const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { BAREMES, pointsPour, maximumExercice, totalGrille, reussite } = require('../lib/bareme.js');

/**
 * ÉVALUATION PRATIQUE — la grille d'une formation, et les notes d'un dossier.
 *
 * LES POINTS NE VIENNENT JAMAIS DU CLIENT. Le formateur envoie ce qu'il a MESURÉ — un temps, une
 * note, un geste acquis — et le serveur applique le barème. Accepter des points tout calculés
 * laisserait n'importe quel appel poser 100 sur un exercice qui en vaut 20, sans qu'aucune règle
 * ne s'y oppose : la grille cesserait d'être un barème pour devenir une suggestion.
 */

const COLS_EX = 'id, grille_id, label, consigne, bareme, max_points, paliers, sort_order, active';

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

/** Grille active d'une formation, avec ses exercices. `null` si la formation n'en a pas. */
async function grilleDeLaFormation(conn, orgId, programId) {
    const [[g]] = await conn.query(
        `SELECT id, program_id, label, pass_score, active FROM evaluation_grille
          WHERE organization_id = ? AND program_id = ? AND active = 1 LIMIT 1`,
        [orgId, programId]);
    if (!g) return null;
    const [exercices] = await conn.query(
        `SELECT ${COLS_EX} FROM evaluation_exercice
          WHERE grille_id = ? ORDER BY sort_order, label`, [g.id]);
    return { ...g, exercices };
}

/** GET /api/evaluations/formation/:programId — la grille, pour la configurer ou la lire. */
const getGrille = async (req, res) => {
    try {
        const conn = db.promise();
        const g = await grilleDeLaFormation(conn, req.user.organization_id, req.params.programId);
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

        let [[g]] = await conn.query(
            'SELECT id FROM evaluation_grille WHERE organization_id = ? AND program_id = ? LIMIT 1',
            [orgId, programId]);
        const label = String(b.label || 'Évaluation pratique').slice(0, 160);
        /* Seuil en POURCENTAGE, borné : au-delà de cent, aucune grille ne serait franchissable. */
        const seuil = b.pass_score === null || b.pass_score === undefined || b.pass_score === ''
            ? null : Math.min(100, Math.max(0, Math.round(Number(b.pass_score) || 0)));

        if (!g) {
            const id = crypto.randomUUID();
            await conn.query(
                `INSERT INTO evaluation_grille (id, organization_id, program_id, label, pass_score, active)
                 VALUES (?, ?, ?, ?, ?, 1)`, [id, orgId, programId, label, seuil]);
            g = { id };
        } else {
            await conn.query(
                'UPDATE evaluation_grille SET label = ?, pass_score = ?, active = 1 WHERE id = ?',
                [label, seuil, g.id]);
        }

        const envoyes = Array.isArray(b.exercices) ? b.exercices.slice(0, 100) : [];
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
            };
            const reutilise = ex && ex.id && connus.has(ex.id);
            if (reutilise) {
                gardes.add(ex.id);
                await conn.query(
                    `UPDATE evaluation_exercice SET label = ?, consigne = ?, bareme = ?, max_points = ?,
                            paliers = ?, sort_order = ?, active = ? WHERE id = ? AND grille_id = ?`,
                    [champs.label, champs.consigne, champs.bareme, champs.max_points, champs.paliers,
                        champs.sort_order, champs.active, ex.id, g.id]);
            } else {
                const id = crypto.randomUUID();
                gardes.add(id);
                await conn.query(
                    `INSERT INTO evaluation_exercice (id, organization_id, grille_id, label, consigne,
                        bareme, max_points, paliers, sort_order, active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, orgId, g.id, champs.label, champs.consigne, champs.bareme, champs.max_points,
                        champs.paliers, champs.sort_order, champs.active]);
            }
        }

        const retires = [...connus].filter((id) => !gardes.has(id));
        if (retires.length) {
            await conn.query('UPDATE evaluation_exercice SET active = 0 WHERE grille_id = ? AND id IN (?)',
                [g.id, retires]);
        }

        logAudit(req, 'evaluation.grille', 'EvaluationGrille', g.id);
        res.json({ data: await grilleDeLaFormation(conn, orgId, programId) });
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

        const grille = await grilleDeLaFormation(conn, orgId, s.program_id);
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

        const actifs = grille.exercices.filter((e) => e.active);
        const stagiaires = enr.map((e) => {
            const miennes = parDossier.get(e.enrollment_id) || {};
            const points = Object.fromEntries(Object.entries(miennes).map(([k, v]) => [k, v.points]));
            const totaux = totalGrille(actifs, points);
            return {
                ...e,
                nom: `${e.last_name || ''} ${e.first_name || ''}`.trim(),
                notes: miennes,
                totaux,
                reussi: reussite(grille, totaux),
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

module.exports = { getGrille, saveGrille, getNotesSession, saveNote, grilleDeLaFormation, resultatDossier };
