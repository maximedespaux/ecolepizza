const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

/**
 * GET /api/inventaire — articles en stock + totaux (valeur, ruptures).
 */
const getItems = (req, res) => {
    db.query(
        `SELECT id, name, category, sku, quantity, unit_price, tax_rate, threshold,
                DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at
         FROM inventory_item
         WHERE organization_id = ?
         ORDER BY name`,
        [req.user.organization_id],
        (err, rows) => {
            if (err) {
                console.error('Erreur inventaire :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            const totals = {
                items: rows.length,
                units: rows.reduce((s, r) => s + (r.quantity || 0), 0),
                value: rows.reduce((s, r) => s + (r.quantity || 0) * Number(r.unit_price || 0), 0),
                low: rows.filter((r) => r.quantity <= r.threshold).length,
            };
            res.json({ data: rows, totals });
        }
    );
};

/**
 * POST /api/inventaire — ajoute un article.
 */
const createItem = (req, res) => {
    const { name, category, sku, quantity = 0, unit_price, tax_rate = 20, threshold = 0 } = req.body;
    if (!name) return res.status(422).json({ error: "Nom de l'article requis" });
    db.query(
        `INSERT INTO inventory_item (id, organization_id, name, category, sku, quantity, unit_price, tax_rate, threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), req.user.organization_id, name, category || null, sku || null,
         Math.max(0, parseInt(quantity, 10) || 0), unit_price || null,
         tax_rate === '' || tax_rate == null ? 20 : tax_rate, parseInt(threshold, 10) || 0],
        (err) => {
            if (err) {
                console.error('Erreur création article :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logAudit(req, 'inventory.create', 'InventoryItem');
            res.status(201).json({ message: 'Article ajouté' });
        }
    );
};

/**
 * PATCH /api/inventaire/:id/adjust — ajuste le stock (delta, +/-). Ne descend pas sous 0.
 */
const adjustItem = (req, res) => {
    const delta = parseInt(req.body.delta, 10);
    if (Number.isNaN(delta)) return res.status(422).json({ error: 'Delta invalide' });
    db.query(
        'UPDATE inventory_item SET quantity = GREATEST(0, quantity + ?) WHERE id = ? AND organization_id = ?',
        [delta, req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur ajustement stock :', err);
                return res.status(400).json({ message: 'Erreur' });
            }
            db.query(
                'SELECT quantity FROM inventory_item WHERE id = ? AND organization_id = ?',
                [req.params.id, req.user.organization_id],
                (e2, rows) => {
                    if (e2 || rows.length === 0) return res.status(200).json({ success: true });
                    res.status(200).json({ success: true, quantity: rows[0].quantity });
                }
            );
        }
    );
};

/**
 * PATCH /api/inventaire/:id — met à jour un article.
 */
const updateItem = (req, res) => {
    const allowed = ['name', 'category', 'sku', 'quantity', 'unit_price', 'tax_rate', 'threshold'];
    // Bornes des champs numériques (rejette négatifs / NaN / valeurs aberrantes).
    const numericBounds = { quantity: [0, 1e9], unit_price: [0, 1e8], tax_rate: [0, 100], threshold: [0, 1e9] };
    const updates = [];
    const values = [];
    for (const f of allowed) {
        if (req.body[f] === undefined || req.body[f] === '') continue;
        let v = req.body[f];
        if (numericBounds[f]) {
            const n = Number(v);
            const [min, max] = numericBounds[f];
            if (!Number.isFinite(n) || n < min || n > max) {
                return res.status(422).json({ message: `Valeur invalide pour ${f}.` });
            }
            v = n;
        }
        updates.push(`${f} = ?`);
        values.push(v);
    }
    if (updates.length === 0) return res.status(400).json({ message: 'Aucun champ' });
    values.push(req.params.id, req.user.organization_id);
    db.query(
        `UPDATE inventory_item SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
        values,
        (err) => {
            if (err) return res.status(400).json({ message: 'Erreur' });
            res.status(200).json({ success: true, message: 'Article mis à jour' });
        }
    );
};

/**
 * POST /api/inventaire/:id/sell — vend N unités : décrémente le stock et
 * enregistre une vente (material_sale) pour le chiffre d'affaires.
 */
const sellItem = async (req, res) => {
    const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT name, category, quantity, unit_price FROM inventory_item WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Article introuvable' });
        const item = rows[0];
        if (item.quantity < qty) return res.status(422).json({ error: 'Stock insuffisant' });

        await conn.query('UPDATE inventory_item SET quantity = quantity - ? WHERE id = ?', [qty, req.params.id]);
        await conn.query(
            `INSERT INTO material_sale (id, organization_id, date, product, category, quantity, amount)
             VALUES (?, ?, CURDATE(), ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user.organization_id, item.name, item.category, qty, item.unit_price || 0]
        );
        logAudit(req, 'inventory.sell', 'InventoryItem', req.params.id);
        res.status(201).json({ success: true, message: 'Vente enregistrée', quantity: item.quantity - qty });
    } catch (err) {
        console.error('Erreur vente article :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/inventaire/:id
 */
const deleteItem = (req, res) => {
    db.query(
        'DELETE FROM inventory_item WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) return res.status(400).json({ message: 'Erreur suppression' });
            res.status(200).json({ success: true, message: 'Article supprimé' });
        }
    );
};

module.exports = { getItems, createItem, adjustItem, updateItem, sellItem, deleteItem };
