const crypto = require('crypto');
const db = require('../config/database.js');
const { belongsToOrg } = require('../lib/tenancy.js');
const { logAudit } = require('../lib/audit.js');
const { buildCII, attacherFacturX, ventilerTva } = require('../lib/facturx.js');
const { getTemplateContent, loadOrgSteps } = require('./template.controller.js');
const { matchStep } = require('../lib/documents.js');
const { renderTemplateHtml } = require('../lib/htmlfill.js');
const { htmlToPdf } = require('../lib/docxpdf.js');

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

    // `[[org]]` extrait DÉJÀ la première ligne : mysql2 rend [lignes, champs], donc la double
    // déstructuration donne la ligne elle-même. Le `org[0]` qui suivait la cherchait une
    // seconde fois et tombait sur `undefined` — l'organisme n'était donc JAMAIS chargé.
    //
    // Visible sur toute facture émise : l'en-tête vendeur affichait « Organisme » et
    // « SIRET — » au lieu de la raison sociale et du SIRET réels. Une facture sans identité
    // du vendeur n'a pas de valeur probante, et le XML Factur-X partait sans BT-31/BT-32.
    const [[org]] = await conn.query('SELECT * FROM organization WHERE id = ?', [orgId]);
    const o = org || {};

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
 * Produit le PDF de la facture, depuis le MODÈLE de l'organisme s'il en a désigné un.
 *
 * L'organisme choisit un modèle de document (Ventes → Réglages) ; il est alors rendu avec les
 * jetons de la facture, converti en PDF, et le XML Factur-X lui est attaché comme d'habitude.
 * Sans modèle désigné — le cas par défaut — la mise en page interne continue de servir, à
 * l'identique. Personne ne se voit imposer un changement sur ses factures.
 *
 * LE XML N'EST JAMAIS CONFIÉ AU MODÈLE. Il est normé (EN 16931) : sa structure n'est pas une
 * question de mise en page, et la laisser configurer produirait des factures non conformes. Le
 * modèle décide de ce que le client LIT, le code de ce que sa comptabilité IMPORTE.
 *
 * Si le rendu du modèle échoue — modèle supprimé, conversion PDF indisponible — on retombe sur
 * la mise en page interne plutôt que de ne rien livrer : une facture doit toujours pouvoir
 * sortir. C'est l'inverse de la règle appliquée aux documents de dossier, et pour une raison :
 * là-bas, un contenu inventé se fait signer ; ici, la facture est la même pièce, seule sa
 * présentation diffère.
 */
/**
 * Produit le PDF de la facture, à partir du MODÈLE désigné par l'organisme.
 *
 * PAS DE MODÈLE, PAS DE FACTURE. Il n'existe plus de mise en page interne : elle a été retirée
 * du code, pas seulement débranchée. C'est la même règle que pour les documents de dossier, et
 * pour la même raison — une pièce dont le contenu n'est fixé nulle part n'a pas à être émise.
 * Un gabarit de secours qui traîne finit toujours par resservir « juste pour dépanner », et
 * personne ne sait plus alors ce qui a été envoyé au client.
 *
 * Le modèle doit être de type FACTURE. C'est vérifié ici en plus de l'être à l'enregistrement
 * du réglage : un modèle peut changer de type après avoir été choisi, et une facture rendue à
 * partir d'un modèle de convention ne se remarquerait qu'une fois chez le client.
 *
 * LE XML N'EST JAMAIS CONFIÉ AU MODÈLE. Il est normé (EN 16931) : sa structure n'est pas une
 * question de mise en page. Le modèle décide de ce que le client LIT, le code de ce que sa
 * comptabilité IMPORTE.
 *
 * Lève une erreur portant `.motif` — l'appelant en fait un 422 lisible plutôt qu'un 500 muet.
 */
/**
 * Produit le PDF de la facture, a partir du modele de type FACTURE de l'organisme.
 *
 * AUCUN REGLAGE, AUCUNE COLONNE. Le lien « ce modele est ma facture » n'a pas besoin d'etre
 * stocke : il est deja dans le modele lui-meme, par son `doc_type`. Une premiere version
 * ajoutait une colonne `invoice_template_slug` a shop_settings, ce qui creait un SECOND
 * mecanisme de designation a cote de celui qui existe pour tous les autres documents — et deux
 * mecanismes pour la meme question finissent toujours par se contredire.
 *
 * PLUSIEURS MODELES DE TYPE FACTURE sont permis : ils se departagent par leurs conditions
 * (`applies_when`), exactement comme les variantes devis particulier / entreprise / RS7404. On
 * reutilise `matchStep`, le meme moteur que partout ailleurs. A conditions egales, le plus
 * petit `sort_order` gagne — c'est l'ordre qu'affiche deja l'ecran Modeles.
 *
 * PAS DE MODELE, PAS DE FACTURE. Il n'existe plus de mise en page interne : elle a ete retiree
 * du code, pas debranchee. Meme regle que pour les documents de dossier.
 *
 * LE XML N'EST JAMAIS CONFIE AU MODELE. Il est norme (EN 16931) : le modele decide de ce que
 * le client LIT, le code de ce que sa comptabilite IMPORTE.
 *
 * Leve une erreur portant `.motif` — l'appelant en fait un 422 lisible plutot qu'un 500 muet.
 */
