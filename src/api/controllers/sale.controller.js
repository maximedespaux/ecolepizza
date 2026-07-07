const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

/**
 * GET /api/ventes — ventes de matériel + total.
 */
const getSales = (req, res) => {
    db.query(
        `SELECT s.id, DATE_FORMAT(s.date, '%Y-%m-%d') AS date, s.product, s.category,
                s.quantity, s.amount, s.note, s.learner_id,
                l.first_name, l.last_name
         FROM material_sale s
         LEFT JOIN learner l ON l.id = s.learner_id
         WHERE s.organization_id = ?
         ORDER BY s.date DESC, s.created_at DESC`,
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération ventes :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            const total = results.reduce((sum, r) => sum + Number(r.amount) * (r.quantity || 1), 0);
            res.json({ data: results, total });
        }
    );
};

/**
 * POST /api/ventes — enregistre une vente.
 */
const createSale = (req, res) => {
    const { date, product, category, quantity = 1, amount, learner_id, note } = req.body;
    if (!product || amount === undefined || amount === '') {
        return res.status(422).json({ error: 'Produit et montant requis' });
    }
    db.query(
        `INSERT INTO material_sale (id, organization_id, date, product, category, quantity, amount, learner_id, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), req.user.organization_id, date || new Date().toISOString().slice(0, 10),
         product, category || null, quantity || 1, amount, learner_id || null, note || null],
        (err) => {
            if (err) {
                console.error('Erreur création vente :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logAudit(req, 'sale.create', 'MaterialSale');
            res.status(201).json({ message: 'Vente enregistrée' });
        }
    );
};

/**
 * DELETE /api/ventes/:id
 */
const deleteSale = (req, res) => {
    db.query(
        'DELETE FROM material_sale WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression vente :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            res.status(200).json({ success: true, message: 'Vente supprimée' });
        }
    );
};

/**
 * POST /api/ventes/checkout — panier : décrémente le stock, enregistre les
 * ventes et crée automatiquement une facture pour le client.
 * Corps : { learner_id?, buyer_name?, lines: [{ item_id, quantity }] }
 */
const checkout = async (req, res) => {
    const { learner_id, buyer_name, lines } = req.body;
    const orgId = req.user.organization_id;
    if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(422).json({ error: 'Panier vide' });
    }
    const discount = Math.min(100, Math.max(0, Number(req.body.discount) || 0)); // % remise
    const factor = 1 - discount / 100;
    try {
        const conn = db.promise();

        // Vérifie les articles + le stock avant d'appliquer.
        for (const ln of lines) {
            const [rows] = await conn.query(
                'SELECT name, category, quantity, unit_price FROM inventory_item WHERE id = ? AND organization_id = ?',
                [ln.item_id, orgId]
            );
            if (rows.length === 0) return res.status(404).json({ message: 'Article introuvable' });
            const qty = Math.max(1, parseInt(ln.quantity, 10) || 1);
            if (rows[0].quantity < qty) return res.status(422).json({ error: `Stock insuffisant : ${rows[0].name}` });
            ln._it = rows[0];
            ln._qty = qty;
        }

        // Applique : décrément stock + vente par ligne.
        let totalHT = 0;
        const productNames = [];
        for (const ln of lines) {
            const it = ln._it;
            const unit = Number(it.unit_price || 0) * factor; // prix remisé
            await conn.query('UPDATE inventory_item SET quantity = quantity - ? WHERE id = ?', [ln._qty, ln.item_id]);
            await conn.query(
                `INSERT INTO material_sale (id, organization_id, date, product, category, quantity, amount, learner_id)
                 VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), orgId, it.name, it.category, ln._qty, unit.toFixed(2), learner_id || null]
            );
            totalHT += unit * ln._qty;
            productNames.push(`${it.name} x${ln._qty}`);
        }

        // Nom du client (stagiaire choisi > nom libre > comptoir).
        let name = buyer_name || null;
        if (!name && learner_id) {
            const [l] = await conn.query('SELECT first_name, last_name FROM learner WHERE id = ? AND organization_id = ?', [learner_id, orgId]);
            if (l[0]) name = `${l[0].first_name || ''} ${l[0].last_name || ''}`.trim();
        }
        if (!name) name = 'Vente comptoir';

        // Facture automatique.
        const year = new Date().getFullYear();
        const [cnt] = await conn.query(
            "SELECT COUNT(*) AS n FROM invoice WHERE organization_id = ? AND type = 'FACTURE' AND YEAR(created_at) = ?",
            [orgId, year]
        );
        const number = `F-${year}-${String(cnt[0].n + 1).padStart(4, '0')}`;
        const remise = discount > 0 ? ` (remise ${discount}%)` : '';
        const description = ('Vente de matériel : ' + productNames.join(', ') + remise).slice(0, 255);
        const invoiceId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO invoice (id, organization_id, buyer_name, description, type, number, amount_net, tva_exoneree, status)
             VALUES (?, ?, ?, ?, 'FACTURE', ?, ?, 0, 'EMISE')`,
            [invoiceId, orgId, name, description, number, totalHT.toFixed(2)]
        );
        logAudit(req, 'sale.checkout', 'Invoice', invoiceId);
        res.status(201).json({ success: true, invoice_number: number, invoice_id: invoiceId, buyer: name });
    } catch (err) {
        console.error('Erreur checkout :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSales, createSale, deleteSale, checkout };
