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

module.exports = { getOrganization, updateOrganization };
