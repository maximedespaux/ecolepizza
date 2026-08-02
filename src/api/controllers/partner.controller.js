const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

const isMissingSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

const PARTNER_FIELDS = [
    'name', 'category', 'contact_name', 'contact_email', 'contact_phone',
    'website', 'town', 'discount_pct', 'offer', 'notes',
];

/**
 * GET /api/partenaires — annuaire + suivi (contacts, offre, commissions cumulées).
 * Filtre ?category=
 */
const getPartners = async (req, res) => {
    try {
        const conn = db.promise();
        const params = [req.user.organization_id];
        /* LE NOMBRE DE PRODUITS EST DANS LA LISTE, et pas seulement dans le détail.
           La section « Produits en boutique » de chaque fiche ne chargeait son catalogue qu'à
           l'ouverture — ce qui est le bon choix, vingt-trois partenaires ne doivent pas déclencher
           vingt-trois requêtes. Mais le COMPTE affiché à côté du titre venait de ce même
           chargement : il restait donc invisible tant qu'on n'avait pas déplié, et il fallait
           ouvrir les vingt-trois sections une par une pour savoir lesquelles ont un catalogue.
           Une sous-requête sur une requête qui tourne déjà coûte infiniment moins que ça. */
        const colonnes = (avecProduits) => `
            SELECT p.id, p.name, p.category, p.contact_name, p.contact_email, p.contact_phone,
                   p.website, p.town, p.discount_pct, p.offer, p.notes, p.created_at,
                   COALESCE(SUM(re.amount), 0) AS commissions_total,
                   COUNT(re.id) AS commissions_count,
                   DATE_FORMAT(MAX(re.date), '%Y-%m-%d') AS last_commission${avecProduits ? `,
                   (SELECT COUNT(*) FROM partner_product pp WHERE pp.partner_id = p.id) AS products` : ''}
              FROM partner p
              LEFT JOIN revenue_extra re ON re.partner_id = p.id
             WHERE p.organization_id = ?`;
        const filtre = req.query.category ? ' AND p.category = ?' : '';
        if (req.query.category) params.push(req.query.category);
        const fin = ' GROUP BY p.id ORDER BY p.name';
        let results;
        try {
            [results] = await conn.query(colonnes(true) + filtre + fin, params);
        } catch (e) {
            // `partner_product` arrive avec la migration 095 : sans elle, on rend la liste sans
            // le compte plutôt que de casser toute la page pour une colonne d'appoint.
            if (!isMissingSchema(e)) throw e;
            [results] = await conn.query(colonnes(false) + filtre + fin, params);
        }

        /* Détail des commissions par partenaire (libellé, date, montant, NATURE).
         *
         * `category` manquait. Un produit divers peut être une COMMISSION, une SUBVENTION ou un
         * AUTRE produit (cf. REVENU_CATEGORIES) ; sans la colonne, la page les affichait TOUS
         * comme des commissions. Anodin tant qu'on ne faisait que lire — mais dès qu'on peut
         * modifier une ligne, le formulaire se serait ouvert sur « Commission » pour une
         * subvention, et l'aurait convertie en la réenregistrant. */
        const [lines] = await conn.query(
            `SELECT re.id, re.partner_id, re.label, re.amount, re.category, DATE_FORMAT(re.date, '%Y-%m-%d') AS date
             FROM revenue_extra re JOIN partner p ON p.id = re.partner_id
             WHERE p.organization_id = ? ORDER BY re.date DESC, re.created_at DESC`,
            [req.user.organization_id]
        );
        const byPartner = {};
        for (const l of lines) (byPartner[l.partner_id] = byPartner[l.partner_id] || []).push(l);
        for (const p of results) p.commissions = byPartner[p.id] || [];

        // Contributions en nature (matériel/équipement) — table optionnelle (migration 065).
        // Si la table n'existe pas encore, on renvoie des contributions vides (pas d'erreur).
        try {
            const [contribs] = await conn.query(
                `SELECT c.id, c.partner_id, c.type, c.label, c.value, DATE_FORMAT(c.date, '%Y-%m-%d') AS date
                 FROM partner_contribution c JOIN partner p ON p.id = c.partner_id
                 WHERE p.organization_id = ? ORDER BY c.date DESC, c.created_at DESC`,
                [req.user.organization_id]
            );
            const cByPartner = {};
            for (const c of contribs) (cByPartner[c.partner_id] = cByPartner[c.partner_id] || []).push(c);
            for (const p of results) p.contributions = cByPartner[p.id] || [];
        } catch {
            for (const p of results) p.contributions = [];
        }

        res.json({ data: results });
    } catch (err) {
        console.error('Erreur récupération partenaires :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/partenaires */
const createPartner = (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(422).json({ error: 'Nom du partenaire requis' });
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO partner (id, organization_id, name, category, contact_name, contact_email,
                              contact_phone, website, town, discount_pct, offer, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.organization_id, b.name, b.category || 'AUTRE', b.contact_name || null,
         b.contact_email || null, b.contact_phone || null, b.website || null, b.town || null,
         b.discount_pct === '' || b.discount_pct == null ? null : Number(b.discount_pct),
         b.offer || null, b.notes || null],
        (err) => {
            if (err) {
                console.error('Erreur création partenaire :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logAudit(req, 'partner.create', 'Partner', id);
            res.status(201).json({ message: 'Partenaire créé', id });
        }
    );
};

/** PATCH /api/partenaires/:id */
const updatePartner = (req, res) => {
    const sets = [];
    const values = [];
    for (const f of PARTNER_FIELDS) {
        if (req.body[f] === undefined) continue;
        let v = req.body[f];
        if (f === 'discount_pct') v = v === '' || v == null ? null : Number(v);
        else if (v === '') v = null;
        sets.push(`${f} = ?`);
        values.push(v);
    }
    if (sets.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    values.push(req.params.id, req.user.organization_id);
    db.query(
        `UPDATE partner SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
        values,
        (err, result) => {
            if (err) {
                console.error('Erreur mise à jour partenaire :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Partenaire introuvable' });
            logAudit(req, 'partner.update', 'Partner', req.params.id);
            res.json({ success: true, message: 'Partenaire mis à jour' });
        }
    );
};

/** DELETE /api/partenaires/:id */
const deletePartner = (req, res) => {
    db.query(
        'DELETE FROM partner WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression partenaire :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            logAudit(req, 'partner.delete', 'Partner', req.params.id);
            res.json({ success: true, message: 'Partenaire supprimé' });
        }
    );
};

/** POST /api/partenaires/contributions — apport EN NATURE (matériel/équipement). */
const createContribution = (req, res) => {
    const b = req.body || {};
    if (!b.partner_id) return res.status(422).json({ error: 'Partenaire requis' });
    if (!b.label) return res.status(422).json({ error: 'Libellé requis' });
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO partner_contribution (id, organization_id, partner_id, date, type, label, value, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.organization_id, b.partner_id, b.date || new Date().toISOString().slice(0, 10),
         b.type || 'MATERIEL', b.label, b.value === '' || b.value == null ? 0 : Number(b.value), b.note || null],
        (err) => {
            if (err) {
                console.error('Erreur création contribution :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logAudit(req, 'partner.contribution.create', 'PartnerContribution', id);
            res.status(201).json({ message: 'Contribution enregistrée', id });
        }
    );
};

/** DELETE /api/partenaires/contributions/:id */
const deleteContribution = (req, res) => {
    db.query(
        'DELETE FROM partner_contribution WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression contribution :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            logAudit(req, 'partner.contribution.delete', 'PartnerContribution', req.params.id);
            res.json({ success: true, message: 'Contribution supprimée' });
        }
    );
};


/* ---------------------------------------------------------------------------------------------
 * PRODUITS D'UN PARTENAIRE
 *
 * La table `partner_product` existait, l'espace stagiaire l'AFFICHAIT déjà (onglet « Offres
 * partenaires »)… et RIEN ne l'écrivait : aucune route, aucun écran. Les produits ne pouvaient
 * donc apparaître dans la boutique que si on les insérait à la main en SQL. C'est ce chaînon
 * manquant que voici.
 *
 * Sur une ligne partenaire, l'école NE VEND PAS : elle met en relation. D'où deux prix distincts
 * — `price_public` (le tarif catalogue du partenaire) et `price_school` (le tarif négocié pour
 * les stagiaires) — et aucun stock : ce n'est pas l'inventaire de l'école.
 * ------------------------------------------------------------------------------------------- */

const PRODUCT_FIELDS = ['name', 'category', 'reference', 'price_public', 'price_school',
    'url', 'image_url', 'note', 'active', 'sort_order'];

/** Normalise une valeur de produit : bornes numériques, longueurs, drapeaux. */
function cleanProduct(champ, brut) {
    if (brut === '' || brut === null || brut === undefined) return null;
    if (champ === 'active') return brut ? 1 : 0;
    if (champ === 'sort_order') return Math.max(0, parseInt(brut, 10) || 0);
    if (champ === 'price_public' || champ === 'price_school') {
        const n = Number(brut);
        // Un prix négatif ou délirant vient d'une faute de frappe, pas d'une intention.
        return Number.isFinite(n) && n >= 0 && n <= 1e6 ? Number(n.toFixed(2)) : null;
    }
    const max = { name: 255, category: 120, reference: 80, url: 500, image_url: 500, note: 500 }[champ] || 255;
    return String(brut).trim().slice(0, max) || null;
}

/** GET /api/partners/:id/produits — les produits d'un partenaire (actifs ET inactifs). */
const getPartnerProducts = async (req, res) => {
    try {
        const conn = db.promise();
        const [[p]] = await conn.query(
            'SELECT id FROM partner WHERE id = ? AND organization_id = ? LIMIT 1',
            [req.params.id, req.user.organization_id]);
        if (!p) return res.status(404).json({ message: 'Partenaire introuvable.' });
        const [rows] = await conn.query(
            `SELECT id, name, category, reference, price_public, price_school, url, image_url,
                    note, active, sort_order
             FROM partner_product WHERE partner_id = ? AND organization_id = ?
             ORDER BY sort_order, name`,
            [req.params.id, req.user.organization_id]);
        res.json({ data: rows });
    } catch (err) {
        console.error('Erreur produits partenaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/partners/:id/produits — ajoute un produit au catalogue du partenaire. */
const createPartnerProduct = async (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(422).json({ message: 'Nom du produit requis.' });
    try {
        const conn = db.promise();
        // Le partenaire doit appartenir à l'organisme : un identifiant venu d'ailleurs créerait
        // un produit rattaché à un partenaire qu'on ne voit pas.
        const [[p]] = await conn.query(
            'SELECT id FROM partner WHERE id = ? AND organization_id = ? LIMIT 1',
            [req.params.id, req.user.organization_id]);
        if (!p) return res.status(404).json({ message: 'Partenaire introuvable.' });

        const cols = ['id', 'organization_id', 'partner_id'];
        const vals = [crypto.randomUUID(), req.user.organization_id, req.params.id];
        for (const f of PRODUCT_FIELDS) {
            if (b[f] === undefined) continue;
            cols.push(f); vals.push(cleanProduct(f, b[f]));
        }
        await conn.query(
            `INSERT INTO partner_product (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
        logAudit(req, 'partner.product.create', 'PartnerProduct', req.params.id);
        res.status(201).json({ message: 'Produit ajouté' });
    } catch (err) {
        console.error('Erreur création produit partenaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PATCH /api/partners/produits/:pid — modifie un produit. */
const updatePartnerProduct = async (req, res) => {
    const b = req.body || {};
    const sets = [], vals = [];
    for (const f of PRODUCT_FIELDS) {
        if (b[f] === undefined) continue;
        sets.push(`${f} = ?`); vals.push(cleanProduct(f, b[f]));
    }
    if (!sets.length) return res.status(422).json({ message: 'Rien à modifier.' });
    try {
        vals.push(req.params.pid, req.user.organization_id);
        const [r] = await db.promise().query(
            `UPDATE partner_product SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`, vals);
        if (!r.affectedRows) return res.status(404).json({ message: 'Produit introuvable.' });
        logAudit(req, 'partner.product.update', 'PartnerProduct', req.params.pid);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur maj produit partenaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/partners/produits/:pid — retire un produit du catalogue. */
const deletePartnerProduct = async (req, res) => {
    try {
        const [r] = await db.promise().query(
            'DELETE FROM partner_product WHERE id = ? AND organization_id = ?',
            [req.params.pid, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Produit introuvable.' });
        logAudit(req, 'partner.product.delete', 'PartnerProduct', req.params.pid);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression produit partenaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


/* ---- Catégories de partenaires (migration 129) ---------------------------------------------
 *
 * Elles étaient écrites EN DUR dans l'écran : huit valeurs choisies une fois, que l'école ne
 * pouvait ni renommer, ni compléter, ni ranger. Un partenaire « Boissons » ou « Assurance »
 * n'avait d'autre place que « AUTRE », et le filtre devenait inutile à mesure que ce fourre-tout
 * grossissait.
 *
 * LE CODE RESTE LA CLÉ. `partner.category` stocke toujours « FARINE » ; la table n'y attache
 * qu'un intitulé, une couleur et un ordre. Renommer « Matériel » en « Équipement » ne touche donc
 * AUCUNE ligne de partenaire — et c'est pour ça que le code n'est jamais modifiable après coup :
 * le changer orphelinerait tous les partenaires qui le portent.
 */

/* Le repli quand la migration 129 n'est pas jouée : la liste d'origine, telle qu'elle était
   écrite dans l'écran. Le code marche donc AVANT comme APRÈS, et l'écran ne se vide jamais. */
const CATEGORIES_SOCLE = [
    { code: 'FARINE', label: 'Farine', sort_order: 1 },
    { code: 'MATERIEL', label: 'Matériel', sort_order: 2 },
    { code: 'FOUR', label: 'Four', sort_order: 3 },
    { code: 'CHARCUTERIE', label: 'Charcuterie', sort_order: 4 },
    { code: 'FROMAGE', label: 'Fromage', sort_order: 5 },
    { code: 'CONSERVE', label: 'Conserve', sort_order: 6 },
    { code: 'DISTRIBUTION', label: 'Distribution', sort_order: 7 },
    { code: 'AUTRE', label: 'Autre', sort_order: 99 },
];

/* « AUTRE » est le repli du serveur à la création d'un partenaire (`b.category || 'AUTRE'`) :
   la supprimer laisserait des partenaires rangés sous un code que plus rien ne nomme. */
const CATEGORIE_SOCLE = 'AUTRE';

/** Un code de catégorie : majuscules, sans accent ni espace — il voyage en paramètre d'URL. */
const versCode = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 60);

/** GET /api/partenaires/categories — la liste de l'organisme, ou le socle si 129 n'est pas jouée. */
const getPartnerCategories = async (req, res) => {
    try {
        const conn = db.promise();
        let rows;
        try {
            [rows] = await conn.query(
                `SELECT id, code, label, color, sort_order,
                        (SELECT COUNT(*) FROM partner p
                          WHERE p.organization_id = c.organization_id AND p.category = c.code) AS partners
                   FROM partner_category c
                  WHERE c.organization_id = ?
                  ORDER BY c.sort_order, c.label`,
                [req.user.organization_id]);
        } catch (e) {
            if (!isMissingSchema(e)) throw e;
            // Migration 129 non jouée : on rend le socle, sans identifiant — donc non modifiable
            // côté écran, ce qui est exactement l'état d'avant.
            return res.json({ data: CATEGORIES_SOCLE.map((c) => ({ ...c, id: null, color: null, partners: 0 })) });
        }
        res.json({ data: rows });
    } catch (err) {
        console.error('Erreur catégories partenaires :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/partenaires/categories — en créer une. */
const createPartnerCategory = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const label = String(req.body?.label || '').trim();
        if (!label) return res.status(422).json({ message: 'Intitulé requis.' });
        const code = versCode(req.body?.code || label);
        if (!code) return res.status(422).json({ message: "L'intitulé ne donne aucun code utilisable." });

        const [[dup]] = await conn.query(
            'SELECT 1 AS x FROM partner_category WHERE organization_id = ? AND code = ? LIMIT 1', [orgId, code]);
        if (dup) return res.status(409).json({ message: `La catégorie « ${code} » existe déjà.` });

        const [[mx]] = await conn.query(
            'SELECT COALESCE(MAX(sort_order), 0) AS n FROM partner_category WHERE organization_id = ?', [orgId]);
        const id = crypto.randomUUID();
        await conn.query(
            'INSERT INTO partner_category (id, organization_id, code, label, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
            [id, orgId, code, label.slice(0, 120),
             req.body?.color ? String(req.body.color).slice(0, 20) : null, Number(mx.n) + 1]);
        await logAudit(req, { action: 'CREATE', entity: 'partner_category', entityId: id, after: { code, label } });
        res.status(201).json({ data: { id, code, label } });
    } catch (err) {
        if (isMissingSchema(err)) return res.status(409).json({ message: 'Migration 129 non jouée : catégories non modifiables.' });
        console.error('Erreur création catégorie partenaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/partenaires/categories/:cid — intitulé, couleur, ordre.
 *
 * LE CODE N'EST PAS MODIFIABLE, et c'est le point important : il est stocké tel quel sur chaque
 * partenaire. Le changer ici les orphelinerait tous en silence — ils garderaient l'ancien code,
 * plus aucune catégorie ne le porterait, et ils disparaîtraient du filtre.
 */
const updatePartnerCategory = async (req, res) => {
    try {
        const conn = db.promise();
        const [[cat]] = await conn.query(
            'SELECT id, code, label FROM partner_category WHERE id = ? AND organization_id = ?',
            [req.params.cid, req.user.organization_id]);
        if (!cat) return res.status(404).json({ message: 'Catégorie introuvable.' });

        const sets = [], vals = [];
        if (req.body?.label !== undefined) {
            const label = String(req.body.label).trim();
            if (!label) return res.status(422).json({ message: 'Intitulé requis.' });
            sets.push('label = ?'); vals.push(label.slice(0, 120));
        }
        if (req.body?.color !== undefined) {
            sets.push('color = ?'); vals.push(req.body.color ? String(req.body.color).slice(0, 20) : null);
        }
        if (req.body?.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(Number(req.body.sort_order) || 0); }
        if (!sets.length) return res.status(422).json({ message: 'Rien à modifier.' });

        vals.push(cat.id, req.user.organization_id);
        await conn.query(`UPDATE partner_category SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`, vals);
        await logAudit(req, { action: 'UPDATE', entity: 'partner_category', entityId: cat.id,
            before: { label: cat.label }, after: { label: req.body?.label } });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur modification catégorie partenaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/partenaires/categories/:cid
 *
 * REFUSÉE TANT QU'ELLE SERT. Supprimer une catégorie utilisée laisserait ses partenaires avec un
 * code que plus rien ne nomme : ils sortiraient du filtre sans avoir bougé, et personne ne saurait
 * pourquoi. On dit COMBIEN de partenaires la portent — c'est ce qu'il faut savoir pour les
 * reclasser — plutôt que de les déplacer d'office vers « Autre », ce qui serait une décision
 * prise à la place de l'école.
 */
const deletePartnerCategory = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[cat]] = await conn.query(
            'SELECT id, code, label FROM partner_category WHERE id = ? AND organization_id = ?',
            [req.params.cid, orgId]);
        if (!cat) return res.status(404).json({ message: 'Catégorie introuvable.' });
        if (cat.code === CATEGORIE_SOCLE) {
            return res.status(409).json({ message: '« Autre » ne peut pas être supprimée : c\'est le rangement par défaut d\'un nouveau partenaire.' });
        }
        const [[used]] = await conn.query(
            'SELECT COUNT(*) AS n FROM partner WHERE organization_id = ? AND category = ?', [orgId, cat.code]);
        if (Number(used.n) > 0) {
            const n = Number(used.n);
            return res.status(409).json({
                message: n > 1
                    ? `${n} partenaires sont rangés dans « ${cat.label} ». Reclassez-les avant de la supprimer.`
                    : `1 partenaire est rangé dans « ${cat.label} ». Reclassez-le avant de la supprimer.`,
            });
        }
        await conn.query('DELETE FROM partner_category WHERE id = ? AND organization_id = ?', [cat.id, orgId]);
        await logAudit(req, { action: 'DELETE', entity: 'partner_category', entityId: cat.id, before: cat });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression catégorie partenaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getPartners, createPartner, updatePartner, deletePartner, createContribution, deleteContribution,
    getPartnerProducts, createPartnerProduct, updatePartnerProduct, deletePartnerProduct,
    getPartnerCategories, createPartnerCategory, updatePartnerCategory, deletePartnerCategory };
