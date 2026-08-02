const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { prixStagiaire } = require('../lib/remise.js');

/**
 * GET /api/inventaire — articles en stock + totaux (valeur, ruptures).
 */
/* `learner_discount_pct` arrive par la 125 : sondée avant usage, sinon la requête échouerait et
 * l'inventaire entier deviendrait illisible pour une remise facultative. */
async function colRemise(conn, colonne = 'learner_discount_pct') {
    try {
        const [r] = await conn.query(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
             AND table_name = 'inventory_item' AND column_name = ? LIMIT 1`, [colonne]);
        return r.length > 0;
    } catch { return false; }
}

const getItems = async (req, res) => {
    try {
        const conn = db.promise();
        // Les deux formes de remise (%, €) arrivent par la 125. On sonde celle ajoutée en
        // dernier : si elle est là, l'autre l'est aussi (même migration).
        const remise = await colRemise(conn, 'learner_discount_eur')
            ? 'learner_discount_pct, learner_discount_eur'
            : 'NULL AS learner_discount_pct, NULL AS learner_discount_eur';
        const [rows] = await conn.query(
            `SELECT id, name, category, sku, quantity, unit_price, tax_rate, threshold, ${remise},
                    DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at
             FROM inventory_item
             WHERE organization_id = ?
             ORDER BY name`,
            [req.user.organization_id]);
        {
            /* Prix stagiaire calculé ICI, par la même fonction que la boutique (lib/remise.js).
         * L'école règle une remise sans jamais en voir l'effet : elle devait ouvrir l'espace
         * stagiaire pour savoir ce que l'article y coûte. Le refaire côté front aurait ajouté
         * une troisième copie du calcul, donc une troisième occasion de diverger. */
        for (const r of rows) {
            const px = prixStagiaire(r);
            r.prix_stagiaire_ht = px.net;
            r.remise_libelle = px.libelle;   // null s'il n'y a pas de remise
        }

        const totals = {
                items: rows.length,
                units: rows.reduce((s, r) => s + (r.quantity || 0), 0),
                value: rows.reduce((s, r) => s + (r.quantity || 0) * Number(r.unit_price || 0), 0),
                low: rows.filter((r) => r.quantity <= r.threshold).length,
            };
            res.json({ data: rows, totals });
        }
    } catch (err) {
        console.error('Erreur inventaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/inventaire — ajoute un article.
 */
const createItem = async (req, res) => {
    const { name, category, sku, quantity = 0, unit_price, tax_rate = 20, threshold = 0 } = req.body;
    if (!name) return res.status(422).json({ error: "Nom de l'article requis" });
    try {
        const conn = db.promise();
        const cols = ['id', 'organization_id', 'name', 'category', 'sku', 'quantity', 'unit_price', 'tax_rate', 'threshold'];
        const vals = [crypto.randomUUID(), req.user.organization_id, name, category || null, sku || null,
            Math.max(0, parseInt(quantity, 10) || 0), unit_price || null,
            tax_rate === '' || tax_rate == null ? 20 : tax_rate, parseInt(threshold, 10) || 0];

        /* Remise stagiaire (125). Elle était ignorée À LA CRÉATION : on pouvait la saisir dans le
         * formulaire d'ajout, elle disparaissait, et il fallait rouvrir l'article pour la reposer.
         * Bornée ici comme à la mise à jour — une saisie hors limites ne doit pas passer par une
         * porte plutôt que l'autre. */
        if (await colRemise(conn, 'learner_discount_eur')) {
            const pct = Number(req.body.learner_discount_pct);
            const eur = Number(req.body.learner_discount_eur);
            cols.push('learner_discount_pct', 'learner_discount_eur');
            vals.push(
                Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : null,
                Number.isFinite(eur) && eur > 0 ? eur : null);
        }
        await conn.query(
            `INSERT INTO inventory_item (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
        logAudit(req, 'inventory.create', 'InventoryItem');
        res.status(201).json({ message: 'Article ajouté' });
    } catch (err) {
        console.error('Erreur création article :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
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
const updateItem = async (req, res) => {
    const allowed = ['name', 'category', 'sku', 'quantity', 'unit_price', 'tax_rate', 'threshold', 'learner_discount_pct', 'learner_discount_eur'];
    // Bornes des champs numériques (rejette négatifs / NaN / valeurs aberrantes).
    const numericBounds = { quantity: [0, 1e9], unit_price: [0, 1e8], tax_rate: [0, 100], threshold: [0, 1e9],
        learner_discount_pct: [0, 100], learner_discount_eur: [0, 1e8] };
    const updates = [];
    const values = [];
    for (const f of allowed) {
        if (req.body[f] === undefined) continue;
        /* Une chaîne VIDE efface la remise. Le filtre d'origine sautait tout champ vide, si bien
         * qu'on pouvait poser une remise mais jamais la retirer : vider le champ ne faisait rien.
         * Les autres champs gardent l'ancien comportement — vider un nom ne doit pas l'effacer. */
        if (req.body[f] === '') {
            if (f !== 'learner_discount_pct' && f !== 'learner_discount_eur') continue;
            updates.push(`${f} = NULL`);
            continue;
        }
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
    // Migration 125 non jouée : on retire la remise de la requête plutôt que de faire échouer
    // TOUTE la mise à jour de l'article pour un champ facultatif.
    if (!await colRemise(db.promise(), 'learner_discount_eur')) {
        for (let k = updates.length - 1; k >= 0; k--) {
            if (!updates[k].startsWith('learner_discount_')) continue;
            // `= NULL` n'a pas de valeur associée ; `= ?` en a une, à retirer au même indice.
            if (updates[k].endsWith('= ?')) values.splice(k, 1);
            updates.splice(k, 1);
        }
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
