/**
 * CE QUE DÉSIGNE UNE LIGNE DU JOURNAL : son OBJET et le STAGIAIRE concerné — demandé le 2026-09-28.
 *
 * LE DÉFAUT. La cloche disait « Document signé ×2 » : QUOI, jamais LEQUEL. Et côté équipe, « Document
 * supprimé », « Document généré (PDF) » — sans le titre, sans la personne. Il fallait ouvrir le dossier
 * et chercher. Le journal ne porte qu'un code et un identifiant (`action`, `entity`, `entity_id`) :
 * le nom se lit donc LÀ OÙ IL VIT, au moment de l'affichage — une requête par sorte d'entité, pour
 * toutes les lignes à la fois. C'est rétroactif : les lignes d'avant se nomment aussi, tant que ce
 * qu'elles désignent existe.
 *
 * CE QUI N'EXISTE PLUS ne se relit pas : un document supprimé n'a plus de titre. D'où `audit_log.libelle`
 * et `audit_log.learner_id` (migration 186), écrits au moment du geste par l'appelant (logAudit,
 * cinquième argument). Le libellé FIGÉ prime sur le libellé relu : c'est le nom qu'avait l'objet
 * quand la chose s'est passée.
 *
 * LE NOM D'UN STAGIAIRE N'EST JAMAIS COPIÉ DANS LE JOURNAL : il se relit TOUJOURS dans sa fiche. Un
 * stagiaire effacé disparaît donc aussi de la cloche (droit à l'effacement) ; la trace « qui a fait
 * quoi, quand » demeure.
 *
 * NE NOMME QUE CE QUE LA PERSONNE PEUT DÉJÀ OUVRIR : chaque requête est bornée à l'organisme de la
 * ligne, et la cloche ne reçoit que les entités des rubriques qu'on lui a accordées (lib/activite.js).
 * Le journal complet, lui, est réservé aux rôles d'audit (routes/audit.routes.js).
 *
 * LES LIBELLÉS D'ACTION RESTENT DANS L'INTERFACE (ui/lib/auditLabels.js) ; ici, seulement des NOMS —
 * un titre de document, un code de formation et une date — qui sont des données, pas une traduction.
 */
