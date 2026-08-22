const bcrypt = require('bcrypt');
const db = require('../config/database.js');
const { couperSessions } = require('./auth.controller.js'); // couper les sessions après un reset admin

// NB : la gestion de l'équipe passe désormais par /api/equipe (equipe.controller).
// Ces points d'accès /api/user sont conservés pour compatibilité mais TOUJOURS
// cloisonnés à l'organisme du jeton (multi-tenant) et protégés contre l'élévation
// de privilèges. Ne jamais faire confiance à organization_id/role venant du corps.

const PUBLIC_FIELDS =
    'id, organization_id, role, first_name, last_name, email, phone, created_at';

const ASSIGNABLE_ROLES = ['ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'STAGIAIRE', 'ENTREPRISE', 'FINANCEUR', 'AUDITEUR'];

/** Un acteur peut-il attribuer ce rôle ? (seul un SUPER_ADMIN attribue SUPER_ADMIN) */
function canAssignRole(actorRole, targetRole) {
    if (targetRole === 'SUPER_ADMIN') return actorRole === 'SUPER_ADMIN';
    return ASSIGNABLE_ROLES.includes(targetRole);
}

/**
 * GET /api/user/all — liste des utilisateurs de L'ORGANISME du jeton.
 */
const getUsers = (req, res) => {
    db.query(
        `SELECT ${PUBLIC_FIELDS} FROM user WHERE organization_id = ?`,
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération utilisateurs :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.json({ data: results });
        }
    );
};

/**
 * POST /api/user — création d'un compte dans l'organisme du jeton.
 */
const createUser = async (req, res) => {
    try {
        const { role = 'SECRETARIAT', first_name, last_name, email, phone, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email et mot de passe requis' });
        }
        // Sécurité : l'organisme vient du jeton (jamais du corps) et le rôle est
        // restreint (seul un SUPER_ADMIN peut créer un SUPER_ADMIN).
        const organization_id = req.user.organization_id;
        let safeRole = ASSIGNABLE_ROLES.includes(role) ? role : 'SECRETARIAT';
        if (role === 'SUPER_ADMIN') {
            if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Rôle non autorisé' });
            safeRole = 'SUPER_ADMIN';
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        db.query(
            `INSERT INTO user (id, organization_id, role, first_name, last_name, email, phone, password)
             VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
            [organization_id, safeRole, first_name, last_name, email, phone, hashedPassword],
            (err) => {
                if (err) {
                    console.error('Erreur création utilisateur :', err);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }
                res.status(201).json({ message: 'Utilisateur créé' });
            }
        );
    } catch (error) {
        console.error('Erreur création utilisateur :', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/user/:id — mise à jour partielle, cloisonnée à l'organisme.
 * Le rôle n'est modifiable que via canAssignRole et jamais sur soi-même.
 */
const updateUser = async (req, res) => {
    try {
        const orgId = req.user.organization_id;
        const userId = req.params.id;

        const conn = db.promise();
        // La cible doit appartenir à l'organisme du demandeur.
        const [[target]] = await conn.query(
            'SELECT id, role FROM user WHERE id = ? AND organization_id = ?',
            [userId, orgId]
        );
        if (!target) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

        const isSelf = target.id === req.user.id;
        // Seul un SUPER_ADMIN peut modifier un compte SUPER_ADMIN.
        if (target.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, message: 'Modification réservée à un super administrateur.' });
        }

        const updates = [];
        const values = [];

        // Changement de rôle : contrôlé, jamais sur soi-même, pas d'auto-élévation.
        if (req.body.role !== undefined && req.body.role !== target.role) {
            if (isSelf) return res.status(400).json({ success: false, message: 'Vous ne pouvez pas modifier votre propre rôle.' });
            if (!canAssignRole(req.user.role, req.body.role)) {
                return res.status(403).json({ success: false, message: "Vous n'êtes pas autorisé à attribuer ce rôle." });
            }
            updates.push('role = ?'); values.push(req.body.role);
        }

        for (const field of ['first_name', 'last_name', 'email', 'phone']) {
            if (req.body[field] !== undefined && req.body[field] !== '') {
                updates.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        }

        let pwChanged = false;
        if (req.body.password) {
            if (String(req.body.password).length < 8) {
                return res.status(400).json({ success: false, message: 'Mot de passe trop court (8 caractères minimum).' });
            }
            updates.push('password = ?');
            values.push(await bcrypt.hash(req.body.password, 10));
            pwChanged = true;
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'Aucun champ valide à mettre à jour' });
        }

        values.push(userId, orgId);
        await conn.query(`UPDATE user SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`, values);
        // #4 FLUX DE RÉCUPÉRATION : un reset de mot de passe par un admin évince les sessions du
        // compte (sinon un cookie déjà volé survivait au « je réinitialise le compte compromis »).
        if (pwChanged) await couperSessions(userId);
        res.status(200).json({ success: true, message: 'Utilisateur mis à jour' });
    } catch (error) {
        console.error('Erreur mise à jour utilisateur :', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/user/:id — suppression cloisonnée à l'organisme (jamais soi-même).
 */
const deleteUser = async (req, res) => {
    try {
        const orgId = req.user.organization_id;
        if (req.params.id === req.user.id) {
            return res.status(400).json({ success: false, message: 'Vous ne pouvez pas supprimer votre propre compte.' });
        }
        const conn = db.promise();
        const [[target]] = await conn.query(
            'SELECT id, role FROM user WHERE id = ? AND organization_id = ?',
            [req.params.id, orgId]
        );
        if (!target) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        if (target.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, message: 'Suppression réservée à un super administrateur.' });
        }

        await conn.query('DELETE FROM user WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        res.status(200).json({ success: true, message: 'Utilisateur supprimé' });
    } catch (error) {
        console.error('Erreur suppression utilisateur :', error);
        res.status(400).json({ success: false, message: 'Erreur suppression' });
    }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
