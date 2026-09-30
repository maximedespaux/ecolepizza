/**
 * LE PANNEAU DE RÉSULTAT FAIT LA HAUTEUR DE L'ÉCRAN, ET SES BOUTONS RESTENT VISIBLES — demandé par
 * l'école le 2026-09-30 : « une fois la fiche faite, la carte de droite prend toujours toute la
 * hauteur de l'écran sur ordinateur ; et pareil pour l'empâtement, où elle débordait, coupée en bas ».
 *
 * LE DÉFAUT : le panneau (bleu nuit) défilait pour lui-même quand son contenu dépassait l'écran —
 * or « Enregistrer », « Partager » et « Imprimer » vivent EN BAS du panneau. Sur un empâtement, le
 * résultat est long : les boutons partaient donc hors de vue, et on ne pouvait plus enregistrer sans
 * faire défiler la carte jusqu'au fond.
 *
 * CE QUI EST GARDÉ ICI (mode deux colonnes, sur ordinateur) :
 *   · le panneau fait EXACTEMENT la hauteur de l'écran (`height:calc(100vh - 88px)`), ni plus haut
 *     (coupé) ni plus court ;
 *   · ce n'est plus LUI qui défile : c'est son CORPS (`fe-panel-corps`, `flex:1` + `overflow-y:auto`)
 *     qui défile à l'intérieur, tandis que les boutons (`fe-actions`, `flex:none`) restent posés
 *     dessous, toujours visibles ;
 *   · les trois panneaux (empâtement, préparation, réalisation) suivent la même charpente.
 * En une colonne (écran étroit), tout se relâche : le panneau reprend sa hauteur naturelle, le corps
 * ne défile plus, et le dock (plus bas) porte le chiffre clé et « Enregistrer ».
 *
 * Le défaut se regèle en remettant l'ancienne `.fe-side{max-height;overflow-y:auto}` (le panneau
 * entier défile) ou en glissant `{actions}` DANS `fe-panel-corps` (les boutons repartent avec le
 * défilement) : l'une comme l'autre rougit ici.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const page = fs.readFileSync(path.join(UI, 'pages', 'FicheRecette.jsx'), 'utf8');
const css = fs.readFileSync(path.join(UI, 'styles', 'app.css'), 'utf8');

test('LES BOUTONS SONT HORS DU CORPS QUI DÉFILE : un corps par panneau, {actions} posé dessous', () => {
    // Trois panneaux (empâtement, préparation, réalisation), trois corps : aucun panneau oublié.
    assert.strictEqual((page.match(/card dough-result fe-panel/g) || []).length, 3, 'trois panneaux de résultat');
    assert.strictEqual((page.match(/fe-panel-corps/g) || []).length, 3, 'un corps qui défile par panneau');
    // Dans CHAQUE panneau, le corps se FERME avant {actions} : les boutons sont un frère posé
    // dessous, pas un enfant qui défile avec le contenu.
    assert.strictEqual((page.match(/<\/div>\n {6}\{actions\}/g) || []).length, 3,
        '{actions} suit la fermeture du corps, dans les trois panneaux');
});

test('LE PANNEAU FAIT LA HAUTEUR DE L\'ÉCRAN, ET C\'EST SON CORPS QUI DÉFILE (deux colonnes)', () => {
    // Le panneau colle sous la barre et occupe tout le reste : ni max-height (le panneau entier
    // défilerait), ni hauteur libre.
    assert.match(css, /\.fe-side\{position:sticky;top:76px;height:calc\(100vh - 88px\);/,
        'la colonne fait exactement la hauteur de l\'écran, sous la barre du haut');
    assert.doesNotMatch(css, /\.fe-side\{[^}]*overflow-y:auto/, 'ce n\'est plus le panneau entier qui défile');
    assert.match(css, /\.fe-side > \.fe-panel\{height:100%/, 'le panneau remplit la colonne');
    // Le corps prend la place laissée par les boutons et défile pour lui-même.
    assert.match(css, /\.fe-panel-corps\{[^}]*flex:1 1 auto;min-height:0;\n?\s*overflow-y:auto/,
        'le corps grandit puis défile (min-height:0, sinon un enfant flex ne rétrécit pas)');
    // Les boutons ne rétrécissent pas et ne défilent pas : ils restent visibles.
    assert.match(css, /\.fe-actions\{[^}]*flex:none\}/, 'les boutons restent posés, toujours visibles');
});

test('EN UNE COLONNE, tout se relâche : hauteur naturelle, plus de défilement interne, dock présent', () => {
    // La règle du conteneur étroit repasse la colonne en flux et rend sa hauteur naturelle.
    assert.match(css, /@container fe \(max-width:1099px\)\{[\s\S]*?\.fe-side\{position:static;height:auto\}/,
        'colonne en flux, hauteur naturelle');
    assert.match(css, /@container fe \(max-width:1099px\)\{\.fe-panel-corps\{flex:0 1 auto;overflow:visible\}\}/,
        'le corps ne se borne plus et ne défile plus — placé APRÈS la règle de base pour la vaincre par l\'ordre du fichier');
    // Le dock (chiffre clé + Enregistrer) prend le relais du panneau sous le pouce.
    assert.match(css, /\.fe-dock\{display:none\}/);
    assert.match(css, /@container fe \(max-width:1099px\)\{\s*\.fe-dock\{display:flex/);
});
