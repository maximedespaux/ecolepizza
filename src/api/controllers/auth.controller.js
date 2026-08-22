const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', 'config', '.env') });

const db = require('../config/database.js');
const { sendMail, appUrl } = require('../lib/mailer.js');
const { resetLinkEmail, securityAlertEmail } = require('../lib/mailTemplates.js');

const JWT_SECRET = process.env.JWT_SECRET;

// Hash « leurre » : sert à égaliser le temps de réponse quand l'utilisateur
// n'existe pas (évite l'énumération de comptes par mesure du temps de réponse).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-equalization', 10);

/* ─── Sécurité des changements sensibles (mot de passe / e-mail) ──────────────────────────────
 * Coupe TOUTES les sessions du compte : `sessions_valid_after = NOW()` (cf. middleware + migration
 * 137). No-op silencieux si la colonne n'existe pas encore — le code marche avant/après migration.
 */
async function couperSessions(userId) {
    try {
        await db.promise().query('UPDATE user SET sessions_valid_after = NOW() WHERE id = ?', [userId]);
    } catch (e) {
        if (!e || e.code !== 'ER_BAD_FIELD_ERROR') console.error('couperSessions:', e.message);
    }
}

/* Réémet un cookie frais (iat = maintenant) pour garder connectée la session QUI vient de faire le
 * changement — sinon `couperSessions` la déconnecterait elle aussi. Appelé APRÈS couperSessions. */
function reemettreSession(res, u) {
    const token = jwt.sign(
        { id: u.id, email: u.email, role: u.role, organization_id: u.organization_id },
        JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
    res.cookie('auth_token', token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax',
        maxAge: 1000 * 60 * 60 * 24 * 7,
    });
}

/* Jeton d'annulation (24 h), signé par le serveur donc infalsifiable. Porte la valeur à restaurer
 * (ancien e-mail, ou ancien hash de mot de passe). Purpose dédié pour qu'il ne serve à rien d'autre. */
function jetonAnnulation(userId, kind, prev) {
    return jwt.sign({ id: userId, purpose: 'annuler', kind, prev }, JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '24h' });
}

/* Envoie l'alerte « votre X a été modifié — ce n'était pas vous ? » avec le lien d'annulation. */
function alerteChangement({ toEmail, firstName, userId, kind, prev, detail }) {
    if (!toEmail) return;
    const cancelUrl = `${appUrl()}/annuler?token=${encodeURIComponent(jetonAnnulation(userId, kind, prev))}`;
    const { subject, html } = securityAlertEmail({ firstName, kind, detail, cancelUrl });
    sendMail({ to: toEmail, subject, html, kind: 'security' }); // best-effort
}

// nav_access est stocké en JSON (colonne TEXT) : on le renvoie TOUJOURS désérialisé
// (objet), sinon le front reçoit une chaîne et considère l'accès comme vide.
function withParsedNav(user) {
    if (user && typeof user.nav_access === 'string') {
        try { user.nav_access = JSON.parse(user.nav_access); } catch { user.nav_access = null; }
    }
    return user;
}

/**
 * GET /api/auth/me — renvoie l'utilisateur connecté (sans le mot de passe).
 */
