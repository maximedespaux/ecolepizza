const bcrypt = require('bcrypt');
const db = require('../config/database.js');

const PUBLIC_FIELDS =
    'id, organization_id, role, first_name, last_name, email, phone, created_at';

/**
 * GET /api/user/all — liste des utilisateurs de l'organisme (sans mot de passe).
 */
const getUsers = (req, res) => {
    db.query(`SELECT ${PUBLIC_FIELDS} FROM user`, (err, results) => {
        if (err) {
            console.error('Erreur récupération utilisateurs :', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        res.json({ data: results });
    });
};

/**
 * POST /api/user — création d'un compte.
 */
const ASSIGNABLE_ROLES = ['ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'STAGIAIRE', 'ENTREPRISE', 'FINANCEUR', 'AUDITEUR'];

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
 * PATCH /api/user/:id — mise à jour partielle.
 */
const updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const allowedFields = ['role', 'first_name', 'last_name', 'email', 'phone'];

        const updates = [];
        const values = [];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined && req.body[field] !== '') {
                updates.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        }

        if (req.body.password) {
            updates.push('password = ?');
            values.push(await bcrypt.hash(req.body.password, 10));
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'Aucun champ valide à mettre à jour' });
        }

        values.push(userId);
        db.query(`UPDATE user SET ${updates.join(', ')} WHERE id = ?`, values, (err) => {
            if (err) {
                console.error('Erreur mise à jour utilisateur :', err);
                return res.status(400).json({ success: false, message: 'Erreur mise à jour' });
            }
            res.status(200).json({ success: true, message: 'Utilisateur mis à jour' });
        });
    } catch (error) {
        console.error('Erreur mise à jour utilisateur :', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/user/:id — suppression.
 */
const deleteUser = (req, res) => {
    db.query('DELETE FROM user WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error('Erreur suppression utilisateur :', err);
            return res.status(400).json({ success: false, message: 'Erreur suppression' });
        }
        res.status(200).json({ success: true, message: 'Utilisateur supprimé' });
    });
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
