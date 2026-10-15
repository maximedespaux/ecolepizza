/**
 * MODIFIER LA FICHE D'UN AUTRE — RÉSERVÉ À LA MODÉRATION (demandé le 2026-10-15).
 *
 * L'auteur modifie la sienne ; un membre qui MODÈRE corrige celle d'un stagiaire — EXACTEMENT la
 * règle de la suppression (deleteRecipe), via le point unique `droitEcritureFiche`. Un stagiaire
 * lambda ne peut pas toucher la fiche d'un autre (403, rien écrit). La correction d'un autre laisse
 * une trace (recipe.update). On gèle ici les trois issues + la source.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
let ecritures = [];
function repondre(q) {
    // Fiche r1 : auteur 'autre', organisme 'org-1'.
    if (/^SELECT author_user_id, organization_id FROM recipe/.test(q)) return [[{ author_user_id: 'autre', organization_id: 'org-1' }]];
    if (/^SELECT nav_access FROM user/.test(q)) return [[{ nav_access: null }]]; // aucune capacité accordée
    if (/information_schema/i.test(q)) return [[{ n: 0 }]];                       // colonnes optionnelles absentes
    if (/^(INSERT|UPDATE|DELETE)/.test(q)) return [{ affectedRows: 1 }];
    return [[]];
}
const faux = {
    // logAudit écrit par db.query(sql, valeurs, callback) : on l'absorbe sans bruit.
    query: (_sql, _valeurs, cb) => { if (typeof cb === 'function') cb(null); },
    promise: () => ({
        query: async (sql) => {
            const q = plat(sql);
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) ecritures.push({ q });
            return repondre(q);
        },
    }),
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { updateRecipe } = require('../controllers/recipe.controller.js');

async function modifier(user) {
    ecritures = [];
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try { await updateRecipe({ user, params: { id: 'r1' }, body: { name: 'Corrigée', kind: 'RECETTE', ingredients: [] }, query: {}, headers: {} }, res); }
    finally { console.error = avant; }
    return r;
}

test('un MEMBRE qui modère corrige la fiche d\'un autre (200, la fiche est mise à jour)', async () => {
    const r = await modifier({ id: 'mod1', organization_id: 'org-1', role: 'SUPER_ADMIN' });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.ok(ecritures.some((e) => /^UPDATE recipe SET/.test(e.q)), 'la fiche est bien mise à jour');
});

test('un STAGIAIRE ne peut PAS modifier la fiche d\'un autre (403, rien d\'écrit)', async () => {
    const r = await modifier({ id: 'stag2', organization_id: 'org-1', role: 'STAGIAIRE' });
    assert.strictEqual(r.code, 403);
    assert.strictEqual(ecritures.length, 0, 'refusée AVANT toute écriture');
});

test('un membre d\'un AUTRE organisme ne modère pas cette fiche (403)', async () => {
    const r = await modifier({ id: 'mod9', organization_id: 'autre-org', role: 'SUPER_ADMIN' });
    assert.strictEqual(r.code, 403, 'la modération ne vaut que dans son organisme');
});

test('SOURCE : auteur OU modération (point unique), UPDATE borné à l\'organisme, trace de modération', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'recipe.controller.js'), 'utf8');
    const up = src.slice(src.indexOf('const updateRecipe'), src.indexOf('const deleteRecipe'));
    assert.match(up, /droitEcritureFiche\(conn, req\.params\.id, req\.user\)/, 'même règle que la suppression');
    assert.match(up, /if \(!autorise\) return res\.status\(403\)/);
    assert.match(up, /UPDATE recipe SET[^`]*WHERE id=\? AND organization_id=\?/, 'borné à l\'organisme');
    assert.match(up, /if \(moderation\) logAudit\(req, 'recipe\.update', 'Recipe', req\.params\.id, \{ libelle: r\.name \}\)/);
});
