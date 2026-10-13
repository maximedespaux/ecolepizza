/**
 * SUPPRIMER UNE FICHE : l'auteur la sienne, un MEMBRE qui MODÈRE celle d'un autre (2026-10-14).
 *
 * Décidé avec l'école : retirer une fiche de la Communauté la SUPPRIME (de partout, auteur compris),
 * au lieu de la dépublier. `deleteRecipe` doit donc accepter l'AUTEUR ou la MODÉRATION, mais refuser
 * tout autre, et JAMAIS la fiche d'un autre organisme. Ce test gèle cette matrice d'autorisation —
 * c'est elle qui, si elle cédait, laisserait un stagiaire effacer la fiche d'un autre, ou un
 * modérateur toucher à une autre école.
 */
const test = require('node:test');
const assert = require('node:assert');

const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
let scenario = {};
let captures = [];
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            if (/^SELECT author_user_id, organization_id, name FROM recipe/.test(q)) return [[scenario.recipe]];
            if (/nav_access FROM user/.test(q)) return [[{ nav_access: null }]]; // peutModerer non-staff → pas de capacité
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) { captures.push({ q, p }); return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { deleteRecipe } = require('../controllers/recipe.controller.js');

async function supprimer(user, recipe) {
    scenario = { recipe }; captures = [];
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try { await deleteRecipe({ user, params: { id: 'r1' } }, res); }
    finally { console.error = avant; }
    return r;
}
const aSupprime = () => captures.some((c) => /^DELETE FROM recipe WHERE id = \? AND organization_id = \?/.test(c.q));

test('l\'AUTEUR supprime sa propre fiche', async () => {
    const r = await supprimer({ organization_id: 'org-1', id: 'u-auteur', role: 'STAGIAIRE' },
        { author_user_id: 'u-auteur', organization_id: 'org-1', name: 'Margherita' });
    assert.strictEqual(r.corps && r.corps.success, true);
    assert.ok(aSupprime(), 'la fiche doit être supprimée');
});

test('un MEMBRE qui MODÈRE supprime la fiche d\'un AUTRE (même organisme)', async () => {
    const r = await supprimer({ organization_id: 'org-1', id: 'u-admin', role: 'ADMIN_ORGANISME' },
        { author_user_id: 'u-autre', organization_id: 'org-1', name: 'Napolitaine' });
    assert.strictEqual(r.corps && r.corps.success, true);
    assert.ok(aSupprime(), 'la modération supprime la fiche de l\'auteur');
});

test('un stagiaire LAMBDA ne supprime PAS la fiche d\'un autre (403)', async () => {
    const r = await supprimer({ organization_id: 'org-1', id: 'u-rando', role: 'STAGIAIRE' },
        { author_user_id: 'u-autre', organization_id: 'org-1', name: 'Reine' });
    assert.strictEqual(r.code, 403);
    assert.ok(!aSupprime(), 'rien ne doit être supprimé');
});

test('la modération ne touche JAMAIS la fiche d\'un AUTRE organisme (403)', async () => {
    const r = await supprimer({ organization_id: 'org-1', id: 'u-admin', role: 'ADMIN_ORGANISME' },
        { author_user_id: 'u-autre', organization_id: 'org-2', name: 'Fiche d\'ailleurs' });
    assert.strictEqual(r.code, 403);
    assert.ok(!aSupprime(), 'une fiche d\'une autre école est hors de portée');
});
