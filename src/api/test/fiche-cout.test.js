/**
 * LE COÛT D'UNE FICHE TECHNIQUE — un seul calcul pour l'éditeur, l'impression, la Communauté et
 * le serveur (2026-09-29, refonte de l'éditeur des fiches techniques).
 *
 * Trois défauts relevés en refaisant l'éditeur. Tous donnaient des chiffres FAUX mais
 * plausibles — le pire genre : rien à l'écran ne signalait l'erreur.
 *
 *  1. LA PÂTE COMPTÉE DEUX FOIS. Une réalisation portait une carte « Empâtement » (pâton + prix de
 *     la farine) ET pouvait importer une fiche Empâtement comme ingrédient : les deux
 *     s'additionnaient. Relevé sur une Reine : 2,56 € de matière au lieu de 2,38 €.
 *  2. LE COÛT AU KG D'UNE GARNITURE AVAIT DEUX VALEURS. L'éditeur et l'import divisaient par un
 *     rendement de 1 000 g posé par défaut, l'impression par le poids des ingrédients : 8,40 €/kg
 *     d'un côté, 3,28 €/kg de l'autre, pour la même sauce — et c'est le premier qui entrait dans
 *     les pizzas.
 *  3. UNE PIÈCE PESAIT UN KILO à l'impression : « 1 pâton » s'ajoutait au poids total comme 1 kg.
 *
 * Et un quatrième, trouvé en chemin : `dough_params` (procédure, cuisson, réglages de pâte) était
 * COUPÉ à 2 000 caractères. Un JSON coupé n'est plus du JSON : la colonne le refuse, et la fiche
 * entière ne s'enregistrait plus. Huit étapes détaillées suffisaient.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (base, f) => fs.readFileSync(path.join(base, f), 'utf8');
const ecran = () => import('../../app/ui/lib/coutFiche.js');
const serveur = require('../lib/coutFiche.js');
const pres = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

// La Reine du relevé : empâtement importé (0,19 € le pâton de 250 g), sauce, fromage, jambon.
const reine = () => ({
    kind: 'RECETTE', paton_g: 250, flour_price: 1.2, margin_pct: 70, servings: 6,
    ingredients: [
        { label: 'Pâte napolitaine 24 h', unit: 'piece', qty: 1, unit_price: 0.19, component_recipe_id: 'p1', component_kind: 'PATE', piece_g: 250 },
        { label: 'Sauce tomate', unit: 'g', qty: 80, unit_price: 4, component_recipe_id: 's1', component_kind: 'PREPARATION' },
        { label: 'Mozzarella', unit: 'g', qty: 130, unit_price: 6.7 },
        { label: 'Jambon', unit: 'g', qty: 60, unit_price: 12.4 },
    ],
});
const sauce = (yieldQty = '') => ({
    kind: 'PREPARATION', yield_qty: yieldQty, yield_unit: 'g', ingredients: [
        { label: 'Tomates pelées', unit: 'g', qty: 2500, unit_price: 3.2 },
        { label: 'Sel', unit: 'g', qty: 25, unit_price: 0.5 },
        { label: 'Huile', unit: 'g', qty: 40, unit_price: 9.8 },
    ],
});

test('une réalisation qui importe son empâtement ne recompte pas la pâte', async () => {
    const { coutFiche } = await ecran();
    const c = coutFiche(reine());
    // 0,19 + 0,32 + 0,871 + 0,744 : rien de plus.
    assert.ok(pres(c.total, 2.125), `coût matière attendu 2,125 €, obtenu ${c.total}`);
    assert.ok(!c.lignes.some((l) => l.estimee), 'pas de « Pâte (estimation) » quand un empâtement est importé');
    assert.ok(pres(c.prix, 2.125 * 1.7), 'le prix conseillé suit le coût juste');
});

test('sans empâtement importé, la pâte estimée compte — une fois, en tête de la composition', async () => {
    const { coutFiche, RATIO_PATE_ESTIMEE } = await ecran();
    const r = reine();
    r.ingredients = r.ingredients.slice(1);
    const c = coutFiche(r);
    const pate = (250 / 1000) * (1.2 / RATIO_PATE_ESTIMEE);
    assert.ok(c.lignes[0].estimee, 'la pâte estimée est la première ligne');
    assert.equal(c.lignes.filter((l) => l.estimee).length, 1);
    assert.ok(pres(c.lignes[0].cout, pate));
    assert.ok(pres(c.total, pate + 0.32 + 0.871 + 0.744));
});

test('« ne compter aucune pâte » tient, y compris relu depuis dough_params (Communauté)', async () => {
    const { coutFiche } = await ecran();
    const r = reine();
    r.ingredients = r.ingredients.slice(1);
    assert.ok(!coutFiche({ ...r, pate: 'aucune' }).lignes.some((l) => l.estimee));
    /* La Communauté lit la fiche BRUTE du serveur : la réponse n'y existe que dans dough_params,
       en chaîne JSON. L'oublier, c'était lui refaire compter la pâte. */
    assert.ok(!coutFiche({ ...r, dough_params: JSON.stringify({ pate: 'aucune' }) }).lignes.some((l) => l.estimee));
});

