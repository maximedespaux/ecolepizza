/**
 * PLUSIEURS CATÉGORIES SUR UN PRODUIT PARTENAIRE, séparées par des virgules.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SÉPARATEUR PLUTÔT QUE DES CHAMPS EN PLUS. Un four est « Four » ET « 400 °C » ET
 * « électrique » : combien de champs faudrait-il prévoir ? Trois, et le quatrième manquera. Une
 * seule ligne, des virgules, autant d'étiquettes que nécessaire — et RIEN À MIGRER, puisque la
 * colonne reste une chaîne de texte. Une valeur sans virgule ressort telle quelle : tout
 * l'existant s'affiche exactement comme avant, sans reprise de données.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI NE CHANGE PAS, ET IL FAUT QUE ÇA RESTE AINSI : la catégorie des ARTICLES DE L'ÉCOLE.
 * Elle sert de FILTRE DE RAYON (`items.filter((i) => i.category === cat)`) et de clé de
 * regroupement dans l'inventaire. La découper y ferait disparaître des articles de leur rayon
 * sans erreur ni message — un défaut silencieux sur un écran de stock.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(path.join(UI, f), 'utf8');

/* On charge la vraie fonction plutôt que d'en recopier une : un test qui réimplémente ce qu'il
   vérifie ne prouve que sa propre cohérence. */
function listeCategories(v) {
    const src = lire('lib/format.js');
    const bloc = src.slice(src.indexOf('export function listeCategories'));
    const corps = bloc.slice(0, bloc.indexOf('\n}\n') + 3).replace('export function', 'function');
    // eslint-disable-next-line no-new-func
    return new Function(`${corps}\nreturn listeCategories(${JSON.stringify(v)});`)();
}

test('le découpage ne coupe que sur la virgule', () => {
    assert.deepStrictEqual(listeCategories('Four'), ['Four'], 'une valeur simple ressort intacte');
    assert.deepStrictEqual(listeCategories('Four,400 °C'), ['Four', '400 °C']);
    assert.deepStrictEqual(listeCategories(' Four , 400 °C , Électrique '), ['Four', '400 °C', 'Électrique'],
        'les espaces autour des virgules sont mangés');
    assert.deepStrictEqual(listeCategories('Four,,400 °C'), ['Four', '400 °C'],
        'une virgule en trop ne crée pas d\'étiquette vide');
    assert.deepStrictEqual(listeCategories(''), []);
    assert.deepStrictEqual(listeCategories(null), [], 'une valeur absente ne doit pas crier');

    /* NI POINT-VIRGULE NI BARRE OBLIQUE. Les deux se glissent naturellement dans un libellé
       — « Bac 60/40 », « Coupe-pâte / Roulette » est une catégorie RÉELLE de cet annuaire — et
       les accepter comme séparateurs couperait en deux la première catégorie qui en contient. */
    assert.deepStrictEqual(listeCategories('Bac 60/40'), ['Bac 60/40']);
    assert.deepStrictEqual(listeCategories('Coupe-pâte / Roulette'), ['Coupe-pâte / Roulette']);
    assert.deepStrictEqual(listeCategories('Pelle 33 cm ; manche court'), ['Pelle 33 cm ; manche court']);
});

test("l'en-tête du partenaire n'est pas répété étiquette par étiquette", () => {
    /* LE DÉFAUT INTRODUIT PUIS CORRIGÉ : l'ancien test comparait la chaîne ENTIÈRE à la catégorie
       du partenaire. Dès qu'un produit portait « Four, 400 °C », l'égalité échouait et « Four » se
       réaffichait en doublon sous l'en-tête « Marana — FOUR ». La règle voulue n'a pas changé — ne
       pas répéter ce que dit déjà l'en-tête — mais elle porte maintenant sur CHAQUE étiquette. */
    const page = lire('pages/Boutique.jsx');
    assert.match(page,
        /listeCategories\(p\.category\)\s*\n\s*\.filter\(\(c\) => c\.toLowerCase\(\) !== String\(g\.partner_category \|\| ""\)\.toLowerCase\(\)\)/,
        'Le filtrage doit porter sur chaque étiquette, pas sur la chaîne entière.');
    assert.doesNotMatch(page, /const repete =/,
        'La comparaison de chaîne entière ne doit pas revenir : elle rate tout multi-étiquette.');
});

test('le glyphe est cherché PAR étiquette', () => {
    /* Sur la chaîne entière, `CAT_ICON["Four, 400 °C"]` ne trouve rien : une catégorie perdrait
       son dessin pour avoir gagné une précision. */
    const page = lire('pages/Boutique.jsx');
    assert.match(page, /\{CAT_ICON\[c\] \? <CatGlyph category=\{c\} size=\{13\} \/> : null\}/,
        'La recherche du glyphe doit porter sur l\'étiquette, pas sur la valeur brute.');
});

test("la catégorie des ARTICLES DE L'ÉCOLE reste indivisible", () => {
    /* Elle filtre les rayons et regroupe l'inventaire. La découper ferait disparaître des articles
       de leur rayon SANS erreur ni message : le filtre comparerait « Pelle » à « Pelle, 33 cm » et
       ne trouverait rien. */
    const page = lire('pages/Boutique.jsx');
    assert.match(page, /items\.filter\(\(i\) => i\.category === cat\)/,
        'Le filtre de rayon compare la catégorie ENTIÈRE — ne pas y introduire de découpage.');
    const inv = lire('pages/Inventaire.jsx');
    assert.doesNotMatch(inv, /listeCategories/,
        "L'inventaire groupe par catégorie : y découper les valeurs éclaterait les rayons.");
});

test("l'aperçu montre le découpage pendant la saisie", () => {
    /* Sans lui, la virgule est une convention invisible : on écrit « Four 400 °C » sans
       séparateur, on enregistre, et il faut aller ouvrir la boutique pour comprendre qu'il n'y a
       qu'une seule étiquette. */
    const comp = lire('components/PartnerProduits.jsx');
    assert.match(comp, /listeCategories\(form\.category\)\.length > 1/,
        'Le formulaire doit montrer les étiquettes dès qu\'il y en a plusieurs…');
    assert.match(comp, /Séparez par des virgules pour plusieurs étiquettes\./,
        '…et le dire tant qu\'il n\'y en a qu\'une.');
});
