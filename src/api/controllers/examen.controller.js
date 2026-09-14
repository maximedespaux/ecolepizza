const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { colonneExiste } = require('../lib/colonnes.js');
const { getTemplateContent } = require('./template.controller.js');
const { composeDocumentPdf } = require('../lib/pdfcompose.js');

/**
 * PROCÈS-VERBAL DE JURY DE CERTIFICATION — la commission de délibération d'une session.
 *
 * DISTINCT DE LA GRILLE, et ce n'est pas une nuance de vocabulaire. La grille évalue UNE
 * personne, devant le jury, sur des critères ; le procès-verbal constate ce que la COMMISSION
 * a décidé pour TOUS les candidats d'une session, à une date et une heure, avec sa composition
 * nommée. L'un se signe par candidat, l'autre une fois pour la session.
 *
 * ON BRANCHE LA MIGRATION 100 plutôt que d'ajouter des tables. Elle a été écrite en réponse au
 * refus du dossier RNCP n° 21983 — « on n'arrive pas à savoir quelle est la certification qui a
 * été visée » — et porte déjà la certification, le numéro de PV, le centre, la voie d'accès et
 * le jury. Elle dormait depuis, sans écran ni route.
 *
 * LE PV NE S'ENREGISTRE PAS COMME UN DOCUMENT DU DOSSIER : il se rend à la demande, depuis les
 * données FIGÉES de la commission. C'est ce que la 100 avait prévu en gelant les verdicts à la
 * clôture — le papier se régénère à l'identique dix ans plus tard, et il n'encombre le parcours
 * d'aucun stagiaire, puisqu'il n'appartient à aucun.
 */

const VOIES = ['FORMATION_CONTINUE', 'CANDIDATURE_INDIVIDUELLE', 'VAE'];
const DECISIONS = ['EN_COURS', 'CERTIFIE', 'BLOCS_ACQUIS', 'AJOURNE', 'ABSENT', 'EXCLU'];
/* ADMIS / NON ADMIS, tels qu'imprimés sur le PV de l'organisme. `EN_COURS` n'est ni l'un ni
   l'autre : la commission ne s'est pas prononcée, et forcer ce cas dans « non admis » ferait
   compter comme refusé quelqu'un qu'on n'a pas encore examiné. */
const ADMIS = new Set(['CERTIFIE', 'BLOCS_ACQUIS']);

const texte = (v, n) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n));

/** Les colonnes de la 150 sont-elles là ? Sans elles, le PV se tient sans heure ni représentant. */
async function supportePv(conn) {
    return colonneExiste(conn, 'exam_session', 'representant');
}

/** Le jury, nettoyé avant écriture : on ne stocke jamais ce qu'on n'a pas relu. */
function juryPropre(brut) {
    const liste = Array.isArray(brut) ? brut.slice(0, 10) : [];
    const out = liste.map((m) => ({
        nom: texte(m && m.nom, 120) || '',
        qualite: texte(m && m.qualite, 120) || '',
        employeur: texte(m && m.employeur, 120) || '',
        /* `externe` et `na_pas_forme` ne sont pas du confort : la majorité du jury doit être
           extérieure à l'organisme, et aucun membre ne peut évaluer un candidat qu'il a formé.
           Ces deux règles s'impriment sur le PV — c'est ce qui les rend opposables. */
        externe: !!(m && m.externe),
        na_pas_forme: !!(m && m.na_pas_forme),
    })).filter((m) => m.nom);
    return out.length ? JSON.stringify(out) : null;
}

