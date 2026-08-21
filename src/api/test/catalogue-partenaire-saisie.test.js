/**
 * LE CATALOGUE D'UN PARTENAIRE — la saisie s'ouvre à la demande, et l'on voit ce qu'on modifie.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX DÉFAUTS D'USAGE, tous deux signalés par l'école.
 *
 *  1. DOUZE CHAMPS DÉPLOYÉS EN PERMANENCE sous chaque catalogue. On ouvrait « Produits en
 *     boutique » pour LIRE la liste, et l'on tombait sur un formulaire de saisie — qui donnait à
 *     croire qu'il fallait le remplir. Sur une page de vingt-trois partenaires, déplier deux
 *     fiches suffisait à noyer l'écran.
 *
 *  2. RIEN NE DISAIT QUEL PRODUIT ÉTAIT EN COURS DE MODIFICATION. Le formulaire s'ouvre SOUS la
 *     liste : sur un catalogue de dix produits, la ligne concernée est hors du champ de vision au
 *     moment où l'on tape. On enregistrait sur le mauvais produit sans jamais s'en apercevoir —
 *     rien à l'écran ne permettait de le rattraper.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const COMP = fs.readFileSync(path.join(UI, 'components/PartnerProduits.jsx'), 'utf8');
const CODE = COMP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const CSS = fs.readFileSync(path.join(UI, 'styles/app.css'), 'utf8');

test('le formulaire est fermé tant que personne ne le demande', () => {
    assert.match(CODE, /const \[saisie, setSaisie\] = useState\(false\)/,
        'La saisie doit naître fermée.');
    assert.match(CODE, /\{saisie && \(\s*<form/,
        'Le formulaire ne doit être rendu que si on l\'a demandé.');
    assert.match(CODE, /Ajouter un produit/,
        'Et un bouton NOMMÉ doit y donner accès — un « + » seul ne dit pas ce qu\'il ajoute.');
});

test('le crayon ouvre le formulaire, sinon il paraît cassé', () => {
    /* SANS `setSaisie(true)` DANS `modifier`, le crayon ne produirait RIEN de visible : le
       formulaire resterait fermé, et l'utilisateur cliquerait deux ou trois fois en pensant que
       le bouton ne marche pas — tout en ayant bel et bien chargé la fiche dans un formulaire
       invisible. */
    const bloc = CODE.slice(CODE.indexOf('function modifier'), CODE.indexOf('function fermerSaisie'));
    assert.match(bloc, /setEdite\(p\.id\)/);
    assert.match(bloc, /setSaisie\(true\)/,
        'Modifier doit DÉPLIER la saisie, sinon le clic ne produit rien de visible.');
});

test('la ligne modifiée est repérable, et pas seulement par sa couleur', () => {
    assert.match(CODE, /className=\{"pp-ligne" \+ \(edite === p\.id \? " en-edition" : ""\)\}/,
        'La ligne en cours de modification doit se distinguer.');
    /* WCAG 1.4.1 : la couleur ne porte jamais seule l'information. Trois autres marqueurs la
       doublent — `aria-current` pour les lecteurs d'écran, une barre à gauche, et le titre du
       formulaire qui NOMME le produit. */
    assert.match(CODE, /aria-current=\{edite === p\.id \? "true" : undefined\}/,
        'Un lecteur d\'écran doit savoir quelle ligne est active.');
    assert.match(CODE, /Modifier « \$\{form\.name \|\| "sans nom"\}/,
        'Le formulaire doit NOMMER ce qu\'il modifie : la ligne surlignée est souvent hors écran.');
    assert.match(CSS, /\.pp-ligne\.en-edition\{[^}]*border-left-color/,
        'Une barre latérale double la teinte de fond.');
});

test('après un AJOUT la saisie reste ouverte, après une MODIFICATION elle se ferme', () => {
    /* On saisit rarement un seul produit : refermer après chaque ajout obligerait à recliquer
       entre chaque ligne d'un catalogue. À l'inverse, garder la saisie ouverte après une
       modification laisserait une ligne surlignée sans qu'on sache si l'enregistrement a eu
       lieu — l'écran dirait « en cours » pour un travail terminé. */
    const bloc = CODE.slice(CODE.indexOf('async function enregistrer'), CODE.indexOf('async function basculer'));
    assert.match(bloc, /if \(edite\) \{ setEdite\(null\); setForm\(VIDE\); setSaisie\(false\); \}\s*else setForm\(VIDE\);/,
        'Les deux cas doivent être traités différemment, et explicitement.');
});

test('« Annuler » referme la saisie, même sans modification en cours', () => {
    /* Il n'apparaissait qu'en modification. Depuis que le formulaire s'ouvre à la demande, il faut
       aussi pouvoir le refermer sans rien saisir — sinon on rouvre la fiche du partenaire pour
       s'en débarrasser. */
    assert.doesNotMatch(CODE, /\{edite && \(\s*<button type="button" className="btn sm ghost"/,
        'Annuler ne doit plus dépendre d\'une modification en cours.');
    assert.match(CODE, /onClick=\{fermerSaisie\}>Annuler/);
    const bloc = CODE.slice(CODE.indexOf('function fermerSaisie'), CODE.indexOf('function fermerSaisie') + 140);
    for (const attendu of ['setEdite(null)', 'setForm(VIDE)', 'setSaisie(false)']) {
        assert.ok(bloc.includes(attendu), `fermerSaisie doit appeler ${attendu}`);
    }
});
