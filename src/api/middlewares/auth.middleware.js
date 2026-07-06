const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', 'config', '.env') });

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Vérifie le JWT (cookie httpOnly `auth_token` ou en-tête `Authorization: Bearer`).
 * Place le payload décodé dans `req.user`.
 */
function authenticateToken(req, res, next) {
    const cookieToken = req.cookies?.auth_token;
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null;
    const token = cookieToken || headerToken;

    if (!token) {
        return res.status(401).json({ message: 'Token manquant' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(401).json({ message: 'Token invalide' });
        }
        req.user = user;
        next();
    });
}

/**
 * Restreint l'accès à une liste de rôles.
 * À utiliser APRÈS authenticateToken. Ex : authorizeRoles('ADMIN_ORGANISME', 'SECRETARIAT')
 */
function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Accès refusé' });
        }
        next();
    };
}

module.exports = { authenticateToken, authorizeRoles };