/** La commission d'une session de formation, avec ses candidats. `null` si elle n'existe pas. */
async function commissionDeLaSession(conn, orgId, sessionId) {
    const avecPv = await supportePv(conn);
    const cols = 'id, training_session_id, certification, rncp_code, voie_acces, pv_ref, '
        + "DATE_FORMAT(date_examen, '%Y-%m-%d') AS date_examen, lieu, centre, jury, status"
        + (avecPv ? ', heure, representant, representant_fonction, aleas' : '');
    const [[ex]] = await conn.query(
        `SELECT ${cols} FROM exam_session
          WHERE organization_id = ? AND training_session_id = ? ORDER BY created_at DESC LIMIT 1`,
        [orgId, sessionId]);
    if (!ex) return null;
    let jury = ex.jury;
    if (typeof jury === 'string') { try { jury = JSON.parse(jury); } catch { jury = []; } }
    const [resultats] = await conn.query(
        `SELECT r.learner_id, r.decision, r.observations
           FROM exam_result r WHERE r.exam_session_id = ?`, [ex.id]);
    return { ...ex, jury: Array.isArray(jury) ? jury : [], resultats };
}

/**
 * GET /api/examens/session/:id — la commission de cette session et ses candidats.
 *
 * LES CANDIDATS VIENNENT DE LA SESSION, pas d'une liste saisie à part : ce sont les stagiaires
 * inscrits. Une seconde liste divergerait dès la première inscription tardive, et le PV
 * annoncerait un nombre d'inscrits faux — exactement ce qu'un contrôle vérifie.
 */
