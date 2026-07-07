const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { buildCII, buildFacturXPdf } = require('../lib/facturx.js');

const PREFIX = { DEVIS: 'D', ACOMPTE: 'A', FACTURE: 'F', AVOIR: 'AV' };
const TYPE_LABEL = { DEVIS: 'Devis', ACOMPTE: 'Facture d\'acompte', FACTURE: 'Facture', AVOIR: 'Avoir' };

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
        const [c] = await conn.query('SELECT * FROM company WHERE id = ?', [inv.company_id]);
        if (c[0]) buyer = { name: c[0].name, siret: c[0].siret, address: { line: c[0].address, zip: c[0].zip_code, city: c[0].town } };
    } else if (inv.enrollment_id) {
        const [l] = await conn.query(
            `SELECT l.first_name, l.last_name, l.address, l.zip_code, l.town
             FROM enrollment e JOIN learner l ON l.id = e.learner_id WHERE e.id = ?`,
            [inv.enrollment_id]
        );
        if (l[0]) buyer = { name: `${l[0].first_name || ''} ${l[0].last_name || ''}`.trim(), siret: null, address: { line: l[0].address, zip: l[0].zip_code, city: l[0].town } };
    }

    return {
        number: inv.number,
        type: inv.type,
        typeLabel: TYPE_LABEL[inv.type] || inv.type,
        issueDate: inv.issue_ymd,
        dueDate: inv.due_ymd || null,
        amountNet: inv.amount_net,
        tvaExoneree: !!inv.tva_exoneree,
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
    const { type, enrollment_id, company_id, amount_net, tva_exoneree = 1, due_date } = req.body;
    if (!type || !PREFIX[type] || amount_net === undefined || amount_net === '') {
        return res.status(422).json({ error: 'Type et montant requis' });
    }
    try {
        const conn = db.promise();
        const year = new Date().getFullYear();
        const [cnt] = await conn.query(
            'SELECT COUNT(*) AS n FROM invoice WHERE organization_id = ? AND type = ? AND YEAR(created_at) = ?',
            [req.user.organization_id, type, year]
        );
        const number = `${PREFIX[type]}-${year}-${String(cnt[0].n + 1).padStart(4, '0')}`;

        await conn.query(
            `INSERT INTO invoice (id, organization_id, enrollment_id, company_id, type, number, amount_net, tva_exoneree, status, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BROUILLON', ?)`,
            [crypto.randomUUID(), req.user.organization_id, enrollment_id || null, company_id || null,
             type, number, amount_net, tva_exoneree ? 1 : 0, due_date || null]
        );
        logAudit(req, 'invoice.create', 'Invoice');
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
            [crypto.randomUUID(), req.params.id, amount]
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
