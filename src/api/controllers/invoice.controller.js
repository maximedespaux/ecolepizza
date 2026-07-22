const crypto = require('crypto');
const db = require('../config/database.js');
const { belongsToOrg } = require('../lib/tenancy.js');
const { logAudit } = require('../lib/audit.js');
const { buildCII, attacherFacturX, ventilerTva, manquantsFacturX } = require('../lib/facturx.js');
const { getTemplateContent, loadOrgSteps } = require('./template.controller.js');
const { renderTemplateHtml } = require('../lib/htmlfill.js');
const { htmlToPdf } = require('../lib/docxpdf.js');
const { loadEmitter, resolveEmitter, nextNumberForEmitter } = require('../lib/emitter.js');

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

    // LE VENDEUR EST L'ÉMETTRICE de la facture, si elle en porte une ; sinon l'organisme. Les
    // deux tables partagent les noms de colonnes d'identité (legal_name, siret, vat_number,
    // adresse, iban…), donc tout ce qui suit — en-tête PDF, jetons, XML Factur-X — bascule sans
    // rien savoir de l'origine. Une entité distincte a un SIRET et une TVA propres : c'est eux
    // qui doivent partir dans le XML, pas ceux de l'organisme.
    const emetteur = await loadEmitter(conn, orgId, inv.billing_profile_id);
    const o = emetteur || org || {};

    // Client : nom libre > entreprise > stagiaire du dossier.
    // `email` n'est pas décoratif : c'est BT-49, l'adresse électronique de l'acheteur, rendue
    // OBLIGATOIRE en France par BR-FR-12. Une facture émise pour un client saisi au nom libre
    // n'en a aucune et sera rejetée à la validation — d'où l'avertissement remonté plus bas.
    // L'ORDRE DIT QUI EST FACTURÉ, et l'entreprise passe EN PREMIER. Quand une vente porte à la
    // fois `company_id` et `learner_id`, c'est l'entreprise qui achète — le stagiaire n'est
    // qu'un rattachement comptable. Tester learner_id d'abord facturerait la mauvaise partie, et
    // priverait le XML du SIRET (BT-30) que porte l'entreprise, pas la personne.
    let buyer = { name: 'Client', siret: null, email: null, address: {} };
    if (inv.company_id) {
        const [c] = await conn.query('SELECT * FROM company WHERE id = ? AND organization_id = ?', [inv.company_id, orgId]);
        if (c[0]) {
            buyer = {
                // Le nom IMPRIMÉ prime : renommer une fiche ne doit pas récrire une pièce émise.
                name: inv.buyer_name || c[0].name,
                siret: c[0].siret,
                email: inv.buyer_email || c[0].email || null,
                address: { line: c[0].address, zip: c[0].zip_code, city: c[0].town },
            };
        }
    } else if (inv.learner_id) {
        // La VENTE garde désormais la référence du stagiaire, pas seulement son nom. Sans elle,
        // l'e-mail et l'adresse restaient sur la fiche, inatteignables depuis la facture.
        const [l] = await conn.query(
            'SELECT first_name, last_name, email, address, zip_code, town FROM learner WHERE id = ? AND organization_id = ?',
            [inv.learner_id, orgId]
        );
        if (l[0]) {
            buyer = {
                name: inv.buyer_name || `${l[0].first_name || ''} ${l[0].last_name || ''}`.trim(),
                siret: null,
                email: inv.buyer_email || l[0].email || null,
                address: { line: l[0].address, zip: l[0].zip_code, city: l[0].town },
            };
        }
    } else if (inv.buyer_name) {
        buyer = { name: inv.buyer_name, siret: null, email: inv.buyer_email || null, address: {} };
    } else if (inv.enrollment_id) {
        const [l] = await conn.query(
            `SELECT l.first_name, l.last_name, l.email, l.address, l.zip_code, l.town
             FROM enrollment e JOIN learner l ON l.id = e.learner_id WHERE e.id = ?`,
            [inv.enrollment_id]
        );
        if (l[0]) buyer = { name: `${l[0].first_name || ''} ${l[0].last_name || ''}`.trim(), siret: null, email: l[0].email || null, address: { line: l[0].address, zip: l[0].zip_code, city: l[0].town } };
    }

    // Lignes de la facture (plusieurs dossiers possibles) ; repli sur ligne unique. Les colonnes
    // détaillées apparaissent par migration : tax_rate/qty/unit_price (108, 110), reference (118).
    // On essaie du plus riche au plus pauvre — chaque niveau tombe sur le suivant si une colonne
    // manque, plutôt qu'une seule requête minimale qui perdrait aussi tax_rate/qty.
    const jointures = `FROM invoice_line il
             LEFT JOIN enrollment e ON e.id = il.enrollment_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             LEFT JOIN learner l ON l.id = e.learner_id
             WHERE il.invoice_id = ? ORDER BY il.sort_order, il.id`;
    const niveaux = [
        'il.description, il.amount_net, il.tax_rate, il.qty, il.unit_price_ht, il.reference,',
        'il.description, il.amount_net, il.tax_rate, il.qty, il.unit_price_ht,',
        'il.description, il.amount_net,',
    ];
    let lineRows;
    for (const cols of niveaux) {
        try {
            [lineRows] = await conn.query(
                `SELECT ${cols} p.title AS program_title, l.first_name, l.last_name ${jointures}`, [invoiceId]);
            break;
        } catch (e) {
            if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
            // colonne absente : on tente le niveau suivant, plus pauvre.
        }
    }
    const lineName = (r) => r.description
        || [r.program_title, (r.last_name ? `${r.last_name} ${r.first_name || ''}`.trim() : '')].filter(Boolean).join(' — ')
        || 'Prestation de formation';
    const lines = lineRows.length
        ? lineRows.map((r) => ({
            name: lineName(r), amount: Number(r.amount_net), taxRate: r.tax_rate ?? null,
            qty: r.qty != null ? Number(r.qty) : null,
            unit_price_ht: r.unit_price_ht != null ? Number(r.unit_price_ht) : null,
            reference: r.reference || null,
        }))
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
        // Règlement : le moyen (résumé) et sa ventilation JSON s'il y en a une (paiement mixte,
        // ou chèque avec banque/numéro). `payment_split` peut ne pas exister (migration 116).
        paymentMethod: inv.payment_method || null,
        paymentSplit: inv.payment_split || null,
        seller: {
            name: o.legal_name || 'Organisme',
            siret: o.siret || null,
            vat: o.vat_number || null,
            email: o.email || null, // BT-34, obligatoire (BR-FR-13)
            address: { line: o.address, zip: o.zip_code, city: o.town },
        },
        // L'identité complète du vendeur retenu — organisme ou émettrice —, pour que le MODÈLE
        // rende ses jetons `field:organization.*` avec ces valeurs-là.
        emitter: o,
        buyer,
        // L'acheteur est-il une ENTREPRISE ? Signal fiable = la vente est rattachée à une company
        // (le SIRET peut manquer sur une société ; company_id, lui, tranche). Sert à choisir le
        // modèle de facture selon son destinataire (buyer_audience).
        buyerIsCompany: !!inv.company_id,
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
        // ÉMETTRICE : celle demandée (si elle est à nous), sinon la défaut, sinon aucune →
        // l'organisme. Son numéro vient de SA séquence ; sans émettrice, on garde le compteur
        // historique par type et par année.
        const emetteur = await resolveEmitter(conn, req.user.organization_id, req.body.billing_profile_id);
        const year = new Date().getFullYear();
        let number;
        if (emetteur) {
            number = await nextNumberForEmitter(conn, emetteur);
        } else {
            const [cnt] = await conn.query(
                'SELECT COUNT(*) AS n FROM invoice WHERE organization_id = ? AND type = ? AND YEAR(created_at) = ?',
                [req.user.organization_id, type, year]
            );
            number = `${PREFIX[type]}-${year}-${String(cnt[0].n + 1).padStart(4, '0')}`;
        }
        const mainEnroll = hasLines ? (cleanLines.find((l) => l.enrollment_id)?.enrollment_id || null) : (enrollment_id || null);
        const invoiceId = crypto.randomUUID();

        // billing_profile_id peut ne pas exister (migration 113 non jouée) : on réinsère alors
        // sans lui, la facture sortant sous l'organisme comme avant.
        const base = [invoiceId, req.user.organization_id, mainEnroll, company_id || null, buyer_name || null,
            type, number, total, tva_exoneree ? 1 : 0, due_date || null];
        try {
            await conn.query(
                `INSERT INTO invoice (id, organization_id, enrollment_id, company_id, buyer_name, type, number, amount_net, tva_exoneree, status, due_date, billing_profile_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BROUILLON', ?, ?)`,
                [...base, emetteur ? emetteur.id : null]
            );
        } catch (e) {
            if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
            await conn.query(
                `INSERT INTO invoice (id, organization_id, enrollment_id, company_id, buyer_name, type, number, amount_net, tva_exoneree, status, due_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'BROUILLON', ?)`,
                base
            );
        }
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
 * Signale ce qui empêchera la facture de passer la validation française.
 *
 * On N'EMPÊCHE PAS l'émission : la facture reste juridiquement valable, et refuser de la
 * produire parce qu'un e-mail manque bloquerait l'organisme sans rien résoudre. Mais on ne se
 * tait pas non plus — sans ça, le défaut ne se découvre qu'au rejet par la plateforme, des
 * jours plus tard, loin de l'écran où il se corrige.
 */
