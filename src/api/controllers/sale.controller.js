const crypto = require('crypto');
const db = require('../config/database.js');
const { loadOrgSteps } = require('./template.controller.js');
const { belongsToOrg } = require('../lib/tenancy.js');
const { logAudit } = require('../lib/audit.js');
const { resolveEmitter, nextNumberForEmitter } = require('../lib/emitter.js');

// La table material_sale porte-t-elle le lien vers la facture (migration 069) ?
// Permet un fonctionnement dégradé tant que la migration n'est pas appliquée.
async function saleHasInvoiceLink(conn) {
    try {
        const [c] = await conn.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'material_sale' AND column_name = 'invoice_id' LIMIT 1`);
        return c.length > 0;
    } catch { return false; }
}

/** Une colonne existe-t-elle ? Permet le fonctionnement dégradé tant qu'une migration n'est
 *  pas appliquée — on n'insère `company_id` (112) que si la colonne est là. */
async function hasColumn(conn, table, column) {
    try {
        const [c] = await conn.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`, [table, column]);
        return c.length > 0;
    } catch { return false; }
}

/**
 * GET /api/ventes — ventes de matériel + total. Renvoie le lien facture
 * (invoice_id / invoice_number) quand la migration 069 est appliquée.
 */
const getSales = async (req, res) => {
    try {
        const conn = db.promise();
        const hasInv = await saleHasInvoiceLink(conn);
        const hasCompany = await hasColumn(conn, 'material_sale', 'company_id');
        const invCols = hasInv ? 's.invoice_id, s.invoice_number,' : '';
        // L'entreprise acheteuse, quand la colonne existe : l'historique doit nommer QUI a payé,
        // pas seulement le stagiaire rattaché. Jointure et colonne omises tant que la 112 n'est
        // pas jouée, pour que la requête reste valide.
        const compCol = hasCompany ? 'co.name AS company_name,' : '';
        const compJoin = hasCompany ? 'LEFT JOIN company co ON co.id = s.company_id' : '';
        const [results] = await conn.query(
            `SELECT s.id, DATE_FORMAT(s.date, '%Y-%m-%d') AS date, s.product, s.category,
                    s.quantity, s.amount, s.note, s.learner_id, ${invCols} ${compCol}
                    l.first_name, l.last_name
             FROM material_sale s
             LEFT JOIN learner l ON l.id = s.learner_id
             ${compJoin}
             WHERE s.organization_id = ?
             ORDER BY s.date DESC, s.created_at DESC`,
            [req.user.organization_id]
        );
        const total = results.reduce((sum, r) => sum + Number(r.amount) * (r.quantity || 1), 0);
        res.json({ data: results, total });
    } catch (err) {
        console.error('Erreur récupération ventes :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/ventes — enregistre une vente.
 */
const createSale = async (req, res) => {
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
    // `learner_id` vient du corps : sans ce contrôle, la vente pointe vers un stagiaire d'un
    // autre organisme, dont le nom s'afficherait ensuite dans notre liste de ventes (getSales
    // joint `learner` sans filtre pour récupérer le nom).
    const conn = db.promise();
    if (!await belongsToOrg(conn, 'learner', learner_id, req.user.organization_id)) {
        return res.status(422).json({ error: 'Stagiaire inconnu.' });
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
    payment_methods: 'Espèces,CB,Virement,Chèque', tva_applies: 1,
    invoice_template_slug: null,
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
        // Le modèle désigné doit être de type FACTURE. Refuser ici évite de découvrir l'erreur
        // au moment d'éditer une facture pour un client — c'est-à-dire trop tard.
        if (b.invoice_template_slug) {
            const steps = await loadOrgSteps(req.user.organization_id);
            const step = steps.find((x) => x.slug === b.invoice_template_slug);
            if (!step) return res.status(422).json({ error: 'Modèle introuvable.' });
            if (String(step.doc_type || '').toUpperCase() !== 'FACTURE') {
                return res.status(422).json({
                    error: `« ${step.label || step.slug} » est de type ${step.doc_type || '(aucun)'}. `
                        + 'Seul un modèle de type FACTURE peut servir de facture.',
                });
            }
        }

        const communs = [
            String(b.invoice_prefix || 'F').slice(0, 20),
            Math.max(1, parseInt(b.next_number, 10) || 1),
            String(b.payment_methods || DEFAULT_SETTINGS.payment_methods).slice(0, 255),
            b.tva_applies ? 1 : 0,
        ];
        // `invoice_template_slug` peut manquer (migration 109 non jouée) : on réenregistre alors
        // sans lui plutôt que de refuser tout l'écran pour une colonne.
        try {
            await conn.query(
                `UPDATE shop_settings SET invoice_prefix = ?, next_number = ?, payment_methods = ?,
                        tva_applies = ?, invoice_template_slug = ? WHERE organization_id = ?`,
                [...communs, b.invoice_template_slug || null, req.user.organization_id]
            );
            return res.json({ success: true, message: 'Paramètres enregistrés.' });
        } catch (e) {
            if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
        }
        await conn.query(
            // `legal_mentions` n'est plus ecrit : les mentions de bas de facture vivent dans le
            // PIED du modele de type FACTURE (document_template.footer_html), avec le reste de
            // la mise en page. Le champ etait de toute facon devenu inerte — la mise en page
            // interne, seule a le lire, a ete retiree. Un reglage qu'on remplit sans effet est
            // pire qu'un reglage absent : il fait croire que quelque chose a ete configure.
            // La colonne reste en base, elle ne gene pas et personne ne l'ecrit plus.
            `UPDATE shop_settings SET invoice_prefix = ?, next_number = ?, payment_methods = ?,
                    tva_applies = ? WHERE organization_id = ?`,
            [...communs, req.user.organization_id]
        );
        res.json({ success: true, message: 'Paramètres enregistrés.' });
    } catch (err) {
        console.error('Erreur enregistrement paramètres boutique :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const checkout = async (req, res) => {
    // L'ACHETEUR EST DE TROIS SORTES, exclusives : une entreprise, un stagiaire, ou un nom libre
    // (vente comptoir). Quand c'est l'entreprise qui paie, `learner_id` reste possible mais ne
    // désigne plus l'acheteur — seulement le stagiaire concerné par le matériel, pour retrouver
    // la vente par lui aussi. C'est l'entreprise qui est facturée.
    const { learner_id, company_id, buyer_name, lines } = req.body;
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
        // ÉMETTRICE résolue tôt : c'est elle qui dit l'assujettissement à la TVA (une société
        // peut être exonérée quand une autre ne l'est pas). Sans émettrice, on garde le réglage
        // global de la boutique.
        const emetteur = await resolveEmitter(conn, orgId, req.body.billing_profile_id);
        const tvaApplies = emetteur ? !!emetteur.tva_applies : !!settings.tva_applies;
        const payMethod = (req.body.payment_method || '').toString().slice(0, 30) || null;

        // Stagiaire comme entreprise sont ÉCRITS sur la facture, plus seulement lus pour en
        // tirer un nom : il faut vérifier qu'ils appartiennent à l'organisme. Un identifiant
        // venu d'un autre organisme créerait une ligne qui pointe ailleurs — la famille de
        // défauts « clé étrangère non vérifiée » relevée à la revue du back-office.
        if (learner_id && !(await belongsToOrg(conn, 'learner', learner_id, orgId))) {
            return res.status(422).json({ message: 'Stagiaire inconnu' });
        }
        if (company_id && !(await belongsToOrg(conn, 'company', company_id, orgId))) {
            return res.status(422).json({ message: 'Entreprise inconnue' });
        }

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

        // Facture liée : identifiant + numéro générés AVANT les lignes, pour que chaque
        // vente (material_sale) référence sa facture → regroupement de l'historique.
        const hasInvLink = await saleHasInvoiceLink(conn);
        const hasSaleCompany = await hasColumn(conn, 'material_sale', 'company_id');
        const hasInvEmitter = await hasColumn(conn, 'invoice', 'billing_profile_id');
        const invoiceId = crypto.randomUUID();
        const year = new Date().getFullYear();

        // Numéro : avec une émettrice, il vient de SA séquence continue et de SON gabarit ; sans
        // elle, on garde le compteur de la boutique (shop_settings), comportement d'avant.
        let number;
        if (emetteur) {
            number = await nextNumberForEmitter(conn, emetteur);
        } else {
            const num = settings.next_number || 1;
            number = `${settings.invoice_prefix || 'F'}-${year}-${String(num).padStart(4, '0')}`;
            await conn.query('UPDATE shop_settings SET next_number = ? WHERE organization_id = ?', [num + 1, orgId]);
        }

        // Applique : décrément stock + vente par ligne (remise ligne puis globale).
        // On construit aussi les lignes de facture (invoice_line) → facture détaillée + PDF.
        let totalHT = 0;
        const productNames = [];
        const invLines = [];
        for (const ln of lines) {
            const it = ln._it;
            // Le prix unitaire est arrondi UNE FOIS, puis multiplié — et c'est ce même
            // arrondi qui part en comptabilité (material_sale.amount) et en facture
            // (invoice_line.amount_net).
            //
            // Auparavant la facture arrondissait APRÈS la multiplication et la comptabilité
            // AVANT : 9,99 € remisé 10 % sur 9 articles donnait 80,92 € d'un côté et 80,91 €
            // de l'autre. Un centime, mais systématique et toujours dans le même sens dès
            // qu'une remise crée une troisième décimale — un rapprochement bancaire qui ne
            // tombe jamais juste.
            //
            // Arrondir le prix UNITAIRE d'abord est aussi ce que le client peut vérifier : le
            // ticket affiche un prix unitaire, il doit pouvoir le multiplier lui-même.
            const unitNet = Number((Number(it.unit_price || 0) * (1 - ln._disc / 100) * factor).toFixed(2));
            const rate = tvaApplies ? Number(it.tax_rate || 0) : 0;
            const lineHT = Number((unitNet * ln._qty).toFixed(2));
            const note = payMethod ? `Paiement : ${payMethod}` : null;
            await conn.query('UPDATE inventory_item SET quantity = quantity - ? WHERE id = ?', [ln._qty, ln.item_id]);

            // Colonnes construites selon les migrations présentes, plutôt qu'en quatre variantes
            // de requête pour deux drapeaux : chaque combinaison oubliée serait un chemin non
            // testé. On ajoute chaque colonne optionnelle quand elle existe, une seule fois.
            const col = ['id', 'organization_id', 'date', 'product', 'category', 'quantity', 'amount', 'learner_id', 'note'];
            const val = [crypto.randomUUID(), orgId, null /*date via CURDATE*/, it.name, it.category, ln._qty, unitNet.toFixed(2), learner_id || null, note];
            if (hasSaleCompany) { col.push('company_id'); val.push(company_id || null); }
            if (hasInvLink) { col.push('invoice_id', 'invoice_number'); val.push(invoiceId, number); }
            const ph = col.map((c) => (c === 'date' ? 'CURDATE()' : '?'));
            const args = val.filter((_, i) => col[i] !== 'date');
            await conn.query(
                `INSERT INTO material_sale (${col.join(', ')}) VALUES (${ph.join(', ')})`, args);
            totalHT += lineHT;
            const label = `${it.name}${ln._qty > 1 ? ` × ${ln._qty}` : ''}${ln._disc ? ` (remise ${ln._disc}%)` : ''}`;
            invLines.push({ description: label.slice(0, 255), amount_net: lineHT, rate, qty: ln._qty, unit: unitNet });
            productNames.push(`${it.name} x${ln._qty}`);
        }
        const totalTVA = invLines.reduce((s, l) => s + l.amount_net * l.rate / 100, 0);
        totalHT = Number(totalHT.toFixed(2));

        // Nom imprimé sur la facture. Priorité : nom libre saisi > entreprise > stagiaire >
        // comptoir. L'entreprise passe AVANT le stagiaire parce que, quand les deux sont là,
        // c'est l'entreprise qui achète ; le stagiaire n'est qu'un rattachement.
        let name = buyer_name || null;
        if (!name && company_id) {
            const [c] = await conn.query('SELECT name FROM company WHERE id = ? AND organization_id = ?', [company_id, orgId]);
            if (c[0]) name = c[0].name;
        }
        if (!name && learner_id) {
            const [l] = await conn.query('SELECT first_name, last_name FROM learner WHERE id = ? AND organization_id = ?', [learner_id, orgId]);
            if (l[0]) name = `${l[0].first_name || ''} ${l[0].last_name || ''}`.trim();
        }
        if (!name) name = 'Vente comptoir';

        const remise = globalDisc > 0 ? ` (remise ${globalDisc}%)` : '';
        const description = ('Vente de matériel : ' + productNames.join(', ') + remise).slice(0, 255);
        // ON GARDE LES RÉFÉRENCES, pas seulement le nom. L'e-mail (BT-49, obligatoire), le SIRET
        // et l'adresse vivent sur la fiche entreprise ou stagiaire ; sans le lien ils restent
        // inatteignables depuis la facture. Le nom reste écrit à côté — c'est lui qui a été
        // imprimé, et renommer une fiche ne doit pas récrire une pièce déjà émise.
        //
        // `invoice.company_id` est une colonne de base : toujours écrite. `learner_id` (111) et
        // `billing_profile_id` (113) sont optionnelles — on les ajoute quand la colonne existe,
        // sinon la vente sort comme avant plutôt que d'échouer. Colonnes construites plutôt que
        // quatre variantes de requête : chaque combinaison oubliée serait un chemin non testé.
        const hasInvLearner = await hasColumn(conn, 'invoice', 'learner_id');
        const iCol = ['id', 'organization_id', 'company_id', 'buyer_name', 'description', 'type',
            'number', 'amount_net', 'tva_exoneree', 'payment_method', 'status'];
        const iVal = [invoiceId, orgId, company_id || null, name, description, 'FACTURE',
            number, totalHT.toFixed(2), tvaApplies ? 0 : 1, payMethod, status];
        if (hasInvLearner) { iCol.push('learner_id'); iVal.push(learner_id || null); }
        if (hasInvEmitter) { iCol.push('billing_profile_id'); iVal.push(emetteur ? emetteur.id : null); }
        await conn.query(
            `INSERT INTO invoice (${iCol.join(', ')}) VALUES (${iCol.map(() => '?').join(', ')})`, iVal);
        // Lignes détaillées (une par article) → facture itemisée + PDF Factur-X.
        for (let i = 0; i < invLines.length; i++) {
            // Le taux réel de l'article accompagne la ligne : sans lui, Factur-X retombait sur
            // 20 % en dur et facturait une farine à 5,5 % comme une pelle à 20 %.
            try {
                await conn.query(
                    `INSERT INTO invoice_line (id, invoice_id, enrollment_id, description, amount_net, tax_rate, qty, unit_price_ht, sort_order)
                     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
                    [crypto.randomUUID(), invoiceId, invLines[i].description, invLines[i].amount_net,
                     invLines[i].rate, invLines[i].qty, invLines[i].unit, i]
                );
            } catch (e) {
                if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
                await conn.query(
                    'INSERT INTO invoice_line (id, invoice_id, enrollment_id, description, amount_net, sort_order) VALUES (?, ?, NULL, ?, ?, ?)',
                    [crypto.randomUUID(), invoiceId, invLines[i].description, invLines[i].amount_net, i]
                );
            }
        }
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
