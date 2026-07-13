const crypto = require('crypto');
const db = require('../config/database.js');
const { createStagiaireAccount } = require('./learner.controller.js');

const clean = (v) => (v === undefined || v === '' ? null : v);

/** GET /api/companies — entreprises de l'organisme (avec nb de stagiaires rattachés). */
const getCompanies = (req, res) => {
    db.query(
        `SELECT c.id, c.organization_id, c.name, c.siret, c.town, c.email, c.phone, c.opco,
                c.representative_civ, c.representative_name, c.created_at,
                (SELECT COUNT(*) FROM learner l WHERE l.company_id = c.id) AS learner_count
         FROM company c
         WHERE c.organization_id = ?
         ORDER BY c.name`,
        [req.user.organization_id],
        (err, results) => {
            if (err) { console.error('Erreur récupération entreprises :', err); return res.status(500).json({ error: 'Internal Server Error' }); }
            res.json({ data: results });
        }
    );
};

/** GET /api/companies/:id — une entreprise + ses stagiaires. */
const getCompany = async (req, res) => {
    try {
        const conn = db.promise();
        const [[company]] = await conn.query('SELECT * FROM company WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const [learners] = await conn.query(
            `SELECT l.id, l.civility, l.first_name, l.last_name, l.email, l.phone, l.financing,
                    (SELECT COUNT(*) FROM enrollment e WHERE e.learner_id = l.id) AS enrollment_count
             FROM learner l WHERE l.company_id = ? AND l.organization_id = ?
             ORDER BY l.last_name, l.first_name`,
            [req.params.id, req.user.organization_id]
        );
        res.json({ data: { ...company, learners } });
    } catch (err) {
        console.error('Erreur lecture entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const COMPANY_COLS = ['name', 'siret', 'naf_ape', 'legal_status', 'address', 'zip_code', 'town', 'email', 'phone', 'opco', 'representative_civ', 'representative_name', 'representative_role'];

/** POST /api/companies — crée une entreprise. */
const createCompany = async (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(422).json({ error: "Nom de l'entreprise requis" });
    try {
        const id = crypto.randomUUID();
        const cols = COMPANY_COLS.filter((k) => b[k] !== undefined);
        await db.promise().query(
            `INSERT INTO company (id, organization_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
            [id, req.user.organization_id, ...cols.map((k) => clean(b[k]))]
        );
        res.status(201).json({ message: 'Entreprise créée', data: { id } });
    } catch (err) {
        console.error('Erreur création entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/companies/:id — met à jour une entreprise. */
const updateCompany = async (req, res) => {
    const b = req.body || {};
    try {
        const conn = db.promise();
        const [[c]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!c) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const cols = COMPANY_COLS.filter((k) => b[k] !== undefined);
        if (cols.length) {
            await conn.query(
                `UPDATE company SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND organization_id = ?`,
                [...cols.map((k) => clean(b[k])), req.params.id, req.user.organization_id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur mise à jour entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/companies/:id/register — inscrit un GROUPE de stagiaires sous l'entreprise.
 * Corps : { session_id?, stagiaires: [{ civility, first_name, last_name, email, phone }] }.
 * Chaque stagiaire est créé (financement PROFESSIONNEL, rattaché à l'entreprise), doté d'un
 * compte de connexion si son e-mail est libre, puis inscrit à la session si fournie.
 */
const registerCompanyStagiaires = async (req, res) => {
    const orgId = req.user.organization_id;
    const list = Array.isArray(req.body?.stagiaires) ? req.body.stagiaires : [];
    const sessionId = req.body?.session_id || null;
    if (!list.length) return res.status(422).json({ error: 'Aucun stagiaire à inscrire.' });
    try {
        const conn = db.promise();
        const [[company]] = await conn.query('SELECT id, opco FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });

        // Badge (niveau/code) de la session, pour le rattacher aux stagiaires inscrits.
        let badge = null;
        if (sessionId) {
            const [[sess]] = await conn.query(
                `SELECT COALESCE(NULLIF(p.level, ''), p.code) AS badge FROM training_session s
                 JOIN training_program p ON p.id = s.program_id WHERE s.id = ? AND s.organization_id = ?`,
                [sessionId, orgId]
            );
            if (!sess) return res.status(404).json({ message: 'Session introuvable.' });
            badge = sess.badge || null;
        }

        const created = [];
        for (const s of list) {
            const first = clean(s.first_name), last = clean(s.last_name);
            if (!first && !last) continue;
            const email = clean(s.email);
            const account = email ? await createStagiaireAccount(conn, orgId, { email, first_name: first, last_name: last, phone: clean(s.phone) }) : null;
            const learnerId = crypto.randomUUID();
            await conn.query(
                `INSERT INTO learner (id, organization_id, company_id, user_id, civility, first_name, last_name, email, phone, financing, opco, levels)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROFESSIONNEL', ?, ?)`,
                [learnerId, orgId, company.id, account?.userId || null, clean(s.civility), first, last, email, clean(s.phone), company.opco || null, badge || null]
            );
            let enrolled = false;
            if (sessionId) {
                await conn.query(
                    `INSERT INTO enrollment (id, organization_id, learner_id, session_id, company_id, financing, crm_stage, conformite_score)
                     VALUES (UUID(), ?, ?, ?, ?, 'PROFESSIONNEL', 'INSCRIT', 'ROUGE')`,
                    [orgId, learnerId, sessionId, company.id]
                );
                enrolled = true;
            }
            created.push({
                learner_id: learnerId, name: [first, last].filter(Boolean).join(' '),
                email: email || null, password: account?.password || null,
                account: !!account, enrolled,
            });
        }
        res.status(201).json({ message: `${created.length} stagiaire(s) inscrit(s).`, data: { created } });
    } catch (err) {
        console.error('Erreur inscription groupe entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getCompanies, getCompany, createCompany, updateCompany, registerCompanyStagiaires };