const getCurrentUser = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query('SELECT * FROM user WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.status(404).json({ message: 'Utilisateur introuvable' });
        const { password, ...user } = rows[0];
        withParsedNav(user);
        // Ce compte est-il aussi rattaché à une fiche stagiaire ? (ex. intervenant
        // ancien stagiaire) -> on lui redonne l'espace stagiaire en plus.
        const [[lc]] = await conn.query('SELECT COUNT(*) AS n FROM learner WHERE user_id = ?', [req.user.id]);
        user.has_learner = lc.n > 0;
        // Ce compte est-il aussi le représentant d'une entreprise ? (accès signature entreprise)
        try { const [[cc]] = await conn.query('SELECT COUNT(*) AS n FROM company WHERE user_id = ?', [req.user.id]); user.has_company = cc.n > 0; }
        catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; user.has_company = false; }
        return res.status(200).json({ success: true, data: user });
    } catch (err) {
        console.error('Erreur récupération utilisateur :', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/auth — connexion par email + mot de passe, pose un cookie JWT.
 */
const userAuthentification = async (req, res) => {
    const { email, password } = req.body;
    const orgCode = String(req.body.org_code || '').trim().toUpperCase();
    const stayConnected = req.body.stayConnected !== false;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }

    try {
        const conn = db.promise();
        let user;

        if (orgCode) {
            // Connexion ciblée sur un organisme précis (multi-tenant).
            const [[org]] = await conn.query('SELECT id FROM organization WHERE code = ?', [orgCode]);
            if (org) {
                const [rows] = await conn.query('SELECT * FROM user WHERE email = ? AND organization_id = ?', [email, org.id]);
                user = rows[0];
            }
        } else {
            // Sans code : rétro-compatible tant que l'e-mail est unique globalement.
            const [rows] = await conn.query('SELECT * FROM user WHERE email = ?', [email]);
            if (rows.length > 1) {
                return res.status(409).json({ message: "Plusieurs organismes utilisent cet e-mail. Précisez le code organisme." });
            }
            user = rows[0];
        }

        // Toujours effectuer une comparaison bcrypt (leurre si aucun utilisateur)
        // afin d'égaliser le temps de réponse et d'éviter l'énumération de comptes.
        const isMatch = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
        if (!user || !isMatch) return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

        // Accès désactivé par un administrateur (colonne `active` — cf. migration 011).
        if (user.active === 0) {
            return res.status(403).json({ message: 'Compte désactivé. Contactez un administrateur.' });
        }

        // Trace de la dernière connexion (non bloquant).
        conn.query('UPDATE user SET last_login_at = NOW() WHERE id = ?', [user.id]).catch(() => {});

        // Toujours une expiration (pas de jeton éternel) : 7 j si « rester connecté », sinon 1 h.
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, organization_id: user.organization_id },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: stayConnected ? '7d' : '1h' }
        );

        const maxAge = stayConnected ? 1000 * 60 * 60 * 24 * 7 : 1000 * 60 * 60;

        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax', // protège du CSRF cross-site (front & API sont same-site)
            maxAge,
        });

        const { password: _pw, ...userWithoutPassword } = user;
        withParsedNav(userWithoutPassword);
        const [[lc]] = await conn.query('SELECT COUNT(*) AS n FROM learner WHERE user_id = ?', [user.id]);
        userWithoutPassword.has_learner = lc.n > 0;
        try { const [[cc]] = await conn.query('SELECT COUNT(*) AS n FROM company WHERE user_id = ?', [user.id]); userWithoutPassword.has_company = cc.n > 0; }
        catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; userWithoutPassword.has_company = false; }
        // Le jeton n'est PAS renvoyé dans le corps : il vit uniquement dans le
        // cookie httpOnly (non lisible par JavaScript). Réduit la surface d'exfiltration.
        return res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            data: userWithoutPassword,
        });
    } catch (err) {
        console.error('Erreur récupération utilisateur :', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/auth/password — l'utilisateur connecté change son propre mot de
 * passe (vérification du mot de passe actuel obligatoire).
 */
const changePassword = (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Mot de passe actuel et nouveau mot de passe requis.' });
    }
    if (String(newPassword).length < 8) {
        return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
    }

    db.query('SELECT password, email, first_name FROM user WHERE id = ?', [req.user.id], async (err, results) => {
        if (err) {
            console.error('Erreur changement de mot de passe :', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Utilisateur introuvable' });
        }
        const isMatch = await bcrypt.compare(currentPassword, results[0].password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
        }
        const ancienHash = results[0].password; // pour l'annulation « ce n'était pas moi »
        const hashed = await bcrypt.hash(newPassword, 10);
        db.query('UPDATE user SET password = ? WHERE id = ?', [hashed, req.user.id], async (uErr) => {
            if (uErr) {
                console.error('Erreur mise à jour mot de passe :', uErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            // Coupe toutes les sessions (dont celle d'un éventuel pirate), PUIS réémet un cookie
            // pour garder connectée la session qui vient de faire le changement.
            await couperSessions(req.user.id);
            reemettreSession(res, req.user);
            alerteChangement({
                toEmail: results[0].email, firstName: results[0].first_name,
                userId: req.user.id, kind: 'pwd', prev: ancienHash,
            });
            res.json({ success: true, message: 'Mot de passe modifié.' });
        });
    });
};

/**
 * PATCH /api/auth/email — l'utilisateur change sa propre adresse e-mail
 * (mot de passe actuel requis ; unicité vérifiée). Synchronise le stagiaire lié.
 */
const changeEmail = (req, res) => {
    const { newEmail, currentPassword } = req.body || {};
    const email = String(newEmail || '').trim().toLowerCase();
    if (!email || !currentPassword) return res.status(400).json({ message: 'Nouvel e-mail et mot de passe actuel requis.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Adresse e-mail invalide.' });

    db.query('SELECT password, email, first_name FROM user WHERE id = ?', [req.user.id], async (err, results) => {
        if (err) { console.error('Erreur changement e-mail :', err); return res.status(500).json({ error: 'Internal Server Error' }); }
        if (results.length === 0) return res.status(404).json({ message: 'Utilisateur introuvable' });
        const isMatch = await bcrypt.compare(currentPassword, results[0].password);
        if (!isMatch) return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
        const ancienEmail = results[0].email;   // l'alerte part vers l'ANCIENNE adresse
        const prenom = results[0].first_name;
        db.query('SELECT id FROM user WHERE email = ? AND id <> ?', [email, req.user.id], (dErr, dup) => {
            if (dErr) { console.error('Erreur unicité e-mail :', dErr); return res.status(500).json({ error: 'Internal Server Error' }); }
            if (dup.length) return res.status(409).json({ message: 'Cette adresse e-mail est déjà utilisée.' });
            db.query('UPDATE user SET email = ? WHERE id = ?', [email, req.user.id], (uErr) => {
                if (uErr) { console.error('Erreur mise à jour e-mail :', uErr); return res.status(500).json({ error: 'Internal Server Error' }); }
                db.query('UPDATE learner SET email = ? WHERE user_id = ?', [email, req.user.id], async () => {
                    // L'alerte va vers l'ANCIENNE adresse : c'est le seul endroit que le vrai
                    // propriétaire contrôle encore si un tiers vient de détourner son compte.
                    await couperSessions(req.user.id);
                    reemettreSession(res, { ...req.user, email });
                    alerteChangement({
                        toEmail: ancienEmail, firstName: prenom, userId: req.user.id,
                        kind: 'email', prev: ancienEmail,
                        detail: `Nouvelle adresse : ${email}.`,
                    });
                    res.json({ success: true, email });
                });
            });
        });
    });
};

/**
 * POST /api/auth/logout — supprime le cookie.
 */
const logout = (req, res) => {
    res.clearCookie('auth_token', { httpOnly: true, sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' });
    return res.status(200).json({ success: true, message: 'Déconnexion réussie' });
};

/**
 * POST /api/auth/forgot — demande de réinitialisation (« mot de passe oublié »).
 *
 * RÉPONSE TOUJOURS IDENTIQUE, que le compte existe ou non : révéler « cette adresse n'existe pas »
 * transformerait ce point d'entrée en oracle d'énumération de comptes. Le limiteur `countAll`
 * (cf. routes) empêche par ailleurs de bombarder un destinataire d'e-mails.
 */
async function forgotPassword(req, res) {
    const email = String(req.body?.email || '').trim();
    const orgCode = req.body?.orgCode ? String(req.body.orgCode).trim() : null;
    const generique = { success: true, message: "Si un compte correspond à cette adresse, un e-mail de réinitialisation vient d'être envoyé." };
    if (!email) return res.status(200).json(generique);
    try {
        const conn = db.promise();
        let user = null;
        if (orgCode) {
            const [[org]] = await conn.query('SELECT id FROM organization WHERE code = ?', [orgCode]);
            if (org) {
                const [rows] = await conn.query('SELECT id, first_name, email, password FROM user WHERE email = ? AND organization_id = ?', [email, org.id]);
                user = rows[0] || null;
            }
        } else {
            const [rows] = await conn.query('SELECT id, first_name, email, password FROM user WHERE email = ?', [email]);
            user = rows[0] || null;
        }
        if (user && user.email) {
            /* JETON SIGNÉ AVEC JWT_SECRET + LE HASH ACTUEL DU MOT DE PASSE. Astuce qui rend le lien
               à USAGE UNIQUE sans aucune table de jetons : dès que le mot de passe change, le hash
               change, et tout jeton signé avec l'ancien devient invérifiable. Un lien déjà utilisé,
               ou un ancien lien, cesse donc de fonctionner tout seul. Portée limitée à 'reset' et
               à une heure. */
            const token = jwt.sign({ id: user.id, purpose: 'reset' }, JWT_SECRET + user.password, { algorithm: 'HS256', expiresIn: '1h' });
            const resetUrl = `${appUrl()}/reinitialiser?token=${encodeURIComponent(token)}`;
            const { subject, html } = resetLinkEmail({ firstName: user.first_name, resetUrl });
            sendMail({ to: user.email, subject, html, kind: 'forgot' }); // best-effort, ne bloque pas la réponse
        }
        return res.status(200).json(generique);
    } catch (e) {
        console.error('forgotPassword:', e.message);
        return res.status(200).json(generique); // même en cas d'erreur : ne rien révéler
    }
}

/**
 * POST /api/auth/reset — pose le nouveau mot de passe à partir du jeton du lien.
 */
async function resetPassword(req, res) {
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères.' });
    if (!token) return res.status(400).json({ message: 'Lien invalide.' });
    try {
        // Décoder SANS vérifier : on a besoin de l'id pour retrouver le hash, qui EST une partie du
        // secret. `decode` ne valide pas la signature — la vérification vient juste après.
        const brut = jwt.decode(token);
        if (!brut || brut.purpose !== 'reset' || !brut.id) {
            return res.status(400).json({ message: 'Lien invalide ou expiré.' });
        }
        const conn = db.promise();
        const [rows] = await conn.query('SELECT id, password FROM user WHERE id = ?', [brut.id]);
        const user = rows[0];
        if (!user) return res.status(400).json({ message: 'Lien invalide ou expiré.' });
        try {
            jwt.verify(token, JWT_SECRET + user.password, { algorithms: ['HS256'] });
        } catch {
            return res.status(400).json({ message: 'Lien invalide ou expiré.' });
        }
        const hash = await bcrypt.hash(password, 10);
        await conn.query('UPDATE user SET password = ? WHERE id = ?', [hash, user.id]);
        return res.status(200).json({ success: true, message: 'Mot de passe réinitialisé. Vous pouvez vous connecter.' });
    } catch (e) {
        console.error('resetPassword:', e.message);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}

/**
 * POST /api/auth/annuler — « Ce n'était pas moi » : annule un changement d'e-mail ou de mot de
 * passe à partir du jeton reçu par e-mail, et COUPE toutes les sessions du compte.
 */
async function annulerModification(req, res) {
    const token = String(req.body?.token || '');
    if (!token) return res.status(400).json({ message: 'Lien invalide.' });
    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        return res.status(400).json({ message: 'Lien invalide ou expiré.' });
    }
    if (!payload || payload.purpose !== 'annuler' || !payload.id || !payload.kind) {
        return res.status(400).json({ message: 'Lien invalide.' });
    }
    try {
        const conn = db.promise();
        if (payload.kind === 'email') {
            // Restaure l'ancienne adresse, côté compte ET fiche stagiaire.
            await conn.query('UPDATE user SET email = ? WHERE id = ?', [payload.prev, payload.id]);
            await conn.query('UPDATE learner SET email = ? WHERE user_id = ?', [payload.prev, payload.id]);
        } else if (payload.kind === 'pwd') {
            /* `payload.prev` = l'ANCIEN hash bcrypt. Il voyage dans le jeton (signé, donc
               infalsifiable). Le mettre dans un lien est acceptable : un hash bcrypt ne se
               renverse pas, et l'annulation ne fait que RESTAURER le mot de passe légitime. */
            await conn.query('UPDATE user SET password = ? WHERE id = ?', [payload.prev, payload.id]);
        } else {
            return res.status(400).json({ message: 'Lien invalide.' });
        }
        // Coupe toutes les sessions — dont celle du tiers. Le propriétaire se reconnecte ensuite.
        await couperSessions(payload.id);
        return res.status(200).json({
            success: true,
            message: 'Modification annulée et sessions déconnectées. Reconnectez-vous, puis changez votre mot de passe par précaution.',
        });
    } catch (e) {
        console.error('annulerModification:', e.message);
        return res.status(500).json({ message: 'Erreur serveur.' });
    }
}

module.exports = { userAuthentification, getCurrentUser, changePassword, changeEmail, logout, forgotPassword, resetPassword, annulerModification };
