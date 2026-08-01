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
const { resolveEmitter, nextNumberForEmitter } = require('../lib/emitter.js');

/* Colonnes de `invoice` arrivées par migration. Écrire une colonne absente ferait échouer
 * l'INSERT ENTIER : on perdrait la facture pour un choix facultatif d'émettrice ou de modèle. */
async function colonneFacture(conn, colonne) { return colonneDe(conn, 'invoice', colonne); }
async function colonneLigneFacture(conn, colonne) { return colonneDe(conn, 'invoice_line', colonne); }

async function colonneDe(conn, table, colonne) {
    try {
        const [r] = await conn.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
            [table, colonne]);
        return r.length > 0;
    } catch { return false; }
}

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
        /* L'entreprise vient de la FICHE DU STAGIAIRE, pas de la demande : c'est l'école qui
         * décide à l'émission si l'employeur prend en charge, et elle a besoin de savoir lequel
         * c'est AU MOMENT où elle facture. `company_id` sur learner existe depuis toujours —
         * aucune migration en jeu. */
        const colsFacturation = 'l.company_id, c.name AS company_name,';
        // Remise stagiaire figée sur la ligne (125). Sondée : sans la migration, la requête
        // entière échouerait et l'écran des demandes se viderait.
        const avecRemise = await colonneDe(conn, 'shop_request_line', 'discount_pct');
        const colsRemise = avecRemise ? 'li.discount_pct, li.unit_price_gross_ht,' : '';
        const jointureEntreprise = 'LEFT JOIN company c ON c.id = l.company_id';
        let rows = [];
        try {
            [rows] = await conn.query(
                // pickup_at manquait : l'école voyait la demande sans jamais savoir QUAND le
                // stagiaire passe la chercher — l'info était pourtant saisie. Heure locale, même
                // raison que ci-dessus.
                `SELECT r.id, r.ref, r.status, r.note, r.admin_note, r.invoice_id, r.created_at, r.updated_at,
                        DATE_FORMAT(r.pickup_at, '%Y-%m-%dT%H:%i') AS pickup_at,
                        ${colsFacturation}
                        l.id AS learner_id, l.first_name, l.last_name, l.email, l.phone,
                        ${colsRemise}
                        li.source, li.label, li.qty, li.unit_price_ht, li.tax_rate, li.personalization, li.variant, li.sort_order
                 FROM shop_request r
                 JOIN learner l ON l.id = r.learner_id
                 ${jointureEntreprise}
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
                    // pickup_at était bien SÉLECTIONNÉ mais jamais recopié ici : l'école ne
                    // voyait donc jamais le créneau, pourtant saisi par le stagiaire.
                    pickup_at: r.pickup_at,
                    invoice_id: r.invoice_id, created_at: r.created_at, updated_at: r.updated_at,
                    // Entreprise du stagiaire : l'école choisit à l'émission de facturer celle-ci
                    // ou le stagiaire lui-même. `null` = pas d'employeur, la question ne se pose pas.
                    company_id: r.company_id, company_name: r.company_name,
                    learner: { id: r.learner_id, first_name: r.first_name, last_name: r.last_name,
                               email: r.email, phone: r.phone },
                    lines: [], total_ht: 0, total_ttc: 0, has_partner: false, tarif_a_definir: false,
                });
            }
            const d = byId.get(r.id);
            if (!r.label) continue;
            const price = r.unit_price_ht == null ? null : Number(r.unit_price_ht);
            d.lines.push({ source: r.source, label: r.label, qty: r.qty, unit_price_ht: price,
                tax_rate: Number(r.tax_rate), personalization: r.personalization, variant: r.variant,
                // Remise consentie au stagiaire, telle qu'elle a été FIGÉE à la commande : c'est
                // celle-là qui a engagé le prix, pas le réglage actuel de l'article.
                discount_pct: r.discount_pct == null ? null : Number(r.discount_pct),
                unit_price_gross_ht: r.unit_price_gross_ht == null ? null : Number(r.unit_price_gross_ht) });
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

        /* PLUS DE COUPLAGE STATUT DE DEMANDE -> STATUT DE FACTURE.
         *
         * « Payé » précède désormais « Facturé » : quand la demande passe à PAYE, aucune facture
         * n'existe encore, et le marquage n'avait donc rien à marquer. Pire dans l'autre sens :
         * revenir de « Remis » à « Facturé » repassait la facture de PAYÉE à ÉMISE, alors que
         * l'argent avait bien été encaissé — un simple retour en arrière dans le suivi faisait
         * réapparaître une créance réglée.
         *
         * La facture reçoit son statut UNE FOIS, à sa création (cf. invoiceShopRequest), à partir
         * du paiement réellement saisi. Le suivi de la commande ne le réécrit plus. */
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
            `SELECT r.id, r.ref, r.status, r.invoice_id,
                    l.first_name, l.last_name, l.company_id, c.name AS company_name
             FROM shop_request r
             JOIN learner l ON l.id = r.learner_id
             LEFT JOIN company c ON c.id = l.company_id
             WHERE r.id = ? AND r.organization_id = ? LIMIT 1`,
            [req.params.id, orgId]
        );
        if (!r) return res.status(404).json({ message: 'Demande introuvable.' });
        if (r.invoice_id) return res.status(409).json({ message: 'Cette demande a déjà une facture.' });

        // La remise stagiaire (125) est figée sur la ligne. Cascade : sans la migration, on
        // facture comme avant, au prix net, sans colonne « Remise ».
        let lines;
        for (const cols of [
            'label, qty, unit_price_ht, tax_rate, personalization, variant, discount_pct, unit_price_gross_ht',
            'label, qty, unit_price_ht, tax_rate, personalization, variant',
        ]) {
            try {
                [lines] = await conn.query(
                    `SELECT ${cols} FROM shop_request_line
                     WHERE request_id = ? AND source = 'ECOLE' AND unit_price_ht IS NOT NULL ORDER BY sort_order`,
                    [r.id]);
                break;
            } catch (e) { if (!isMissingSchema(e)) throw e; }
        }
        if (!lines.length) return res.status(422).json({ message: 'Aucune ligne facturable par l’école dans cette demande.' });

        // Le montant stocké est le HT, PAS le TTC. `amount_net` est la base hors taxe partout
        // ailleurs (invoice.controller la passe telle quelle à Factur-X comme BasisAmount) :
        // y écrire un TTC avec `tva_exoneree = 0` faisait appliquer 20 % PAR-DESSUS un montant
        // qui les contenait déjà — 144 € facturés pour 120 € dus, sur chaque commande.
        const totalHt = lines.reduce((s, l) => s + Number(l.unit_price_ht) * l.qty, 0);
        // Le taux d'en-tête n'a de sens que si toutes les lignes le partagent ; sinon chaque
        // ligne porte le sien et la ventilation se fait à l'édition (cf. ventilerTva).
        const taux = [...new Set(lines.map((l) => Number(l.tax_rate)))];
        const tauxEntete = taux.length === 1 ? taux[0] : null;
        /* ENTITÉ ÉMETTRICE choisie par l'organisme au moment de facturer (le corps de la requête
         * l'emporte sur celle figée à la commande). Avec une émettrice, le numéro vient de SA
         * séquence et de SON gabarit, comme à la caisse — sans elle on garde le compteur BQ
         * historique, sinon les numéros de la boutique vivraient hors des séquences officielles. */
        const emetteur = await resolveEmitter(conn, orgId, req.body?.billing_profile_id || null);
        let number;
        if (emetteur) {
            number = await nextNumberForEmitter(conn, emetteur);
        } else {
            const year = new Date().getFullYear();
            const [[last]] = await conn.query(
                "SELECT number FROM invoice WHERE organization_id = ? AND number LIKE ? ORDER BY number DESC LIMIT 1",
                [orgId, `BQ-${year}-%`]
            );
            const n = last ? Number(String(last.number).split('-').pop()) + 1 : 1;
            number = `BQ-${year}-${String(n).padStart(4, '0')}`;
        }

        // `tax_rate` peut manquer (migration 108 non jouée) : on retombe alors sur l'insertion
        // sans la colonne, et l'édition applique 20 % comme avant.
        /* ACHETEUR. Il suivait le stagiaire en dur ; il suit désormais le choix fait à la
         * commande (migration 124). Un stagiaire envoyé par son employeur commande avec l'argent
         * de l'entreprise : c'est elle qu'il faut facturer, avec son SIRET. Le corps de la
         * requête peut corriger ce choix — l'organisme confirme avant d'émettre. */
        const versEntreprise = req.body?.bill_to === 'ENTREPRISE' && !!r.company_id;
        const acheteur = versEntreprise
            ? (r.company_name || 'Entreprise')
            : `${r.first_name || ''} ${r.last_name || ''}`.trim();
        const libelle = `Boutique — demande ${r.ref}`;

        // Colonnes optionnelles selon les migrations jouées : émettrice (billing_profile_id),
        // modèle choisi (template_slug, 121), entreprise acheteuse (company_id).
        const slugChoisi = req.body?.template_slug || null;
        const ic = ['id', 'organization_id', 'buyer_name', 'description', 'type', 'number', 'amount_net', 'tva_exoneree', 'status'];
        const iv = [orgId, acheteur, libelle, 'FACTURE', number, totalHt.toFixed(2), 0, 'PAYEE'];
        const ajouter = async (col, val) => {
            if (val == null) return;
            if (await colonneFacture(conn, col)) { ic.push(col); iv.push(val); }
        };
        /* PAIEMENT ET ÉCHÉANCE. « Payé » précède « Facturé » : quand on arrive ici, l'argent est
         * encaissé. La facture naît donc PAYÉE et porte le moyen de règlement — sans quoi elle
         * sortait en BROUILLON, sans trace de la façon dont elle avait été réglée, et il fallait
         * la rouvrir pour la solder. Le moyen reste facultatif : on n'exige pas de ressaisir ce
         * qu'on sait déjà quand la commande est simple. */
        /* VENTILATION DU RÈGLEMENT : un stagiaire peut payer en plusieurs fois (30 € espèces +
         * le reste en carte). Même forme qu'à la caisse — on ne retient que les parts valides,
         * le résumé sert d'affichage et le détail chiffré part dans `payment_split`.
         * Le champ `payment_method` seul ne pouvait dire qu'UN moyen : régler moitié-moitié
         * obligeait à en choisir un et à taire l'autre. */
        const parts = (Array.isArray(req.body?.payments) ? req.body.payments : [])
            .map((p) => ({ method: String(p && p.method || '').trim().slice(0, 40), amount: Number(p && p.amount) }))
            .filter((p) => p.method && Number.isFinite(p.amount) && p.amount > 0);
        const moyen = parts.length
            ? parts.map((p) => p.method).join(' + ').slice(0, 30)
            : (String(req.body?.payment_method || '').trim().slice(0, 30) || null);
        const ventilation = parts.length ? JSON.stringify(parts) : null;
        const echeance = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.due_date || ''))
            ? req.body.due_date : null;

        await ajouter('tax_rate', tauxEntete);
        await ajouter('payment_method', moyen);
        await ajouter('payment_split', ventilation);
        await ajouter('due_date', echeance);
        await ajouter('billing_profile_id', emetteur ? emetteur.id : null);
        await ajouter('template_slug', slugChoisi);
        await ajouter('company_id', versEntreprise ? r.company_id : null);
        await conn.query(
            `INSERT INTO invoice (${ic.join(', ')}) VALUES (uuid(), ${ic.slice(1).map(() => '?').join(', ')})`,
            iv
        );
        const [[inv]] = await conn.query('SELECT id FROM invoice WHERE number = ? LIMIT 1', [number]);
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const ht = Number(l.unit_price_ht) * l.qty;
            const desc = `${l.label}${l.variant ? ` (${l.variant})` : ''} × ${l.qty}${l.personalization ? ` — ${l.personalization}` : ''}`;
            /* Remise stagiaire reportée sur la ligne de facture (colonnes de la 122) : c'est elle
             * qui fait apparaître « -15 % » sur le document au lieu d'un prix nu inexpliqué.
             * Sondée sur `invoice_line` et NON sur `invoice` — deux tables différentes, et une
             * sonde sur la mauvaise aurait toujours répondu non, donc jamais écrit la remise. */
            const lc = ['id', 'invoice_id', 'description', 'amount_net', 'tax_rate', 'qty', 'unit_price_ht', 'sort_order'];
            const lv = [inv.id, desc, ht.toFixed(2), Number(l.tax_rate), l.qty, Number(l.unit_price_ht), i];
            if (l.discount_pct != null && await colonneLigneFacture(conn, 'discount_pct')) {
                lc.splice(7, 0, 'discount_pct', 'unit_price_gross_ht');
                lv.splice(6, 0, Number(l.discount_pct), Number(l.unit_price_gross_ht));
            }
            try {
                await conn.query(
                    `INSERT INTO invoice_line (${lc.join(', ')}) VALUES (uuid(), ${lc.slice(1).map(() => '?').join(', ')})`,
                    lv
                );
            } catch (e) {
                if (!isMissingSchema(e)) throw e;
                await conn.query(
                    'INSERT INTO invoice_line (id, invoice_id, description, amount_net, sort_order) VALUES (uuid(), ?, ?, ?, ?)',
                    [inv.id, desc, ht.toFixed(2), i]
                );
            }
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
 * DELETE /api/boutique/demandes — PURGE : supprime TOUTES les demandes de l'organisme,
 * quel que soit leur statut (facturées incluses ; la facture liée subsiste, invoice_id
 * étant seulement détaché). Action destructive réservée à l'admin.
 */
const deleteAllShopRequests = async (req, res) => {
    try {
        const conn = db.promise();
        const [r] = await conn.query('DELETE FROM shop_request WHERE organization_id = ?', [req.user.organization_id]);
        res.json({ success: true, deleted: r.affectedRows || 0 });
    } catch (err) {
        if (isMissingSchema(err)) return res.json({ success: true, deleted: 0 });
        console.error('Erreur purge demandes :', err);
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

module.exports = { listShopRequests, updateShopRequest, invoiceShopRequest, deleteShopRequest, deleteAllShopRequests, listPickups };
