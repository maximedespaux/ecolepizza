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
    // Validation numérique : montant >= 0 fini, quantité entière >= 1.
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0 || amt > 100000000) {
        return res.status(422).json({ error: 'Montant invalide (nombre positif requis).' });
    }
    const qty = Number.parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) {
        return res.status(422).json({ error: 'Quantité invalide (entier positif requis).' });
    }
    db.query(
        `INSERT INTO material_sale (id, organization_id, date, product, category, quantity, amount, learner_id, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), req.user.organization_id, date || new Date().toISOString().slice(0, 10),
         product, category || null, qty, amt, learner_id || null, note || null],
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
const DEFAULT_SETTINGS = {
    invoice_prefix: 'F', next_number: 1,
    payment_methods: 'Espèces,CB,Virement,Chèque', legal_mentions: null, tva_applies: 1,
};

// Charge les paramètres boutique (crée la ligne par défaut si absente).
async function loadSettings(conn, orgId) {
    const [rows] = await conn.query('SELECT * FROM shop_settings WHERE organization_id = ? LIMIT 1', [orgId]);
    if (rows.length) return rows[0];
    await conn.query('INSERT INTO shop_settings (id, organization_id) VALUES (UUID(), ?)', [orgId]);
    const [r2] = await conn.query('SELECT * FROM shop_settings WHERE organization_id = ? LIMIT 1', [orgId]);
    return r2[0] || { ...DEFAULT_SETTINGS };
}

/** GET /api/ventes/settings — paramètres de facturation de la boutique. */
const getShopSettings = async (req, res) => {
    try {
        const s = await loadSettings(db.promise(), req.user.organization_id);
        res.json({ data: s });
    } catch (err) {
        console.error('Erreur paramètres boutique :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/ventes/settings — enregistre les paramètres de facturation. */
const saveShopSettings = async (req, res) => {
    const b = req.body || {};
    try {
        const conn = db.promise();
        await loadSettings(conn, req.user.organization_id); // garantit l'existence
        await conn.query(
            `UPDATE shop_settings SET invoice_prefix = ?, next_number = ?, payment_methods = ?,
                    legal_mentions = ?, tva_applies = ? WHERE organization_id = ?`,
            [
                String(b.invoice_prefix || 'F').slice(0, 20),
                Math.max(1, parseInt(b.next_number, 10) || 1),
                String(b.payment_methods || DEFAULT_SETTINGS.payment_methods).slice(0, 255),
                b.legal_mentions || null,
                b.tva_applies ? 1 : 0,
                req.user.organization_id,
            ]
        );
        res.json({ success: true, message: 'Paramètres enregistrés.' });
    } catch (err) {
        console.error('Erreur enregistrement paramètres boutique :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const checkout = async (req, res) => {
    const { learner_id, buyer_name, lines } = req.body;
    const orgId = req.user.organization_id;
    if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(422).json({ error: 'Panier vide' });
    }
    const globalDisc = Math.min(100, Math.max(0, Number(req.body.discount) || 0)); // % remise globale
    const factor = 1 - globalDisc / 100;
    const status = req.body.status === 'IMPAYEE' ? 'IMPAYEE' : 'PAYEE';
    try {
        const conn = db.promise();
        const settings = await loadSettings(conn, orgId);
        const tvaApplies = !!settings.tva_applies;
        const payMethod = (req.body.payment_method || '').toString().slice(0, 30) || null;

        // Vérifie les articles + le stock avant d'appliquer.
        for (const ln of lines) {
            const [rows] = await conn.query(
                'SELECT name, category, quantity, unit_price, tax_rate FROM inventory_item WHERE id = ? AND organization_id = ?',
                [ln.item_id, orgId]
            );
            if (rows.length === 0) return res.status(404).json({ message: 'Article introuvable' });
            const qty = Math.max(1, parseInt(ln.quantity, 10) || 1);
            if (rows[0].quantity < qty) return res.status(422).json({ error: `Stock insuffisant : ${rows[0].name}` });
            ln._it = rows[0];
            ln._qty = qty;
            ln._disc = Math.min(100, Math.max(0, Number(ln.discount_pct) || 0)); // remise ligne
        }

        // Applique : décrément stock + vente par ligne (remise ligne puis globale).
        let totalHT = 0, totalTVA = 0;
        const productNames = [];
        for (const ln of lines) {
            const it = ln._it;
            const unitNet = Number(it.unit_price || 0) * (1 - ln._disc / 100) * factor; // HT remisé
            const rate = tvaApplies ? Number(it.tax_rate || 0) : 0;
            const lineHT = unitNet * ln._qty;
            await conn.query('UPDATE inventory_item SET quantity = quantity - ? WHERE id = ?', [ln._qty, ln.item_id]);
            await conn.query(
                `INSERT INTO material_sale (id, organization_id, date, product, category, quantity, amount, learner_id, note)
                 VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), orgId, it.name, it.category, ln._qty, unitNet.toFixed(2), learner_id || null,
                 payMethod ? `Paiement : ${payMethod}` : null]
            );
            totalHT += lineHT;
            totalTVA += lineHT * rate / 100;
            productNames.push(`${it.name} x${ln._qty}`);
        }

        // Nom du client (stagiaire choisi > nom libre > comptoir).
        let name = buyer_name || null;
        if (!name && learner_id) {
            const [l] = await conn.query('SELECT first_name, last_name FROM learner WHERE id = ? AND organization_id = ?', [learner_id, orgId]);
            if (l[0]) name = `${l[0].first_name || ''} ${l[0].last_name || ''}`.trim();
        }
        if (!name) name = 'Vente comptoir';

        // Facture : numérotation paramétrable (préfixe + n° incrémental).
        const year = new Date().getFullYear();
        const num = settings.next_number || 1;
        const number = `${settings.invoice_prefix || 'F'}-${year}-${String(num).padStart(4, '0')}`;
        await conn.query('UPDATE shop_settings SET next_number = ? WHERE organization_id = ?', [num + 1, orgId]);

        const remise = globalDisc > 0 ? ` (remise ${globalDisc}%)` : '';
        const description = ('Vente de matériel : ' + productNames.join(', ') + remise).slice(0, 255);
        const invoiceId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO invoice (id, organization_id, buyer_name, description, type, number, amount_net, tva_exoneree, payment_method, status)
             VALUES (?, ?, ?, ?, 'FACTURE', ?, ?, ?, ?, ?)`,
            [invoiceId, orgId, name, description, number, totalHT.toFixed(2), tvaApplies ? 0 : 1, payMethod, status]
        );
        logAudit(req, 'sale.checkout', 'Invoice', invoiceId);
        res.status(201).json({
            success: true, invoice_number: number, invoice_id: invoiceId, buyer: name,
            total_ht: Number(totalHT.toFixed(2)), total_tva: Number(totalTVA.toFixed(2)),
            total_ttc: Number((totalHT + totalTVA).toFixed(2)),
        });
    } catch (err) {
        console.error('Erreur checkout :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSales, createSale, deleteSale, checkout, getShopSettings, saveShopSettings };