test('une garniture : coût au kg du rendement déclaré, sinon du poids des ingrédients', async () => {
    const { coutFiche } = await ecran();
    const sans = coutFiche(sauce());
    assert.ok(pres(sans.total, 8.4045, 0.0001));
    assert.equal(sans.prep.source, 'poids');
    assert.ok(pres(sans.coutKg, 8.4045 / 2.565), `sans rendement : ≈ 3,28 €/kg attendu, obtenu ${sans.coutKg}`);
    const avec = coutFiche(sauce(2100));
    assert.equal(avec.prep.source, 'rendement');
    assert.ok(pres(avec.coutKg, 8.4045 / 2.1), `rendement 2 100 g : ≈ 4,00 €/kg attendu, obtenu ${avec.coutKg}`);
    assert.ok(pres(avec.perte, (2100 - 2565) / 2565, 0.0001), 'la perte à la préparation se lit');
});

test('l\'écran et le serveur chiffrent une garniture exactement de la même façon', async () => {
    /* C'est le prix du SERVEUR qu'une réalisation importe : s'il divergeait de celui de l'écran,
       la garniture afficherait un coût et en ferait payer un autre aux pizzas. */
    const { prixUnitairePreparation } = await ecran();
    const cas = [
        [8.4, 2565, '', 'g'], [8.4, 2565, 2100, 'g'], [8.4, 2565, 2.1, 'kg'], [8.4, 2565, 1500, 'ml'],
        [8.4, 2565, 1.5, 'l'], [8.4, 2565, 12, 'piece'], [3, 0, '', 'g'], [3, 0, null, null], [0, 0, 0, 'g'],
    ];
    for (const [total, poids, y, u] of cas) {
        assert.deepStrictEqual(prixUnitairePreparation(total, poids, y, u), serveur.prixUnitairePreparation(total, poids, y, u),
            `l'écran et le serveur divergent pour ${JSON.stringify([total, poids, y, u])}`);
    }
});

test('le serveur importe une garniture à la règle commune, et n\'en garde pas d\'autre', () => {
    const ctrl = lire(API, 'controllers/recipe.controller.js');
    const corps = /async function ficheUnitCost\(conn, r\) \{[\s\S]*?\n\}/.exec(ctrl)[0];
    assert.match(corps, /prixUnitairePreparation\(ingCost, poidsIngredients\(ings\), r\.yield_qty, r\.yield_unit\)/);
    assert.doesNotMatch(ctrl, /const MASS_VOL/, 'une seule table des unités : lib/coutFiche.js');
    assert.equal(serveur.poidsIngredients([{ unit: 'g', qty: 80 }, { unit: 'piece', qty: 2 }]), 80,
        'une pièce ne pèse rien pour le serveur, faute de poids connu');
});

test('une pièce ne pèse que si l\'on connaît son poids', async () => {
    const { poidsLigne, coutFiche } = await ecran();
    assert.equal(poidsLigne({ unit: 'piece', qty: 1 }), null, '1 pièce sans poids connu ne pèse pas 1 kg');
    assert.equal(poidsLigne({ unit: 'piece', qty: 2, piece_g: 250 }), 500);
    assert.equal(coutFiche(reine()).poids, 250 + 80 + 130 + 60, 'le pâton importé pèse son pâton');
    const burrata = coutFiche({ kind: 'RECETTE', pate: 'aucune', ingredients: [
        { label: 'Burrata', unit: 'piece', qty: 1, unit_price: 2 }, { label: 'Tomate', unit: 'g', qty: 100, unit_price: 3 }] });
    assert.equal(burrata.poids, 100);
    assert.equal(burrata.poidsIncomplet, true, 'le total dit qu\'il est « hors pièces »');
});

