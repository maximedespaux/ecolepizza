// Espace « fiches techniques » (recettes) des stagiaires + catalogue d'ingrédients.
// Les recettes sont privées par défaut ; en « SHARED » elles apparaissent dans la
// communauté (autres stagiaires du même organisme).
const crypto = require('crypto');
const db = require('../config/database.js');

const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const authorName = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || 'Stagiaire';

/** GET /api/recipes/catalog?q=… — recherche d'ingrédients (autocomplétion). */
const searchCatalog = async (req, res) => {
    try {
        const conn = db.promise();
        const q = String(req.query.q || '').trim();
        const like = `%${q}%`;
        const [rows] = await conn.query(
            `SELECT id, name, brand, family, type_unity, unit_ht, unit_ttc, price_ht, image_url
             FROM catalog_product
             WHERE organization_id = ? ${q ? 'AND (name LIKE ? OR brand LIKE ?)' : ''}
             ORDER BY name LIMIT 30`,
            q ? [req.user.organization_id, like, like] : [req.user.organization_id]
        );
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] }); // migration 071 non jouée
        console.error('Erreur recherche catalogue :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Résumé d'une recette (sans ingrédients).
const RECIPE_COLS = `id, author_user_id, author_name, name, type, description, servings, paton_g,
    flour_price, margin_pct, visibility, DATE_FORMAT(updated_at, '%Y-%m-%d') AS updated_at`;

/** GET /api/recipes/mine — mes fiches techniques. */
const listMine = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT ${RECIPE_COLS} FROM recipe WHERE author_user_id = ? ORDER BY updated_at DESC, name`,
            [req.user.id]
        );
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur liste recettes :', err);
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
            `SELECT id, product_id, label, qty, unit, unit_price FROM recipe_ingredient WHERE recipe_id = ? ORDER BY sort_order, id`,
            [req.params.id]);
        delete r.organization_id;
        res.json({ data: { ...r, mine, ingredients: ings } });
    } catch (err) {
        if (noTable(err)) return res.status(404).json({ message: 'Espace recettes non initialisé (migration 071).' });
        console.error('Erreur lecture recette :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

function normRecipe(b) {
    return {
        name: String(b.name || '').trim().slice(0, 160) || 'Nouvelle recette',
        type: b.type ? String(b.type).slice(0, 40) : null,
        description: b.description ? String(b.description).slice(0, 5000) : null,
        servings: Math.max(1, parseInt(b.servings, 10) || 6),
        paton_g: Math.max(1, parseInt(b.paton_g, 10) || 250),
        flour_price: Math.max(0, Number(b.flour_price) || 0),
        margin_pct: Math.max(0, Math.min(1000, parseInt(b.margin_pct, 10) || 0)),
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
            `INSERT INTO recipe_ingredient (id, recipe_id, product_id, label, qty, unit, unit_price, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), recipeId, g.product_id || null, label.slice(0, 255),
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
            `INSERT INTO recipe (id, organization_id, author_user_id, author_name, name, type, description, servings, paton_g, flour_price, margin_pct, visibility)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, req.user.id, authorName(req.user), r.name, r.type, r.description, r.servings, r.paton_g, r.flour_price, r.margin_pct, r.visibility]
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
            `UPDATE recipe SET name=?, type=?, description=?, servings=?, paton_g=?, flour_price=?, margin_pct=?, visibility=? WHERE id=?`,
            [r.name, r.type, r.description, r.servings, r.paton_g, r.flour_price, r.margin_pct, r.visibility, req.params.id]
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

module.exports = { searchCatalog, listMine, listShared, getRecipe, createRecipe, updateRecipe, deleteRecipe };
