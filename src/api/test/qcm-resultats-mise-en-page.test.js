/**
 * RÉSULTATS QCM : le détail s'ouvre DANS LE CHAMP DE VISION.
 *
 * LE DÉFAUT, mesuré sur la page en production. Le détail s'affichait SOUS la liste. Avec dix-neuf
 * QCM groupés par formation, la carte de liste faisait 1419 px de haut : cliquer un QCM plaçait
 * le détail à y = 1744 pour une fenêtre de 715 px. Il fallait défiler 1129 px pour voir ce qu'on
 * venait d'ouvrir — le clic ne montrait rien.
 *
 * DEUX COLONNES au-delà d'un certain palier, une seule en dessous avec défilement automatique.
 * Ce test gèle surtout LE PALIER, parce qu'il est répété à deux endroits et que les désaccorder
 * rouvre le défaut sur une bande de largeurs, sans que rien ne le signale.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'app/ui');
const CSS = fs.readFileSync(path.join(APP, 'styles/app.css'), 'utf8');
const PAGE = fs.readFileSync(path.join(APP, 'pages/ResultatsQCM.jsx'), 'utf8');

test('la liste et le détail sont côte à côte, la liste défilant seule', () => {
    const regle = /\.qcm-split \{([^}]*)\}/.exec(CSS);
    assert.ok(regle, 'règle .qcm-split introuvable');
    assert.match(regle[1], /grid-template-columns: minmax\(300px, 380px\) 1fr/);
    /* `align-items: start` : sans lui, les deux cartes s'étirent à la hauteur de la plus haute et
       la liste se retrouve avec un grand vide sous elle. */
    assert.match(regle[1], /align-items: start/);

    const liste = /\.qcm-split > \.qcm-liste \{([^}]*)\}/.exec(CSS);
    assert.ok(liste, 'règle .qcm-liste introuvable');
    /* La liste défile DANS sa colonne : sinon une longue liste rallonge la page et repousse le
       bas du détail hors de vue — le problème qu'on corrige, déplacé d'un cran. */
    assert.match(liste[1], /overflow-y: auto/);
    // `dvh` APRÈS `vh` : sur iOS, `vh` ignore la barre d'adresse et le bas de la colonne passerait
    // sous l'écran. Même piège que la barre latérale.
    assert.ok(liste[1].indexOf('100vh') < liste[1].indexOf('100dvh'), 'le repli vh précède dvh');
});

test('LE PALIER EST LE MÊME des deux côtés — sinon le défaut revient', () => {
    /* Il est répété : une fois en CSS pour empiler, une fois en JS pour décider s'il faut ramener
       le détail dans le champ de vision. Désaccordés, il existe une bande de largeurs où la page
       s'empile SANS défiler : le clic ne montre rien, exactement comme avant. */
    const enCss = /@media \(max-width: (\d+)px\) \{\s*\.qcm-split \{ grid-template-columns: 1fr; \}/.exec(CSS);
    assert.ok(enCss, 'media query de .qcm-split introuvable');
    const enJs = /matchMedia\("\(max-width: (\d+)px\)"\)/.exec(PAGE);
    assert.ok(enJs, 'matchMedia introuvable dans la page');
    assert.strictEqual(enCss[1], enJs[1], 'le palier CSS et le palier JS doivent être identiques');
    /* Et il vaut 1220, une valeur MESURÉE et non choisie : la barre latérale prend 258 px, il faut
       1218 px de fenêtre pour que le détail atteigne 500 px. À 940 px — le palier des autres
       grilles — le détail n'en recevait que 420 : deux colonnes serrées valent moins qu'une seule
       lisible. */
    assert.strictEqual(enCss[1], '1220');
});

test('empilé, le détail est ramené dans le champ de vision', () => {
    assert.match(PAGE, /detailRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
    /* Après le rendu, pas avant : appelé dans la foulée de `setDetail`, le nœud n'existe pas
       encore et le défilement ne se produit pas. */
    assert.match(PAGE, /requestAnimationFrame\(\(\) => detailRef\.current/);
    /* Le ref est porté par un `<div>`, pas par `<Card>` : Card ne transmet pas `ref`, et le lui
       apprendre pour un seul écran toucherait un composant utilisé partout. */
    assert.match(PAGE, /<div ref=\{detailRef\}>/);
});
