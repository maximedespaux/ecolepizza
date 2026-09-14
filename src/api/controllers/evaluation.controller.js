const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { BAREMES, pointsPour, maximumExercice, totalGrille, reussite, resultatJury } = require('../lib/bareme.js');
const { colonneExiste } = require('../lib/colonnes.js');

/**
 * ÉVALUATION PRATIQUE — la grille d'une formation, et les notes d'un dossier.
 *
 * LES POINTS NE VIENNENT JAMAIS DU CLIENT. Le formateur envoie ce qu'il a MESURÉ — un temps, une
 * note, un geste acquis — et le serveur applique le barème. Accepter des points tout calculés
 * laisserait n'importe quel appel poser 100 sur un exercice qui en vaut 20, sans qu'aucune règle
 * ne s'y oppose : la grille cesserait d'être un barème pour devenir une suggestion.
 */

const COLS_EX = 'id, grille_id, label, consigne, bareme, max_points, paliers, sort_order, active';
/* Colonnes de la 149. Sondées à chaque appel plutôt que mémorisées : le serveur doit voir la
   migration jouée pendant qu'il tourne (cf. lib/colonnes.js). */
const COLS_EX_149 = 'competence_id, obligatoire';
const ROLES = ['FORMATEUR', 'JURY'];
const roleValide = (r) => (ROLES.includes(String(r || '').toUpperCase()) ? String(r).toUpperCase() : 'FORMATEUR');

/** La 149 est-elle jouée ? Sans elle, seule la grille du formateur existe. */
async function supporteJury(conn) {
    return colonneExiste(conn, 'evaluation_grille', 'role');
}

/** Paliers normalisés avant écriture — on ne stocke jamais ce qu'on n'a pas relu. */
function paliersPropres(bareme, brut) {
    if (bareme !== 'TEMPS' && bareme !== 'NIVEAUX') return null;
    const liste = Array.isArray(brut) ? brut : [];
    const out = [];
    for (const p of liste.slice(0, 20)) {
        const points = Math.max(0, Math.round(Number(p && p.points) || 0));
        if (bareme === 'TEMPS') {
            /* `max_s` absent ou nul = « au-delà de tout le reste ». On le conserve tel quel :
               c'est ce que `lib/bareme.js` attend, et le traduire en un grand nombre rendrait
               la grille illisible à l'écran. */
            const brutMax = p && p.max_s;
            const max_s = brutMax === null || brutMax === undefined || brutMax === ''
                ? null : Math.max(0, Math.round(Number(brutMax) || 0));
            out.push({ max_s, points });
        } else {
            out.push({ label: String((p && p.label) || '').slice(0, 80) || 'Niveau', points });
        }
    }
    return out.length ? JSON.stringify(out) : null;
}

/**
 * Grille active d'une formation POUR UN RÔLE, avec ses exercices et, pour le jury, ses
 * compétences. `null` si la formation n'en a pas.
 *
 * TOLÈRE LA 149 NON JOUÉE : sans la colonne `role`, la seule grille qui existe est celle du
 * formateur — demander celle du jury rend `null`, et les écrans affichent « aucune grille »
 * au lieu de tomber.
 */
async function grilleDeLaFormation(conn, orgId, programId, role = 'FORMATEUR') {
    const r = roleValide(role);
    const avecRole = await supporteJury(conn);
    if (!avecRole && r === 'JURY') return null;

    const [[g]] = avecRole
        ? await conn.query(
            `SELECT id, program_id, role, label, pass_score, template_slug, active FROM evaluation_grille
              WHERE organization_id = ? AND program_id = ? AND role = ? AND active = 1 LIMIT 1`,
            [orgId, programId, r])
        : await conn.query(
            `SELECT id, program_id, label, pass_score, active FROM evaluation_grille
              WHERE organization_id = ? AND program_id = ? AND active = 1 LIMIT 1`,
            [orgId, programId]);
    if (!g) return null;

    const cols = avecRole ? `${COLS_EX}, ${COLS_EX_149}` : COLS_EX;
    const [exercices] = await conn.query(
        `SELECT ${cols} FROM evaluation_exercice
          WHERE grille_id = ? ORDER BY sort_order, label`, [g.id]);

    let competences = [];
    if (avecRole) {
        const [cs] = await conn.query(
            `SELECT id, code, label, min_valides, sort_order, active FROM evaluation_competence
              WHERE grille_id = ? ORDER BY sort_order, code`, [g.id]);
        /* LES CRITÈRES SONT RANGÉS SOUS LEUR COMPÉTENCE ici, et pas côté écran : c'est ce
           découpage qui porte la règle de validation, et deux écrans qui le referaient chacun
           à leur façon finiraient par ne plus grouper pareil. */
        competences = cs.map((c) => ({
            ...c,
            criteres: exercices.filter((e) => e.competence_id === c.id),
        }));
    }
    return { ...g, role: g.role || 'FORMATEUR', exercices, competences };
}

