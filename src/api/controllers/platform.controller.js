const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/database.js');
const { generatePassword } = require('../lib/crypto.js');
const { logAudit } = require('../lib/audit.js');

/**
 * Administration « plateforme » (au-dessus des organismes) — réservée au
 * PLATFORM_OWNER. Permet de provisionner un nouvel organisme (revente) avec
 * son premier administrateur, et de lister les organismes existants.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normCode = (v) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);

/** GET /api/platform/organizations — tous les organismes + volumétrie. */
const listOrganizations = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT o.id, o.code, o.legal_name, o.short_name, o.town,
                    DATE_FORMAT(o.created_at, '%Y-%m-%d') AS created_at,
                    (SELECT COUNT(*) FROM user u WHERE u.organization_id = o.id) AS users,
                    (SELECT COUNT(*) FROM learner l WHERE l.organization_id = o.id) AS learners
             FROM organization o ORDER BY o.created_at DESC`
        );
        res.json({ data: rows });
    } catch (err) {
        console.error('Erreur liste organismes (plateforme) :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/platform/organizations — crée un organisme + son premier admin.
 * Corps : { legal_name, short_name?, code, admin: { first_name?, last_name?, email, phone?, password?, role? } }.
 */
const createOrganization = async (req, res) => {
    const b = req.body || {};
    const legal_name = String(b.legal_name || '').trim();
    const code = normCode(b.code);
    const admin = b.admin || {};
    const adminEmail = String(admin.email || '').trim();
    const role = admin.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN_ORGANISME';

    if (!legal_name) return res.status(422).json({ error: "Nom de l'organisme requis." });
    if (!code) return res.status(422).json({ error: 'Code organisme requis.' });
    if (!EMAIL_RE.test(adminEmail)) return res.status(422).json({ error: "E-mail de l'administrateur invalide." });
    const password = admin.password && String(admin.password).length >= 8 ? String(admin.password) : generatePassword();

    const conn = db.promise();
    const orgId = crypto.randomUUID();

    // 1) Organisme
    try {
        await conn.query(
            'INSERT INTO organization (id, legal_name, short_name, code) VALUES (?, ?, ?, ?)',
            [orgId, legal_name, b.short_name || null, code]
        );
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce code organisme est déjà utilisé.' });
        console.error('Erreur création organisme :', e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }

    // 2) Premier administrateur (rollback de l'organisme si échec)
    try {
        const userId = crypto.randomUUID();
        const hash = await bcrypt.hash(password, 10);
        await conn.query(
            `INSERT INTO user (id, organization_id, role, first_name, last_name, email, phone, password, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [userId, orgId, role, admin.first_name || null, admin.last_name || null, adminEmail, admin.phone || null, hash]
        );
        logAudit(req, 'platform.org.create', 'Organization', orgId);
        res.status(201).json({
            data: {
                organization: { id: orgId, code, legal_name },
                admin: { email: adminEmail, password, role },
            },
        });
    } catch (e) {
        await conn.query('DELETE FROM organization WHERE id = ?', [orgId]).catch(() => {});
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée dans cet organisme.' });
        console.error('Erreur création administrateur :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listOrganizations, createOrganization };
