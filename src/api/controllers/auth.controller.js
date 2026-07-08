const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', 'config', '.env') });

const db = require('../config/database.js');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * GET /api/auth/me — renvoie l'utilisateur connecté (sans le mot de passe).
 */
const getCurrentUser = (req, res) => {
    const userId = req.user.id;

    db.query('SELECT * FROM user WHERE id = ?', [userId], (err, results) => {
        if (err) {
            console.error('Erreur récupération utilisateur :', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Utilisateur introuvable' });
        }
        const { password, ...user } = results[0];
        return res.status(200).json({ success: true, data: user });
    });
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
            if (!org) return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
            const [rows] = await conn.query('SELECT * FROM user WHERE email = ? AND organization_id = ?', [email, org.id]);
            user = rows[0];
        } else {
            // Sans code : rétro-compatible tant que l'e-mail est unique globalement.
            const [rows] = await conn.query('SELECT * FROM user WHERE email = ?', [email]);
            if (rows.length > 1) {
                return res.status(409).json({ message: "Plusieurs organismes utilisent cet e-mail. Précisez le code organisme." });
            }
            user = rows[0];
        }

        if (!user) return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

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
        return res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            token,
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
 * POST /api/auth/logout — supprime le cookie.
 */
const logout = (req, res) => {
    res.clearCookie('auth_token', { httpOnly: true, sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' });
    return res.status(200).json({ success: true, message: 'Déconnexion réussie' });
};

module.exports = { userAuthentification, getCurrentUser, changePassword, logout };
