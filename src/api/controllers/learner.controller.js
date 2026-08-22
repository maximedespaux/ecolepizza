const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/database.js');
const { encrypt, decrypt, generatePassword } = require('../lib/crypto.js');
const { sendMail, appUrl } = require('../lib/mailer.js');
const { credentialsEmail, resetEmail } = require('../lib/mailTemplates.js');

// Crée un compte de connexion (rôle STAGIAIRE) pour un stagiaire, si l'email
// n'est pas déjà utilisé. Renvoie { userId, password } ou null.
/* NB — `password_plain_enc` N'EXISTE PLUS : la colonne portait une copie RÉVERSIBLE du mot de
   passe et a été supprimée par la migration 039. Le mot de passe n'est stocké qu'en bcrypt.
   Le commentaire est corrigé plutôt que retiré : lu tel quel dans un fichier qui manipule des
   mots de passe, il laissait croire qu'une copie déchiffrable traînait quelque part — et c'est
   le genre de fausse piste qui fait chercher une faille inexistante, ou pire, qui donne
   l'impression qu'on peut en récupérer un. */
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
    // E-mail de bienvenue avec les identifiants. Fire-and-forget : la création du compte NE DOIT
    // PAS échouer ni ralentir si le SMTP est lent ou absent (cf. lib/mailer.js). Sans SMTP
    // configuré, c'est un no-op — le mot de passe reste communiqué à la main comme avant.
    const { subject, html } = credentialsEmail({ firstName: first_name, email, password, loginUrl: `${appUrl()}/login` });
    sendMail({ to: email, subject, html });
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
    // Cadres exclusifs accordés par l'école (migration 113) — même idiome que `levels` : une
    // liste séparée par des virgules. Passe par cette liste blanche, donc par PATCH /:id, donc
    // par `authorizeRoles(...ADMIN_ROLES)` : un formateur ne peut pas s'accorder un Champion.
    // Il entre aussi de ce fait au journal d'audit, comme tout autre champ de la fiche.
    'cadres_exclusifs',
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
                l.birthday, l.zip_code, l.town, l.address, l.professional_status, l.levels,
                l.financing, l.opco, l.created_at,
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
            // Les badges (niveaux/codes) sont la source stockée sur le stagiaire :
            // ajoutés automatiquement à l'inscription, mais entièrement modifiables à la main.
            const data = results.map(({ account_email, levels, ...rest }) => {
                const set = new Set(String(levels || '').split(',').map((s) => s.trim()).filter(Boolean));
                return { ...rest, levels: [...set].join(','), has_account: !!account_email };
            });
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

        // Rattachement à une ENTREPRISE EXISTANTE (nouveau modèle) : simple lien via la FK.
        if (body.company_id) {
            const [[c]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [body.company_id, organizationId]);
            companyId = c ? c.id : null;
        } else if (body.company && body.company.name) {
            // Rétro-compatibilité : ancienne saisie « inline » (crée une entreprise).
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
            // `financing` est lu pour savoir s'il CHANGE réellement (voir la propagation en
            // fin de fonction) : sans lui, la comparaison porterait sur `undefined` et la
            // garde laisserait tout passer.
            'SELECT company_id, financing FROM learner WHERE id = ? AND organization_id = ?',
            [learnerId, organizationId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Stagiaire introuvable' });
        }
        let companyId = rows[0].company_id;

        // Rattachement direct à une entreprise (nouveau modèle) : lien FK, ou détachement.
        if (body.company_id !== undefined) {
            if (body.company_id) {
                const [[c]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [body.company_id, organizationId]);
                companyId = c ? c.id : null;
            } else {
                companyId = null;
            }
        // Rétro-compatibilité : ancienne saisie inline (met à jour ou crée l'entreprise).
        } else if (body.company && body.company.name) {
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

        // Champs de la fiche stagiaire. Le formulaire envoie TOUS les champs : une
        // chaîne vide signifie « vider le champ » (→ NULL), ce qui permet de remettre
        // une liste sur « — ». Seuls les champs REQUIS ne peuvent pas être vidés.
        const REQUIRED = new Set(['first_name', 'last_name', 'financing']);
        const updates = [];
        const values = [];
        for (const field of LEARNER_FIELDS) {
            if (body[field] === undefined) continue;
            if (body[field] === '' && REQUIRED.has(field)) continue; // ne pas vider un champ requis
            updates.push(`${field} = ?`);
            const raw = body[field];
            values.push(raw === '' ? null : (field === 'social_security' ? encrypt(raw) : raw));
        }
        if (companyId !== rows[0].company_id) {
            updates.push('company_id = ?');
            values.push(companyId); // peut être null (détachement)
        }

        if (updates.length > 0) {
            values.push(learnerId, organizationId);
            await conn.query(
                `UPDATE learner SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
                values
            );
        }

        // Formations TERMINÉES (marquées manuellement) — colonne optionnelle (migration 094).
        // Traitée à part pour tolérer l'absence de la colonne sans casser le reste.
        if (Object.prototype.hasOwnProperty.call(body, 'completed_levels')) {
            const cl = String(body.completed_levels || '').trim() || null;
            try {
                await conn.query('UPDATE learner SET completed_levels = ? WHERE id = ? AND organization_id = ?',
                    [cl, learnerId, organizationId]);
            } catch (e) { if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; }
        }

        // Le « type de devis » (financement) pilote le parcours documentaire, calculé à partir
        // de enrollment.financing. On propage donc un CHANGEMENT aux dossiers concernés — mais
        // sous deux gardes, absentes jusqu'ici.
        //
        // 1. SEULEMENT SI LA VALEUR A CHANGÉ. Le formulaire renvoie tous les champs à chaque
        //    enregistrement : sans cette comparaison, corriger un numéro de téléphone
        //    réécrivait le financement de tous les dossiers de la personne.
        //
        // 2. JAMAIS SUR UN DOSSIER PORTÉ PAR UNE ENTREPRISE. Un dossier rattaché à un
        //    employeur est PROFESSIONNEL par construction, avec une convention déjà signée et
        //    des documents de groupe émis. Le faire basculer en PARTICULIER depuis la fiche
        //    personne changeait son parcours sous lui : les documents signés ne correspondaient
        //    plus aux étapes attendues et la progression retombait, sans un mot ni une trace.
        //
        // C'est le même principe que le correctif company_id : ce que porte un dossier ne se
        // décide pas depuis la fiche de la personne.
        const financingAvant = rows[0].financing;
        const financingApres = body.financing;
        const aChange = (financingApres === 'PARTICULIER' || financingApres === 'PROFESSIONNEL')
            && financingApres !== financingAvant;
        if (aChange) {
            await conn.query(
                `UPDATE enrollment SET financing = ?
                  WHERE learner_id = ? AND organization_id = ? AND company_id IS NULL`,
                [financingApres, learnerId, organizationId]
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

        if (learner.email) {
            const login = `${appUrl()}/login`;
            /* Le MÊME bouton sert à créer un compte et à en réinitialiser un. L'e-mail, lui, ne
               doit pas être le même : `learner.user_id` (sa valeur AVANT réassignation) dit si le
               compte préexistait. Absent → on vient de le créer/rattacher pour ce stagiaire, donc
               e-mail de BIENVENUE avec ses identifiants (son e-mail sert d'identifiant). Présent →
               simple réinitialisation. */
            const { subject, html } = learner.user_id
                ? resetEmail({ firstName: learner.first_name, password, loginUrl: login })
                : credentialsEmail({ firstName: learner.first_name, email: learner.email, password, loginUrl: login });
            sendMail({ to: learner.email, subject, html });
        }
        res.status(200).json({
            success: true,
            created: !learner.user_id,
            message: learner.user_id ? 'Mot de passe réinitialisé' : 'Compte créé',
            password,
        });
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

/**
 * DELETE /api/stagiaires/:id/account — supprime UNIQUEMENT le compte de connexion
 * du stagiaire (la fiche, les dossiers et documents sont conservés).
 */
const deleteStagiaireAccount = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[learner]] = await conn.query(
            'SELECT id, user_id FROM learner WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!learner) return res.status(404).json({ message: 'Stagiaire introuvable' });
        if (!learner.user_id) return res.status(400).json({ message: "Ce stagiaire n'a pas de compte de connexion." });
        // Détache la fiche puis supprime le compte (login) — la fiche reste intacte.
        await conn.query('UPDATE learner SET user_id = NULL WHERE id = ?', [learner.id]);
        await conn.query('DELETE FROM user WHERE id = ? AND organization_id = ?', [learner.user_id, orgId]);
        res.json({ success: true, message: 'Compte de connexion supprimé (fiche conservée).' });
    } catch (err) {
        console.error('Erreur suppression compte stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getLearners, getLearner, createLearner, updateLearner, deleteLearner, resetStagiairePassword,
    deleteStagiaireAccount, createStagiaireAccount,
};
