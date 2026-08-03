const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { prixStagiaire } = require('../lib/remise.js');

/**
 * GET /api/inventaire — articles en stock + totaux (valeur, ruptures).
 */
/* `learner_discount_pct` arrive par la 125 : sondée avant usage, sinon la requête échouerait et
 * l'inventaire entier deviendrait illisible pour une remise facultative. */
const { colonneExiste } = require('../lib/colonnes.js');
const { validerImage } = require('../lib/imageDistante.js');

/* La photo d'un article (migration 133) : une adresse, pas un fichier. Sondée comme la remise —
   l'inventaire entier deviendrait illisible si la requête nommait une colonne absente. */
const CHAMP_IMAGE = 'image_url';

async function colRemise(conn, colonne = 'learner_discount_pct') {
    try {
        const [r] = await conn.query(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
             AND table_name = 'inventory_item' AND column_name = ? LIMIT 1`, [colonne]);
        return r.length > 0;
    } catch { return false; }
}

const getItems = async (req, res) => {
    try {
        const conn = db.promise();
        // Les deux formes de remise (%, €) arrivent par la 125. On sonde celle ajoutée en
        // dernier : si elle est là, l'autre l'est aussi (même migration).
        const remise = await colRemise(conn, 'learner_discount_eur')
            ? 'learner_discount_pct, learner_discount_eur'
            : 'NULL AS learner_discount_pct, NULL AS learner_discount_eur';
        const image = await colonneExiste(conn, 'inventory_item', CHAMP_IMAGE)
            ? CHAMP_IMAGE : `NULL AS ${CHAMP_IMAGE}`;
        const [rows] = await conn.query(
            `SELECT id, name, category, sku, quantity, unit_price, tax_rate, threshold, ${remise},
                    ${image},
                    DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at
             FROM inventory_item
             WHERE organization_id = ?
             ORDER BY name`,
            [req.user.organization_id]);
        {
            /* Prix stagiaire calculé ICI, par la même fonction que la boutique (lib/remise.js).
         * L'école règle une remise sans jamais en voir l'effet : elle devait ouvrir l'espace
         * stagiaire pour savoir ce que l'article y coûte. Le refaire côté front aurait ajouté
         * une troisième copie du calcul, donc une troisième occasion de diverger. */
        for (const r of rows) {
            const px = prixStagiaire(r);
            r.prix_stagiaire_ht = px.net;
            r.remise_libelle = px.libelle;   // null s'il n'y a pas de remise
        }

        const totals = {
                items: rows.length,
                units: rows.reduce((s, r) => s + (r.quantity || 0), 0),
                value: rows.reduce((s, r) => s + (r.quantity || 0) * Number(r.unit_price || 0), 0),
                low: rows.filter((r) => r.quantity <= r.threshold).length,
            };
            res.json({ data: rows, totals });
        }
    } catch (err) {
        console.error('Erreur inventaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/inventaire — ajoute un article.
 */
const createItem = async (req, res) => {
    const { name, category, sku, quantity = 0, unit_price, tax_rate = 20, threshold = 0 } = req.body;
    if (!name) return res.status(422).json({ error: "Nom de l'article requis" });
    // Validée AVANT toute écriture : une adresse rejetée en silence donnerait un article sans
    // photo sans qu'on sache que le lien était en cause.
    const image = validerImage(req.body[CHAMP_IMAGE]);
    if (!image.ok) return res.status(422).json({ message: image.message });
    try {
        const conn = db.promise();
        const cols = ['id', 'organization_id', 'name', 'category', 'sku', 'quantity', 'unit_price', 'tax_rate', 'threshold'];
        const vals = [crypto.randomUUID(), req.user.organization_id, name, category || null, sku || null,
            Math.max(0, parseInt(quantity, 10) || 0), unit_price || null,
            tax_rate === '' || tax_rate == null ? 20 : tax_rate, parseInt(threshold, 10) || 0];

        /* Remise stagiaire (125). Elle était ignorée À LA CRÉATION : on pouvait la saisir dans le
         * formulaire d'ajout, elle disparaissait, et il fallait rouvrir l'article pour la reposer.
         * Bornée ici comme à la mise à jour — une saisie hors limites ne doit pas passer par une
         * porte plutôt que l'autre. */
        if (image.valeur !== undefined && image.valeur !== null
            && await colonneExiste(conn, 'inventory_item', CHAMP_IMAGE)) {
            cols.push(CHAMP_IMAGE); vals.push(image.valeur);
        }
        if (await colRemise(conn, 'learner_discount_eur')) {
            const pct = Number(req.body.learner_discount_pct);
            const eur = Number(req.body.learner_discount_eur);
            cols.push('learner_discount_pct', 'learner_discount_eur');
            vals.push(
                Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : null,
                Number.isFinite(eur) && eur > 0 ? eur : null);
        }
        await conn.query(
            `INSERT INTO inventory_item (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
        logAudit(req, 'inventory.create', 'InventoryItem');
        res.status(201).json({ message: 'Article ajouté' });
    } catch (err) {
        console.error('Erreur création article :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/inventaire/:id/adjust — ajuste le stock (delta, +/-). Ne descend pas sous 0.
 */
const adjustItem = (req, res) => {
    const delta = parseInt(req.body.delta, 10);
    if (Number.isNaN(delta)) return res.status(422).json({ error: 'Delta invalide' });
    db.query(
        'UPDATE inventory_item SET quantity = GREATEST(0, quantity + ?) WHERE id = ? AND organization_id = ?',
        [delta, req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur ajustement stock :', err);
                return res.status(400).json({ message: 'Erreur' });
            }
            db.query(
                'SELECT quantity FROM inventory_item WHERE id = ? AND organization_id = ?',
                [req.params.id, req.user.organization_id],
                (e2, rows) => {
                    if (e2 || rows.length === 0) return res.status(200).json({ success: true });
                    res.status(200).json({ success: true, quantity: rows[0].quantity });
                }
            );
        }
    );
};

/**
 * PATCH /api/inventaire/:id — met à jour un article.
 */
const updateItem = async (req, res) => {
    const allowed = ['name', 'category', 'sku', 'quantity', 'unit_price', 'tax_rate', 'threshold', 'learner_discount_pct', 'learner_discount_eur'];
    // Bornes des champs numériques (rejette négatifs / NaN / valeurs aberrantes).
    const numericBounds = { quantity: [0, 1e9], unit_price: [0, 1e8], tax_rate: [0, 100], threshold: [0, 1e9],
        learner_discount_pct: [0, 100], learner_discount_eur: [0, 1e8] };
    /* CHAQUE FRAGMENT PORTE SA VALEUR, au lieu de deux tableaux parallèles indexés en miroir.
     *
     * LE DÉFAUT QUE CETTE FORME SUPPRIME était réel et silencieux : le nettoyage « migration 125
     * non jouée » plus bas retirait `values[k]` en se servant de l'indice du FRAGMENT. Or un
     * fragment `= NULL` n'a pas de valeur associée, et décale donc les deux tableaux. Sur
     *     ['learner_discount_pct = NULL', 'learner_discount_eur = ?', 'name = ?']  +  [10, 'Nom']
     * le nettoyage retirait « Nom » au lieu de « 10 », et l'article se retrouvait RENOMMÉ « 10 ».
     * Aucune erreur SQL : une mise à jour parfaitement valide, sur la mauvaise colonne.
     *
     * En appariant, filtrer devient un `filter` et l'ordre des valeurs se déduit des fragments
     * retenus — il n'y a plus d'indice à tenir juste. */
    const champs = [];   // { sql: 'x = ?' | 'x = NULL', valeur?: any, remise?: true }

    /* LA PHOTO PASSE PAR SA PROPRE VALIDATION, hors de la boucle générique : celle-ci ne fait que
       borner des nombres et convertir les vides, ce qui laisserait entrer n'importe quoi dans un
       attribut `src`. Une chaîne vide EFFACE la photo — retirer une image est une opération
       légitime, exactement comme retirer une remise. */
    const image = validerImage(req.body[CHAMP_IMAGE]);
    if (!image.ok) return res.status(422).json({ message: image.message });
    if (image.valeur !== undefined && await colonneExiste(db.promise(), 'inventory_item', CHAMP_IMAGE)) {
        champs.push(image.valeur === null
            ? { sql: `${CHAMP_IMAGE} = NULL` }
            : { sql: `${CHAMP_IMAGE} = ?`, valeur: image.valeur });
    }

    for (const f of allowed) {
        if (req.body[f] === undefined) continue;
        /* Une chaîne VIDE efface la remise. Le filtre d'origine sautait tout champ vide, si bien
         * qu'on pouvait poser une remise mais jamais la retirer : vider le champ ne faisait rien.
         * Les autres champs gardent l'ancien comportement — vider un nom ne doit pas l'effacer. */
        if (req.body[f] === '') {
            if (f !== 'learner_discount_pct' && f !== 'learner_discount_eur') continue;
            champs.push({ sql: `${f} = NULL`, remise: true });
            continue;
        }
        let v = req.body[f];
        if (numericBounds[f]) {
            const n = Number(v);
            const [min, max] = numericBounds[f];
            if (!Number.isFinite(n) || n < min || n > max) {
                return res.status(422).json({ message: `Valeur invalide pour ${f}.` });
            }
            v = n;
        }
        champs.push({ sql: `${f} = ?`, valeur: v, remise: f.startsWith('learner_discount_') });
    }
    // Migration 125 non jouée : on retire la remise de la requête plutôt que de faire échouer
    // TOUTE la mise à jour de l'article pour un champ facultatif.
    const retenus = await colRemise(db.promise(), 'learner_discount_eur')
        ? champs
        : champs.filter((c) => !c.remise);

    if (retenus.length === 0) return res.status(400).json({ message: 'Aucun champ' });
    const updates = retenus.map((c) => c.sql);
    // Les valeurs se DÉDUISENT des fragments retenus : plus aucun indice à tenir en parallèle.
    const values = retenus.filter((c) => 'valeur' in c).map((c) => c.valeur);
    values.push(req.params.id, req.user.organization_id);
    db.query(
        `UPDATE inventory_item SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
        values,
        (err) => {
            if (err) return res.status(400).json({ message: 'Erreur' });
            res.status(200).json({ success: true, message: 'Article mis à jour' });
        }
    );
};

/**
 * POST /api/inventaire/:id/sell — vend N unités : décrémente le stock et
 * enregistre une vente (material_sale) pour le chiffre d'affaires.
 */
const sellItem = async (req, res) => {
    const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT name, category, quantity, unit_price FROM inventory_item WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Article introuvable' });
        const item = rows[0];
        if (item.quantity < qty) return res.status(422).json({ error: 'Stock insuffisant' });

        await conn.query('UPDATE inventory_item SET quantity = quantity - ? WHERE id = ?', [qty, req.params.id]);
        await conn.query(
            `INSERT INTO material_sale (id, organization_id, date, product, category, quantity, amount)
             VALUES (?, ?, CURDATE(), ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user.organization_id, item.name, item.category, qty, item.unit_price || 0]
        );
        logAudit(req, 'inventory.sell', 'InventoryItem', req.params.id);
        res.status(201).json({ success: true, message: 'Vente enregistrée', quantity: item.quantity - qty });
    } catch (err) {
        console.error('Erreur vente article :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/inventaire/:id
 */
const deleteItem = (req, res) => {
    db.query(
        'DELETE FROM inventory_item WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) return res.status(400).json({ message: 'Erreur suppression' });
            res.status(200).json({ success: true, message: 'Article supprimé' });
        }
    );
};

module.exports = { getItems, createItem, adjustItem, updateItem, sellItem, deleteItem };