/** GET /api/evaluations/formation/:programId — la grille, pour la configurer ou la lire. */
const getGrille = async (req, res) => {
    try {
        const conn = db.promise();
        const g = await grilleDeLaFormation(conn, req.user.organization_id, req.params.programId,
            req.query.role);
        res.json({ data: g });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(409).json({ error: 'Migration 148 non jouée : évaluation indisponible.' });
        }
        console.error('Erreur lecture grille :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/evaluations/formation/:programId — enregistre la grille et ses exercices.
 *
 * RÉCONCILIATION, PAS TABLE RASE. Un exercice envoyé AVEC son identifiant est mis à jour ; sans
 * identifiant, créé. Supprimer puis réinsérer aurait effacé les notes déjà saisies par cascade —
 * c'est exactement le défaut qu'on a payé sur les réponses de QCM, et qu'on ne refait pas.
 *
 * Un exercice ABSENT de l'envoi est DÉSACTIVÉ, jamais supprimé : ses notes restent lisibles sur
 * les dossiers déjà évalués, et il cesse simplement de compter dans les totaux à venir.
 */
const saveGrille = async (req, res) => {
    const orgId = req.user.organization_id;
    const programId = req.params.programId;
    const b = req.body || {};
    try {
        const conn = db.promise();
        const [[prog]] = await conn.query(
            'SELECT id FROM training_program WHERE id = ? AND organization_id = ?', [programId, orgId]);
        if (!prog) return res.status(404).json({ error: 'Formation introuvable.' });

        const role = roleValide(b.role || req.query.role);
        const avecRole = await supporteJury(conn);
        if (!avecRole && role === 'JURY') {
            return res.status(409).json({ error: 'Migration 149 non jouée : grille de jury indisponible.' });
        }
        let [[g]] = avecRole
            ? await conn.query(
                'SELECT id FROM evaluation_grille WHERE organization_id = ? AND program_id = ? AND role = ? LIMIT 1',
                [orgId, programId, role])
            : await conn.query(
                'SELECT id FROM evaluation_grille WHERE organization_id = ? AND program_id = ? LIMIT 1',
                [orgId, programId]);
        const label = String(b.label || 'Évaluation pratique').slice(0, 160);
        /* Seuil en POURCENTAGE, borné : au-delà de cent, aucune grille ne serait franchissable. */
        const seuil = b.pass_score === null || b.pass_score === undefined || b.pass_score === ''
            ? null : Math.min(100, Math.max(0, Math.round(Number(b.pass_score) || 0)));

        const slug = b.template_slug ? String(b.template_slug).slice(0, 120) : null;
        if (!g) {
            const id = crypto.randomUUID();
            if (avecRole) {
                await conn.query(
                    `INSERT INTO evaluation_grille (id, organization_id, program_id, role, label, pass_score, template_slug, active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`, [id, orgId, programId, role, label, seuil, slug]);
            } else {
                await conn.query(
                    `INSERT INTO evaluation_grille (id, organization_id, program_id, label, pass_score, active)
                     VALUES (?, ?, ?, ?, ?, 1)`, [id, orgId, programId, label, seuil]);
            }
            g = { id };
        } else if (avecRole) {
            await conn.query(
                'UPDATE evaluation_grille SET label = ?, pass_score = ?, template_slug = ?, active = 1 WHERE id = ?',
                [label, seuil, slug, g.id]);
        } else {
            await conn.query(
                'UPDATE evaluation_grille SET label = ?, pass_score = ?, active = 1 WHERE id = ?',
                [label, seuil, g.id]);
        }

        /* ── LES COMPÉTENCES, réconciliées comme les exercices : mise à jour par identifiant,
           création sans, DÉSACTIVATION pour les absentes. Supprimer une compétence entraînerait
           ses critères en cascade, et les notes avec — c'est le défaut des réponses de QCM,
           qu'on ne refait pas. */
        const compEnvoyees = avecRole && Array.isArray(b.competences) ? b.competences.slice(0, 60) : [];
        const idComp = new Map();     // identifiant envoyé (ou repère local) → identifiant réel
        if (avecRole) {
            const [compExistantes] = await conn.query(
                'SELECT id FROM evaluation_competence WHERE grille_id = ?', [g.id]);
            const compConnues = new Set(compExistantes.map((c) => c.id));
            const compGardees = new Set();
            for (const [i, c] of compEnvoyees.entries()) {
                const champs = {
                    code: c && c.code ? String(c.code).slice(0, 20) : null,
                    label: String((c && c.label) || '').slice(0, 200) || `Compétence ${i + 1}`,
                    /* `min_valides` NULL = TOUS les critères. Une valeur au-delà du nombre de
                       critères rendrait la compétence impossible : le calcul la borne déjà
                       (lib/bareme.js), on n'écrit pas une contrainte de plus ici. */
                    min_valides: c && c.min_valides !== null && c.min_valides !== undefined && c.min_valides !== ''
                        ? Math.max(0, Math.round(Number(c.min_valides) || 0)) : null,
                    sort_order: (i + 1) * 10,
                };
                if (c && c.id && compConnues.has(c.id)) {
                    compGardees.add(c.id);
                    idComp.set(c.id, c.id);
                    await conn.query(
                        `UPDATE evaluation_competence SET code = ?, label = ?, min_valides = ?,
                                sort_order = ?, active = 1 WHERE id = ? AND grille_id = ?`,
                        [champs.code, champs.label, champs.min_valides, champs.sort_order, c.id, g.id]);
                } else {
                    const cid = crypto.randomUUID();
                    compGardees.add(cid);
                    if (c && c.id) idComp.set(c.id, cid);
                    idComp.set(`#${i}`, cid);
                    await conn.query(
                        `INSERT INTO evaluation_competence (id, organization_id, grille_id, code, label,
                                min_valides, sort_order, active)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                        [cid, orgId, g.id, champs.code, champs.label, champs.min_valides, champs.sort_order]);
                }
            }
            const compRetirees = [...compConnues].filter((id) => !compGardees.has(id));
            if (compRetirees.length) {
                await conn.query('UPDATE evaluation_competence SET active = 0 WHERE grille_id = ? AND id IN (?)',
                    [g.id, compRetirees]);
            }
        }

        /* LES CRITÈRES D'UNE COMPÉTENCE SONT DES EXERCICES, aplatis ici pour n'avoir qu'UNE
           écriture et qu'UNE réconciliation. Un critère vaut 1 point et se coche : c'est un
           barème BINAIRE, le même que « acquis / non acquis » du formateur. Rien de nouveau à
           calculer, à noter ni à vérifier. */
        const criteres = [];
        for (const [i, c] of compEnvoyees.entries()) {
            const cid = idComp.get(c && c.id) || idComp.get(`#${i}`);
            for (const cr of (Array.isArray(c && c.criteres) ? c.criteres.slice(0, 60) : [])) {
                criteres.push({
                    ...cr, bareme: 'BINAIRE', max_points: 1,
                    competence_id: cid, obligatoire: cr && cr.obligatoire ? 1 : 0,
                });
            }
        }
        const envoyes = [...(Array.isArray(b.exercices) ? b.exercices.slice(0, 100) : []), ...criteres];
        const [existants] = await conn.query('SELECT id FROM evaluation_exercice WHERE grille_id = ?', [g.id]);
        const connus = new Set(existants.map((e) => e.id));
        const gardes = new Set();

        for (const [i, ex] of envoyes.entries()) {
            const bareme = BAREMES.includes(ex && ex.bareme) ? ex.bareme : 'POINTS';
            const champs = {
                label: String((ex && ex.label) || '').slice(0, 200) || `Exercice ${i + 1}`,
                consigne: ex && ex.consigne ? String(ex.consigne).slice(0, 2000) : null,
                bareme,
                /* Le maximum déclaré est recalculé pour les barèmes à paliers : laisser les deux
                   diverger ferait annoncer un total qu'aucun stagiaire ne peut atteindre. */
                max_points: maximumExercice({ bareme, max_points: ex && ex.max_points, paliers: ex && ex.paliers }),
                paliers: paliersPropres(bareme, ex && ex.paliers),
                sort_order: (i + 1) * 10,
                active: 1,
                competence_id: ex && ex.competence_id ? ex.competence_id : null,
                obligatoire: ex && ex.obligatoire ? 1 : 0,
            };
            const reutilise = ex && ex.id && connus.has(ex.id);
            if (reutilise) {
                gardes.add(ex.id);
                const sup149 = avecRole ? ', competence_id = ?, obligatoire = ?' : '';
                const args149 = avecRole ? [champs.competence_id, champs.obligatoire] : [];
                await conn.query(
                    `UPDATE evaluation_exercice SET label = ?, consigne = ?, bareme = ?, max_points = ?,
                            paliers = ?, sort_order = ?, active = ?${sup149} WHERE id = ? AND grille_id = ?`,
                    [champs.label, champs.consigne, champs.bareme, champs.max_points, champs.paliers,
                        champs.sort_order, champs.active, ...args149, ex.id, g.id]);
            } else {
                const id = crypto.randomUUID();
                gardes.add(id);
                const cols149 = avecRole ? ', competence_id, obligatoire' : '';
                const vals149 = avecRole ? ', ?, ?' : '';
                const args149 = avecRole ? [champs.competence_id, champs.obligatoire] : [];
                await conn.query(
                    `INSERT INTO evaluation_exercice (id, organization_id, grille_id, label, consigne,
                        bareme, max_points, paliers, sort_order, active${cols149})
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?${vals149})`,
                    [id, orgId, g.id, champs.label, champs.consigne, champs.bareme, champs.max_points,
                        champs.paliers, champs.sort_order, champs.active, ...args149]);
            }
        }

        const retires = [...connus].filter((id) => !gardes.has(id));
        if (retires.length) {
            await conn.query('UPDATE evaluation_exercice SET active = 0 WHERE grille_id = ? AND id IN (?)',
                [g.id, retires]);
        }

        logAudit(req, 'evaluation.grille', 'EvaluationGrille', g.id);
        res.json({ data: await grilleDeLaFormation(conn, orgId, programId, role) });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(409).json({ error: 'Migration 148 non jouée : évaluation indisponible.' });
        }
        console.error('Erreur enregistrement grille :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/evaluations/session/:id — la grille de la session et les notes de chaque inscrit.
 *
 * C'EST L'ÉCRAN DU FORMATEUR : il a son groupe devant lui, pas un dossier à la fois. On renvoie
 * donc la grille une fois et les notes de tout le monde, plutôt qu'une requête par stagiaire.
 */
const getNotesSession = async (req, res) => {
    const orgId = req.user.organization_id;
    try {
        const conn = db.promise();
        const [[s]] = await conn.query(
            `SELECT s.id, s.program_id, p.code, p.title
               FROM training_session s JOIN training_program p ON p.id = s.program_id
              WHERE s.id = ? AND s.organization_id = ?`, [req.params.id, orgId]);
        if (!s) return res.status(404).json({ error: 'Session introuvable.' });

        const role = roleValide(req.query.role);
        const grille = await grilleDeLaFormation(conn, orgId, s.program_id, role);
        if (!grille) return res.json({ data: { session: s, grille: null, stagiaires: [] } });

        const [enr] = await conn.query(
            `SELECT e.id AS enrollment_id, l.first_name, l.last_name
               FROM enrollment e LEFT JOIN learner l ON l.id = e.learner_id
              WHERE e.session_id = ? AND e.organization_id = ?
              ORDER BY l.last_name, l.first_name`, [req.params.id, orgId]);

        let notes = [];
        if (enr.length) {
            [notes] = await conn.query(
                `SELECT enrollment_id, exercice_id, valeur, points, commentaire,
                        DATE_FORMAT(note_le, '%Y-%m-%d %H:%i') AS note_le
                   FROM evaluation_note WHERE enrollment_id IN (?)`,
                [enr.map((e) => e.enrollment_id)]);
        }
        const parDossier = new Map();
        for (const n of notes) {
            if (!parDossier.has(n.enrollment_id)) parDossier.set(n.enrollment_id, {});
            parDossier.get(n.enrollment_id)[n.exercice_id] = n;
        }

        /* LES VERDICTS DU JURY, s'il y en a. Une grille de jury sans verdict se lit comme
           « pas encore délibéré » — l'absence de ligne est l'état initial, pas une erreur. */
        const verdicts = new Map();
        if (grille.role === 'JURY' && enr.length) {
            try {
                const [vs] = await conn.query(
                    `SELECT enrollment_id, avis, rattrapage, observations, document_id,
                            DATE_FORMAT(cloture_le, '%Y-%m-%d %H:%i') AS cloture_le
                       FROM evaluation_verdict WHERE grille_id = ? AND enrollment_id IN (?)`,
                    [grille.id, enr.map((e) => e.enrollment_id)]);
                for (const v of vs) verdicts.set(v.enrollment_id, v);
            } catch (e) { if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; }
        }

        const actifs = grille.exercices.filter((e) => e.active);
        const stagiaires = enr.map((e) => {
            const miennes = parDossier.get(e.enrollment_id) || {};
            const points = Object.fromEntries(Object.entries(miennes).map(([k, v]) => [k, v.points]));
            const totaux = totalGrille(actifs, points);
            /* LE JURY NE COMPTE PAS DES POINTS, il valide des compétences : les deux résultats
               n'ont pas la même forme, et forcer le second dans le premier ferait afficher un
               pourcentage là où la grille papier écrit « 5 compétences sur 7 ». On renvoie
               donc les deux, et l'écran lit celui qui correspond à sa grille. */
            const jury = grille.role === 'JURY' && grille.competences.length
                ? resultatJury(grille.competences, points) : null;
            return {
                ...e,
                nom: `${e.last_name || ''} ${e.first_name || ''}`.trim(),
                notes: miennes,
                totaux,
                reussi: reussite(grille, totaux),
                jury,
                verdict: verdicts.get(e.enrollment_id) || null,
            };
        });
        res.json({ data: { session: s, grille, stagiaires } });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(409).json({ error: 'Migration 148 non jouée : évaluation indisponible.' });
        }
        console.error('Erreur lecture notes :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/evaluations/note — enregistre UNE note.
 *
 * UNE NOTE À LA FOIS, volontairement : le formateur saisit au fil de l'exercice, debout, entre
 * deux passages. Un enregistrement global l'obligerait à ne rien perdre jusqu'au bout, et une
 * fermeture d'onglet effacerait l'après-midi.
 *
 * VIDER LA VALEUR EFFACE LA NOTE. Se tromper de ligne arrive ; sans retour en arrière, il
 * faudrait laisser une note fausse ou passer par la base.
 */
const saveNote = async (req, res) => {
    const orgId = req.user.organization_id;
    const { enrollment_id: enrollmentId, exercice_id: exerciceId } = req.body || {};
    if (!enrollmentId || !exerciceId) {
        return res.status(422).json({ error: 'Dossier et exercice requis.' });
    }
    try {
        const conn = db.promise();
        /* LES DEUX APPARTENANCES SONT VÉRIFIÉES. Sans cela, un identifiant d'un autre organisme
           passé dans le corps de la requête ferait noter le dossier de quelqu'un d'autre. */
        const [[ex]] = await conn.query(
            `SELECT ${COLS_EX} FROM evaluation_exercice WHERE id = ? AND organization_id = ?`,
            [exerciceId, orgId]);
        if (!ex) return res.status(404).json({ error: 'Exercice introuvable.' });
        const [[enr]] = await conn.query(
            'SELECT id FROM enrollment WHERE id = ? AND organization_id = ?', [enrollmentId, orgId]);
        if (!enr) return res.status(404).json({ error: 'Dossier introuvable.' });

        /* UNE GRILLE CLÔTURÉE NE BOUGE PLUS. Le jury a délibéré et le document est signé : un
           procès-verbal dont on pourrait encore changer les notes ne prouve rien. Le refus est
           explicite — laisser l'écriture passer en silence serait pire que l'interdire. */
        if (await estCloture(conn, ex.grille_id, enrollmentId)) {
            return res.status(409).json({ error: 'Évaluation clôturée : les notes ne sont plus modifiables.' });
        }

        const valeur = req.body.valeur;
        const vide = valeur === null || valeur === undefined || String(valeur).trim() === '';
        if (vide) {
            await conn.query('DELETE FROM evaluation_note WHERE enrollment_id = ? AND exercice_id = ?',
                [enrollmentId, exerciceId]);
            logAudit(req, 'evaluation.note', 'EvaluationNote', exerciceId);
            return res.json({ data: { enrollment_id: enrollmentId, exercice_id: exerciceId, points: null } });
        }

        /* LE BARÈME S'APPLIQUE ICI. C'est le seul endroit où des points naissent. */
        const { points, libelle } = pointsPour(ex, valeur);
        const commentaire = req.body.commentaire ? String(req.body.commentaire).slice(0, 400) : null;
        await conn.query(
            `INSERT INTO evaluation_note (id, organization_id, enrollment_id, exercice_id, valeur,
                    points, commentaire, note_par, note_le)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), points = VALUES(points),
                    commentaire = VALUES(commentaire), note_par = VALUES(note_par), note_le = NOW()`,
            [crypto.randomUUID(), orgId, enrollmentId, exerciceId, String(valeur).slice(0, 40),
                points, commentaire, req.user.id]);

        logAudit(req, 'evaluation.note', 'EvaluationNote', exerciceId);
        res.json({ data: { enrollment_id: enrollmentId, exercice_id: exerciceId, points, libelle } });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(409).json({ error: 'Migration 148 non jouée : évaluation indisponible.' });
        }
        console.error('Erreur enregistrement note :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * La grille est-elle CLÔTURÉE pour ce dossier ? Tolère la 149 non jouée (rien n'est clôturé).
 */
async function estCloture(conn, grilleId, enrollmentId) {
    try {
        const [[v]] = await conn.query(
            'SELECT cloture_le FROM evaluation_verdict WHERE grille_id = ? AND enrollment_id = ?',
            [grilleId, enrollmentId]);
        return !!(v && v.cloture_le);
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) return false;
        throw err;
    }
}

/**
 * PUT /api/evaluations/verdict — l'avis du jury sur un candidat.
 *
 * L'AVIS N'EST PAS UN CALCUL. « 5 compétences sur 7 » se déduit des cases cochées ; « Favorable »
 * et « Rattrapage » sont PRONONCÉS par le jury, qui a vu le candidat. Les déduire du compte
 * ferait signer aux jurés une décision qu'ils n'ont pas prise.
 *
 * Corps : { enrollment_id, grille_id, avis, rattrapage, observations, cloturer? }.
 */
const AVIS = ['FAVORABLE', 'DEFAVORABLE'];
const saveVerdict = async (req, res) => {
    const orgId = req.user.organization_id;
    const b = req.body || {};
    const { enrollment_id: enrollmentId, grille_id: grilleId } = b;
    if (!enrollmentId || !grilleId) return res.status(422).json({ error: 'Dossier et grille requis.' });
    try {
        const conn = db.promise();
        /* LES DEUX APPARTENANCES, en base, comme pour une note : un identifiant glissé dans le
           corps de la requête ne doit jamais faire délibérer sur le dossier d'un autre. */
        const [[g]] = await conn.query(
            'SELECT id, program_id, template_slug FROM evaluation_grille WHERE id = ? AND organization_id = ?',
            [grilleId, orgId]);
        if (!g) return res.status(404).json({ error: 'Grille introuvable.' });
        const [[enr]] = await conn.query(
            'SELECT id FROM enrollment WHERE id = ? AND organization_id = ?', [enrollmentId, orgId]);
        if (!enr) return res.status(404).json({ error: 'Dossier introuvable.' });
        if (await estCloture(conn, grilleId, enrollmentId)) {
            return res.status(409).json({ error: 'Évaluation déjà clôturée.' });
        }

        const avis = AVIS.includes(String(b.avis || '').toUpperCase()) ? String(b.avis).toUpperCase() : null;
        const rattrapage = b.rattrapage ? 1 : 0;
        const observations = b.observations ? String(b.observations).slice(0, 1000) : null;

        await conn.query(
            `INSERT INTO evaluation_verdict (id, organization_id, grille_id, enrollment_id, avis,
                    rattrapage, observations)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE avis = VALUES(avis), rattrapage = VALUES(rattrapage),
                    observations = VALUES(observations)`,
            [crypto.randomUUID(), orgId, grilleId, enrollmentId, avis, rattrapage, observations]);

        logAudit(req, 'evaluation.verdict', 'EvaluationVerdict', enrollmentId);
        res.json({ data: { enrollment_id: enrollmentId, avis, rattrapage, observations } });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(409).json({ error: 'Migration 149 non jouée : évaluation jury indisponible.' });
        }
        console.error('Erreur enregistrement verdict :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** Résultat d'un dossier — lu par les jetons de document et la condition de parcours. */
async function resultatDossier(conn, orgId, enrollmentId) {
    try {
        const [[e]] = await conn.query(
            `SELECT e.id, s.program_id FROM enrollment e
               JOIN training_session s ON s.id = e.session_id
              WHERE e.id = ? AND e.organization_id = ?`, [enrollmentId, orgId]);
        if (!e || !e.program_id) return null;
        const grille = await grilleDeLaFormation(conn, orgId, e.program_id);
        if (!grille) return null;
        const actifs = grille.exercices.filter((x) => x.active);
        const [notes] = await conn.query(
            'SELECT exercice_id, valeur, points FROM evaluation_note WHERE enrollment_id = ?', [enrollmentId]);
        const parEx = Object.fromEntries(notes.map((n) => [n.exercice_id, n.points]));
        const totaux = totalGrille(actifs, parEx);
        return {
            grille, exercices: actifs, notes, totaux, reussi: reussite(grille, totaux),
        };
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) return null;
        throw err;
    }
}

/**
 * Résultat d'un candidat sur la grille du JURY — lu par les jetons du document.
 *
 * DISTINCT DE `resultatDossier`, qui compte des points. Le jury ne compte pas : il valide des
 * compétences, et son document imprime « 5 sur 7 », pas un pourcentage. Forcer l'un dans
 * l'autre ferait dire au papier signé autre chose que ce que le jury a coché.
 */
async function resultatJuryDossier(conn, orgId, enrollmentId) {
    try {
        const [[e]] = await conn.query(
            `SELECT e.id, s.program_id FROM enrollment e
               JOIN training_session s ON s.id = e.session_id
              WHERE e.id = ? AND e.organization_id = ?`, [enrollmentId, orgId]);
        if (!e || !e.program_id) return null;
        const grille = await grilleDeLaFormation(conn, orgId, e.program_id, 'JURY');
        if (!grille || !grille.competences.length) return null;

        const [notes] = await conn.query(
            'SELECT exercice_id, valeur, points, commentaire FROM evaluation_note WHERE enrollment_id = ?',
            [enrollmentId]);
        const parEx = Object.fromEntries(notes.map((n) => [n.exercice_id, n.points]));
        const remarques = Object.fromEntries(notes.map((n) => [n.exercice_id, n.commentaire]));
        const competences = grille.competences.filter((c) => c.active);
        const resultat = resultatJury(competences, parEx);

        let verdict = null;
        try {
            const [[v]] = await conn.query(
                `SELECT avis, rattrapage, observations, DATE_FORMAT(cloture_le, '%d/%m/%Y') AS cloture_le
                   FROM evaluation_verdict WHERE grille_id = ? AND enrollment_id = ?`,
                [grille.id, enrollmentId]);
            verdict = v || null;
        } catch (err) { if (!(err && err.code === 'ER_NO_SUCH_TABLE')) throw err; }

        /* LES MEMBRES DU JURY sont ceux AFFECTÉS À LA SESSION : c'est l'organisme qui les
           inscrit, et le document doit porter les noms de ceux qui ont réellement évalué —
           pas une liste saisie à part, qui divergerait au premier changement. */
        let membres = [];
        try {
            const [ms] = await conn.query(
                `SELECT u.first_name, u.last_name, si.specialty
                   FROM enrollment e
                   JOIN session_intervenant si ON si.session_id = e.session_id
                   JOIN user u ON u.id = si.user_id
                  WHERE e.id = ? AND si.organization_id = ?
                  ORDER BY u.last_name, u.first_name`, [enrollmentId, orgId]);
            membres = ms;
        } catch { /* intervenants indisponibles : le document sort sans les noms */ }

        return { grille, competences, resultat, notes, remarques, verdict, membres };
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) return null;
        throw err;
    }
}

/**
 * Clôture l'évaluation d'un candidat et produit son document.
 *
 * LA CLÔTURE EST LE POINT DE NON-RETOUR, et c'est sa raison d'être : à partir d'ici la grille
 * ne bouge plus (cf. `estCloture`), et le document imprimé dit exactement ce que le jury a
 * coché. Sans ce gel, un procès-verbal signé pourrait être contredit par sa propre grille.
 *
 * ON REFUSE DE CLÔTURER UNE GRILLE INCOMPLÈTE. Un document qui annonce « 4 compétences sur 7 »
 * alors que trois n'ont pas été regardées est faux, et il est signé : l'erreur devient
 * opposable. Le jury voit ce qui manque et y retourne.
 */
async function cloturerCandidat(conn, orgId, userId, enrollmentId) {
    const r = await resultatJuryDossier(conn, orgId, enrollmentId);
    if (!r) return { erreur: 'Aucune grille de jury pour cette formation.', code: 404 };
    if (r.verdict && r.verdict.cloture_le) return { erreur: 'Évaluation déjà clôturée.', code: 409 };
    if (!r.resultat.complet) {
        const restant = r.resultat.details.filter((d) => d.validee === null).map((d) => d.code || d.label);
        return { erreur: `Compétences non terminées : ${restant.join(', ')}.`, code: 422 };
    }
    /* L'AVIS EST EXIGÉ. Le compte se calcule, l'avis se prononce : un document sans avis ne dit
       pas ce que le jury a décidé, et c'est pourtant la seule ligne que le candidat lira. */
    if (!r.verdict || !r.verdict.avis) return { erreur: "Prononcez l'avis du jury avant de clôturer.", code: 422 };

    /* LE DOCUMENT EST FACULTATIF : une grille sans modèle se clôture quand même. Refuser la
       clôture faute de mise en page bloquerait le jury sur un réglage qui ne le regarde pas. */
    let documentId = null;
    if (r.grille.template_slug) {
        const [[enr]] = await conn.query('SELECT learner_id FROM enrollment WHERE id = ?', [enrollmentId]);
        const { prepareLearnerDoc } = require('./document.controller.js');
        documentId = await prepareLearnerDoc(conn, orgId, {
            learnerId: enr.learner_id, type: 'EVALUATION', templateSlug: r.grille.template_slug,
            title: r.grille.label || 'Évaluation du jury', enrollmentIds: [enrollmentId],
        });
    }
    await conn.query(
        `UPDATE evaluation_verdict SET cloture_le = NOW(), cloture_par = ?, document_id = ?
          WHERE grille_id = ? AND enrollment_id = ?`,
        [userId, documentId, r.grille.id, enrollmentId]);
    return { documentId, resultat: r.resultat };
}

module.exports = {
    getGrille, saveGrille, getNotesSession, saveNote, saveVerdict,
    grilleDeLaFormation, resultatDossier, resultatJuryDossier, cloturerCandidat, estCloture, roleValide,
};
