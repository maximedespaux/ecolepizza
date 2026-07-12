const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { encrypt, decrypt } = require('../lib/crypto.js');
const { mergeEmargConfig } = require('../lib/emargement.js');

/**
 * GET /api/organisation — l'organisme de l'utilisateur connecté.
 */
const getOrganization = (req, res) => {
    db.query(
        'SELECT * FROM organization WHERE id = ?',
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération organisme :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (results.length === 0) return res.status(404).json({ message: 'Organisme introuvable' });
            const org = results[0];
            // Champs chiffrés au repos : on déchiffre l'image de signature ;
            // le certificat de scellement (chiffré) n'est jamais renvoyé au client.
            org.signature_image = decrypt(org.signature_image);
            delete org.sign_cert;
            // Config d'émargement toujours renvoyée normalisée (défauts si vide / colonne absente).
            org.emargement_config = mergeEmargConfig(org.emargement_config);
            res.json({ data: org });
        }
    );
};

/**
 * PATCH /api/organisation — met à jour l'organisme (admin / secrétariat).
 */
const updateOrganization = (req, res) => {
    const allowed = ['legal_name', 'short_name', 'code', 'manager', 'siret', 'vat_number', 'nda', 'naf_ape',
        'address', 'zip_code', 'town', 'phone', 'email', 'iban', 'bic', 'bank_name', 'signature_image',
        'logo_image', 'emargement_config', 'qualiopi'];

    const updates = [];
    const values = [];
    for (const f of allowed) {
        if (req.body[f] === undefined) continue;
        let v = req.body[f];
        if (f === 'qualiopi') v = v ? 1 : 0;
        else if (f === 'code') {
            // Code court unique : majuscules, alphanumérique + tiret, ou NULL si vidé.
            v = String(v).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || null;
        }
        else if (f === 'signature_image') v = encrypt(v || null); // chiffrée au repos
        else if (f === 'emargement_config') v = JSON.stringify(mergeEmargConfig(v)); // normalisée puis stockée en JSON
        updates.push(`${f} = ?`);
        values.push(v);
    }
    if (updates.length === 0) {
        return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    }
    values.push(req.user.organization_id);

    db.query(
        `UPDATE organization SET ${updates.join(', ')} WHERE id = ?`,
        values,
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ error: 'Ce code organisme est déjà utilisé.' });
                }
                if (err.code === 'ER_BAD_FIELD_ERROR') {
                    return res.status(400).json({ message: "Migration 057 requise pour enregistrer la mise en page de l'émargement." });
                }
                console.error('Erreur mise à jour organisme :', err);
                return res.status(400).json({ message: 'Erreur mise à jour' });
            }
            logAudit(req, 'organization.update', 'Organization', req.user.organization_id);
            res.status(200).json({ success: true, message: 'Organisme mis à jour' });
        }
    );
};

const crypto = require('crypto');

/** GET /api/organisation/locations — lieux de formation de l'organisme. */
const getLocations = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT id, name, address, zip_code, town, sort_order FROM training_location WHERE organization_id = ? ORDER BY sort_order, name',
            [req.user.organization_id]
        );
        res.json({ data: rows });
    } catch (e) {
        if (e && e.code === 'ER_NO_SUCH_TABLE') return res.json({ data: [] });
        console.error('Erreur lecture lieux :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/organisation/locations — remplace la liste { locations: [{ id?, name, address, zip_code, town }] }. */
const saveLocations = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const list = Array.isArray(req.body && req.body.locations) ? req.body.locations : [];
        const clean = list
            .map((l, i) => ({
                id: l && l.id ? String(l.id) : null,
                name: String((l && l.name) || '').trim().slice(0, 160),
                address: String((l && l.address) || '').trim().slice(0, 255) || null,
                zip_code: String((l && l.zip_code) || '').trim().slice(0, 10) || null,
                town: String((l && l.town) || '').trim().slice(0, 120) || null,
                sort_order: i * 10,
            }))
            .filter((l) => l.name);
        try {
            // Upsert par id : on GARDE les identifiants existants (sessions liées via location_id).
            const [existing] = await conn.query('SELECT id FROM training_location WHERE organization_id = ?', [orgId]);
            const existingIds = new Set(existing.map((r) => r.id));
            const keep = new Set();
            for (const l of clean) {
                if (l.id && existingIds.has(l.id)) {
                    await conn.query('UPDATE training_location SET name=?, address=?, zip_code=?, town=?, sort_order=? WHERE id=? AND organization_id=?',
                        [l.name, l.address, l.zip_code, l.town, l.sort_order, l.id, orgId]);
                    keep.add(l.id);
                } else {
                    const id = crypto.randomUUID();
                    await conn.query('INSERT INTO training_location (id, organization_id, name, address, zip_code, town, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [id, orgId, l.name, l.address, l.zip_code, l.town, l.sort_order]);
                    keep.add(id);
                }
            }
            for (const id of existingIds) if (!keep.has(id)) await conn.query('DELETE FROM training_location WHERE id=? AND organization_id=?', [id, orgId]);
        } catch (e) {
            if (e && e.code === 'ER_NO_SUCH_TABLE') return res.status(501).json({ message: 'Migration des lieux (067) non appliquée.' });
            throw e;
        }
        logAudit(req, 'organization.locations', 'Organization', orgId);
        res.json({ success: true, message: 'Lieux enregistrés.' });
    } catch (e) {
        console.error('Erreur enregistrement lieux :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getOrganization, updateOrganization, getLocations, saveLocations };
