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

/** GET /api/access-profiles — rôles d'accès de l'organisme. */
const listProfiles = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT id, name, nav_access FROM access_profile WHERE organization_id = ? ORDER BY name',
            [req.user.organization_id]
        );
        const data = rows.map((r) => {
            let nav = {};
            if (r.nav_access) { try { nav = JSON.parse(r.nav_access); } catch { nav = {}; } }
            return { id: r.id, name: r.name, nav_access: nav };
        });
        res.json({ data });
    } catch (err) {
        console.error('Erreur rôles :', err);
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
            'INSERT INTO access_profile (id, organization_id, name, nav_access) VALUES (?, ?, ?, ?)',
            [id, req.user.organization_id, name.slice(0, 120), JSON.stringify(cleanNav(req.body?.nav_access))]
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

module.exports = { listProfiles, createProfile, updateProfile, deleteProfile };
