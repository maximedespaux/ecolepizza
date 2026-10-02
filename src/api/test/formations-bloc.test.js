/**
 * LE BLOC {#Formations}…{/Formations} — un devis « une ligne par formation » (demandé le 2026-10-03).
 *
 * LE DÉFAUT. Un dossier peut couvrir PLUSIEURS formations (NIV1 + NIV2, demandé pour l'entreprise
 * Gervais Christelle). Les jetons {Formation}, {Prix}, {Heures} les AGRÈGENT — intitulés joints,
 * somme des prix, somme des heures (resolveTokens, `joinTitles`/`totalPrice`/`sumHours`). Un devis
 * professionnel ne pouvait donc PAS détailler « NIV1 850 €, NIV2 1 180 €, Total 2 030 € » : il
 * imprimait une seule ligne « Pizzaïolo niveau 1, Pizzaïolo niveau 2 » au prix total.
 *
 * LA CORRECTION. Un bloc répété, sur le modèle de {#Articles}/{#Stagiaires} : `formationRowTokens`
 * donne les valeurs de CHAQUE formation, `expandListBlocks(out, 'Formations', ctx.formations, …)`
 * (htmlfill.js) répète la ligne. Hors du bloc — la ligne « Total » — les mêmes jetons gardent leur
 * sens agrégé : la somme des lignes tombe au centime sur le {Prix} global, par construction (le
 * prix d'une ligne est `enroll_price || price`, la base même que `totalPrice` additionne).
 *
 * Réintroduire le défaut : retirer la ligne `expandListBlocks(… 'Formations' …)` de htmlfill.js,
 * ou faire lire à `formationRowTokens` le tarif catalogue au lieu du prix négocié, fait rougir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { fillHtml } = require('../lib/htmlfill.js');
const { formationRowTokens, findMissingTokens } = require('../lib/tokens.js');

// `euro` sépare les milliers par une espace insécable fine : on normalise pour comparer la VALEUR.
const eur = (s) => String(s).replace(/\s/g, ' ');

const CTX = {
    org: { name: 'École Pizza', vat_rate: 0 },
    learner: { civility: 'Mme', first_name: 'Christelle', last_name: 'GERVAIS' },
    formations: [
        { title: 'Pizzaïolo niveau 1', code: 'NIV1PRO', hours: 35, days: 5, enroll_price: 850,
          price: 900, start_date: '2026-05-18', end_date: '2026-05-22', week: 21, year: 2026 },
        { title: 'Pizzaïolo niveau 2', code: 'NIV2', hours: 21, days: 3, enroll_price: 1180,
          price: 1180, start_date: '2026-06-01', end_date: '2026-06-03', week: 23, year: 2026 },
    ],
};

/* La ligne répétée (entre les marqueurs) + une ligne « Total » HORS marqueurs, comme BLOC_FORMATIONS. */
const pill = (key) => `<span data-token="${key}">${key}</span>`;
const TABLEAU = '<table><tbody>'
    + `<tr><td>{#Formations}${pill('Formation')}</td><td>${pill('Heures')}</td><td>${pill('Prix')}{/Formations}</td></tr>`
    + `<tr><td>Total</td><td>${pill('Heures')}</td><td>${pill('Prix')}</td></tr>`
    + '</tbody></table>';

test('formationRowTokens : les valeurs de LA formation, prix négocié d\'abord, coût horaire au centime', () => {
    const r = formationRowTokens(CTX.formations[0], 0);
    assert.strictEqual(r['N°'], '1');
    assert.strictEqual(r.Formation, 'Pizzaïolo niveau 1');
    assert.strictEqual(r.Code, 'NIV1PRO');
    assert.strictEqual(r.Heures, '35');
    assert.strictEqual(r.Jours, '5');
    assert.strictEqual(eur(r.Prix), '850 €', 'enroll_price (850) et non le tarif catalogue (900)');
    assert.strictEqual(eur(r['Coût horaire']), '24,29 €', '850 ÷ 35, arrondi au centime');
    assert.strictEqual(r.Jour1, '18/05/2026');
    assert.strictEqual(r.Semaine, 'Semaine 21 — 2026');
    // À défaut de prix négocié, le tarif catalogue ; sans ni l'un ni l'autre, vide (pas « 0 € »).
    assert.strictEqual(eur(formationRowTokens({ price: 500 }, 0).Prix), '500 €');
    assert.strictEqual(formationRowTokens({}, 0).Prix, '');
});