async function buildInvoicePdf(conn, orgId, data, xml) {
    const refus = (motif) => Object.assign(new Error(motif), { motif });

    const steps = await loadOrgSteps(orgId);
    const factures = steps.filter((x) => x.active && String(x.doc_type || '').toUpperCase() === 'FACTURE');
    if (!factures.length) {
        throw refus("Aucun modele de type FACTURE n'existe. Creez-le dans Modeles de documents : "
            + 'sans lui, aucune facture ne peut etre editee.');
    }

    // Contexte de conditions. Une facture en sait peu sur le dossier — le financement suffit a
    // departager « facture particulier » et « facture entreprise », qui est le cas courant.
    const ctx = { financing: data.buyer.siret ? 'PROFESSIONNEL' : 'PARTICULIER' };
    const eligibles = factures.filter((x) => matchStep(x.applies_when, ctx));
    const step = (eligibles.length ? eligibles : factures)
        .slice()
        .sort((a, b) => Number(a.sort_order || 100) - Number(b.sort_order || 100))[0];

    const content = await getTemplateContent(orgId, step.slug);
    if (!content || content.kind !== 'builder') {
        throw refus(`Le modele « ${step.label || step.slug} » n'a pas de corps editable. `
            + 'Ouvrez-le dans Modeles de documents -> Editer.');
    }

    const html = renderTemplateHtml(content.html, invoiceTokens(data), {
        title: `${data.typeLabel} ${data.number}`,
        headerHtml: content.header,
        footerHtml: content.footer,
    });
    const pdf = await htmlToPdf(html);
    if (!pdf) throw refus('La conversion du modele en PDF a echoue. Verifiez le contenu du modele.');
    return await attacherFacturX(pdf, xml);
}

/**
 * Les jetons offerts au modèle de facture.
 *
 * Nommés comme ceux des autres modèles pour qu'on n'ait pas à apprendre un second vocabulaire.
 * La ventilation de TVA vient de `ventilerTva` — la même que celle du XML : deux calculs
 * séparés finiraient par ne plus dire le même montant sur la même feuille.
 */
function invoiceTokens(d) {
    const v = ventilerTva(d);
    const eur = (n) => `${Number(n || 0).toFixed(2)} €`;
    const jour = (ymd) => (ymd ? `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}` : '');
    return {
        organisme: { nom: d.seller.name, siret: d.seller.siret, tva: d.seller.vat, ...d.seller.address },
        client: { nom: d.buyer.name, siret: d.buyer.siret, ...d.buyer.address },
        facture: {
            numero: d.number,
            type: d.typeLabel,
            date: jour(d.issueDate),
            echeance: jour(d.dueDate),
            total_ht: eur(v.base),
            total_tva: eur(v.taxe),
            total_ttc: eur(v.grand),
            exoneree: d.tvaExoneree ? 'oui' : 'non',
            taux: v.groupes.map((g) => `${g.taux.toFixed(2)} %`).join(', '),
        },
        lignes: (d.lines || []).map((l) => ({
            designation: l.name,
            montant_ht: eur(l.amount),
            taux: `${Number(l.taxRate ?? d.taxRate ?? 20).toFixed(2)} %`,
        })),
        tva: v.groupes.map((g) => ({ taux: `${g.taux.toFixed(2)} %`, base: eur(g.base), montant: eur(g.taxe) })),
    };
}

/**
 * GET /api/factures/:id/facturx — PDF Factur-X (PDF + XML embarqué).
 */
const getInvoiceFacturX = async (req, res) => {
    try {
        const conn = db.promise();
        const data = await loadInvoiceData(conn, req.user.organization_id, req.params.id);
        if (!data) return res.status(404).json({ message: 'Facture introuvable' });
        const xml = buildCII(data);
        let pdfBytes;
        try {
            pdfBytes = await buildInvoicePdf(conn, req.user.organization_id, data, xml);
        } catch (e) {
            // Un refus de configuration n'est pas une panne : il se corrige en deux clics, à
            // condition de dire lesquels. Un 500 muet enverrait chercher dans les journaux.
            if (e && e.motif) return res.status(422).json({ message: e.motif });
            throw e;
        }
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
