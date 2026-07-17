/**
 * Zone « Demandes boutique » du panel admin.
 *
 * Le stagiaire compose son panier dans son espace, valide → une DEMANDE arrive ici avec son
 * identité et ses articles. L'école prépare, remet en main propre, puis facture via `invoice`
 * (qui gère déjà la vente comptoir : `buyer_name`, `payment_method`). Aucun paiement en ligne :
 * le stagiaire est sur place cinq jours.
 *
 * Ce contrôleur est le PENDANT ADMIN de `espace.controller.js` (côté stagiaire) : là-bas on ne
 * voit que ses propres demandes, ici on voit celles de toute l'organisation.
 */

const db = require('../config/database.js');

const isMissingSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');

/* Le stagiaire ne pilote pas son statut : c'est l'école qui prépare, remet et facture. */
const STATUSES = ['NOUVELLE', 'EN_PREPARATION', 'PRETE', 'PAYE', 'FACTUREE', 'REMISE', 'ANNULEE'];

/**
 * GET /api/boutique/demandes?status=…
 * Renvoie les demandes avec l'identité du demandeur et le détail des lignes.
 */
const listShopRequests = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const status = STATUSES.includes(req.query.status) ? req.query.status : null;
        let rows = [];
        try {
            [rows] = await conn.query(
                // pickup_at manquait : l'école voyait la demande sans jamais savoir QUAND le
                // stagiaire passe la chercher — l'info était pourtant saisie. Heure locale, même
                // raison que ci-dessus.
                `SELECT r.id, r.ref, r.status, r.note, r.admin_note, r.invoice_id, r.created_at, r.updated_at,
                        DATE_FORMAT(r.pickup_at, '%Y-%m-%dT%H:%i') AS pickup_at,
                        l.id AS learner_id, l.first_name, l.last_name, l.email, l.phone,
                        li.source, li.label, li.qty, li.unit_price_ht, li.tax_rate, li.personalization, li.variant, li.sort_order
                 FROM shop_request r
                 JOIN learner l ON l.id = r.learner_id
                 LEFT JOIN shop_request_line li ON li.request_id = r.id
                 WHERE r.organization_id = ? ${status ? 'AND r.status = ?' : ''}
                 ORDER BY r.created_at DESC, li.sort_order`,
                status ? [orgId, status] : [orgId]
            );
        } catch (e) {
            if (isMissingSchema(e)) return res.json({ data: [] }); // migration 096 non jouée
            throw e;
        }

        const byId = new Map();
        for (const r of rows) {
            if (!byId.has(r.id)) {
                byId.set(r.id, {
                    id: r.id, ref: r.ref, status: r.status, note: r.note, admin_note: r.admin_note,
                    invoice_id: r.invoice_id, created_at: r.created_at, updated_at: r.updated_at,
                    learner: { id: r.learner_id, first_name: r.first_name, last_name: r.last_name,
                               email: r.email, phone: r.phone },
                    lines: [], total_ht: 0, total_ttc: 0, has_partner: false, tarif_a_definir: false,
                });
            }
            const d = byId.get(r.id);
            if (!r.label) continue;
            const price = r.unit_price_ht == null ? null : Number(r.unit_price_ht);
            d.lines.push({ source: r.source, label: r.label, qty: r.qty, unit_price_ht: price, tax_rate: Number(r.tax_rate), personalization: r.personalization, variant: r.variant });
            if (r.source === 'PARTENAIRE') d.has_partner = true;
            // Une ligne partenaire « tarif sur demande » n'a pas de prix : on ne l'additionne pas
            // et on le signale, sinon le total afficherait un montant faux avec assurance.
            if (price == null) { d.tarif_a_definir = true; continue; }
            d.total_ht += price * r.qty;
            d.total_ttc += price * r.qty * (1 + Number(r.tax_rate) / 100);
        }
        const data = [...byId.values()].map((d) => ({
            ...d, total_ht: +d.total_ht.toFixed(2), total_ttc: +d.total_ttc.toFixed(2),
        }));
        res.json({ data });
    } catch (err) {
        console.error('Erreur demandes boutique :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/boutique/demandes/:id — { status, admin_note } */
const updateShopRequest = async (req, res) => {
    try {
        const conn = db.promise();
        const sets = [], vals = [];
        if (req.body.status !== undefined) {
            if (!STATUSES.includes(req.body.status)) return res.status(422).json({ message: 'Statut inconnu.' });
            sets.push('status = ?'); vals.push(req.body.status);
        }
        if (req.body.admin_note !== undefined) {
            sets.push('admin_note = ?'); vals.push(String(req.body.admin_note || '').slice(0, 500) || null);
        }
        if (!sets.length) return res.status(422).json({ message: 'Rien à modifier.' });
        vals.push(req.params.id, req.user.organization_id);
        const [r] = await conn.query(`UPDATE shop_request SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`, vals);
        if (!r.affectedRows) return res.status(404).json({ message: 'Demande introuvable.' });
        res.json({ success: true });
    } catch (err) {
        if (isMissingSchema(err)) return res.status(503).json({ message: 'Migration 096 non jouée.' });
        console.error('Erreur maj demande :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/boutique/demandes/:id/facture — transforme la demande en facture.
 *
 * Ne facture QUE les lignes ECOLE : sur une ligne partenaire, l'école ne vend pas, elle met en
 * relation — la facturer reviendrait à encaisser une vente qui n'est pas la sienne.
 * `tva_exoneree = 0` : l'exonération de l'art. 261-4-4° vise la formation professionnelle, pas
 * la vente de matériel. Une pelle est soumise à TVA.
 */
const invoiceShopRequest = async (req, res) => {
    const conn = db.promise();
    try {
        const orgId = req.user.organization_id;
        const [[r]] = await conn.query(
            `SELECT r.id, r.ref, r.status, r.invoice_id, l.first_name, l.last_name
             FROM shop_request r JOIN learner l ON l.id = r.learner_id
             WHERE r.id = ? AND r.organization_id = ? LIMIT 1`,
            [req.params.id, orgId]
        );
        if (!r) return res.status(404).json({ message: 'Demande introuvable.' });
        if (r.invoice_id) return res.status(409).json({ message: 'Cette demande a déjà une facture.' });

        const [lines] = await conn.query(
            `SELECT label, qty, unit_price_ht, tax_rate, personalization, variant FROM shop_request_line
             WHERE request_id = ? AND source = 'ECOLE' AND unit_price_ht IS NOT NULL ORDER BY sort_order`,
            [r.id]
        );
        if (!lines.length) return res.status(422).json({ message: 'Aucune ligne facturable par l’école dans cette demande.' });

        const totalTtc = lines.reduce((s, l) => s + Number(l.unit_price_ht) * l.qty * (1 + Number(l.tax_rate) / 100), 0);
        const year = new Date().getFullYear();
        const [[last]] = await conn.query(
            "SELECT number FROM invoice WHERE organization_id = ? AND number LIKE ? ORDER BY number DESC LIMIT 1",
            [orgId, `BQ-${year}-%`]
        );
        const n = last ? Number(String(last.number).split('-').pop()) + 1 : 1;
        const number = `BQ-${year}-${String(n).padStart(4, '0')}`;

        await conn.query(
            `INSERT INTO invoice (id, organization_id, buyer_name, description, type, number, amount_net, tva_exoneree, status)
             VALUES (uuid(), ?, ?, ?, 'FACTURE', ?, ?, 0, 'BROUILLON')`,
            [orgId, `${r.first_name || ''} ${r.last_name || ''}`.trim(), `Boutique — demande ${r.ref}`, number, totalTtc.toFixed(2)]
        );
        const [[inv]] = await conn.query('SELECT id FROM invoice WHERE number = ? LIMIT 1', [number]);
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const ttc = Number(l.unit_price_ht) * l.qty * (1 + Number(l.tax_rate) / 100);
            await conn.query(
                'INSERT INTO invoice_line (id, invoice_id, description, amount_net, sort_order) VALUES (uuid(), ?, ?, ?, ?)',
                [inv.id, `${l.label}${l.variant ? ` (${l.variant})` : ''} × ${l.qty}${l.personalization ? ` — ${l.personalization}` : ''}`, ttc.toFixed(2), i]
            );
        }
        await conn.query("UPDATE shop_request SET invoice_id = ?, status = 'FACTUREE' WHERE id = ?", [inv.id, r.id]);
        res.status(201).json({ success: true, invoice_id: inv.id, number });
    } catch (err) {
        if (isMissingSchema(err)) return res.status(503).json({ message: 'Migration 096 non jouée.' });
        console.error('Erreur facturation demande :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/boutique/demandes/:id — supprime une demande (et ses lignes, en cascade).
 * Refuse si la demande est déjà FACTURÉE (une facture existe) : détacher/supprimer
 * d'abord la facture pour garder la traçabilité.
 */
const deleteShopRequest = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[r]] = await conn.query('SELECT id, invoice_id, status FROM shop_request WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!r) return res.status(404).json({ message: 'Demande introuvable.' });
        if (r.invoice_id || r.status === 'FACTUREE') return res.status(409).json({ message: 'Demande facturée : gérez d’abord la facture.' });
        await conn.query('DELETE FROM shop_request WHERE id = ? AND organization_id = ?', [req.params.id, orgId]); // lignes en cascade
        res.json({ success: true });
    } catch (err) {
        if (isMissingSchema(err)) return res.status(503).json({ message: 'Migration 096 non jouée.' });
        console.error('Erreur suppression demande :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/boutique/retraits?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Les retraits prévus sur une plage — sert à afficher « Récupérer le matériel » sur la page
 * d'une session, aux dates de cette session.
 *
 * On filtre sur la DATE seule (DATE(pickup_at)) et pas sur le datetime : `to` est un jour de
 * fin inclus, et comparer `pickup_at <= '2026-07-24'` exclurait tout ce qui suit minuit — donc
 * la journée entière. Le grand classique des bornes de dates.
 */
const listPickups = async (req, res) => {
    try {
        const conn = db.promise();
        const { from, to } = req.query;
        const day = /^\d{4}-\d{2}-\d{2}$/;
        if (!day.test(from || '') || !day.test(to || '')) {
            return res.status(422).json({ message: 'Bornes de dates attendues (YYYY-MM-DD).' });
        }
        let rows = [];
        try {
            [rows] = await conn.query(
                // Heure LOCALE (cf. espace.controller/getMyShopRequests) : en brut, le driver
                // renvoie une Date que res.json() passe en UTC, et le bandeau « Récupérer le
                // matériel » annonçait à l'école une heure décalée de deux heures.
                `SELECT r.id, r.ref, r.status, DATE_FORMAT(r.pickup_at, '%Y-%m-%dT%H:%i') AS pickup_at,
                        l.id AS learner_id, l.first_name, l.last_name, l.phone,
                        COUNT(li.id) AS n_lines
                 FROM shop_request r
                 JOIN learner l ON l.id = r.learner_id
                 LEFT JOIN shop_request_line li ON li.request_id = r.id
                 WHERE r.organization_id = ? AND r.pickup_at IS NOT NULL
                   AND r.status <> 'ANNULEE'
                   AND DATE(r.pickup_at) BETWEEN ? AND ?
                 GROUP BY r.id
                 ORDER BY r.pickup_at`,
                [req.user.organization_id, from, to]
            );
        } catch (e) {
            if (isMissingSchema(e)) return res.json({ data: [] }); // migration 096 non jouée
            throw e;
        }
        res.json({ data: rows.map((r) => ({
            id: r.id, ref: r.ref, status: r.status, pickup_at: r.pickup_at, n_lines: Number(r.n_lines),
            learner: { id: r.learner_id, first_name: r.first_name, last_name: r.last_name, phone: r.phone },
        })) });
    } catch (err) {
        console.error('Erreur retraits :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listShopRequests, updateShopRequest, invoiceShopRequest, deleteShopRequest, listPickups };
