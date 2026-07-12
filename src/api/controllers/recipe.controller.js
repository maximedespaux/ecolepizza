// Espace « fiches techniques » (recettes) des stagiaires + catalogue d'ingrédients.
// Les recettes sont privées par défaut ; en « SHARED » elles apparaissent dans la
// communauté (autres stagiaires du même organisme).
const crypto = require('crypto');
const db = require('../config/database.js');

const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const authorName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || 'Stagiaire';

// Récupère une fiche accessible à l'utilisateur (auteur, ou partagée dans le même organisme).
async function accessibleRecipe(conn, id, user) {
    const [[r]] = await conn.query('SELECT id, author_user_id, organization_id, visibility FROM recipe WHERE id = ?', [id]);
    if (!r) return null;
    const ok = r.author_user_id === user.id || (r.visibility === 'SHARED' && r.organization_id === user.organization_id);
    return ok ? r : false;
}

/** GET /api/recipes/catalog?q=&brand=&family=&sort=&limit= — recherche filtrée d'ingrédients. */
const searchCatalog = async (req, res) => {
    try {
        const conn = db.promise();
        const q = String(req.query.q || '').trim();
        const brand = String(req.query.brand || '').trim();
        const family = String(req.query.family || '').trim();
        const sort = String(req.query.sort || '');
        const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 12));
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const offset = (page - 1) * limit;
        const pmin = req.query.price_min !== undefined && req.query.price_min !== '' ? Number(req.query.price_min) : null;
        const pmax = req.query.price_max !== undefined && req.query.price_max !== '' ? Number(req.query.price_max) : null;
        const where = ['organization_id = ?']; const params = [req.user.organization_id];
        if (q) { where.push('(name LIKE ? OR brand LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        if (brand) { where.push('brand LIKE ?'); params.push(`%${brand}%`); }
        if (family) { where.push('family = ?'); params.push(family); }
        if (Number.isFinite(pmin)) { where.push('unit_ht >= ?'); params.push(pmin); }
        if (Number.isFinite(pmax)) { where.push('unit_ht <= ?'); params.push(pmax); }
        const order = sort === 'price_asc' ? '(unit_ht IS NULL), unit_ht ASC'
            : sort === 'price_desc' ? 'unit_ht DESC' : 'name ASC';
        const whereSql = where.join(' AND ');
        const [[cnt]] = await conn.query(`SELECT COUNT(*) AS n FROM catalog_product WHERE ${whereSql}`, params);
        const [rows] = await conn.query(
            `SELECT id, name, brand, family, type_unity, unit_ht, unit_ttc, price_ht, image_url
             FROM catalog_product WHERE ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        res.json({ data: rows, total: cnt.n, page, limit });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] }); // migration 071 non jouée
        console.error('Erreur recherche catalogue :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/recipes/catalog/families — catégories (rayons) disponibles pour le filtre. */
const catalogFamilies = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT DISTINCT family FROM catalog_product WHERE organization_id = ? AND family IS NOT NULL AND family <> '' ORDER BY family`,
            [req.user.organization_id]
        );
        res.json({ data: rows.map((r) => r.family) });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur familles catalogue :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/recipes/catalog/brands — marques disponibles (triées) pour le filtre. */
const catalogBrands = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT DISTINCT brand FROM catalog_product WHERE organization_id = ? AND brand IS NOT NULL AND brand <> '' ORDER BY brand`,
            [req.user.organization_id]
        );
        res.json({ data: rows.map((r) => r.brand) });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur marques catalogue :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Résumé d'une fiche (sans ingrédients).
const RECIPE_COLS = `id, kind, author_user_id, author_name, name, type, description, servings, paton_g,
    flour_price, margin_pct, yield_qty, yield_unit, dough_params, visibility, DATE_FORMAT(updated_at, '%Y-%m-%d') AS updated_at`;

// Ratio pâte/farine (pourcentage boulanger). Depuis les réglages du calculateur si présents,
// sinon 1.68 par défaut (≈ 60 % hydratation).
function doughRatio(r) {
    let dp = r.dough_params;
    if (typeof dp === 'string') { try { dp = JSON.parse(dp); } catch { dp = null; } }
    if (dp && (dp.hydra != null || dp.sel != null || dp.huile != null || dp.levure != null)) {
        return 1 + ((Number(dp.hydra) || 0) + (Number(dp.sel) || 0) + (Number(dp.huile) || 0) + (Number(dp.levure) || 0)) / 100;
    }
    return 1.68;
}

const lineCost = (t) => (t.unit === 'piece' ? Number(t.qty || 0) * Number(t.unit_price || 0)
    : (Number(t.qty || 0) / 1000) * Number(t.unit_price || 0)); // 'g' → prix €/kg
const MASS_VOL = { g: 1000, kg: 1, mg: 1e6, l: 1, ml: 1000, cl: 100 }; // diviseur → kg (L≈kg)

// Coût unitaire d'une fiche (pour l'importer dans une recette) : { unit:'g'|'piece', unitPrice, total }.
// PÂTE = coût par pâton (farine + ingrédients) ; PRÉPARATION = coût total ÷ rendement.
async function ficheUnitCost(conn, r) {
    const [ings] = await conn.query('SELECT qty, unit, unit_price FROM recipe_ingredient WHERE recipe_id = ?', [r.id]);
    const ingCost = ings.reduce((s, t) => s + lineCost(t), 0);
    if (r.kind === 'PATE') {
        const perPaton = ((Number(r.paton_g) / 1000) / doughRatio(r)) * Number(r.flour_price || 0) + ingCost;
        return { unit: 'piece', unitPrice: perPaton, total: perPaton * Math.max(1, Number(r.servings) || 1) };
    }
    const total = ingCost;
    const y = Number(r.yield_qty) || 0;
    const yu = String(r.yield_unit || '').toLowerCase();
    if (y > 0 && MASS_VOL[yu]) { const kg = y / MASS_VOL[yu]; return { unit: 'g', unitPrice: kg > 0 ? total / kg : 0, total }; }
    if (y > 0) return { unit: 'piece', unitPrice: total / y, total };
    return { unit: 'piece', unitPrice: total, total };
}

/** GET /api/recipes/mine?kind= — mes fiches techniques (filtrées par type si fourni). */
const listMine = async (req, res) => {
    try {
        const conn = db.promise();
        const kind = String(req.query.kind || '').toUpperCase();
        const kf = ['PATE', 'PREPARATION', 'RECETTE'].includes(kind);
        const [rows] = await conn.query(
            `SELECT ${RECIPE_COLS} FROM recipe WHERE author_user_id = ? ${kf ? 'AND kind = ?' : ''} ORDER BY updated_at DESC, name`,
            kf ? [req.user.id, kind] : [req.user.id]
        );
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur liste recettes :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/recipes/components?q= — pâtes/préparations importables (avec coût unitaire). */
const listComponents = async (req, res) => {
    try {
        const conn = db.promise();
        const q = String(req.query.q || '').trim();
        const [rows] = await conn.query(
            `SELECT ${RECIPE_COLS} FROM recipe
             WHERE organization_id = ? AND kind IN ('PATE','PREPARATION')
               AND (author_user_id = ? OR visibility = 'SHARED') ${q ? 'AND name LIKE ?' : ''}
             ORDER BY kind, name LIMIT 80`,
            q ? [req.user.organization_id, req.user.id, `%${q}%`] : [req.user.organization_id, req.user.id]
        );
        const out = [];
        for (const r of rows) {
            const c = await ficheUnitCost(conn, r);
            out.push({ id: r.id, name: r.name, kind: r.kind, unit: c.unit, unit_price: Number(c.unitPrice.toFixed(4)), yield_qty: r.yield_qty, yield_unit: r.yield_unit });
        }
        res.json({ data: out });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur composants recettes :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/recipes/shared — recettes partagées par les stagiaires de l'organisme. */
const listShared = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT ${RECIPE_COLS} FROM recipe
             WHERE organization_id = ? AND visibility = 'SHARED'
             ORDER BY updated_at DESC LIMIT 200`,
            [req.user.organization_id]
        );
        // Compteurs cœurs / commentaires (dégradent si migration 074 non lancée).
        const ids = rows.map((r) => r.id);
        if (ids.length) {
            try {
                const [likes] = await conn.query('SELECT recipe_id, COUNT(*) AS n FROM recipe_like WHERE recipe_id IN (?) GROUP BY recipe_id', [ids]);
                const [coms] = await conn.query('SELECT recipe_id, COUNT(*) AS n FROM recipe_comment WHERE recipe_id IN (?) GROUP BY recipe_id', [ids]);
                const [mineLikes] = await conn.query('SELECT recipe_id FROM recipe_like WHERE user_id = ? AND recipe_id IN (?)', [req.user.id, ids]);
                const lm = Object.fromEntries(likes.map((x) => [x.recipe_id, x.n]));
                const cm = Object.fromEntries(coms.map((x) => [x.recipe_id, x.n]));
                const liked = new Set(mineLikes.map((x) => x.recipe_id));
                rows.forEach((r) => { r.like_count = lm[r.id] || 0; r.comment_count = cm[r.id] || 0; r.liked = liked.has(r.id); });
            } catch (e) { if (!noTable(e)) throw e; }
        }
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur communauté recettes :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/recipes/:id — une recette + ses ingrédients (auteur, ou partagée du même org). */
const getRecipe = async (req, res) => {
    try {
        const conn = db.promise();
        const [[r]] = await conn.query(
            `SELECT ${RECIPE_COLS}, organization_id FROM recipe WHERE id = ?`, [req.params.id]);
        if (!r) return res.status(404).json({ message: 'Recette introuvable.' });
        const mine = r.author_user_id === req.user.id;
        const sharedSameOrg = r.visibility === 'SHARED' && r.organization_id === req.user.organization_id;
        if (!mine && !sharedSameOrg) return res.status(403).json({ message: 'Accès refusé.' });
        const [ings] = await conn.query(
            `SELECT id, product_id, component_recipe_id, label, qty, unit, unit_price FROM recipe_ingredient WHERE recipe_id = ? ORDER BY sort_order, id`,
            [req.params.id]);
        delete r.organization_id;
        // Interactions communauté (cœur + commentaires) — dégradent en douceur si migration 074 non lancée.
        let likeCount = 0, liked = false, comments = [];
        try {
            const [[lc]] = await conn.query('SELECT COUNT(*) AS n FROM recipe_like WHERE recipe_id = ?', [req.params.id]);
            likeCount = lc.n;
            const [[lm]] = await conn.query('SELECT 1 AS l FROM recipe_like WHERE recipe_id = ? AND user_id = ?', [req.params.id, req.user.id]);
            liked = !!lm;
            const [cs] = await conn.query(
                `SELECT id, user_id, author_name, body, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
                 FROM recipe_comment WHERE recipe_id = ? ORDER BY created_at`, [req.params.id]);
            comments = cs.map((c) => ({ ...c, mine: c.user_id === req.user.id }));
        } catch (e) { if (!noTable(e)) throw e; }
        res.json({ data: { ...r, mine, ingredients: ings, like_count: likeCount, liked, comments } });
    } catch (err) {
        if (noTable(err)) return res.status(404).json({ message: 'Espace recettes non initialisé (migration 071).' });
        console.error('Erreur lecture recette :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

function normRecipe(b) {
    return {
        kind: ['PATE', 'PREPARATION', 'RECETTE'].includes(b.kind) ? b.kind : 'RECETTE',
        name: String(b.name || '').trim().slice(0, 160) || 'Nouvelle fiche',
        type: b.type ? String(b.type).slice(0, 40) : null,
        description: b.description ? String(b.description).slice(0, 5000) : null,
        servings: Math.max(1, parseInt(b.servings, 10) || 6),
        paton_g: Math.max(1, parseInt(b.paton_g, 10) || 250),
        flour_price: Math.max(0, Number(b.flour_price) || 0),
        margin_pct: Math.max(0, Math.min(1000, parseInt(b.margin_pct, 10) || 0)),
        yield_qty: (b.yield_qty != null && b.yield_qty !== '') ? Math.max(0, Number(b.yield_qty) || 0) : null,
        yield_unit: b.yield_unit ? String(b.yield_unit).slice(0, 20) : null,
        dough_params: (b.dough_params && typeof b.dough_params === 'object') ? JSON.stringify(b.dough_params).slice(0, 2000) : null,
        visibility: b.visibility === 'SHARED' ? 'SHARED' : 'PRIVATE',
    };
}
async function saveIngredients(conn, recipeId, ingredients) {
    await conn.query('DELETE FROM recipe_ingredient WHERE recipe_id = ?', [recipeId]);
    const list = Array.isArray(ingredients) ? ingredients : [];
    for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const label = String(g.label || '').trim();
        if (!label) continue;
        await conn.query(
            `INSERT INTO recipe_ingredient (id, recipe_id, product_id, component_recipe_id, label, qty, unit, unit_price, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), recipeId, g.product_id || null, g.component_recipe_id || null, label.slice(0, 255),
             Number(g.qty) || 0, g.unit === 'piece' ? 'piece' : 'g', Number(g.unit_price) || 0, i]
        );
    }
}

/** POST /api/recipes — crée une recette. */
const createRecipe = async (req, res) => {
    try {
        const conn = db.promise();
        const r = normRecipe(req.body || {});
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO recipe (id, organization_id, author_user_id, author_name, kind, name, type, description, servings, paton_g, flour_price, margin_pct, yield_qty, yield_unit, dough_params, visibility)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, req.user.id, authorName(req.user), r.kind, r.name, r.type, r.description, r.servings, r.paton_g, r.flour_price, r.margin_pct, r.yield_qty, r.yield_unit, r.dough_params, r.visibility]
        );
        await saveIngredients(conn, id, (req.body || {}).ingredients);
        res.status(201).json({ data: { id } });
    } catch (err) {
        if (noTable(err)) return res.status(422).json({ message: 'Espace recettes non initialisé (migration 071).' });
        console.error('Erreur création recette :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/recipes/:id — met à jour (auteur uniquement). */
const updateRecipe = async (req, res) => {
    try {
        const conn = db.promise();
        const [[cur]] = await conn.query('SELECT author_user_id FROM recipe WHERE id = ?', [req.params.id]);
        if (!cur) return res.status(404).json({ message: 'Recette introuvable.' });
        if (cur.author_user_id !== req.user.id) return res.status(403).json({ message: 'Seul l\'auteur peut modifier.' });
        const r = normRecipe(req.body || {});
        await conn.query(
            `UPDATE recipe SET kind=?, name=?, type=?, description=?, servings=?, paton_g=?, flour_price=?, margin_pct=?, yield_qty=?, yield_unit=?, dough_params=?, visibility=? WHERE id=?`,
            [r.kind, r.name, r.type, r.description, r.servings, r.paton_g, r.flour_price, r.margin_pct, r.yield_qty, r.yield_unit, r.dough_params, r.visibility, req.params.id]
        );
        await saveIngredients(conn, req.params.id, (req.body || {}).ingredients);
        res.json({ data: { id: req.params.id } });
    } catch (err) {
        console.error('Erreur mise à jour recette :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/recipes/:id — supprime (auteur uniquement). */
const deleteRecipe = async (req, res) => {
    try {
        const conn = db.promise();
        const [[cur]] = await conn.query('SELECT author_user_id FROM recipe WHERE id = ?', [req.params.id]);
        if (!cur) return res.status(404).json({ message: 'Recette introuvable.' });
        if (cur.author_user_id !== req.user.id) return res.status(403).json({ message: 'Seul l\'auteur peut supprimer.' });
        await conn.query('DELETE FROM recipe WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression recette :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/recipes/:id/like — bascule le « j'aime » de l'utilisateur ; renvoie l'état + compteur. */
const toggleLike = async (req, res) => {
    try {
        const conn = db.promise();
        const r = await accessibleRecipe(conn, req.params.id, req.user);
        if (r === null) return res.status(404).json({ message: 'Recette introuvable.' });
        if (r === false) return res.status(403).json({ message: 'Accès refusé.' });
        const [[had]] = await conn.query('SELECT 1 AS l FROM recipe_like WHERE recipe_id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (had) await conn.query('DELETE FROM recipe_like WHERE recipe_id = ? AND user_id = ?', [req.params.id, req.user.id]);
        else await conn.query('INSERT IGNORE INTO recipe_like (recipe_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id]);
        const [[lc]] = await conn.query('SELECT COUNT(*) AS n FROM recipe_like WHERE recipe_id = ?', [req.params.id]);
        res.json({ data: { liked: !had, like_count: lc.n } });
    } catch (err) {
        if (noTable(err)) return res.status(422).json({ message: 'Interactions non initialisées (migration 074).' });
        console.error('Erreur like recette :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/recipes/:id/comments — ajoute un commentaire ; renvoie le commentaire créé. */
const addComment = async (req, res) => {
    try {
        const conn = db.promise();
        const body = String((req.body || {}).body || '').trim().slice(0, 2000);
        if (!body) return res.status(422).json({ message: 'Commentaire vide.' });
        const r = await accessibleRecipe(conn, req.params.id, req.user);
        if (r === null) return res.status(404).json({ message: 'Recette introuvable.' });
        if (r === false) return res.status(403).json({ message: 'Accès refusé.' });
        const id = crypto.randomUUID();
        const name = authorName(req.user);
        await conn.query('INSERT INTO recipe_comment (id, recipe_id, user_id, author_name, body) VALUES (?, ?, ?, ?, ?)',
            [id, req.params.id, req.user.id, name, body]);
        res.status(201).json({ data: { id, user_id: req.user.id, author_name: name, body, mine: true } });
    } catch (err) {
        if (noTable(err)) return res.status(422).json({ message: 'Interactions non initialisées (migration 074).' });
        console.error('Erreur commentaire recette :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/recipes/:id/comments/:cid — modifie son propre commentaire. */
const updateComment = async (req, res) => {
    try {
        const conn = db.promise();
        const body = String((req.body || {}).body || '').trim().slice(0, 2000);
        if (!body) return res.status(422).json({ message: 'Commentaire vide.' });
        const [[c]] = await conn.query('SELECT user_id, author_name FROM recipe_comment WHERE id = ? AND recipe_id = ?', [req.params.cid, req.params.id]);
        if (!c) return res.status(404).json({ message: 'Commentaire introuvable.' });
        if (c.user_id !== req.user.id) return res.status(403).json({ message: 'Seul l\'auteur peut modifier.' });
        await conn.query('UPDATE recipe_comment SET body = ? WHERE id = ?', [body, req.params.cid]);
        res.json({ data: { id: req.params.cid, user_id: req.user.id, author_name: c.author_name, body, mine: true } });
    } catch (err) {
        console.error('Erreur modification commentaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/recipes/:id/comments/:cid — supprime son propre commentaire. */
const deleteComment = async (req, res) => {
    try {
        const conn = db.promise();
        const [[c]] = await conn.query('SELECT user_id FROM recipe_comment WHERE id = ? AND recipe_id = ?', [req.params.cid, req.params.id]);
        if (!c) return res.status(404).json({ message: 'Commentaire introuvable.' });
        if (c.user_id !== req.user.id) return res.status(403).json({ message: 'Seul l\'auteur peut supprimer.' });
        await conn.query('DELETE FROM recipe_comment WHERE id = ?', [req.params.cid]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression commentaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { searchCatalog, catalogFamilies, catalogBrands, listMine, listShared, listComponents, getRecipe, createRecipe, updateRecipe, deleteRecipe, toggleLike, addComment, updateComment, deleteComment };
