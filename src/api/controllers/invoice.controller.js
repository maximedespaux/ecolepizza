const crypto = require('crypto');
const db = require('../config/database.js');
const { belongsToOrg } = require('../lib/tenancy.js');
const { logAudit } = require('../lib/audit.js');
const { buildCII, buildFacturXPdf } = require('../lib/facturx.js');

const PREFIX = { DEVIS: 'D', ACOMPTE: 'A', FACTURE: 'F', AVOIR: 'AV' };
const TYPE_LABEL = { DEVIS: 'Devis', ACOMPTE: 'Facture d\'acompte', FACTURE: 'Facture', AVOIR: 'Avoir' };

// Montant financier valide : fini, >= 0, borné (évite négatifs / NaN / débordements).
const MAX_AMOUNT = 100000000; // 100 M€ garde-fou
function validAmount(v) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? n : null;
}

// Vérifie qu'un id référencé (entreprise, dossier) appartient bien à l'organisme.

// Assemble les données de facturation (vendeur, client, ligne) pour Factur-X.
async function loadInvoiceData(conn, orgId, invoiceId) {
    const [rows] = await conn.query(
        `SELECT i.*, DATE_FORMAT(i.created_at, '%Y%m%d') AS issue_ymd, DATE_FORMAT(i.due_date, '%Y%m%d') AS due_ymd,
                p.title AS program_title
         FROM invoice i
         LEFT JOIN enrollment e ON e.id = i.enrollment_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         WHERE i.id = ? AND i.organization_id = ?`,
        [invoiceId, orgId]
    );
    if (rows.length === 0) return null;
    const inv = rows[0];

    const [[org]] = await conn.query('SELECT * FROM organization WHERE id = ?', [orgId]);
    const o = org[0] || {};

    // Client : nom libre > entreprise > stagiaire du dossier.
    let buyer = { name: 'Client', siret: null, address: {} };
    if (inv.buyer_name) {
        buyer = { name: inv.buyer_name, siret: null, address: {} };
    } else if (inv.company_id) {
        const [c] = await conn.query('SELECT * FROM company WHERE id = ? AND organization_id = ?', [inv.company_id, orgId]);
        if (c[0]) buyer = { name: c[0].name, siret: c[0].siret, address: { line: c[0].address, zip: c[0].zip_code, city: c[0].town } };
    } else if (inv.enrollment_id) {
        const [l] = await conn.query(
            `SELECT l.first_name, l.last_name, l.address, l.zip_code, l.town
             FROM enrollment e JOIN learner l ON l.id = e.learner_id WHERE e.id = ?`,
            [inv.enrollment_id]
        );
        if (l[0]) buyer = { name: `${l[0].first_name || ''} ${l[0].last_name || ''}`.trim(), siret: null, address: { line: l[0].address, zip: l[0].zip_code, city: l[0].town } };
    }

    // Lignes de la facture (plusieurs dossiers possibles) ; repli sur ligne unique.
    // `il.tax_rate` peut ne pas exister (migration 108 non jouée) : la requête est rejouée
    // sans lui, et l'édition retombe alors sur 20 % comme avant.
    let lineRows;
    try {
        [lineRows] = await conn.query(
            `SELECT il.description, il.amount_net, il.tax_rate, p.title AS program_title, l.first_name, l.last_name
             FROM invoice_line il
             LEFT JOIN enrollment e ON e.id = il.enrollment_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             LEFT JOIN learner l ON l.id = e.learner_id
             WHERE il.invoice_id = ? ORDER BY il.sort_order, il.id`,
            [invoiceId]
        );
    } catch (e) {
        if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
        [lineRows] = await conn.query(
        `SELECT il.description, il.amount_net, p.title AS program_title, l.first_name, l.last_name
         FROM invoice_line il
         LEFT JOIN enrollment e ON e.id = il.enrollment_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         LEFT JOIN learner l ON l.id = e.learner_id
         WHERE il.invoice_id = ? ORDER BY il.sort_order, il.id`,
            [invoiceId]
        );
    }
    const lineName = (r) => r.description
        || [r.program_title, (r.last_name ? `${r.last_name} ${r.first_name || ''}`.trim() : '')].filter(Boolean).join(' — ')
        || 'Prestation de formation';
    const lines = lineRows.length
        ? lineRows.map((r) => ({ name: lineName(r), amount: Number(r.amount_net), taxRate: r.tax_rate ?? null }))
        : [{ name: inv.description || inv.program_title || 'Prestation de formation', amount: Number(inv.amount_net) }];

    return {
        number: inv.number,
        type: inv.type,
        typeLabel: TYPE_LABEL[inv.type] || inv.type,
        issueDate: inv.issue_ymd,
        dueDate: inv.due_ymd || null,
        amountNet: inv.amount_net,
        tvaExoneree: !!inv.tva_exoneree,
        taxRate: inv.tax_rate ?? null, // NULL = facture antérieure à la 108 → 20 % comme avant
        lines,
        lineName: inv.description || inv.program_title || 'Prestation de formation',
        seller: {
            name: o.legal_name || 'Organisme',
            siret: o.siret || null,
            vat: o.vat_number || null,
            address: { line: o.address, zip: o.zip_code, city: o.town },
        },
        buyer,
    };
}

