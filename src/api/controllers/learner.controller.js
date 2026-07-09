const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/database.js');
const { encrypt, decrypt, generatePassword } = require('../lib/crypto.js');

// Crée un compte de connexion (rôle STAGIAIRE) pour un stagiaire, si l'email
// n'est pas déjà utilisé. Renvoie { userId, password } ou null.
// NB : password_plain_enc = copie chiffrée du mot de passe (DEV uniquement).
async function createStagiaireAccount(conn, organizationId, { email, first_name, last_name, phone }) {
    if (!email) return null;
    // Unicité par organisme : le même e-mail peut exister dans un autre organisme.
    const [existing] = await conn.query('SELECT id FROM user WHERE email = ? AND organization_id = ?', [email, organizationId]);
    if (existing.length > 0) return null; // email déjà pris dans CET organisme : pas de compte auto
    const userId = crypto.randomUUID();
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 10);
    await conn.query(
        `INSERT INTO user
            (id, organization_id, role, first_name, last_name, email, phone, password)
         VALUES (?, ?, 'STAGIAIRE', ?, ?, ?, ?, ?)`,
        [userId, organizationId, first_name, last_name, email, phone || null, hash]
    );
    return { userId, password };
}

// Champs de la « fiche d'expression du stagiaire » stockés sur learner.
const LEARNER_FIELDS = [
    'contacted_at', 'contacted_by', 'civility', 'first_name', 'last_name', 'email',
    'phone', 'birthday', 'birth_place', 'address', 'zip_code', 'town',
    'diploma_level', 'diploma_name', 'diploma_year', 'last_experience',
    'experience_value', 'experience_unit', 'professional_status', 'cpf_amount',
    'france_travail_id', 'current_contract', 'social_security', 'financing', 'opco', 'levels',
    'project_creation', 'project_takeover', 'project_oven', 'project_truck', 'project_job',
];

// Colonnes de l'entreprise (section « Informations professionnelle »).
const COMPANY_FIELDS = [
    'name', 'legal_status', 'siret', 'naf_ape', 'address', 'zip_code', 'town',
    'email', 'phone', 'opco', 'representative_civ', 'representative_name', 'representative_role',
];

// Normalise une valeur de formulaire (chaîne vide -> null).
const clean = (v) => (v === undefined || v === '' ? null : v);

/**
 * GET /api/stagiaires — liste des stagiaires de l'organisme, filtre ?q= (nom/email).
 */
const getLearners = (req, res) => {
    const organizationId = req.user.organization_id;
    const q = req.query.q ? `%${req.query.q}%` : '%';

    db.query(
        `SELECT l.id, l.organization_id, l.first_name, l.last_name, l.email, l.phone,
                l.birthday, l.zip_code, l.town, l.address, l.professional_status, l.levels, l.created_at,
                u.email AS account_email
         FROM learner l
         LEFT JOIN user u ON u.id = l.user_id
         WHERE l.organization_id = ?
           AND (l.first_name LIKE ? OR l.last_name LIKE ? OR l.email LIKE ?)
         ORDER BY l.last_name, l.first_name`,
        [organizationId, q, q, q],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération stagiaires :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            // Sécurité : on n'expose jamais les mots de passe. Le mot de passe généré
            // n'est montré qu'une seule fois, à la création / réinitialisation.
            const data = results.map((r) => ({ ...r, has_account: !!r.account_email }));
            res.json({ data });
        }
    );
};

/**
 * GET /api/stagiaires/:id — dossier complet (avec l'entreprise liée si devis pro).
 */
