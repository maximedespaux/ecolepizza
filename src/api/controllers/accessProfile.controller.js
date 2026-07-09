const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

// Normalise nav_access -> objet { chemin: 'read' | 'write' }.
function cleanNav(nav) {
    if (!nav || typeof nav !== 'object' || Array.isArray(nav)) return {};
    const out = {};
    let n = 0;
    for (const [p, mode] of Object.entries(nav)) {
        if (n >= 60) break;
        if (typeof p === 'string' && p.startsWith('/')) { out[p] = mode === 'read' ? 'read' : 'write'; n++; }
    }
    return out;
}
const cleanColor = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null);

const SYSTEM_ROLES = new Set(['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR']);
const parseNav = (s) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };

/** GET /api/access-profiles — rôles personnalisés + personnalisations des rôles système. */
const listProfiles = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT id, name, system_role, color, nav_access FROM access_profile WHERE organization_id = ? ORDER BY name',
            [req.user.organization_id]
        );
        const data = [];
        const systemOverrides = {};
        for (const r of rows) {
            if (r.system_role) systemOverrides[r.system_role] = { color: r.color, nav_access: parseNav(r.nav_access) };
            else data.push({ id: r.id, name: r.name, color: r.color, nav_access: parseNav(r.nav_access) });
        }
        res.json({ data, systemOverrides });
    } catch (err) {
        console.error('Erreur rôles :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/access-profiles/system/:role — personnalise un rôle système (couleur + accès). */
const upsertSystemRole = async (req, res) => {
    const role = req.params.role;
    if (!SYSTEM_ROLES.has(role)) return res.status(422).json({ error: 'Rôle système inconnu.' });
    try {
        const conn = db.promise();
        await conn.query('DELETE FROM access_profile WHERE organization_id = ? AND system_role = ?', [req.user.organization_id, role]);
        await conn.query(
            'INSERT INTO access_profile (id, organization_id, name, system_role, color, nav_access) VALUES (?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), req.user.organization_id, role, role, cleanColor(req.body?.color), JSON.stringify(cleanNav(req.body?.nav_access))]
        );
        logAudit(req, 'accessprofile.system', 'AccessProfile', role);
        res.json({ success: true, message: 'Rôle système personnalisé' });
    } catch (err) {
        console.error('Erreur personnalisation rôle système :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/access-profiles */
const createProfile = async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(422).json({ error: 'Nom du rôle requis.' });
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            'INSERT INTO access_profile (id, organization_id, name, color, nav_access) VALUES (?, ?, ?, ?, ?)',
            [id, req.user.organization_id, name.slice(0, 120), cleanColor(req.body?.color), JSON.stringify(cleanNav(req.body?.nav_access))]
        );
        logAudit(req, 'accessprofile.create', 'AccessProfile', id);
        res.status(201).json({ id, message: 'Rôle créé' });
    } catch (err) {
        console.error('Erreur création rôle :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PATCH /api/access-profiles/:id */
const updateProfile = async (req, res) => {
    const sets = [], vals = [];
    if (req.body?.name !== undefined) { sets.push('name = ?'); vals.push(String(req.body.name).trim().slice(0, 120)); }
    if (req.body?.color !== undefined) { sets.push('color = ?'); vals.push(cleanColor(req.body.color)); }
    if (req.body?.nav_access !== undefined) { sets.push('nav_access = ?'); vals.push(JSON.stringify(cleanNav(req.body.nav_access))); }
    if (!sets.length) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    vals.push(req.params.id, req.user.organization_id);
    try {
        await db.promise().query(`UPDATE access_profile SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`, vals);
        res.json({ success: true, message: 'Rôle mis à jour' });
    } catch (err) {
        console.error('Erreur maj rôle :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/access-profiles/:id */
const deleteProfile = async (req, res) => {
    try {
        await db.promise().query('DELETE FROM access_profile WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        res.json({ success: true, message: 'Rôle supprimé' });
    } catch (err) {
        console.error('Erreur suppression rôle :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listProfiles, createProfile, updateProfile, deleteProfile, upsertSystemRole };
