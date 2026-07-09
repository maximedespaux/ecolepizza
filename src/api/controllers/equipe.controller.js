const bcrypt = require('bcrypt');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

/**
 * Gestion de l'équipe : comptes ayant accès au panneau de l'organisme.
 * Toutes les opérations sont cloisonnées à l'organisme du jeton (multi-tenant)
 * et réservées au propriétaire / administrateurs (voir equipe.routes.js).
 */

// Rôles « accès au panneau » gérables depuis l'écran Équipe (dont les intervenants externes).
const TEAM_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR', 'INTERVENANT'];
// Rôles « propriétaire » : il doit toujours en rester au moins un actif.
const OWNER_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME'];
// Rôles qu'un ADMIN_ORGANISME peut attribuer (un SUPER_ADMIN peut aussi attribuer SUPER_ADMIN).
const ASSIGNABLE_BY_ADMIN = ['ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR', 'INTERVENANT'];

const PUBLIC_FIELDS =
    'id, role, first_name, last_name, email, phone, active, nav_access, last_login_at, created_at';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Un acteur (req.user) peut-il attribuer ce rôle ? */
function canAssignRole(actorRole, targetRole) {
    if (targetRole === 'SUPER_ADMIN') return actorRole === 'SUPER_ADMIN';
    return ASSIGNABLE_BY_ADMIN.includes(targetRole);
}

/** Nombre de propriétaires actifs de l'organisme (hors éventuel id exclu). */
async function countActiveOwners(conn, orgId, excludeId = null) {
    const [[row]] = await conn.query(
        `SELECT COUNT(*) AS n FROM user
         WHERE organization_id = ? AND active = 1 AND role IN (?)
           ${excludeId ? 'AND id <> ?' : ''}`,
        excludeId ? [orgId, OWNER_ROLES, excludeId] : [orgId, OWNER_ROLES]
    );
    return row.n;
}

/** Récupère un membre de l'équipe appartenant à l'organisme du demandeur. */
async function loadMember(conn, orgId, id) {
    const [[member]] = await conn.query(
        `SELECT id, organization_id, role, active, first_name, last_name, email
         FROM user WHERE id = ? AND organization_id = ? AND role IN (?)`,
        [id, orgId, TEAM_ROLES]
    );
    return member || null;
}

/**
 * GET /api/equipe — liste des membres de l'équipe (organisme du jeton).
 */
