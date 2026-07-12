const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

// Montant valide : fini, >= 0, borné ; sinon null (= non relevé / vide).
function price(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 1000000 ? n : null;
}
const str = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

// Vérifie qu'un id (item/store) appartient bien à l'organisme.
async function owns(conn, table, id, orgId) {
    const [[row]] = await conn.query(`SELECT 1 AS ok FROM ${table} WHERE id = ? AND organization_id = ? LIMIT 1`, [id, orgId]);
    return !!row;
}

/**
 * GET /api/mercuriale — magasins + produits (avec la carte des prix par magasin).
 * Tolérant : si les tables ne sont pas encore migrées (069), renvoie du vide.
 */
const getMercuriale = async (req, res) => {
    const orgId = req.user.organization_id;
    try {
        const conn = db.promise();
        let stores = [], items = [], prices = [];
        try {
            [stores] = await conn.query(
                'SELECT id, name, sort_order FROM mercuriale_store WHERE organization_id = ? ORDER BY sort_order, created_at', [orgId]);
            [items] = await conn.query(
                `SELECT id, rayon, marque, produit, reference, conditionnement, unite, prix_kg, notes,
                        DATE_FORMAT(updated_at, '%Y-%m-%d') AS updated_at
                 FROM mercuriale_item WHERE organization_id = ? ORDER BY rayon, produit`, [orgId]);
            if (items.length) {
                [prices] = await conn.query(
                    `SELECT item_id, store_id, prix_ht, DATE_FORMAT(date_releve, '%Y-%m-%d') AS date_releve, note
                     FROM mercuriale_price WHERE item_id IN (?)`, [items.map((i) => i.id)]);
            }
        } catch { /* tables 069 pas encore migrées */ }
        const byItem = {};
        for (const p of prices) (byItem[p.item_id] ||= {})[p.store_id] = { prix_ht: p.prix_ht, date_releve: p.date_releve, note: p.note };
        const data = items.map((i) => ({ ...i, prices: byItem[i.id] || {} }));
        res.json({ stores, items: data });
    } catch (err) {
        console.error('Erreur mercuriale :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/mercuriale/stores — ajoute un magasin (colonne de prix). */
const createStore = async (req, res) => {
    const name = str(req.body.name, 120);
    if (!name) return res.status(422).json({ error: 'Nom du magasin requis.' });
    try {
        const conn = db.promise();
        const [[mx]] = await conn.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM mercuriale_store WHERE organization_id = ?', [req.user.organization_id]);
        const id = crypto.randomUUID();
        await conn.query('INSERT INTO mercuriale_store (id, organization_id, name, sort_order) VALUES (?, ?, ?, ?)',
            [id, req.user.organization_id, name, mx.n]);
        logAudit(req, 'mercuriale.store.create', 'MercurialeStore', id);
        res.status(201).json({ id, name, sort_order: mx.n });
    } catch (err) { console.error('Erreur ajout magasin :', err); res.status(500).json({ error: 'Internal Server Error' }); }
};

/** DELETE /api/mercuriale/stores/:id — retire un magasin (et ses prix). */
const deleteStore = async (req, res) => {
    try {
        await db.promise().query('DELETE FROM mercuriale_store WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        res.json({ success: true });
    } catch (err) { console.error('Erreur suppression magasin :', err); res.status(500).json({ error: 'Internal Server Error' }); }
};

function cleanItem(b) {
    return {
        rayon: str(b.rayon, 120), marque: str(b.marque, 160), produit: str(b.produit, 255),
        reference: str(b.reference, 80), conditionnement: str(b.conditionnement, 80),
        unite: str(b.unite, 40), prix_kg: price(b.prix_kg), notes: str(b.notes, 500),
    };
}

/** POST /api/mercuriale/items — ajoute un produit. */
const createItem = async (req, res) => {
    const it = cleanItem(req.body);
    if (!it.produit) return res.status(422).json({ error: 'Nom du produit requis.' });
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO mercuriale_item (id, organization_id, rayon, marque, produit, reference, conditionnement, unite, prix_kg, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, it.rayon, it.marque, it.produit, it.reference, it.conditionnement, it.unite, it.prix_kg, it.notes]);
        logAudit(req, 'mercuriale.item.create', 'MercurialeItem', id);
        res.status(201).json({ id, ...it });
    } catch (err) { console.error('Erreur ajout produit :', err); res.status(500).json({ error: 'Internal Server Error' }); }
};

/** PATCH /api/mercuriale/items/:id — met à jour les champs d'un produit. */
const updateItem = async (req, res) => {
    const orgId = req.user.organization_id;
    const it = cleanItem({ ...req.body, produit: req.body.produit ?? '_keep_' });
    const sets = [], vals = [];
    for (const f of ['rayon', 'marque', 'reference', 'conditionnement', 'unite', 'prix_kg', 'notes']) {
        if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(it[f]); }
    }
    if (req.body.produit !== undefined) {
        const p = str(req.body.produit, 255);
        if (!p) return res.status(422).json({ error: 'Nom du produit requis.' });
        sets.push('produit = ?'); vals.push(p);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour.' });
    try {
        await db.promise().query(`UPDATE mercuriale_item SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`, [...vals, req.params.id, orgId]);
        res.json({ success: true });
    } catch (err) { console.error('Erreur maj produit :', err); res.status(500).json({ error: 'Internal Server Error' }); }
};

/** DELETE /api/mercuriale/items/:id — supprime un produit (et ses prix). */
const deleteItem = async (req, res) => {
    try {
        await db.promise().query('DELETE FROM mercuriale_item WHERE id = ? AND organization_id = ?', [req.params.id, req.user.organization_id]);
        res.json({ success: true });
    } catch (err) { console.error('Erreur suppression produit :', err); res.status(500).json({ error: 'Internal Server Error' }); }
};

/**
 * PUT /api/mercuriale/items/:id/prices/:storeId — pose/écrase le prix d'une cellule.
 * Corps : { prix_ht?, date_releve?, note? }. Prix vide => cellule effacée.
 */
const setPrice = async (req, res) => {
    const orgId = req.user.organization_id;
    const { id: itemId, storeId } = req.params;
    try {
        const conn = db.promise();
        if (!(await owns(conn, 'mercuriale_item', itemId, orgId)) || !(await owns(conn, 'mercuriale_store', storeId, orgId))) {
            return res.status(404).json({ error: 'Produit ou magasin introuvable.' });
        }
        const ht = price(req.body.prix_ht);
        const note = str(req.body.note, 120);
        const date = ht == null && !note ? null : (req.body.date_releve || new Date().toISOString().slice(0, 10));
        if (ht == null && !note) {
            await conn.query('DELETE FROM mercuriale_price WHERE item_id = ? AND store_id = ?', [itemId, storeId]);
            return res.json({ success: true, cleared: true });
        }
        await conn.query(
            `INSERT INTO mercuriale_price (id, item_id, store_id, prix_ht, date_releve, note) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE prix_ht = VALUES(prix_ht), date_releve = VALUES(date_releve), note = VALUES(note)`,
            [crypto.randomUUID(), itemId, storeId, ht, date, note]);
        res.json({ success: true, prix_ht: ht, date_releve: date, note });
    } catch (err) { console.error('Erreur prix mercuriale :', err); res.status(500).json({ error: 'Internal Server Error' }); }
};

module.exports = { getMercuriale, createStore, deleteStore, createItem, updateItem, deleteItem, setPrice };