const { SLOT } = require('./emargement.js');
const { sectionDeLEntite, lienDeLEntite } = require('./activite.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v) => typeof v === 'string' && UUID.test(v);

const dejaSignales = new Set();
function signalerUneFois(cle, message) {
    if (dejaSignales.has(cle)) return;
    dejaSignales.add(cle);
    console.error(message);
}

/* La session d'une ligne, en une forme : « RS7404 · S38 2026 » — celle de la fiche entreprise. */
const SESSION = `SELECT ts.id, ts.id AS session_id, p.code, ts.week AS semaine, ts.year AS annee
                   FROM training_session ts JOIN training_program p ON p.id = ts.program_id
                  WHERE ts.organization_id = ? AND ts.id IN (?)`;

/**
 * PAR ENTITÉ, LES REQUÊTES QUI LA NOMMENT — dans l'ordre : un identifiant que la première ne trouve
 * pas est proposé à la suivante. Chacune rend `id` (celui du journal) et ce qu'elle sait parmi
 * `objet`, `learner_id`, `session_id` — ou les morceaux d'un nom de session (`code`, `jour`,
 * `creneau`, `semaine`, `annee`), assemblés par `nommer`.
 *
 * UNE SECONDE REQUÊTE QUAND L'IDENTIFIANT CHANGE DE SENS : trois appels journalisent sous une entité
 * l'identifiant d'une AUTRE — « Émargement généré » (AttendanceSheet) porte celui de la session,
 * « Remise écartée / réintégrée » (RemiseDocument) celui du TYPE de remise, « Avis du jury »
 * (EvaluationVerdict) celui du dossier. On les lit tels qu'ils sont écrits : réécrire ces appels
 * rendrait illisibles les lignes déjà au journal.
 *
 * Toutes ces entités s'identifient par un UUID : un slug (modèle) ou un nom de rôle n'y est jamais
 * proposé. Une entité absente d'ici garde son libellé d'entité, comme avant.
 */
const RESOLVEURS = {
    GeneratedDocument: [
        `SELECT d.id, d.title AS objet, d.learner_id
           FROM generated_document d WHERE d.organization_id = ? AND d.id IN (?)`,
    ],
    PieceDepot: [
        `SELECT pd.id, pt.label AS objet, e.learner_id
           FROM piece_depot pd JOIN piece_type pt ON pt.id = pd.piece_type_id
           LEFT JOIN enrollment e ON e.id = pd.enrollment_id
          WHERE pd.organization_id = ? AND pd.id IN (?)`,
    ],
    RemiseDocument: [
        `SELECT rd.id, rt.label AS objet, e.learner_id
           FROM remise_document rd JOIN remise_type rt ON rt.id = rd.remise_type_id
           LEFT JOIN enrollment e ON e.id = rd.enrollment_id
          WHERE rd.organization_id = ? AND rd.id IN (?)`,
        `SELECT rt.id, rt.label AS objet FROM remise_type rt WHERE rt.organization_id = ? AND rt.id IN (?)`,
    ],
    QuizResponse: [
        `SELECT r.id, q.title AS objet, COALESCE(r.learner_id, e.learner_id) AS learner_id
           FROM quiz_response r JOIN quiz q ON q.id = r.quiz_id
           LEFT JOIN enrollment e ON e.id = r.enrollment_id
          WHERE r.organization_id = ? AND r.id IN (?)`,
    ],
    Quiz: [
        `SELECT q.id, q.title AS objet FROM quiz q WHERE q.organization_id = ? AND q.id IN (?)`,
    ],
    AttendanceSheet: [
        `SELECT s.id, s.session_id, p.code, DATE_FORMAT(s.date, '%d/%m') AS jour, s.slot AS creneau
           FROM attendance_sheet s JOIN training_session ts ON ts.id = s.session_id
           JOIN training_program p ON p.id = ts.program_id
          WHERE ts.organization_id = ? AND s.id IN (?)`,
        SESSION,
    ],
    AttendanceRecord: [
        `SELECT ar.id, ar.learner_id, s.session_id, p.code, DATE_FORMAT(s.date, '%d/%m') AS jour, s.slot AS creneau
           FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id
           JOIN training_session ts ON ts.id = s.session_id
           JOIN training_program p ON p.id = ts.program_id
          WHERE ts.organization_id = ? AND ar.id IN (?)`,
    ],
    TrainingSession: [SESSION],
    EvaluationNote: [
        `SELECT x.id, x.label AS objet FROM evaluation_exercice x WHERE x.organization_id = ? AND x.id IN (?)`,
    ],
    EvaluationVerdict: [
        `SELECT e.id, e.learner_id, e.session_id FROM enrollment e WHERE e.organization_id = ? AND e.id IN (?)`,
    ],
    ExamSession: [
        `SELECT x.id, x.pv_ref AS objet, x.training_session_id AS session_id
           FROM exam_session x WHERE x.organization_id = ? AND x.id IN (?)`,
    ],
    Company: [
        `SELECT c.id, c.name AS objet FROM company c WHERE c.organization_id = ? AND c.id IN (?)`,
    ],
    Invoice: [
        `SELECT i.id, i.number AS objet FROM invoice i WHERE i.organization_id = ? AND i.id IN (?)`,
    ],
    Partner: [
        `SELECT p.id, p.name AS objet FROM partner p WHERE p.organization_id = ? AND p.id IN (?)`,
    ],
};

/** Le nom d'une ligne relue : l'objet, sinon « RS7404 · 14/09 matin », sinon « RS7404 · S38 2026 ». */
function nommer(r) {
    if (!r) return null;
    const objet = r.objet == null ? '' : String(r.objet).trim();
    if (objet) return objet;
    if (r.code && r.jour) {
        const creneau = SLOT[r.creneau] ? ` ${SLOT[r.creneau].toLowerCase()}` : '';
        return `${r.code} · ${r.jour}${creneau}`;
    }
    if (r.code && r.semaine) return `${r.code} · S${r.semaine} ${r.annee || ''}`.trim();
    return null;
}

/**
 * Le nom d'une session, pour un appelant qui va la perdre de vue — le retrait d'un stagiaire se
 * journalise sous la fiche, et la session dont il sort ne se retrouverait plus. `null` si inconnue.
 */
async function libelleSession(conn, orgId, sessionId) {
    if (!estUuid(sessionId)) return null;
    try {
        const [rows] = await conn.query(SESSION, [orgId, [sessionId]]);
        return nommer(rows && rows[0]);
    } catch { return null; }
}

/**
 * LE LIEN DE LA LIGNE : l'enregistrement dont elle parle, DANS LA RUBRIQUE où elle s'affiche — ou rien.
 *
 * `lienDeLEntite` ne sait mener qu'aux trois entités dont l'identifiant EST celui d'une page. Pour
 * les autres, c'est la « requête qui remonte à son parent » qu'il annonce : un document, une pièce,
 * une remise mènent à la fiche de LEUR stagiaire ; une feuille d'émargement ou un avis du jury, à LEUR
 * session. La rubrique décide du parent : un formateur qui ne voit que les sessions ne reçoit pas un
 * lien vers la fiche d'un stagiaire qu'il ne pourrait pas ouvrir.
 *
 * SEULEMENT VERS CE QUI EXISTE : un stagiaire se lie s'il a été relu (sa fiche est là), une entreprise
 * ou une session si l'une des requêtes l'a trouvée. Une entreprise supprimée n'a plus de lien — il
 * menait à une page vide.
 */
function lienPrecis(ligne, { stagiaire, sessionId, trouve }) {
    const rubrique = sectionDeLEntite(ligne.entity);
    if (rubrique === '/stagiaires' && stagiaire) return `/stagiaires/${stagiaire.id}`;
    if (rubrique === '/sessions' && estUuid(sessionId)) return `/sessions/${sessionId}`;
    return trouve ? lienDeLEntite(ligne.entity, ligne.entity_id) : null;
}

/**
 * Les précisions de lignes du journal, dans le même ordre : `[{ objet, stagiaire, lien }]`.
 *
 * @param conn  `db.promise()` ou une connexion
 * @param {string} orgId  l'organisme des lignes — toute lecture y est bornée
 * @param {Array<{ entity, entity_id, libelle?, learner_id?, user_id? }>} lignes  telles que lues dans
 *   `audit_log` ; `libelle` et `learner_id` (migration 186) sont facultatifs
 * @returns `stagiaire` vaut `{ id, nom, soi }` — `soi` quand c'est le stagiaire lui-même qui a agi (la
 *   cloche dit déjà « par Jean Dupont », elle ne le répète pas). JAMAIS d'exception : une requête qui
 *   échoue laisse ses lignes sans nom, la cloche s'affiche quand même.
 */
async function preciser(conn, orgId, lignes) {
    const liste = Array.isArray(lignes) ? lignes : [];
    /* En minuscules des deux côtés : MariaDB rend ses UUID en minuscules, le journal garde ce
       qu'on lui a passé. */
    const cle = (entity, id) => `${entity}:${String(id).toLowerCase()}`;

    // 1. Les objets, une série de requêtes par sorte d'entité.
    const parEntite = new Map();
    for (const l of liste) {
        if (!RESOLVEURS[l.entity] || !estUuid(l.entity_id)) continue;
        if (!parEntite.has(l.entity)) parEntite.set(l.entity, new Set());
        parEntite.get(l.entity).add(l.entity_id.toLowerCase());
    }
    const trouves = new Map();
    for (const [entity, ids] of parEntite) {
        let reste = [...ids];
        for (const sql of RESOLVEURS[entity]) {
            if (!reste.length) break;
            try {
                const [rows] = await conn.query(sql, [orgId, reste]);
                for (const r of rows || []) trouves.set(cle(entity, r.id), r);
            } catch (e) {
                signalerUneFois(`${entity}:${e && e.code}`,
                    `cloche : les lignes « ${entity} » restent sans nom — ${(e && e.message) || e}. `
                    + 'Signalé une seule fois jusqu\'au prochain démarrage.');
                break;
            }
            reste = reste.filter((id) => !trouves.has(cle(entity, id)));
        }
    }

    // 2. Le stagiaire : figé au journal (186), sinon la fiche elle-même, sinon celui de l'objet relu.
    const base = liste.map((l) => {
        const t = trouves.get(cle(l.entity, l.entity_id)) || null;
        const learnerId = [l.learner_id, l.entity === 'Learner' ? l.entity_id : null, t && t.learner_id]
            .find((v) => estUuid(v));
        const libelle = l.libelle == null ? '' : String(l.libelle).trim();
        return { t, learnerId: learnerId ? learnerId.toLowerCase() : null, objet: libelle || nommer(t) };
    });

    // 3. Les noms, relus dans les fiches — un stagiaire effacé n'en a plus.
    const fiches = new Map();
    const ids = [...new Set(base.map((b) => b.learnerId).filter(Boolean))];
    if (ids.length) {
        try {
            const [rows] = await conn.query(
                `SELECT l.id, l.first_name, l.last_name, l.user_id
                   FROM learner l WHERE l.organization_id = ? AND l.id IN (?)`, [orgId, ids]);
            for (const r of rows || []) fiches.set(String(r.id).toLowerCase(), r);
        } catch (e) {
            signalerUneFois(`learner:${e && e.code}`,
                `cloche : les stagiaires restent sans nom — ${(e && e.message) || e}. `
                + 'Signalé une seule fois jusqu\'au prochain démarrage.');
        }
    }

    return liste.map((l, i) => {
        const { t, learnerId, objet } = base[i];
        const f = learnerId ? fiches.get(learnerId) : null;
        const nom = f ? [f.first_name, f.last_name].filter(Boolean).join(' ').trim() : '';
        const stagiaire = f && nom
            ? { id: learnerId, nom, soi: !!(f.user_id && l.user_id && String(f.user_id) === String(l.user_id)) }
            : null;
        return {
            objet: objet || null,
            stagiaire,
            lien: lienPrecis(l, { stagiaire, sessionId: t && t.session_id, trouve: !!t }),
        };
    });
}

module.exports = { preciser, libelleSession, nommer, lienPrecis, RESOLVEURS };