test('l\'impression et la Communauté passent par le même calcul que l\'éditeur', () => {
    const print = lire(UI, 'components/FichePrint.jsx');
    assert.match(print, /const cf = coutFiche\(r\);/);
    assert.doesNotMatch(print, /coutKg: poidsTotal \? coutTotal \/ poidsTotal/, 'la feuille divisait par le poids des ingrédients');
    const comm = lire(UI, 'pages/Communaute.jsx');
    assert.match(comm, /function costs\(d\) \{\n  const c = coutFiche\(d\);/);
    assert.doesNotMatch(comm, /const per = dough \+ topping/, 'la pâte estimée s\'ajoutait à toute fiche');
});

test('une nouvelle garniture naît sans rendement (il valait 1 000 g, que personne n\'ajustait)', () => {
    assert.match(lire(UI, 'pages/FicheRecette.jsx'), /yield_qty: "", yield_unit: "g"/);
});

test('dough_params n\'est jamais tronqué : au-delà de la borne, l\'enregistrement est refusé', () => {
    const ctrl = lire(API, 'controllers/recipe.controller.js');
    assert.doesNotMatch(ctrl, /JSON\.stringify\(b\.dough_params\)\.slice\(/, 'un JSON coupé n\'est plus du JSON');
    for (const f of ['createRecipe', 'updateRecipe']) {
        const corps = new RegExp(`const ${f} = async \\(req, res\\) => \\{[\\s\\S]*?\\n\\};`).exec(ctrl)[0];
        assert.match(corps, /if \(r\.dough_params && r\.dough_params\.length > DP_MAX\) return res\.status\(422\)/,
            `${f} refuse au-delà de DP_MAX, avant toute écriture`);
    }
});

test('le prix actuel d\'une fiche importée ne sort que pour qui peut l\'ouvrir', () => {
    /* L'éditeur remet à jour le coût des fiches importées (une ligne importée gardait le prix du
       jour de l'import). Le TYPE sort toujours — sans lui, la Communauté recompterait la pâte
       d'une réalisation dont l'empâtement est privé — mais le PRIX, seulement pour une fiche
       qu'on peut ouvrir, et jamais pour une fiche d'un autre organisme. */
    const ctrl = lire(API, 'controllers/recipe.controller.js');
    const corps = /async function decrireFichesImportees[\s\S]*?\n\}/.exec(ctrl)[0];
    assert.match(corps, /WHERE id IN \(\?\) AND organization_id = \?/);
    assert.match(corps, /const lisible = f\.author_user_id === user\.id \|\| f\.visibility === 'SHARED';/);
    assert.match(corps, /if \(lisible\) \{ const c = await ficheUnitCost/);
});

test('« Utilisée dans » ne nomme que les réalisations de l\'auteur de la fiche', () => {
    /* Une fiche partagée peut être importée par tous les stagiaires : lister leurs réalisations
       (privées) à son auteur les lui ferait connaître. */
    const ctrl = lire(API, 'controllers/recipe.controller.js');
    assert.match(ctrl, /WHERE i\.component_recipe_id = \? AND p\.author_user_id = \?/);
    assert.match(ctrl, /if \(mine && \(r\.kind === 'PATE' \|\| r\.kind === 'PREPARATION'\)\)/);
});

test('la part d\'une ligne ne s\'affiche jamais « 0 % » quand elle coûte, et la phrase dit où part l\'argent', async () => {
    const { pctPart, phraseCout, coutFiche } = await ecran();
    assert.equal(pctPart(0.004), '< 1 %');
    assert.equal(pctPart(0.37), '37 %');
    assert.equal(pctPart(0), '0 %');
    const phrase = phraseCout(coutFiche(reine()).lignes);
    assert.match(phrase, /Mozzarella.*Jambon.*font 76 % du coût matière/);
    assert.equal(phraseCout(coutFiche(sauce()).lignes).includes('Tomates pelées'), true);
    assert.equal(phraseCout([]), null, 'rien à dire sur une fiche vide');
});

test('sur téléphone, une ligne de la composition devient une carte où le nom a la place', () => {
    /* Le nom tombait à 24 px de large et la ligne débordait de sa carte : six colonnes dans un
       écran de 390 px. La composition se replie selon SA largeur (requête de conteneur), pas
       celle de l'écran — le menu du bureau lui prend déjà 258 px sur un ordinateur. */
    const css = lire(UI, 'styles/app.css');
    const bloc = /@container compo \(max-width:660px\)\{[\s\S]*?\n\}/.exec(css);
    assert.ok(bloc, 'la composition se replie en cartes');
    assert.match(bloc[0], /\.fe-ing\{display:flex;flex-wrap:wrap/);
    assert.match(bloc[0], /\.fe-ing-nom\{order:1;flex:1 1 calc\(100% - 110px\)\}/, 'le nom prend la première rangée');
});
