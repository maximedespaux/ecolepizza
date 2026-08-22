const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');
const db = require('../config/database.js');

dotenv.config({ path: path.join(__dirname, '..', 'config', '.env') });

const JWT_SECRET = process.env.JWT_SECRET;

// Mémorise si la colonne `sessions_valid_after` existe (migration 137). undefined = pas encore
// testé ; true/false = connu. Évite une requête en échec par requête avant la migration.
let colonneSVA;

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

    // Algorithme épinglé (HS256) pour éviter toute confusion d'algorithme.
    jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, async (err, user) => {
        if (err) {
            return res.status(401).json({ message: 'Token invalide' });
        }

        /* UN JWT EST SANS ÉTAT : sa signature reste valide jusqu'à expiration (7 jours), même
           si le compte a été désactivé ou supprimé entre-temps. Sans ce contrôle, révoquer un
           accès — un départ, un compte compromis — ne coupait rien pendant une semaine (vérifié
           au pentest : `active=0` laissait l'ancien cookie répondre 200). On relit donc l'état
           du compte en base à CHAQUE requête authentifiée.

           On en profite pour rafraîchir `role` et `organization_id` depuis la base : une
           rétrogradation prend effet immédiatement, au lieu d'attendre l'expiration du jeton.
           Le coût est une lecture par clé primaire (indexée) — négligeable, et de toute façon
           la requête qui suit touchera la base. */
        try {
            /* Repli si `sessions_valid_after` n'existe pas encore (migration 137 non jouée) : on
               retombe sur la requête d'origine. Le code marche donc AVANT comme APRÈS la migration
               — sans elle, la coupure de session est simplement inopérante.
               Le résultat du test est MÉMORISÉ (`colonneSVA`) : sans ça, chaque requête
               authentifiée lancerait une requête vouée à l'échec et remplirait le journal de
               MariaDB tant que la migration n'est pas jouée. Corollaire : REDÉMARRER l'API après
               avoir joué la 137, pour que le cache repasse à « colonne présente ». */
            let rows;
            if (colonneSVA === false) {
                [rows] = await db.promise().query(
                    'SELECT active, role, organization_id FROM user WHERE id = ?', [user.id]);
            } else {
                try {
                    [rows] = await db.promise().query(
                        'SELECT active, role, organization_id, sessions_valid_after FROM user WHERE id = ?', [user.id]);
                    colonneSVA = true;
                } catch (e) {
                    if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                        colonneSVA = false;
                        [rows] = await db.promise().query(
                            'SELECT active, role, organization_id FROM user WHERE id = ?', [user.id]);
                    } else { throw e; }
                }
            }
            if (rows.length === 0 || rows[0].active === 0) {
                return res.status(401).json({ message: 'Compte inactif' });
            }
            /* SESSION COUPÉE. Après un changement sensible ou une annulation « ce n'était pas moi »,
               `sessions_valid_after` passe à l'instant présent : tout jeton émis AVANT (le `iat` du
               JWT, en secondes) cesse d'être accepté. C'est ce qui déconnecte réellement un pirate
               dont on annule le méfait, là où un JWT sans état survivrait sinon des jours. */
            const borne = rows[0].sessions_valid_after
                ? Math.floor(new Date(rows[0].sessions_valid_after).getTime() / 1000) : 0;
            if (borne && typeof user.iat === 'number' && user.iat < borne) {
                return res.status(401).json({ message: 'Session expirée' });
            }
            req.user = { ...user, role: rows[0].role, organization_id: rows[0].organization_id };
            next();
        } catch (e) {
            // Base injoignable : on refuse plutôt que d'accorder un accès non vérifié. De toute
            // façon, sans base, la requête suivante échouerait aussi.
            return res.status(503).json({ message: 'Service indisponible' });
        }
    });
}

// Groupes de rôles réutilisables pour les gardes d'accès.
const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'];
const AUDIT_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'AUDITEUR'];

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

module.exports = { authenticateToken, authorizeRoles, STAFF_ROLES, ADMIN_ROLES, AUDIT_ROLES };
