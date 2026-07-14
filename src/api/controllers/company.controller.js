const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/database.js');
const { generatePassword } = require('../lib/crypto.js');
const { createStagiaireAccount } = require('./learner.controller.js');
const { loadOrgSteps } = require('./template.controller.js');
const { formationSteps } = require('./formationProgram.controller.js');
const { computeDocParcours } = require('../lib/parcours.js');
const { stagiaireSignsDoc } = require('../lib/documents.js');

const clean = (v) => (v === undefined || v === '' ? null : v);
const isMissingSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');

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
        // Sessions où l'entreprise a des stagiaires inscrits (pour le parcours entreprise).
        let sessions = [];
        try {
            [sessions] = await conn.query(
                `SELECT DISTINCT s.id, s.week, s.year, p.code AS program_code, p.title AS program_title
                 FROM enrollment e
                 JOIN training_session s ON s.id = e.session_id
                 JOIN training_program p ON p.id = s.program_id
                 WHERE e.company_id = ? AND e.organization_id = ?
                 ORDER BY s.year DESC, s.week DESC`,
                [req.params.id, req.user.organization_id]
            );
        } catch (e) { if (!isMissingSchema(e)) throw e; }
        res.json({ data: { ...company, learners, sessions } });
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
 * Corps : {
 *   session_id?,
 *   stagiaires: [{ civility, first_name, last_name, email, phone }]  // nouveaux à créer
 *   learner_ids: [id, …]                                             // stagiaires existants à rattacher
 * }
 * Nouveaux : créés (financement PRO, rattachés, compte si e-mail libre). Existants : rattachés
 * à l'entreprise (financement PRO). Tous inscrits à la session si fournie (sans doublon).
 */
