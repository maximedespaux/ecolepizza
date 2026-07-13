const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', 'config', '.env') });

const db = require('../config/database.js');

const JWT_SECRET = process.env.JWT_SECRET;

// Hash « leurre » : sert à égaliser le temps de réponse quand l'utilisateur
// n'existe pas (évite l'énumération de comptes par mesure du temps de réponse).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-equalization', 10);

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

    db.query('SELECT password FROM user WHERE id = ?', [req.user.id], async (err, results) => {
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
        const hashed = await bcrypt.hash(newPassword, 10);
        db.query('UPDATE user SET password = ? WHERE id = ?', [hashed, req.user.id], (uErr) => {
            if (uErr) {
                console.error('Erreur mise à jour mot de passe :', uErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
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

    db.query('SELECT password FROM user WHERE id = ?', [req.user.id], async (err, results) => {
        if (err) { console.error('Erreur changement e-mail :', err); return res.status(500).json({ error: 'Internal Server Error' }); }
        if (results.length === 0) return res.status(404).json({ message: 'Utilisateur introuvable' });
        const isMatch = await bcrypt.compare(currentPassword, results[0].password);
        if (!isMatch) return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
        db.query('SELECT id FROM user WHERE email = ? AND id <> ?', [email, req.user.id], (dErr, dup) => {
            if (dErr) { console.error('Erreur unicité e-mail :', dErr); return res.status(500).json({ error: 'Internal Server Error' }); }
            if (dup.length) return res.status(409).json({ message: 'Cette adresse e-mail est déjà utilisée.' });
            db.query('UPDATE user SET email = ? WHERE id = ?', [email, req.user.id], (uErr) => {
                if (uErr) { console.error('Erreur mise à jour e-mail :', uErr); return res.status(500).json({ error: 'Internal Server Error' }); }
                db.query('UPDATE learner SET email = ? WHERE user_id = ?', [email, req.user.id], () => {
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

module.exports = { userAuthentification, getCurrentUser, changePassword, changeEmail, logout };