test('LE RENDU : une ligne par formation, puis un TOTAL qui reste sur la somme', () => {
    const out = eur(fillHtml(TABLEAU, CTX));
    // Deux lignes détaillées.
    assert.ok(out.includes('Pizzaïolo niveau 1') && out.includes('850 €'), 'NIV1 détaillée');
    assert.ok(out.includes('Pizzaïolo niveau 2') && out.includes('1 180 €'), 'NIV2 détaillée');
    // La ligne « Total » : hors des marqueurs, {Heures}/{Prix} restent agrégés (35+21, 850+1180).
    // (LibreOffice injecte un style sur chaque <td> — d'où le `[^>]*`.)
    assert.ok(/>Total<\/td><td[^>]*>56<\/td><td[^>]*>2 030 €<\/td>/.test(out), `total agrégé attendu, obtenu : ${out}`);
    // La somme des lignes tombe au centime sur le total (pas de dérive).
    assert.strictEqual((out.match(/850 €/g) || []).length, 1);
    assert.strictEqual((out.match(/1 180 €/g) || []).length, 1);
});

test('FORME TEXTE (un <br> par formation), comme le bloc stagiaires', () => {
    const txt = '<p>{#Formations}' + pill('Formation') + ' — ' + pill('Prix') + '<br>{/Formations}Total : ' + pill('Prix') + '</p>';
    const out = eur(fillHtml(txt, CTX));
    assert.ok(out.includes('Pizzaïolo niveau 1 — 850 €<br>Pizzaïolo niveau 2 — 1 180 €<br>Total : 2 030 €'),
        `obtenu : ${out}`);
});

test('UNE SEULE formation : une ligne, et le total lui est égal', () => {
    const out = eur(fillHtml(TABLEAU, { ...CTX, formations: [CTX.formations[0]] }));
    assert.strictEqual((out.match(/850 €/g) || []).length, 2, 'la ligne et le total');
    assert.ok(!out.includes('Pizzaïolo niveau 2'));
});

test('findMissingTokens IGNORE les jetons DANS le bloc (résolus par formation, pas globalement)', () => {
    // Contexte SANS formation : hors d'un bloc, {Formation} serait « manquant »…
    const vide = { org: {}, learner: {}, formations: [] };
    const bareFlagged = findMissingTokens('<p>{Formation}</p>', vide).map((m) => m.key);
    assert.ok(bareFlagged.includes('Formation'), 'hors bloc et sans formation : bien signalé manquant');
    // … mais DANS le bloc, il ne doit pas l'être : la ligne est répétée par formation.
    const dansBloc = findMissingTokens('<p>{#Formations}{Formation} {Coût horaire}{/Formations}</p>', vide);
    assert.deepStrictEqual(dansBloc, [], 'aucun jeton du bloc n\'est réclamé');
});

/* ── Le câblage, lu au source (contrats) ─────────────────────────────────────────────────────── */
const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(f, 'utf8');

test('htmlfill développe bien la liste « Formations » depuis ctx.formations', () => {
    const h = lire(path.join(API, 'lib/htmlfill.js'));
    assert.match(h, /expandListBlocks\(out, 'Formations', ctx\.formations, formationRowTokens\)/);
});

test('L\'ÉDITEUR propose le bloc et ses jetons par formation', () => {
    const e = lire(path.join(UI, 'pages/TemplateEditor.jsx'));
    assert.match(e, /const BLOC_FORMATIONS =/);
    assert.match(e, /\{#Formations\}/, 'le marqueur ouvrant est dans la trame');
    assert.match(e, /const FORMATION_ROW_TOKENS =/);
    assert.match(e, /insertRaw\(BLOC_FORMATIONS\)/, 'un bouton insère la trame');
    assert.match(e, /g\.group === "Formation" &&/, 'la section est rattachée au groupe Formation');
    assert.match(e, /descParFormation/);
});
