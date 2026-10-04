/**
 * « DATE DU JOUR » FIGÉE À L'ÉMISSION DU DOCUMENT (demandé le 2026-10-04, « URGENT »).
 *
 * Le jeton {Date} / {Today} (« Date du jour ») se résolvait avec `new Date()` à CHAQUE rendu. Un
 * devis envoyé en mai, rouvert dans les archives en octobre, s'imprimait donc daté d'octobre : une
 * pièce émise se redatait toute seule, tous les jours. Une pièce ÉMISE ne doit plus bouger.
 *
 * La date est désormais FIGÉE à l'émission : `loadContext` (document.controller) lit `sent_at` (la
 * date d'envoi), à défaut `signed_at`, et pose `ctx.figeLe` ; `resolveTokens` s'en sert pour {Date}
 * et {Today} au lieu de `new Date()`. Un brouillon pas encore émis (ni envoi ni signature) garde la
 * date vivante — il est encore en travail.
 *
 * Réintroduire le défaut (`const today = frDate(new Date())` sans `ctx.figeLe`, ou cesser de poser
 * `figeLe` dans loadContext) fait rougir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resolveTokens, frDate } = require('../lib/tokens.js');

const base = { org: {}, learner: {}, company: {}, formations: [] };

test('{Date} et {Today} prennent la date FIGÉE, pas celle du jour', () => {
    // Un envoi daté du 18/05/2026 (Date locale, pour ne pas dépendre du fuseau au formatage).
    const emis = new Date(2026, 4, 18, 10, 0, 0);
    const v = resolveTokens({ ...base, figeLe: emis });
    assert.strictEqual(v.Date, '18/05/2026');
    assert.strictEqual(v.Today, '18/05/2026');
    // Et surtout : ce n'est PAS la date du jour (le défaut qu'on corrige).
    assert.notStrictEqual(v.Date, frDate(new Date()), 'la date émise ne doit pas suivre le jour');
});

test('sans date figée (brouillon, aperçu, facture), la date reste vivante', () => {
    const v = resolveTokens({ ...base });
    assert.strictEqual(v.Date, frDate(new Date()));
    assert.strictEqual(v.Today, frDate(new Date()));
});

test('une date figée fournie en CHAÎNE (datetime MySQL) est honorée', () => {
    // mysql2 rend d'ordinaire un DATETIME en objet Date ; on tolère aussi la chaîne.
    const v = resolveTokens({ ...base, figeLe: '2026-05-18 10:00:00' });
    assert.strictEqual(v.Date, '18/05/2026');
});

/* LE CÂBLAGE DU CONTRÔLEUR, lu au source (comme les autres tests de ce dépôt) : la date figée vient
   de l'envoi, à défaut de la signature, et traverse le contexte jusqu'au rendu. */
test('loadContext lit sent_at / signed_at et pose ctx.figeLe', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
    assert.match(src, /SELECT org_signature_data, template_slug, type, sent_at, signed_at FROM generated_document/,
        'le document est lu avec ses dates d\'émission');
    assert.match(src, /figeLe = gd\.sent_at \|\| gd\.signed_at \|\| null/,
        'la date figée = envoi, à défaut signature');
    assert.match(src, /saisies, figeLe \}/, 'figeLe est rendu dans le contexte');
});

test('resolveTokens s\'appuie sur ctx.figeLe pour la date du jour', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'tokens.js'), 'utf8');
    assert.match(src, /const today = frDate\(ctx\.figeLe \|\| new Date\(\)\)/);
});