/**
 * GET /api/factures — factures/devis + montant déjà payé + totaux.
 */
const getInvoices = (req, res) => {
    db.query(
        `SELECT i.id, i.type, i.number, i.amount_net, i.tva_exoneree, i.status,
                DATE_FORMAT(i.due_date, '%Y-%m-%d') AS due_date,
                DATE_FORMAT(i.created_at, '%Y-%m-%d') AS created_at,
                i.enrollment_id, i.company_id,
                l.first_name, l.last_name, p.code AS program_code, c.name AS company_name,
                (SELECT COUNT(*) FROM invoice_line il WHERE il.invoice_id = i.id) AS n_lines,
                (SELECT COALESCE(SUM(amount),0) FROM payment WHERE invoice_id = i.id AND status = 'REUSSI') AS paid
         FROM invoice i
         LEFT JOIN enrollment e ON e.id = i.enrollment_id
         LEFT JOIN learner l ON l.id = e.learner_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         LEFT JOIN company c ON c.id = i.company_id
         WHERE i.organization_id = ?
         ORDER BY i.created_at DESC`,
        [req.user.organization_id],
        (err, rows) => {
            if (err) {
                console.error('Erreur factures :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            const totals = { emis: 0, paye: 0, impaye: 0 };
            for (const r of rows) {
                if (r.type === 'FACTURE' || r.type === 'ACOMPTE') {
                    totals.emis += Number(r.amount_net);
                    totals.paye += Number(r.paid);
                    if (r.status !== 'PAYEE' && r.status !== 'ANNULEE') totals.impaye += Number(r.amount_net) - Number(r.paid);
                }
            }
            res.json({ data: rows, totals });
        }
    );
};

/**
 * POST /api/factures — crée un document de facturation (numéro auto).
 */
const createInvoice = async (req, res) => {
    const { type, enrollment_id, company_id, buyer_name, amount_net, tva_exoneree = 1, due_date, lines } = req.body;
    if (!type || !PREFIX[type]) return res.status(422).json({ error: 'Type requis' });

    // Lignes multiples (plusieurs dossiers) ou montant unique (rétro-compatible).
    const hasLines = Array.isArray(lines) && lines.length > 0;
    let cleanLines = [];
    let total;
    if (hasLines) {
        cleanLines = lines
            .map((l) => ({ enrollment_id: l.enrollment_id || null, description: (l.description || '').trim() || null, amount_net: validAmount(l.amount_net) }))
            .filter((l) => l.enrollment_id || l.description || l.amount_net !== null);
        if (cleanLines.length === 0) return res.status(422).json({ error: 'Au moins une ligne requise.' });
        if (cleanLines.some((l) => l.amount_net === null)) {
            return res.status(422).json({ error: 'Montant de ligne invalide (doit être un nombre positif).' });
        }
        total = cleanLines.reduce((s, l) => s + l.amount_net, 0);
    } else {
        if (amount_net === undefined || amount_net === '') return res.status(422).json({ error: 'Type et montant requis' });
        total = validAmount(amount_net);
        if (total === null) return res.status(422).json({ error: 'Montant invalide (doit être un nombre positif).' });
    }

    try {
        const conn = db.promise();
        // Cloisonnement : les références client/dossier doivent être du même organisme.
        if (!await belongsToOrg(conn, 'company', company_id, req.user.organization_id)) {
            return res.status(422).json({ error: 'Entreprise inconnue.' });
        }
        const enrollIds = hasLines ? cleanLines.map((l) => l.enrollment_id) : [enrollment_id];
        for (const eid of enrollIds) {
            if (!await belongsToOrg(conn, 'enrollment', eid, req.user.organization_id)) {
                return res.status(422).json({ error: 'Dossier (inscription) inconnu.' });
            }
        }
        const year = new Date().getFullYear();
        const [cnt] = await conn.query(
            'SELECT COUNT(*) AS n FROM invoice WHERE organization_id = ? AND type = ? AND YEAR(created_at) = ?',
            [req.user.organization_id, type, year]
        );
        const number = `${PREFIX[type]}-${year}-${String(cnt[0].n + 1).padStart(4, '0')}`;
        const mainEnroll = hasLines ? (cleanLines.find((l) => l.enrollment_id)?.enrollment_id || null) : (enrollment_id || null);
        const invoiceId = crypto.randomUUID();

        await conn.query(
            `INSERT INTO invoice (id, organization_id, enrollment_id, company_id, buyer_name, type, number, amount_net, tva_exoneree, status, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BROUILLON', ?)`,
            [invoiceId, req.user.organization_id, mainEnroll, company_id || null, buyer_name || null,
             type, number, total, tva_exoneree ? 1 : 0, due_date || null]
        );
        if (hasLines) {
            for (let i = 0; i < cleanLines.length; i++) {
                const l = cleanLines[i];
                await conn.query(
                    'INSERT INTO invoice_line (id, invoice_id, enrollment_id, description, amount_net, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
                    [crypto.randomUUID(), invoiceId, l.enrollment_id, l.description, l.amount_net, i]
                );
            }
        }
        logAudit(req, 'invoice.create', 'Invoice', invoiceId);
        res.status(201).json({ message: 'Document créé', number });
    } catch (err) {
        console.error('Erreur création facture :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/factures/:id — met à jour le statut.
 */
const updateInvoice = (req, res) => {
    const status = req.body.status;
    const allowed = ['BROUILLON', 'EMISE', 'PAYEE', 'IMPAYEE', 'ANNULEE'];
    if (!allowed.includes(status)) return res.status(422).json({ error: 'Statut invalide' });
    db.query(
        'UPDATE invoice SET status = ? WHERE id = ? AND organization_id = ?',
        [status, req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur maj facture :', err);
                return res.status(400).json({ message: 'Erreur mise à jour' });
            }
            res.status(200).json({ success: true, message: 'Statut mis à jour' });
        }
    );
};

/**
 * POST /api/factures/:id/payments — enregistre un paiement (solde -> PAYEE).
 */
const recordPayment = async (req, res) => {
    const { amount } = req.body;
    if (amount === undefined || amount === '') return res.status(422).json({ error: 'Montant requis' });
    const amt = validAmount(amount);
    if (amt === null || amt === 0) return res.status(422).json({ error: 'Montant invalide (nombre strictement positif requis).' });
    try {
        const conn = db.promise();
        const [inv] = await conn.query(
            'SELECT amount_net FROM invoice WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (inv.length === 0) return res.status(404).json({ message: 'Facture introuvable' });

        await conn.query(
            `INSERT INTO payment (id, invoice_id, provider, amount, status, paid_at)
             VALUES (?, ?, 'manuel', ?, 'REUSSI', NOW())`,
            [crypto.randomUUID(), req.params.id, amt]
        );
        const [sum] = await conn.query(
            "SELECT COALESCE(SUM(amount),0) AS paid FROM payment WHERE invoice_id = ? AND status = 'REUSSI'",
            [req.params.id]
        );
        if (Number(sum[0].paid) >= Number(inv[0].amount_net)) {
            await conn.query('UPDATE invoice SET status = ? WHERE id = ?', ['PAYEE', req.params.id]);
        }
        logAudit(req, 'payment.record', 'Invoice', req.params.id);
        res.status(201).json({ success: true, message: 'Paiement enregistré' });
    } catch (err) {
        console.error('Erreur paiement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/factures/:id
 */
const deleteInvoice = (req, res) => {
    db.query(
        'DELETE FROM invoice WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression facture :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            res.status(200).json({ success: true, message: 'Document supprimé' });
        }
    );
};

/**
 * GET /api/factures/:id/xml — XML CII (Factur-X BASIC).
 */
const getInvoiceXml = async (req, res) => {
    try {
        const conn = db.promise();
        const data = await loadInvoiceData(conn, req.user.organization_id, req.params.id);
        if (!data) return res.status(404).json({ message: 'Facture introuvable' });
        const xml = buildCII(data);
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="${data.number}.xml"`);
        res.send(xml);
    } catch (err) {
        console.error('Erreur XML facture :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/factures/:id/facturx — PDF Factur-X (PDF + XML embarqué).
 */
const getInvoiceFacturX = async (req, res) => {
    try {
        const conn = db.promise();
        const data = await loadInvoiceData(conn, req.user.organization_id, req.params.id);
        if (!data) return res.status(404).json({ message: 'Facture introuvable' });
        const xml = buildCII(data);
        const pdfBytes = await buildFacturXPdf(data, xml);
        logAudit(req, 'invoice.facturx', 'Invoice', req.params.id);
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `attachment; filename="${data.number}.pdf"`);
        res.send(Buffer.from(pdfBytes));
    } catch (err) {
        console.error('Erreur Factur-X :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getInvoices, createInvoice, updateInvoice, recordPayment, deleteInvoice, getInvoiceXml, getInvoiceFacturX };
