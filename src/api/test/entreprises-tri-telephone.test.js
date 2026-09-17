/**
 * ENTREPRISES : LE TRI EXISTE AUSSI SUR TÉLÉPHONE.
 *
 * LE DÉFAUT, relevé le 2026-09-17 pendant la tournée à 375 px. Sous 700 px de large, `DataTable`
 * range ses lignes en cartes et retire l'en-tête — et les deux boutons de tri de la page vivent
 * DANS l'en-tête (« Entreprise ↑ », « Date de création ↕ »). Sur téléphone, on ne pouvait donc plus
 * trier du tout : quatre cent soixante et onze entreprises, dans le seul ordre alphabétique.
 *
 * LE MÊME ÉCRAN EN CACHAIT UN SECOND : l'intitulé de carte se lit dans un attribut, et l'en-tête
 * de la date est un BOUTON — un élément React, rendu « [object Object] » devant chaque date de
 * création. Et une fois réparé, l'intitulé héritait du `nowrap` de la cellule et débordait sur sa
 * valeur : « DATE DE CRÉATION09/01/2015 ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');
const PAGE = lire('pages/Entreprises.jsx');
const CSS = lire('styles/app.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** Le contenu d'un bloc `@container (max-width: N)`, accolades imbriquées comprises. */
function blocsConteneur(css) {
    const blocs = [];
    const re = /@container\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{/g;
    let m;
    while ((m = re.exec(css))) {
        let p = 1, i = re.lastIndex;
        while (i < css.length && p) { if (css[i] === '{') p++; else if (css[i] === '}') p--; i++; }
        blocs.push({ largeur: Number(m[1]), corps: css.slice(re.lastIndex, i - 1) });
    }
    return blocs;
}

test('le choix couvre chaque colonne triable, dans les deux sens, et pilote le même état', () => {
    const colonnes = [...PAGE.matchAll(/enTete\("([a-z_]+)"/g)].map((m) => m[1]).filter((c, i, t) => t.indexOf(c) === i).sort();
    assert.deepStrictEqual(colonnes, ['date_creation', 'name']);
    const valeurs = [...PAGE.matchAll(/<option value="([a-z_]+):(-?1)">/g)].map((m) => `${m[1]}:${m[2]}`).sort();
    assert.deepStrictEqual(valeurs, colonnes.flatMap((c) => [`${c}:-1`, `${c}:1`]).sort(),
        'une option par colonne triable ET par sens — sinon un ordre de l\'ordinateur n\'a pas d\'équivalent');
    // Le même `tri` que les boutons d'en-tête : on passe du téléphone à l'ordinateur sans perdre l'ordre.
    assert.match(PAGE, /value=\{`\$\{tri\.col\}:\$\{tri\.sens\}`\}/);
    // `sens` redevient un NOMBRE : « -1 » en chaîne multiplierait la comparaison par NaN.
    assert.match(PAGE, /setTri\(\{ col, sens: Number\(sens\) \}\)/);
});

test('il apparaît exactement quand l\'en-tête disparaît', () => {
    /* Même bloc `@container` que la règle qui retire l'en-tête : une media query les désaccorderait
       (tableau en cartes dans une colonne étroite d'un grand écran, sans moyen de trier). */
    const carte = blocsConteneur(CSS).find((b) => /\.dt thead\{position:absolute/.test(b.corps));
    assert.ok(carte, 'le bloc de la bascule en cartes');
    assert.match(carte.corps, /\.dt-tri-choix\{display:flex/);
    assert.match(CSS, /\.dt-tri-zone\{container-type:inline-size\}/, 'la zone est un conteneur, aussi large que le tableau');
    assert.match(CSS, /\.dt-tri-choix\{display:none\}/, 'caché en mode tableau, où les en-têtes trient');
    // Le choix et le tableau partagent la zone — sinon la requête de conteneur ne le concernerait pas.
    const zone = PAGE.indexOf('<div className="dt-tri-zone">');
    assert.ok(zone > -1 && zone < PAGE.indexOf('<label className="dt-tri-choix">') && PAGE.indexOf('<label className="dt-tri-choix">') < PAGE.indexOf('<DataTable'));
});

test('une carte n\'affiche jamais « [object Object] » en guise d\'intitulé', () => {
    const table = lire('components/DataTable.jsx');
    assert.match(table, /const intituleDe = \(c\) => \(c\.intitule \?\? \(typeof c\.t === "string" \? c\.t : null\)\) \|\| undefined;/);
    // Corps ET ligne de totaux : la ligne de totaux gardait l'ancienne forme.
    const usages = table.match(/data-intitule=\{[^}]*\}/g) || [];
    assert.deepStrictEqual(usages, ['data-intitule={intituleDe(c)}', 'data-intitule={intituleDe(c)}']);
    // Toute colonne dont l'en-tête est un bouton de tri porte son intitulé en texte.
    const colonnesBouton = PAGE.match(/\{ k: "[a-z_]+", t: enTete\([^)]*\)[^\n]*/g) || [];
    assert.strictEqual(colonnesBouton.length, 2);
    for (const c of colonnesBouton) assert.match(c, /intitule: "[^"]+"/, c);
});

test('l\'intitulé de carte passe à la ligne, même dans une cellule en nowrap', () => {
    const carte = blocsConteneur(CSS).find((b) => /\.dt thead\{position:absolute/.test(b.corps));
    const regle = /\.dt td\[data-intitule\]::before\{[^}]*\}/.exec(carte.corps);
    assert.ok(regle);
    assert.match(regle[0], /white-space:normal/);
});