const getLearner = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT * FROM learner WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Stagiaire introuvable' });
        }
        // Déchiffre le n° de sécurité sociale pour l'affichage (rôle autorisé).
        const learner = { ...rows[0], social_security: decrypt(rows[0].social_security) };

        // Entreprise liée (pour préremplir la section « professionnel »).
        if (learner.company_id) {
            const [cRows] = await conn.query('SELECT * FROM company WHERE id = ?', [learner.company_id]);
            learner.company = cRows[0] || null;
        }

        res.json({ data: learner });
    } catch (err) {
        console.error('Erreur récupération stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/stagiaires
 * Corps : les champs de la fiche stagiaire (voir LEARNER_FIELDS) + un objet
 * `company` optionnel (créé et rattaché quand le devis est professionnel).
 */
const createLearner = async (req, res) => {
    const organizationId = req.user.organization_id;
    const body = req.body;

    if (!body.first_name || !body.last_name) {
        return res.status(422).json({ error: 'Nom et prénom requis' });
    }

    try {
        const conn = db.promise();
        let companyId = null;

        // Entreprise (devis professionnel) : on la crée puis on la rattache.
        if (body.company && body.company.name) {
            companyId = crypto.randomUUID();
            const cols = COMPANY_FIELDS.filter((f) => body.company[f] !== undefined && body.company[f] !== '');
            const placeholders = cols.map(() => '?').join(', ');
            const values = cols.map((f) => body.company[f]);
            await conn.query(
                `INSERT INTO company (id, organization_id, ${cols.join(', ')})
                 VALUES (?, ?, ${placeholders})`,
                [companyId, organizationId, ...values]
            );
        }

        // Compte de connexion du stagiaire (rôle STAGIAIRE) à partir de son email.
        const account = await createStagiaireAccount(conn, organizationId, {
            email: clean(body.email),
            first_name: body.first_name,
            last_name: body.last_name,
            phone: clean(body.phone),
        });

        // Stagiaire. Le n° de sécurité sociale est chiffré au repos (AES-256-GCM).
        const cols = LEARNER_FIELDS.filter((f) => body[f] !== undefined);
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((f) =>
            f === 'social_security' ? encrypt(clean(body[f])) : clean(body[f])
        );

        await conn.query(
            `INSERT INTO learner (id, organization_id, company_id, user_id, ${cols.join(', ')})
             VALUES (UUID(), ?, ?, ?, ${placeholders})`,
            [organizationId, companyId, account?.userId || null, ...values]
        );

        res.status(201).json({ message: 'Stagiaire créé', password: account?.password || null });
    } catch (err) {
        console.error('Erreur création stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/stagiaires/:id — met à jour la fiche + l'entreprise liée (upsert).
 */
const updateLearner = async (req, res) => {
    const organizationId = req.user.organization_id;
    const learnerId = req.params.id;
    const body = req.body;

    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT company_id FROM learner WHERE id = ? AND organization_id = ?',
            [learnerId, organizationId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Stagiaire introuvable' });
        }
        let companyId = rows[0].company_id;

        // Entreprise : on met à jour la fiche existante, ou on la crée si besoin.
        if (body.company && body.company.name) {
            const cols = COMPANY_FIELDS.filter((f) => body.company[f] !== undefined && body.company[f] !== '');
            const vals = cols.map((f) => body.company[f]);
            if (companyId) {
                await conn.query(
                    `UPDATE company SET ${cols.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND organization_id = ?`,
                    [...vals, companyId, organizationId]
                );
            } else {
                companyId = crypto.randomUUID();
                await conn.query(
                    `INSERT INTO company (id, organization_id, ${cols.join(', ')})
                     VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
                    [companyId, organizationId, ...vals]
                );
            }
        }

        // Champs de la fiche stagiaire.
        const updates = [];
        const values = [];
        for (const field of LEARNER_FIELDS) {
            if (body[field] !== undefined && body[field] !== '') {
                updates.push(`${field} = ?`);
                values.push(field === 'social_security' ? encrypt(body[field]) : body[field]);
            }
        }
        if (companyId && companyId !== rows[0].company_id) {
            updates.push('company_id = ?');
            values.push(companyId);
        }

        if (updates.length > 0) {
            values.push(learnerId, organizationId);
            await conn.query(
                `UPDATE learner SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
                values
            );
        }

        res.status(200).json({ success: true, message: 'Stagiaire mis à jour' });
    } catch (err) {
        console.error('Erreur mise à jour stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/stagiaires/:id/reset-password — régénère le mot de passe du compte
 * stagiaire (le crée si besoin). Renvoie le nouveau mot de passe en clair.
 */
const resetStagiairePassword = async (req, res) => {
    const organizationId = req.user.organization_id;
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT id, user_id, email, first_name, last_name, phone FROM learner WHERE id = ? AND organization_id = ?',
            [req.params.id, organizationId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Stagiaire introuvable' });
        }
        const learner = rows[0];
        const password = generatePassword();
        const hash = await bcrypt.hash(password, 10);

        let userId = learner.user_id;
        if (userId) {
            await conn.query('UPDATE user SET password = ? WHERE id = ? AND organization_id = ?',
                [hash, userId, organizationId]);
        } else {
            if (!learner.email) {
                return res.status(422).json({ error: "Ce stagiaire n'a pas d'email : impossible de créer un compte." });
            }
            // Cloisonnement : ne rattacher/réinitialiser qu'un compte du MÊME organisme.
            const [ex] = await conn.query('SELECT id FROM user WHERE email = ? AND organization_id = ?', [learner.email, organizationId]);
            if (ex.length > 0) {
                userId = ex[0].id;
                await conn.query('UPDATE user SET password = ? WHERE id = ? AND organization_id = ?',
                    [hash, userId, organizationId]);
            } else {
                userId = crypto.randomUUID();
                await conn.query(
                    `INSERT INTO user
                        (id, organization_id, role, first_name, last_name, email, phone, password)
                     VALUES (?, ?, 'STAGIAIRE', ?, ?, ?, ?, ?)`,
                    [userId, organizationId, learner.first_name, learner.last_name, learner.email, learner.phone || null, hash]
                );
            }
            await conn.query('UPDATE learner SET user_id = ? WHERE id = ?', [userId, learner.id]);
        }

        res.status(200).json({ success: true, message: 'Mot de passe réinitialisé', password });
    } catch (err) {
        console.error('Erreur réinitialisation mot de passe :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/stagiaires/:id
 */
const deleteLearner = (req, res) => {
    db.query(
        'DELETE FROM learner WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression stagiaire :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            res.status(200).json({ success: true, message: 'Stagiaire supprimé' });
        }
    );
};

module.exports = {
    getLearners, getLearner, createLearner, updateLearner, deleteLearner, resetStagiairePassword,
};
