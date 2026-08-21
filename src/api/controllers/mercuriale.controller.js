// Mercuriale — liste de prix curée par utilisateur (produits réellement utilisés).
// Couche entre le catalogue (catalog_product Metro + frais/marché) et les recettes.
// La table historique `mercuriale_item` porte des colonnes FR (produit/marque/rayon/unite/
// prix_kg/notes) enrichies (origin/calibre/market/source/auto_update/catalog_product_id/user_id).
// L'API expose des noms propres (label/family/brand/unit/price/usage_note) mappés ci-dessous.
const crypto = require('crypto');
const db = require('../config/database.js');

const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const SOURCES = ['RNM', 'METRO', 'FOURNISSEUR', 'MANUEL'];
const str = (v, max) => { const s = (v == null ? '' : String(v)).trim(); return s ? s.slice(0, max) : null; };
const numv = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const enumSource = (v) => (SOURCES.includes(String(v)) ? String(v) : 'MANUEL');

// SELECT qui renomme les colonnes FR en noms d'API propres.
const SEL = `SELECT id, organization_id, user_id,
  produit AS label, rayon AS family, marque AS brand, origin, calibre, conditionnement,
  market, unite AS unit, prix_kg AS price, source, auto_update, catalog_product_id,
  notes AS usage_note, created_at, updated_at FROM mercuriale_item`;

// GET /api/mercuriale — ma mercuriale (triée par rayon puis produit).
const listMine = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(`${SEL} WHERE user_id = ? ORDER BY rayon, produit`, [req.user.id]);
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [], migration: true });
        console.error('Erreur liste mercuriale :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// POST /api/mercuriale — ajoute un produit (depuis le catalogue, le frais, ou manuel).
const createItem = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const label = str(b.label, 255);
        if (!label) return res.status(400).json({ message: 'Libellé requis.' });
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO mercuriale_item
               (id, organization_id, user_id, produit, rayon, marque, origin, calibre, conditionnement, market, unite, prix_kg, source, auto_update, catalog_product_id, notes)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, req.user.organization_id, req.user.id, label,
             str(b.family, 120), str(b.brand, 160), str(b.origin, 120), str(b.calibre, 60), str(b.conditionnement, 80), str(b.market, 120),
             str(b.unit, 40) || 'kg', numv(b.price), enumSource(b.source), b.auto_update ? 1 : 0, b.catalog_product_id || null, str(b.usage_note, 500)]);
        const [[row]] = await conn.query(`${SEL} WHERE id = ?`, [id]);
        res.status(201).json({ data: row });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table mercuriale absente — migration à appliquer.', migration: true });
        console.error('Erreur création mercuriale :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Mapping champ d'API → colonne DB (+ nettoyage).
const FIELDS = {
    label: (v) => ['produit', str(v, 255)],
    family: (v) => ['rayon', str(v, 120)],
    brand: (v) => ['marque', str(v, 160)],
    origin: (v) => ['origin', str(v, 120)],
    calibre: (v) => ['calibre', str(v, 60)],
    conditionnement: (v) => ['conditionnement', str(v, 80)],
    market: (v) => ['market', str(v, 120)],
    unit: (v) => ['unite', str(v, 40) || 'kg'],
    price: (v) => ['prix_kg', numv(v)],
    source: (v) => ['source', enumSource(v)],
    auto_update: (v) => ['auto_update', v ? 1 : 0],
    usage_note: (v) => ['notes', str(v, 500)],
};

// PATCH /api/mercuriale/:id — édite un produit (champs fournis uniquement).
const updateItem = async (req, res) => {
    try {
        const conn = db.promise();
        const b = req.body || {};
        const sets = [], params = [];
        for (const [k, fn] of Object.entries(FIELDS)) {
            if (b[k] === undefined) continue;
            const [col, val] = fn(b[k]);
            if (k === 'label' && !val) return res.status(400).json({ message: 'Libellé requis.' });
            sets.push(`${col} = ?`); params.push(val);
        }
        if (!sets.length) return res.status(400).json({ message: 'Rien à modifier.' });
        params.push(req.params.id, req.user.id);
        const [r] = await conn.query(`UPDATE mercuriale_item SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
        if (!r.affectedRows) return res.status(404).json({ message: 'Produit introuvable.' });
        const [[row]] = await conn.query(`${SEL} WHERE id = ?`, [req.params.id]);
        res.json({ data: row });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table mercuriale absente — migration à appliquer.', migration: true });
        console.error('Erreur maj mercuriale :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// DELETE /api/mercuriale/:id — retire un produit de ma mercuriale.
const deleteItem = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query('DELETE FROM mercuriale_item WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Produit introuvable.' });
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ error: 'Table mercuriale absente — migration à appliquer.', migration: true });
        console.error('Erreur suppression mercuriale :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listMine, createItem, updateItem, deleteItem };
