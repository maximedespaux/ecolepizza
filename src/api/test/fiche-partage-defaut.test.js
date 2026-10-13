/**
 * TOUTE FICHE TECHNIQUE EST PARTAGÉE À LA COMMUNAUTÉ (décidé par l'école le 2026-10-13).
 *
 * Avant, une fiche naissait PRIVÉE et le stagiaire cliquait « Partager ». Désormais il n'y a plus
 * de choix : toute fiche part sur la communauté. On gèle ici ce qui, s'il cédait, ramènerait le
 * choix ou, pire, republierait une fiche que la modération a retirée :
 *   · `createRecipe` écrit TOUJOURS `visibility = 'SHARED'`, même si le client envoie 'PRIVATE' ;
 *   · `updateRecipe` NE TOUCHE PLUS à `visibility` (il la préserve) — une fiche retirée du fil par
 *     la modération ne se republie pas au prochain enregistrement de l'auteur ;
 *   · l'écran n'offre plus de bouton « Partager » / « Retirer » à l'auteur.
 *
 * Le RETRAIT par la modération (`unshareRecipe`) reste, lui — c'est l'objet de retrait-fiche-dates.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* ── Fausse base : capture les écritures ─────────────────────────────────────────────────────── */
let ecritures = [];
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) ecritures.push({ q, p });
            if (/^SELECT author_user_id FROM recipe/.test(q)) return [[{ author_user_id: 'u1' }]];
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

test('CRÉER une fiche la met TOUJOURS sur la communauté — même si le client dit « privée »', async () => {
    const r = await appeler(createRecipe, { body: { name: 'Margherita', kind: 'RECETTE', visibility: 'PRIVATE' } });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    const ins = recipeInsert();
    assert.ok(ins, 'une fiche doit être insérée');
    assert.match(ins.q, /'SHARED'\)$/, "la visibilité insérée est 'SHARED' en dur, pas la valeur du client");
    assert.ok(!ins.p.includes('PRIVATE'), "le 'PRIVATE' du client ne doit pas atteindre la base");
});

test('MODIFIER une fiche ne touche PAS à sa visibilité (préservée)', async () => {
    const r = await appeler(updateRecipe, { params: { id: 'rec-1' }, body: { name: 'Margherita', kind: 'RECETTE', visibility: 'PRIVATE' } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    const up = recipeUpdate();
    assert.ok(up, 'la fiche doit être mise à jour');
    assert.doesNotMatch(up.q, /visibility/, "l'UPDATE ne doit PAS écrire visibility — sinon un retrait de modération se déferait à l'enregistrement");
});

/* ── Source : plus d'option de partage côté auteur, et le retrait de modération intact ─────────── */
test('le contrôleur force SHARED à la création et n\'écrit pas la visibilité à la mise à jour', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/recipe.controller.js'), 'utf8');
    // `normRecipe` ne lit plus de visibilité du client.
    const norm = src.slice(src.indexOf('function normRecipe'));
    assert.doesNotMatch(norm.slice(0, norm.indexOf('\n}')), /visibility:/, 'normRecipe ne doit plus porter de visibility');
    // La création force 'SHARED'.
    const create = src.slice(src.indexOf('const createRecipe'));
    assert.match(create.slice(0, create.indexOf('\n};')), /VALUES \([^)]*'SHARED'\)/, "createRecipe insère 'SHARED'");
    // La mise à jour ne liste plus la colonne visibility.
    const update = src.slice(src.indexOf('const updateRecipe'));
    assert.doesNotMatch(update.slice(0, update.indexOf('\n};')), /UPDATE recipe SET[^`]*visibility/, 'updateRecipe ne touche plus visibility');
});

test('l\'écran n\'offre plus de « Partager » / « Retirer » à l\'auteur', () => {
    const APP = path.join(__dirname, '..', '..', 'app', 'ui');
    const editeur = fs.readFileSync(path.join(APP, 'pages/FicheRecette.jsx'), 'utf8');
    assert.doesNotMatch(editeur, /persist\(\{ visibility:/, 'plus de bascule de partage dans l\'éditeur');
    const liste = fs.readFileSync(path.join(APP, 'pages/FichesTechniques.jsx'), 'utf8');
    assert.doesNotMatch(liste, /unshareRecipe\(|from "\.\.\/api\/apiClient\.js"[^\n]*unshareRecipe/, 'plus d\'appel ni d\'import du retrait auteur dans « Mes fiches »');
    // Une nouvelle fiche naît partagée (l'état initial).
    assert.match(editeur, /visibility: "SHARED"/, 'une nouvelle fiche part partagée');
    // La modération, elle, garde son retrait (depuis la Communauté).
    const comm = fs.readFileSync(path.join(APP, 'pages/Communaute.jsx'), 'utf8');
    assert.match(comm, /unshareRecipe\(d\.id\)/, 'le retrait de modération reste');
});