function avertirConformite(res, data) {
    const manque = manquantsFacturX(data);
    if (!manque.length) return;
    console.warn(`Facture ${data.number} : non conforme XP Z12-012, il manque ${manque.join(', ')}`);
    res.set('X-Facturx-Manquants', encodeURIComponent(manque.join(' | ')));
}

/**
 * GET /api/factures/:id/xml — XML CII (Factur-X BASIC).
 */
const getInvoiceXml = async (req, res) => {
    try {
        const conn = db.promise();
        const data = await loadInvoiceData(conn, req.user.organization_id, req.params.id);
        if (!data) return res.status(404).json({ message: 'Facture introuvable' });
        const xml = buildCII(data);
        avertirConformite(res, data);
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
/**
 * Choisit le modèle FACTURE selon le DESTINATAIRE (l'acheteur), parmi les modèles FACTURE actifs.
 *
 * Ordre : (1) un modèle dont le destinataire correspond exactement à l'acheteur — entreprise ou
 * particulier ; (2) à défaut, un modèle « tous » (buyer_audience vide) ; (3) à défaut, l'ancien
 * réglage global (slug de shop_settings) ; (4) à défaut, l'unique modèle FACTURE. Renvoie null si
 * rien ne tranche (plusieurs modèles, aucun « tous », aucun réglage) — l'appelant explique alors.
 *
 * Pur (aucune I/O) pour être testable directement, indépendamment de la base.
 */
function pickInvoiceTemplate(factures, buyerIsCompany, fallbackSlug) {
    const cible = buyerIsCompany ? 'company' : 'individual';
    const dest = (x) => {
        const a = String(x.buyer_audience || '').toLowerCase();
        return (a === 'company' || a === 'individual') ? a : 'all';
    };
    return factures.find((x) => dest(x) === cible)                     // 1) destiné à cet acheteur
        || factures.find((x) => dest(x) === 'all')                     // 2) « tous »
        || (fallbackSlug ? factures.find((x) => x.slug === fallbackSlug) : null) // 3) ancien réglage
        || (factures.length === 1 ? factures[0] : null);               // 4) l'unique modèle FACTURE
}

async function buildInvoicePdf(conn, orgId, data, xml) {
    const refus = (motif) => Object.assign(new Error(motif), { motif });

    const steps = await loadOrgSteps(orgId);
    const factures = steps.filter((x) => x.active && String(x.doc_type || '').toUpperCase() === 'FACTURE');
    if (!factures.length) {
        throw refus("Aucun modele de type FACTURE n'existe. Creez-le dans Modeles de documents : "
            + 'sans lui, aucune facture ne peut etre editee.');
    }

    // LE MODÈLE SUIT L'ACHETEUR. Une facture à une ENTREPRISE et une facture à un PARTICULIER
    // n'ont pas la même forme (SIRET acheteur, représentant, mentions OPCO d'un côté, rien de
    // l'autre). Chaque modèle FACTURE porte donc un « destinataire » (buyer_audience) ; on prend
    // celui qui correspond à l'acheteur, sinon un modèle « tous », sinon l'unique. C'est plus sûr
    // qu'un slug figé sur l'émettrice : le bon modèle se choisit tout seul, sans réglage à tenir.
    // Ancien réglage global (shop_settings) : conservé comme DERNIER repli, pour un organisme qui
    // n'a pas (encore) renseigné de destinataire sur ses modèles.
    let slug = null;
    try {
        const [[st]] = await conn.query(
            'SELECT invoice_template_slug FROM shop_settings WHERE organization_id = ?', [orgId]);
        slug = (st && st.invoice_template_slug) || null;
    } catch (e) {
        if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
    }

    const step = pickInvoiceTemplate(factures, data.buyerIsCompany, slug);

    if (!step) {
        throw refus(`Plusieurs modèles de type FACTURE existent, sans « destinataire » qui les `
            + `départage pour un acheteur ${data.buyerIsCompany ? 'entreprise' : 'particulier'}. `
            + 'Ouvrez Modèles de documents et indiquez, sur au moins un modèle FACTURE, s\'il vise '
            + 'les particuliers, les entreprises, ou tous.');
    }

    const content = await getTemplateContent(orgId, step.slug);
    if (!content || content.kind !== 'builder') {
        throw refus(`Le modele « ${step.label || step.slug} » n'a pas de corps editable. `
            + 'Ouvrez-le dans Modeles de documents -> Editer.');
    }

    // Le contexte de rendu prend l'ÉMETTRICE, pas l'organisme : les jetons `field:organization.*`
    // (raison sociale, SIRET, IBAN, et même forme juridique / capital / RCS que l'organisme ne
    // portait pas) doivent afficher l'identité sous laquelle la facture sort.
    const [[org]] = await conn.query('SELECT * FROM organization WHERE id = ?', [orgId]);
    const identite = (data.emitter && data.emitter.legal_name) ? data.emitter : (org || {});
    // PAPIER À EN-TÊTE AUTOMATIQUE. Quand l'en-tête du modèle est vide, l'app ajoute d'office un
    // bandeau avec l'identité de l'organisme. Un modèle de facture qui porte DÉJÀ cette identité
    // dans son corps (les deux encadrés vendeur/acheteur) se retrouve alors avec le nom en double,
    // tout en haut. Le modèle peut donc le désactiver (layout.noLetterhead) — voir l'éditeur.
    const html = renderTemplateHtml(content.html, invoiceCtx(identite, data), {
        title: `${data.typeLabel} ${data.number}`,
        headerHtml: content.header,
        footerHtml: content.footer,
        letterhead: !(content.layout && content.layout.noLetterhead),
    });
    // PDF/A-3 : exigé par Factur-X, et seul le moteur de rendu peut l'obtenir (polices
    // embarquees, profil de sortie ICC, aucune couleur en espace dependant du peripherique).
    const pdf = await htmlToPdf(html, true);
    if (!pdf) throw refus('La conversion du modele en PDF a echoue. Verifiez le contenu du modele.');
    return await attacherFacturX(pdf, xml);
}

/**
 * Le CONTEXTE passé au modèle de facture.
 *
 * DÉFAUT CORRIGÉ ICI, et il était sérieux : cette fonction renvoyait auparavant un objet
 * maison `{ organisme, client, facture, lignes }`, passé tel quel comme `ctx` à
 * `renderTemplateHtml`. Or celui-ci appelle `resolveTokens(ctx)`, qui attend la forme
 * `{ org, learner, company, formations }`. Aucun des 99 jetons standard ne trouvait donc sa
 * valeur : une facture rendue depuis un modèle sortait avec TOUS ses jetons vides. Le PDF
 * était produit, l'erreur ne se voyait qu'en le lisant.
 *
 * On construit donc un vrai `ctx` : `org` pour l'organisme, `company` ou `learner` selon
 * l'acheteur — de sorte que {Nom entreprise} ou {Personne} fonctionnent selon le cas — plus un
 * bloc `invoice` que `resolveTokens` fusionne, et `articles` pour le bloc {#Articles}.
 */
function invoiceCtx(org, data) {
    const v = ventilerTva(data);
    const eur = (n) => `${Number(n || 0).toFixed(2)} €`;
    const jour = (ymd) => (ymd ? `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}/${ymd.slice(0, 4)}` : '');
    const a = data.buyer.address || {};
    const adresse = [a.line, [a.zip, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

    // L'acheteur est une entreprise s'il porte un SIRET ; sinon on le traite comme une
    // personne. Les deux familles de jetons restent disponibles, seule l'une est remplie.
    const estEntreprise = !!data.buyer.siret;

    // Les jetons « Champs documents » (field:organization.…) sont remplis depuis `ctx.fields`.
    // Sans eux, TOUS les champs de la palette « Organisme » sortaient VIDES sur une facture —
    // raison sociale, SIRET, NDA, IBAN… — alors qu'ils sont proposés à l'insertion. Un jeton
    // qu'on peut poser et qui ne se remplit jamais est pire que pas de jeton du tout.
    // On expose la fiche organisme telle quelle : la palette et le rendu voient la même chose.
    const fields = {};
    for (const [k, v] of Object.entries(org || {})) {
        if (v == null || typeof v === 'object') continue;
        fields[`organization.${k}`] = v;
    }

    // RÈGLEMENT. La ventilation JSON s'il y en a une (paiement mixte, chèque détaillé) ; sinon,
    // un seul moyen couvrant tout le TTC. Chaque part porte son montant, sa banque et son numéro
    // de chèque le cas échéant — de quoi les afficher ligne par ligne dans le modèle.
    let payments = [];
    if (data.paymentSplit) {
        try { payments = JSON.parse(data.paymentSplit); } catch { payments = []; }
    }
    if (!payments.length && data.paymentMethod) {
        payments = [{ method: data.paymentMethod, amount: v.grand }];
    }
    const reglement = payments.map((p) => p.method).filter(Boolean).join(' + ')
        || data.paymentMethod || '';
    const detailReglement = payments
        .map((p) => `${p.method} : ${eur(p.amount)}${p.cheque_number ? ` (chèque n° ${p.cheque_number}${p.bank ? `, ${p.bank}` : ''})` : ''}`)
        .join(' · ');

    return {
        org,
        fields,
        company: estEntreprise ? { name: data.buyer.name, siret: data.buyer.siret, address: a.line, zip_code: a.zip, town: a.city } : {},
        learner: estEntreprise ? {} : { first_name: data.buyer.name, address: a.line, zip_code: a.zip, town: a.city },
        formations: [],
        articles: data.lines || [],
        payments, // bloc {#Paiements}…{/Paiements}
        invoice: {
            number: data.number,
            typeLabel: data.typeLabel,
            dateFr: jour(data.issueDate),
            dueFr: jour(data.dueDate),
            buyerName: data.buyer.name,
            buyerAddress: adresse,
            buyerSiret: data.buyer.siret || '',
            totalHt: eur(v.base),
            totalTva: eur(v.taxe),
            totalTtc: eur(v.grand),
            detailTva: v.groupes.map((g) => `${g.taux.toFixed(2)} % sur ${eur(g.base)} : ${eur(g.taxe)}`).join(' · '),
            reglement,           // {Règlement} : les moyens, ex. « Espèces + CB »
            detailReglement,     // {Détail règlement} : moyens + montants, ex. « Espèces : 300 € · CB : 700 € »
            // Le jeton {Articles} en fait un tableau complet (cf. articlesTable).
            articles: data.lines || [],
        },
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
        avertirConformite(res, data);
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

module.exports = { getInvoices, createInvoice, updateInvoice, recordPayment, deleteInvoice, getInvoiceXml, getInvoiceFacturX, pickInvoiceTemplate };