const registerCompanyStagiaires = async (req, res) => {
    const orgId = req.user.organization_id;
    const list = Array.isArray(req.body?.stagiaires) ? req.body.stagiaires : [];
    const learnerIds = Array.isArray(req.body?.learner_ids) ? req.body.learner_ids.filter(Boolean) : [];
    const sessionId = req.body?.session_id || null;
    if (!list.length && !learnerIds.length) return res.status(422).json({ error: 'Aucun stagiaire à inscrire.' });
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

        // Inscrit un stagiaire (existant) à la session, sans doublon ; ajoute le badge.
        async function enrollLearner(learnerId) {
            if (!sessionId) return false;
            const [[ex]] = await conn.query('SELECT id FROM enrollment WHERE learner_id = ? AND session_id = ?', [learnerId, sessionId]);
            if (ex) {
                await conn.query("UPDATE enrollment SET company_id = ?, financing = 'PROFESSIONNEL' WHERE id = ?", [company.id, ex.id]);
            } else {
                await conn.query(
                    `INSERT INTO enrollment (id, organization_id, learner_id, session_id, company_id, financing, crm_stage, conformite_score)
                     VALUES (UUID(), ?, ?, ?, ?, 'PROFESSIONNEL', 'INSCRIT', 'ROUGE')`,
                    [orgId, learnerId, sessionId, company.id]
                );
            }
            if (badge) {
                const [[l]] = await conn.query('SELECT levels FROM learner WHERE id = ?', [learnerId]);
                const set = new Set((l?.levels || '').split(',').map((x) => x.trim()).filter(Boolean));
                if (!set.has(badge)) { set.add(badge); await conn.query('UPDATE learner SET levels = ? WHERE id = ?', [[...set].join(','), learnerId]); }
            }
            return true;
        }

        const created = [];

        // 1) Stagiaires EXISTANTS : rattachés à l'entreprise + inscrits.
        if (learnerIds.length) {
            const [rows] = await conn.query(
                'SELECT id, user_id, email, first_name, last_name, phone FROM learner WHERE id IN (?) AND organization_id = ?',
                [learnerIds, orgId]
            );
            for (const l of rows) {
                await conn.query("UPDATE learner SET company_id = ?, financing = 'PROFESSIONNEL' WHERE id = ? AND organization_id = ?", [company.id, l.id, orgId]);
                // Compte de connexion si absent et e-mail disponible.
                let account = null;
                if (!l.user_id && l.email) {
                    account = await createStagiaireAccount(conn, orgId, { email: l.email, first_name: l.first_name, last_name: l.last_name, phone: l.phone });
                    if (account) await conn.query('UPDATE learner SET user_id = ? WHERE id = ?', [account.userId, l.id]);
                }
                const enrolled = await enrollLearner(l.id);
                created.push({ learner_id: l.id, name: [l.first_name, l.last_name].filter(Boolean).join(' '), email: l.email || null, password: account?.password || null, account: !!(l.user_id || account), enrolled, existing: true });
            }
        }

        // 2) NOUVEAUX stagiaires : créés puis inscrits.
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
            created.push({ learner_id: learnerId, name: [first, last].filter(Boolean).join(' '), email: email || null, password: account?.password || null, account: !!account, enrolled, existing: false });
        }

        res.status(201).json({ message: `${created.length} stagiaire(s) inscrit(s).`, data: { created } });
    } catch (err) {
        console.error('Erreur inscription groupe entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/companies/:id/doc-templates?session_id= — PARCOURS ENTREPRISE de la
 * formation de la session : étapes company_level actives, dans l'ordre défini
 * (program_step), + le point de rupture entreprise (company_break_slug).
 */
const companyDocTemplates = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        let program = null;
        if (req.query.session_id) {
            const [[s]] = await conn.query(
                `SELECT p.id, p.code, p.days, p.hygiene, p.rs_code, p.company_break_slug
                 FROM training_session s JOIN training_program p ON p.id = s.program_id
                 WHERE s.id = ? AND s.organization_id = ?`, [req.query.session_id, orgId]);
            program = s || null;
        }
        let out, breakSlug = null;
        if (program) {
            // Respecte l'ordre + l'inclusion du parcours entreprise défini sur la formation.
            const steps = await formationSteps(conn, orgId, program);
            out = steps
                .filter((s) => s.active && s.company_level)
                .map((s) => ({ slug: s.slug, label: s.label, doc_type: s.doc_type }));
            breakSlug = program.company_break_slug || null;
        } else {
            // Sans session : tous les modèles entreprise de l'organisme.
            const steps = await loadOrgSteps(orgId);
            out = steps.filter((s) => s.active && s.company_level).map((s) => ({ slug: s.slug, label: s.label, doc_type: s.doc_type }));
        }
        res.json({ data: out, break_slug: breakSlug });
    } catch (err) {
        console.error('Erreur modèles entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/companies/:id/documents?session_id= — documents « entreprise » générés. */
const listCompanyDocuments = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const params = [orgId, req.params.id];
        let where = "organization_id = ? AND company_id = ? AND scope = 'COMPANY'";
        if (req.query.session_id) { where += ' AND session_id = ?'; params.push(req.query.session_id); }
        const [rows] = await conn.query(
            `SELECT id, type, template_slug, title, status, session_id,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
                    DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i') AS sent_at
             FROM generated_document WHERE ${where} ORDER BY created_at DESC`, params);
        res.json({ data: rows });
    } catch (err) {
        if (isMissingSchema(err)) return res.json({ data: [] }); // migration 077 non jouée
        console.error('Erreur documents entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/companies/:id/documents — génère un document « entreprise » (liste le groupe). */
const createCompanyDocument = async (req, res) => {
    const orgId = req.user.organization_id;
    const { session_id, template_slug } = req.body || {};
    if (!session_id || !template_slug) return res.status(422).json({ error: 'Session et modèle requis.' });
    try {
        const conn = db.promise();
        const [[company]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const [[sess]] = await conn.query('SELECT id FROM training_session WHERE id = ? AND organization_id = ?', [session_id, orgId]);
        if (!sess) return res.status(404).json({ message: 'Session introuvable.' });

        const steps = await loadOrgSteps(orgId);
        const step = steps.find((s) => s.slug === template_slug && s.active && s.company_level);
        if (!step) return res.status(422).json({ error: 'Modèle « entreprise » introuvable.' });

        const [enr] = await conn.query(
            'SELECT id FROM enrollment WHERE session_id = ? AND company_id = ? AND organization_id = ?',
            [session_id, company.id, orgId]
        );
        if (!enr.length) return res.status(422).json({ error: 'Aucun stagiaire de cette entreprise dans cette session.' });

        // Remplace la version en attente (non signée) du même modèle pour ce groupe.
        try {
            await conn.query(
                "DELETE FROM generated_document WHERE organization_id = ? AND company_id = ? AND session_id = ? AND template_slug = ? AND status <> 'SIGNE'",
                [orgId, company.id, session_id, template_slug]
            );
        } catch (e) { if (!isMissingSchema(e)) throw e; }

        const id = crypto.randomUUID();
        try {
            await conn.query(
                `INSERT INTO generated_document (id, organization_id, learner_id, type, template_slug, title, status, scope, company_id, session_id)
                 VALUES (?, ?, NULL, ?, ?, ?, 'A_FAIRE', 'COMPANY', ?, ?)`,
                [id, orgId, step.doc_type, template_slug, step.label, company.id, session_id]
            );
        } catch (e) {
            if (isMissingSchema(e)) return res.status(422).json({ message: 'Documents entreprise non initialisés (migration 077).' });
            throw e;
        }
        for (const e of enr) {
            await conn.query('INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)', [id, e.id]);
        }
        res.status(201).json({ message: 'Document entreprise préparé.', data: { id } });
    } catch (err) {
        console.error('Erreur création document entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/companies/:id — supprime une entreprise (les stagiaires sont détachés, pas supprimés : FK ON DELETE SET NULL). */
const deleteCompany = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query('DELETE FROM company WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Entreprise introuvable.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/companies/:id/learners/:learnerId — détache un stagiaire de l'entreprise. */
const detachLearner = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query(
            'UPDATE learner SET company_id = NULL WHERE id = ? AND company_id = ? AND organization_id = ?',
            [req.params.learnerId, req.params.id, req.user.organization_id]
        );
        if (!r.affectedRows) return res.status(404).json({ message: 'Stagiaire non rattaché à cette entreprise.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur détachement stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/companies/:id/parcours?session_id= — parcours documentaire ENTREPRISE
 * (même forme que le parcours d'un dossier stagiaire, cf. enrollment.getParcours) :
 * étapes company_level de la formation + statut déduit des documents entreprise générés.
 */
const getCompanyParcours = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[company]] = await conn.query('SELECT id, name FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const empty = { header: {}, steps: [], percent: 0, currentIndex: 0, currentKey: null };
        const sessionId = req.query.session_id;
        if (!sessionId) return res.json({ data: empty });

        const [[sess]] = await conn.query(
            `SELECT s.id, s.year, s.week,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                    p.id AS program_id, p.title AS program_title, p.code AS program_code,
                    p.days, p.hygiene, p.rs_code
             FROM training_session s JOIN training_program p ON p.id = s.program_id
             WHERE s.id = ? AND s.organization_id = ?`, [sessionId, orgId]);
        if (!sess) return res.status(404).json({ message: 'Session introuvable.' });

        const program = { id: sess.program_id, code: sess.program_code, days: sess.days, hygiene: sess.hygiene, rs_code: sess.rs_code };
        const allSteps = await formationSteps(conn, orgId, program);
        const steps = allSteps.filter((s) => s.active && s.company_level);

        let docs = [];
        try {
            [docs] = await conn.query(
                `SELECT id, type, status, template_slug, quiz_id FROM generated_document
                 WHERE organization_id = ? AND company_id = ? AND session_id = ? AND scope = 'COMPANY'
                 ORDER BY created_at DESC`,
                [orgId, company.id, sessionId]);
        } catch (e) { if (!isMissingSchema(e)) throw e; }

        const parc = computeDocParcours({ steps, docs });
        res.json({
            data: {
                header: {
                    title: sess.program_title || '—', code: sess.program_code || '',
                    session: sess.week ? `SEM ${sess.week}/${sess.year || ''}` : '',
                    dates: sess.start_date ? `${sess.start_date}${sess.end_date ? ` → ${sess.end_date}` : ''}` : '',
                    financing: 'Entreprise', opco: null,
                },
                ...parc,
            },
        });
    } catch (err) {
        console.error('Erreur parcours entreprise :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/companies/:id/learner-documents?session_id= — documents des STAGIAIRES du
 * groupe (dans la session) que le stagiaire devrait signer : le représentant de
 * l'entreprise les signe à leur place (lien de signature, slot « stagiaire »). Le
 * stagiaire en récupère la copie signée dans son espace (c'est son document).
 */
const getCompanyLearnerDocuments = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[company]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const sessionId = req.query.session_id;
        if (!sessionId) return res.json({ data: [] });

        const orgSteps = await loadOrgSteps(orgId);
        const [rows] = await conn.query(
            `SELECT DISTINCT gd.id, gd.title, gd.type, gd.status, gd.template_slug,
                    l.id AS learner_id, l.civility, l.first_name, l.last_name
             FROM enrollment e
             JOIN learner l ON l.id = e.learner_id
             JOIN document_formation df ON df.enrollment_id = e.id
             JOIN generated_document gd ON gd.id = df.document_id AND gd.learner_id = l.id
             WHERE e.company_id = ? AND e.session_id = ? AND e.organization_id = ?
             ORDER BY l.last_name, l.first_name, gd.created_at`,
            [company.id, sessionId, orgId]
        );
        // Ne garde que les documents que le STAGIAIRE devrait signer.
        const out = rows.filter((d) => stagiaireSignsDoc(orgSteps, d));
        res.json({ data: out });
    } catch (err) {
        console.error('Erreur documents stagiaires (entreprise) :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/companies/:id/representative-account — crée (ou réinitialise) le compte
 * de connexion du REPRÉSENTANT de l'entreprise (rôle ENTREPRISE), pour qu'il signe
 * lui-même les documents de niveau entreprise. Renvoie l'e-mail + le mot de passe
 * (affiché une seule fois).
 */
const createRepresentativeAccount = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[company]] = await conn.query('SELECT * FROM company WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!company) return res.status(404).json({ message: 'Entreprise introuvable.' });
        const email = (company.email || '').trim();
        if (!email) return res.status(422).json({ message: "Renseigne d'abord l'e-mail de l'entreprise." });

        const [first, ...rest] = String(company.representative_name || company.name || 'Représentant').trim().split(/\s+/);
        const last = rest.join(' ') || '';

        // Compte existant pour cet e-mail dans l'organisme ? (le référent peut DÉJÀ être un
        // stagiaire / membre du bureau — cas fréquent d'une société au nom du propriétaire).
        const linkedId = company.user_id || null;
        const [[u]] = await conn.query('SELECT id, role FROM user WHERE email = ? AND organization_id = ?', [email, orgId]);
        const existing = u || (linkedId ? { id: linkedId, role: null } : null);

        const linkCompany = async (uid) => {
            try { await conn.query('UPDATE company SET user_id = ? WHERE id = ? AND organization_id = ?', [uid, company.id, orgId]); }
            catch (e) { if (!isMissingSchema(e)) throw e; } // migration 084 non jouée
        };

        if (existing) {
            // Ce compte appartient-il à une vraie personne à NE PAS écraser (stagiaire lié,
            // ou membre du bureau) ? Si oui, on ne touche NI son rôle NI son mot de passe :
            // on rattache juste l'entreprise à son compte -> il gagne l'accès « Entreprise »
            // en plus, via sa connexion habituelle.
            const [[lc]] = await conn.query('SELECT COUNT(*) AS n FROM learner WHERE user_id = ?', [existing.id]);
            const isRealPerson = lc.n > 0 || ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR'].includes(existing.role);
            if (isRealPerson) {
                await linkCompany(existing.id);
                return res.status(200).json({ data: { email, linked: true, existing_role: existing.role } });
            }
            // Compte représentant dédié déjà en place : on réinitialise juste le mot de passe.
            const password = generatePassword();
            await conn.query("UPDATE user SET role = 'ENTREPRISE', password = ?, first_name = ?, last_name = ? WHERE id = ? AND organization_id = ?",
                [await bcrypt.hash(password, 10), first || 'Représentant', last, existing.id, orgId]);
            await linkCompany(existing.id);
            return res.status(200).json({ data: { email, password } });
        }

        // Aucun compte pour cet e-mail : on crée un compte représentant dédié.
        const password = generatePassword();
        const userId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO user (id, organization_id, role, first_name, last_name, email, phone, password)
             VALUES (?, ?, 'ENTREPRISE', ?, ?, ?, ?, ?)`,
            [userId, orgId, first || 'Représentant', last, email, company.phone || null, await bcrypt.hash(password, 10)]);
        await linkCompany(userId);
        res.status(201).json({ data: { email, password } });
    } catch (err) {
        console.error('Erreur compte représentant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getCompanies, getCompany, createCompany, updateCompany, deleteCompany, registerCompanyStagiaires, detachLearner, companyDocTemplates, listCompanyDocuments, createCompanyDocument, getCompanyParcours, getCompanyLearnerDocuments, createRepresentativeAccount };
