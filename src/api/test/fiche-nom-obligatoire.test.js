/**
 * LE NOM D'UNE FICHE TECHNIQUE EST OBLIGATOIRE — demandé par l'école le 2026-11-26.
 *
 * Avant, une fiche sans nom recevait un nom INVENTÉ : « Préparation maison » (ou « <type> maison »)
 * côté écran, « Nouvelle fiche » côté serveur. L'école ne le voulait plus : le nom est REQUIS, et
 * s'il manque l'écran surligne le champ au lieu d'enregistrer une fiche à demi nommée.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · `createRecipe` et `updateRecipe` REFUSENT (422) une fiche sans nom (ou au nom tout en
 *     espaces), AVANT toute écriture — défense en profondeur, pour qu'un client périmé ne crée pas
 *     de fiche anonyme ;
 *   · `normRecipe` ne fabrique PLUS de nom par défaut (« Nouvelle fiche » retiré) ;
 *   · l'écran ne fabrique plus « Préparation maison », bloque l'enregistrement sans nom et surligne
 *     le champ (`erreurNom`, classe `fe-nom err`, intitulé « — à remplir ») ;
 *   · la quantité est un champ nombre SANS flèches natives (elles rognaient « 5000 »).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* ── Fausse base : capture les écritures (même procédé que fiche-partage-defaut.test.js) ───────── */
let ecritures = [];
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) ecritures.push({ q, p });
            if (/^SELECT author_user_id, organization_id FROM recipe/.test(q)) return [[{ author_user_id: 'u1', organization_id: 'org-1' }]];
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) return [{ affectedRows: 1 }];
            return [[]];
        },
    }),
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { createRecipe, updateRecipe } = require('../controllers/recipe.controller.js');

async function appeler(fn, { body = {}, params = {} } = {}) {
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    ecritures = [];
    const avant = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'org-1', id: 'u1', role: 'SUPER_ADMIN' }, params, body, query: {}, headers: {} }, res); }
    finally { console.error = avant; }
    return r;
}
const recipeInsert = () => ecritures.find((e) => /^INSERT INTO recipe \(/.test(e.q));
const recipeUpdate = () => ecritures.find((e) => /^UPDATE recipe SET/.test(e.q));

test('CRÉER sans nom : refusé (422), rien n\'est inséré', async () => {
    const r = await appeler(createRecipe, { body: { kind: 'PREPARATION', ingredients: [] } });
    assert.strictEqual(r.code, 422, JSON.stringify(r.corps));
    assert.match(r.corps.message, /nom.*obligatoire/i);
    assert.ok(!recipeInsert(), 'aucune fiche ne doit être insérée');
});

test('CRÉER avec un nom tout en espaces : refusé (422)', async () => {
    const r = await appeler(createRecipe, { body: { name: '   ', kind: 'RECETTE' } });
    assert.strictEqual(r.code, 422, JSON.stringify(r.corps));
    assert.ok(!recipeInsert(), 'un nom tout en espaces ne vaut pas un nom');
});

test('CRÉER avec un nom : accepté (201), la fiche est insérée', async () => {
    const r = await appeler(createRecipe, { body: { name: 'Sauce tomate San Marzano', kind: 'PREPARATION' } });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    const ins = recipeInsert();
    assert.ok(ins, 'la fiche doit être insérée');
    assert.ok(ins.p.includes('Sauce tomate San Marzano'), 'le nom saisi part en base');
});

test('MODIFIER en effaçant le nom : refusé (422), aucune mise à jour', async () => {
    const r = await appeler(updateRecipe, { params: { id: 'rec-1' }, body: { name: '', kind: 'RECETTE' } });
    assert.strictEqual(r.code, 422, JSON.stringify(r.corps));
    assert.ok(!recipeUpdate(), 'aucune mise à jour ne doit partir');
});

test('MODIFIER avec un nom : accepté (200)', async () => {
    const r = await appeler(updateRecipe, { params: { id: 'rec-1' }, body: { name: 'Margherita', kind: 'RECETTE' } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.ok(recipeUpdate(), 'la fiche doit être mise à jour');
});

/* ── Source : plus aucun nom fabriqué, ni au serveur ni à l'écran ──────────────────────────────── */
test('normRecipe ne fabrique plus de nom par défaut', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/recipe.controller.js'), 'utf8');
    const norm = src.slice(src.indexOf('function normRecipe'));
    const corps = norm.slice(0, norm.indexOf('\n}'));
    assert.doesNotMatch(corps, /Nouvelle fiche/, 'le repli « Nouvelle fiche » doit avoir disparu');
});

test('l\'écran ne fabrique plus « Préparation maison » et exige le nom', () => {
    const APP = path.join(__dirname, '..', '..', 'app', 'ui');
    const editeur = fs.readFileSync(path.join(APP, 'pages/FicheRecette.jsx'), 'utf8');
    assert.doesNotMatch(editeur, /nomParDefaut|\} maison`/, 'plus de nom « maison » fabriqué (ni variable par défaut)');
    assert.match(editeur, /setErreurNom\(true\)/, 'sans nom, l\'écran signale le champ manquant');
    assert.match(editeur, /erreurNom \? " err"/, 'le champ nom se surligne (classe err)');
    assert.match(editeur, /à remplir/, 'l\'intitulé dit ce qui manque');
});

test('la quantité est un champ nombre sans flèches natives', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');
    assert.match(css, /\.fe-ing-qte input\[type=number\]::-webkit-inner-spin-button/, 'les flèches de la quantité sont masquées');
    assert.match(css, /\.fe-nom-cap\{/, 'le champ nom porte un intitulé');
    assert.match(css, /\.fe-nom\.err input/, 'le champ nom a un état d\'erreur');
});
