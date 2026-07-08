const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

// Référentiel par défaut (coordonnées nationales) — semé au 1er accès d'un organisme.
// Sources : sites officiels des OPCO / FAF. À vérifier / compléter dans l'écran OPCO.
// triggers_assiduite = déclenche l'attestation d'assiduité.
const DEFAULT_OPCOS = [
    { code: 'AKTO', name: 'AKTO', address: '14 rue Riquet', zip_code: '75019', town: 'Paris', website: 'www.akto.fr', triggers: 0 },
    { code: 'AFDAS', name: 'Afdas', address: '66/72 rue Stendhal', zip_code: '75020', town: 'Paris', website: 'www.afdas.com', triggers: 0 },
    { code: 'ATLAS', name: 'ATLAS', address: '25 quai Panhard et Levassor', zip_code: '75013', town: 'Paris', website: 'www.opco-atlas.fr', triggers: 0 },
    { code: 'CONSTRUCTYS', name: 'Constructys', address: '32 rue René Boulanger, CS 60033', zip_code: '75483', town: 'Paris Cedex 10', phone: '01 82 83 95 00', website: 'www.constructys.fr', triggers: 0 },
    { code: 'OCAPIAT', name: 'OCAPIAT', address: '153 rue de la Pompe', zip_code: '75179', town: 'Paris Cedex 16', website: 'www.ocapiat.fr', triggers: 0 },
    { code: 'OPCO2I', name: 'Opco 2i', website: 'www.opco2i.fr', triggers: 0 },
    { code: 'OPCOEP', name: 'Opco EP (Entreprises de proximité)', website: 'www.opcoep.fr', triggers: 0 },
    { code: 'OPCOMOBILITES', name: 'Opco Mobilités', address: '204 Rond-Point du Pont de Sèvres', zip_code: '92100', town: 'Boulogne-Billancourt', phone: '01 41 14 16 18', website: 'www.opcomobilites.fr', triggers: 0 },
    { code: 'OPCOSANTE', name: 'Opco Santé', address: '31 rue Anatole France', zip_code: '92300', town: 'Levallois-Perret', phone: '01 49 68 10 10', website: 'www.opco-sante.fr', triggers: 0 },
    { code: 'OPCOMMERCE', name: "L'Opcommerce", address: '251 boulevard Pereire', zip_code: '75852', town: 'Paris Cedex 17', phone: '01 55 37 41 51', website: 'www.lopcommerce.com', triggers: 0 },
    { code: 'UNIFORMATION', name: 'Uniformation (Cohésion sociale)', phone: '01 53 02 13 13', website: 'www.uniformation.fr', triggers: 0 },
    // FAF (indépendants / dirigeants non-salariés)
    { code: 'AGEFICE', name: 'AGEFICE', website: 'www.communication-agefice.fr', triggers: 1 },
    { code: 'FIFPL', name: 'FIF PL', website: 'www.fifpl.fr', triggers: 0 },
    { code: 'FAFCEA', name: 'FAFCEA', address: '12-14 rue Beffroy', zip_code: '92200', town: 'Neuilly-sur-Seine', email: 'accueil@fafcea.com', phone: '01 41 43 15 30', website: 'www.fafcea.com', triggers: 0 },
    // Autres modes de financement
    { code: 'CPF', name: 'CPF (Mon Compte Formation)', website: 'www.moncompteformation.gouv.fr', triggers: 0 },
    { code: 'FRANCETRAVAIL', name: 'France Travail', website: 'www.francetravail.fr', triggers: 0 },
    { code: 'AUTOFINANCEMENT', name: 'Autofinancement', triggers: 0 },
    { code: 'AUTRE', name: 'Autre', triggers: 0 },
];

async function seedIfEmpty(conn, orgId) {
    const [[c]] = await conn.query('SELECT COUNT(*) AS n FROM opco WHERE organization_id = ?', [orgId]);
    if (c.n > 0) return;
    for (let i = 0; i < DEFAULT_OPCOS.length; i++) {
        const o = DEFAULT_OPCOS[i];
        await conn.query(
            `INSERT INTO opco (id, organization_id, code, name, address, zip_code, town, email, phone, website, triggers_assiduite, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), orgId, o.code || null, o.name, o.address || null, o.zip_code || null, o.town || null,
             o.email || null, o.phone || null, o.website || null, o.triggers ? 1 : 0, (i + 1) * 10]
        );
    }
}

/** GET /api/opcos — référentiel de l'organisme (semé au 1er accès). */
const getOpcos = async (req, res) => {
    try {
        const conn = db.promise();
        await seedIfEmpty(conn, req.user.organization_id);
        const [rows] = await conn.query(
            'SELECT * FROM opco WHERE organization_id = ? ORDER BY active DESC, sort_order, name',
            [req.user.organization_id]
        );
        res.json({ data: rows });
    } catch (err) {
        console.error('Erreur OPCO :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const FIELDS = ['code', 'name', 'address', 'zip_code', 'town', 'email', 'phone', 'website', 'triggers_assiduite', 'active', 'sort_order'];

/** POST /api/opcos — ajoute un OPCO. */
const createOpco = async (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(422).json({ error: 'Nom requis.' });
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO opco (id, organization_id, code, name, address, zip_code, town, email, phone, website, triggers_assiduite, active, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [id, req.user.organization_id, b.code || null, String(b.name).slice(0, 160), b.address || null, b.zip_code || null,
             b.town || null, b.email || null, b.phone || null, b.website || null, b.triggers_assiduite ? 1 : 0, Number(b.sort_order) || 999]
        );
        logAudit(req, 'opco.create', 'Opco', id);
        res.status(201).json({ id, message: 'OPCO créé' });
    } catch (err) {
        console.error('Erreur création OPCO :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PATCH /api/opcos/:id — met à jour un OPCO. */
const updateOpco = async (req, res) => {
    const sets = [], vals = [];
    for (const f of FIELDS) {
        if (req.body[f] === undefined) continue;
        let v = req.body[f];
        if (f === 'triggers_assiduite' || f === 'active') v = v ? 1 : 0;
        else if (f === 'sort_order') v = Number(v) || 100;
        else if (v === '') v = null;
        sets.push(`${f} = ?`); vals.push(v);
    }
    if (!sets.length) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    vals.push(req.params.id, req.user.organization_id);
    try {
        await db.promise().query(`UPDATE opco SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`, vals);
        res.json({ success: true, message: 'OPCO mis à jour' });
    } catch (err) {
        console.error('Erreur maj OPCO :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/opcos/:id */
const deleteOpco = async (req, res) => {
    try {
        await db.promise().query('DELETE FROM opco WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        res.json({ success: true, message: 'OPCO supprimé' });
    } catch (err) {
        console.error('Erreur suppression OPCO :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getOpcos, createOpco, updateOpco, deleteOpco };
