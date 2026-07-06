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
    const stayConnected = req.body.stayConnected !== false;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }

    db.query('SELECT * FROM user WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Erreur récupération utilisateur :', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (results.length === 0) {
            return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, organization_id: user.organization_id },
            JWT_SECRET,
            stayConnected ? {} : { expiresIn: '1h' }
        );

        const maxAge = stayConnected ? 1000 * 60 * 60 * 24 * 7 : 1000 * 60 * 60;

        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None',
            maxAge,
        });

        const { password: _pw, ...userWithoutPassword } = user;
        return res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            token,
            data: userWithoutPassword,
        });
    });
};

/**
 * POST /api/auth/logout — supprime le cookie.
 */
const logout = (req, res) => {
    res.clearCookie('auth_token', { httpOnly: true, sameSite: 'None', secure: process.env.NODE_ENV === 'production' });
    return res.status(200).json({ success: true, message: 'Déconnexion réussie' });
};

module.exports = { userAuthentification, getCurrentUser, logout };