const getCommission = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[s]] = await conn.query(
            `SELECT s.id, s.year, s.week, DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    p.code, p.title, p.rs_code
               FROM training_session s LEFT JOIN training_program p ON p.id = s.program_id
              WHERE s.id = ? AND s.organization_id = ?`, [req.params.id, orgId]);
        if (!s) return res.status(404).json({ error: 'Session introuvable.' });

        const [candidats] = await conn.query(
            `SELECT l.id AS learner_id, l.first_name, l.last_name, l.civility,
                    DATE_FORMAT(l.birthday, '%Y-%m-%d') AS birthday
               FROM enrollment e JOIN learner l ON l.id = e.learner_id
              WHERE e.session_id = ? AND e.organization_id = ?
              ORDER BY l.last_name, l.first_name`, [req.params.id, orgId]);

        const commission = await commissionDeLaSession(conn, orgId, req.params.id);
        res.json({ data: { session: s, candidats, commission } });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(409).json({ error: 'Migration 150 non jouée : procès-verbal indisponible.' });
        }
        console.error('Erreur lecture commission :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/examens/session/:id — crée ou met à jour la commission. */
const saveCommission = async (req, res) => {
    const orgId = req.user.organization_id;
    const b = req.body || {};
    try {
        const conn = db.promise();
        const [[s]] = await conn.query(
            'SELECT id FROM training_session WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!s) return res.status(404).json({ error: 'Session introuvable.' });

        const avecPv = await supportePv(conn);
        const existante = await commissionDeLaSession(conn, orgId, req.params.id);
        if (existante && existante.status === 'CLOTUREE') {
            return res.status(409).json({ error: 'Commission clôturée : le procès-verbal est figé.' });
        }

        /* LE NUMÉRO DE PV EST OBLIGATOIRE et unique par organisme : c'est lui qui identifie la
           session dans les archives, et c'est son absence qui a rendu les PV de 2023
           inexploitables. On ne l'invente pas — l'organisme a sa propre numérotation. */
        const pvRef = texte(b.pv_ref, 32);
        if (!pvRef) return res.status(422).json({ error: 'Le numéro de procès-verbal est requis.' });
        const date = texte(b.date_examen, 10);
        if (!date) return res.status(422).json({ error: 'La date de la commission est requise.' });

        const champs = {
            certification: texte(b.certification, 160) || 'Certification',
            rncp_code: texte(b.rncp_code, 20),
            voie_acces: VOIES.includes(b.voie_acces) ? b.voie_acces : 'FORMATION_CONTINUE',
            pv_ref: pvRef,
            date_examen: date,
            lieu: texte(b.lieu, 200) || '',
            centre: texte(b.centre, 200) || '',
            jury: juryPropre(b.jury),
        };
        const sup = avecPv ? {
            heure: texte(b.heure, 10),
            representant: texte(b.representant, 200),
            representant_fonction: texte(b.representant_fonction, 160),
            aleas: texte(b.aleas, 2000),
        } : {};
        const tout = { ...champs, ...sup };

        if (existante) {
            const cles = Object.keys(tout);
            await conn.query(`UPDATE exam_session SET ${cles.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
                [...cles.map((k) => tout[k]), existante.id]);
        } else {
            const cles = Object.keys(tout);
            await conn.query(
                `INSERT INTO exam_session (id, organization_id, training_session_id, ${cles.join(', ')})
                 VALUES (?, ?, ?, ${cles.map(() => '?').join(', ')})`,
                [crypto.randomUUID(), orgId, req.params.id, ...cles.map((k) => tout[k])]);
        }
        logAudit(req, 'examen.commission', 'ExamSession', req.params.id);
        res.json({ data: await commissionDeLaSession(conn, orgId, req.params.id) });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ce numéro de procès-verbal est déjà utilisé.' });
        }
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(409).json({ error: 'Migration 150 non jouée : procès-verbal indisponible.' });
        }
        console.error('Erreur enregistrement commission :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/examens/decision — la décision de la commission pour UN candidat. */
const saveDecision = async (req, res) => {
    const orgId = req.user.organization_id;
    const { session_id: sessionId, learner_id: learnerId, decision } = req.body || {};
    if (!sessionId || !learnerId) return res.status(422).json({ error: 'Session et candidat requis.' });
    if (!DECISIONS.includes(decision)) return res.status(422).json({ error: 'Décision invalide.' });
    try {
        const conn = db.promise();
        const commission = await commissionDeLaSession(conn, orgId, sessionId);
        if (!commission) return res.status(404).json({ error: 'Aucune commission pour cette session.' });
        if (commission.status === 'CLOTUREE') {
            return res.status(409).json({ error: 'Commission clôturée : les décisions sont figées.' });
        }
        /* LE CANDIDAT DOIT ÊTRE INSCRIT À LA SESSION : sans cette vérification, un identifiant
           glissé dans la requête ferait porter une décision de jury au dossier d'un autre. */
        const [[ok]] = await conn.query(
            `SELECT e.id FROM enrollment e
              WHERE e.session_id = ? AND e.learner_id = ? AND e.organization_id = ? LIMIT 1`,
            [sessionId, learnerId, orgId]);
        if (!ok) return res.status(404).json({ error: 'Candidat non inscrit à cette session.' });

        const observations = texte(req.body.observations, 1000);
        /* UNE DÉCISION DÉFAVORABLE SE MOTIVE, sinon elle n'est pas opposable au recours. */
        if ((decision === 'AJOURNE' || decision === 'EXCLU') && !observations) {
            return res.status(422).json({ error: 'Une décision défavorable doit être motivée.' });
        }
        await conn.query(
            `INSERT INTO exam_result (id, exam_session_id, learner_id, decision, observations)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE decision = VALUES(decision), observations = VALUES(observations)`,
            [crypto.randomUUID(), commission.id, learnerId, decision, observations]);
        logAudit(req, 'examen.decision', 'ExamSession', sessionId);
        res.json({ data: await commissionDeLaSession(conn, orgId, sessionId) });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(409).json({ error: 'Migration 150 non jouée : procès-verbal indisponible.' });
        }
        console.error('Erreur décision de jury :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/examens/session/:id/cloturer — la commission a délibéré, le PV est figé.
 *
 * ON REFUSE DE CLÔTURER TANT QU'UN CANDIDAT EST « EN COURS ». Un PV qui annonce « 0 admis,
 * 0 non admis » sur deux inscrits ne dit rien, et il est signé.
 */
const cloturerCommission = async (req, res) => {
    const orgId = req.user.organization_id;
    try {
        const conn = db.promise();
        const commission = await commissionDeLaSession(conn, orgId, req.params.id);
        if (!commission) return res.status(404).json({ error: 'Aucune commission pour cette session.' });
        if (commission.status === 'CLOTUREE') return res.status(409).json({ error: 'Commission déjà clôturée.' });

        const [candidats] = await conn.query(
            'SELECT learner_id FROM enrollment WHERE session_id = ? AND organization_id = ?', [req.params.id, orgId]);
        const prises = new Map(commission.resultats.map((r) => [r.learner_id, r.decision]));
        const restants = candidats.filter((c) => !prises.has(c.learner_id) || prises.get(c.learner_id) === 'EN_COURS');
        if (restants.length) {
            return res.status(422).json({ error: `${restants.length} candidat(s) sans décision.` });
        }
        /* LA COMPOSITION DU JURY EST UNE CONDITION DE VALIDITÉ : « en l'absence d'un membre, la
           session ne se tient pas » (règlement d'examen, article 6). Un PV signé par deux
           personnes là où trois sont exigées se retourne contre l'organisme. */
        if (!commission.jury || commission.jury.length < 3) {
            return res.status(422).json({ error: 'La commission doit compter au moins trois membres.' });
        }
        await conn.query("UPDATE exam_session SET status = 'CLOTUREE', cloture_at = NOW() WHERE id = ?", [commission.id]);
        logAudit(req, 'examen.cloture', 'ExamSession', req.params.id);
        res.json({ data: await commissionDeLaSession(conn, orgId, req.params.id) });
    } catch (err) {
        console.error('Erreur clôture commission :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** Contexte de rendu du PV : la commission, ses candidats, l'organisme. */
async function contextePv(conn, orgId, sessionId) {
    const commission = await commissionDeLaSession(conn, orgId, sessionId);
    if (!commission) return null;
    const [[org]] = await conn.query('SELECT * FROM organization WHERE id = ?', [orgId]);
    const [candidats] = await conn.query(
        `SELECT l.id AS learner_id, l.first_name, l.last_name, l.civility,
                DATE_FORMAT(l.birthday, '%d/%m/%Y') AS birthday
           FROM enrollment e JOIN learner l ON l.id = e.learner_id
          WHERE e.session_id = ? AND e.organization_id = ?
          ORDER BY l.last_name, l.first_name`, [sessionId, orgId]);
    const parCandidat = new Map(commission.resultats.map((r) => [r.learner_id, r]));
    const lignes = candidats.map((c) => ({
        ...c, decision: (parCandidat.get(c.learner_id) || {}).decision || 'EN_COURS',
        observations: (parCandidat.get(c.learner_id) || {}).observations || '',
    }));
    return { org: org || {}, exam: commission, pvCandidats: lignes };
}

/** POST /api/examens/session/:id/pv — rend le procès-verbal en PDF. */
const pvPdf = async (req, res) => {
    const orgId = req.user.organization_id;
    try {
        const conn = db.promise();
        const ctx = await contextePv(conn, orgId, req.params.id);
        if (!ctx) return res.status(404).json({ error: 'Aucune commission pour cette session.' });
        const slug = String(req.query.slug || 'pv-jury');
        const content = await getTemplateContent(orgId, slug);
        if (!content || content.kind !== 'builder') {
            return res.status(404).json({ error: `Modèle « ${slug} » introuvable. Créez-le depuis Modèles.` });
        }
        const pdf = await composeDocumentPdf({
            bodyHtml: content.html, headerHtml: content.header, footerHtml: content.footer,
            ctx, useLetterhead: !(content.layout && content.layout.noLetterhead),
            bleed: (content.layout && content.layout.bleed) || {},
        });
        logAudit(req, 'examen.pv', 'ExamSession', req.params.id);
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `inline; filename="pv-${(ctx.exam.pv_ref || 'jury').replace(/[^a-zA-Z0-9-]/g, '')}.pdf"`);
        res.send(pdf);
    } catch (e) {
        if (e && e.code === 'NO_SOFFICE') {
            return res.status(501).json({ error: "LibreOffice n'est pas installé sur le serveur." });
        }
        console.error('Erreur rendu PV :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getCommission, saveCommission, saveDecision, cloturerCommission, pvPdf,
    commissionDeLaSession, contextePv, ADMIS, DECISIONS,
};