const listTeam = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT ${PUBLIC_FIELDS} FROM user
             WHERE organization_id = ? AND role IN (?)
             ORDER BY active DESC, FIELD(role, ${TEAM_ROLES.map(() => '?').join(',')}), last_name, first_name`,
            [req.user.organization_id, TEAM_ROLES, ...TEAM_ROLES]
        );
        const data = rows.map((r) => {
            let nav_access = null;
            if (r.nav_access) { try { nav_access = JSON.parse(r.nav_access); } catch { nav_access = null; } }
            return { ...r, nav_access, is_self: r.id === req.user.id };
        });
        res.json({ data });
    } catch (err) {
        console.error('Erreur liste équipe :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/equipe — création d'un membre (email + mot de passe + rôle).
 */
const createMember = async (req, res) => {
    try {
        const { role = 'SECRETARIAT', first_name, last_name, email, phone, password } = req.body;

        if (!email || !EMAIL_RE.test(email)) {
            return res.status(400).json({ error: 'Adresse e-mail invalide.' });
        }
        if (!canAssignRole(req.user.role, role)) {
            return res.status(403).json({ error: "Vous n'êtes pas autorisé à attribuer ce rôle." });
        }

        const conn = db.promise();
        // Un compte existe-t-il déjà pour cet e-mail dans l'organisme ?
        const [[existing]] = await conn.query(
            'SELECT id, role FROM user WHERE email = ? AND organization_id = ?', [email.trim(), req.user.organization_id]);
        if (existing) {
            // Ancien STAGIAIRE -> on CONVERTIT son compte (il garde sa fiche stagiaire).
            // Le mot de passe n'est mis à jour que s'il est fourni (sinon on garde le sien).
            if (existing.role === 'STAGIAIRE') {
                const updates = ['role = ?']; const values = [role];
                if (first_name) { updates.push('first_name = ?'); values.push(first_name); }
                if (last_name) { updates.push('last_name = ?'); values.push(last_name); }
                if (phone) { updates.push('phone = ?'); values.push(phone); }
                if (password && String(password).length >= 8) { updates.push('password = ?'); values.push(await bcrypt.hash(password, 10)); }
                values.push(existing.id, req.user.organization_id);
                await conn.query(`UPDATE user SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`, values);
                logAudit(req, 'equipe.convert', 'User', existing.id);
                return res.status(200).json({ message: 'Compte stagiaire existant converti.', id: existing.id, converted: true });
            }
            return res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée.' });
        }

        // Nouveau compte : mot de passe requis.
        if (!password || String(password).length < 8) {
            return res.status(400).json({ error: 'Mot de passe requis (8 caractères minimum).' });
        }
        const hashed = await bcrypt.hash(password, 10);
        const [result] = await conn.query(
            `INSERT INTO user (id, organization_id, role, first_name, last_name, email, phone, password, active)
             VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, 1)`,
            [req.user.organization_id, role, first_name || null, last_name || null, email.trim(), phone || null, hashed]
        );
        res.status(201).json({ message: 'Membre créé.', id: result.insertId });
    } catch (err) {
        console.error('Erreur création membre :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/equipe/:id — mise à jour d'un membre (rôle, coordonnées, statut,
 * réinitialisation du mot de passe). Protège le dernier propriétaire et soi-même.
 */
const updateMember = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const target = await loadMember(conn, orgId, req.params.id);
        if (!target) return res.status(404).json({ error: 'Membre introuvable.' });

        const isSelf = target.id === req.user.id;
        // Seul un SUPER_ADMIN peut modifier un compte SUPER_ADMIN.
        if (target.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Modification réservée à un super administrateur.' });
        }

        const updates = [];
        const values = [];

        // --- Changement de rôle ---
        if (req.body.role !== undefined && req.body.role !== target.role) {
            if (isSelf) return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle.' });
            if (!canAssignRole(req.user.role, req.body.role)) {
                return res.status(403).json({ error: "Vous n'êtes pas autorisé à attribuer ce rôle." });
            }
            // Rétrograder le dernier propriétaire actif ?
            if (OWNER_ROLES.includes(target.role) && !OWNER_ROLES.includes(req.body.role) && target.active) {
                if (await countActiveOwners(conn, orgId, target.id) === 0) {
                    return res.status(400).json({ error: "Impossible : c'est le dernier administrateur actif de l'organisme." });
                }
            }
            updates.push('role = ?'); values.push(req.body.role);
        }

        // --- Activation / désactivation ---
        if (req.body.active !== undefined) {
            const nextActive = req.body.active ? 1 : 0;
            if (nextActive === 0) {
                if (isSelf) return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
                if (OWNER_ROLES.includes(target.role) && target.active
                    && await countActiveOwners(conn, orgId, target.id) === 0) {
                    return res.status(400).json({ error: "Impossible : c'est le dernier administrateur actif de l'organisme." });
                }
            }
            updates.push('active = ?'); values.push(nextActive);
        }

        // --- Coordonnées ---
        for (const field of ['first_name', 'last_name', 'phone']) {
            if (req.body[field] !== undefined) { updates.push(`${field} = ?`); values.push(req.body[field] || null); }
        }
        if (req.body.email !== undefined) {
            if (!EMAIL_RE.test(req.body.email)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
            updates.push('email = ?'); values.push(req.body.email.trim());
        }

        // --- Accès menu (par utilisateur) — réservé au SUPER_ADMIN ---
        if (req.body.nav_access !== undefined) {
            if (req.user.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ error: "La configuration des accès menu est réservée au super administrateur." });
            }
            if (OWNER_ROLES.includes(target.role)) {
                return res.status(400).json({ error: "Les administrateurs conservent toujours l'accès complet au menu." });
            }
            const nav = req.body.nav_access;
            if (nav === null) { updates.push('nav_access = ?'); values.push(null); }
            else if (Array.isArray(nav)) {
                // Ancien format : liste de chemins => tout en écriture.
                const map = {};
                for (const p of nav) if (typeof p === 'string' && p.startsWith('/')) map[p] = 'write';
                updates.push('nav_access = ?'); values.push(JSON.stringify(map));
            } else if (nav && typeof nav === 'object') {
                // Nouveau format : { "/chemin": "read" | "write" }.
                const map = {};
                let n = 0;
                for (const [p, mode] of Object.entries(nav)) {
                    if (n >= 50) break;
                    if (typeof p === 'string' && p.startsWith('/')) { map[p] = mode === 'read' ? 'read' : 'write'; n++; }
                }
                updates.push('nav_access = ?'); values.push(JSON.stringify(map));
            } else {
                return res.status(400).json({ error: 'nav_access doit être un objet { chemin: "read"|"write" } ou null.' });
            }
        }

        // --- Réinitialisation du mot de passe ---
        if (req.body.password) {
            if (String(req.body.password).length < 8) {
                return res.status(400).json({ error: 'Mot de passe trop court (8 caractères minimum).' });
            }
            updates.push('password = ?'); values.push(await bcrypt.hash(req.body.password, 10));
        }

        if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour.' });

        values.push(target.id, orgId);
        try {
            await conn.query(`UPDATE user SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`, values);
            res.json({ message: 'Membre mis à jour.' });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée.' });
            throw e;
        }
    } catch (err) {
        console.error('Erreur mise à jour membre :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/equipe/:id — suppression définitive d'un membre.
 */
const deleteMember = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const target = await loadMember(conn, orgId, req.params.id);
        if (!target) return res.status(404).json({ error: 'Membre introuvable.' });

        if (target.id === req.user.id) {
            return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
        }
        if (target.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Suppression réservée à un super administrateur.' });
        }
        if (OWNER_ROLES.includes(target.role) && target.active
            && await countActiveOwners(conn, orgId, target.id) === 0) {
            return res.status(400).json({ error: "Impossible : c'est le dernier administrateur actif de l'organisme." });
        }

        await conn.query('DELETE FROM user WHERE id = ? AND organization_id = ?', [target.id, orgId]);
        res.json({ message: 'Membre supprimé.' });
    } catch (err) {
        console.error('Erreur suppression membre :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listTeam, createMember, updateMember, deleteMember };
