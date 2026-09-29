/**
 * LE PROCÉDÉ D'UNE FICHE PARTAGÉE SE LIT DANS LA COMMUNAUTÉ (demandé par l'école le 2026-09-29).
 *
 * Le procédé du « saumon gravlax » — une préparation partagée — ne se voyait nulle part : ni sur
 * sa carte, ni dans son détail. Seule une pâte montrait son déroulé, et seulement dans le détail.
 * Or une fiche technique, c'est des quantités ET un procédé.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · `procedeDe` lit les étapes ÉCRITES d'une préparation ou d'une réalisation — dough_params
 *     objet OU chaîne JSON, telle que l'API la rend —, le déroulé GÉNÉRÉ d'une pâte, et la
 *     cuisson d'une réalisation ;
 *   · la carte le montre REPLIÉ (« Procédé › »), HORS du corps cliquable : l'ouvrir ne doit pas
 *     ouvrir la fiche ;
 *   · le détail montre le même, pour toutes les fiches — la pâte n'a plus son bloc à part.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const procede = () => import('../../app/ui/lib/procede.js');
const COMM = fs.readFileSync(path.join(UI, 'pages/Communaute.jsx'), 'utf8');

test('le procédé d\'une préparation : les étapes que l\'auteur a écrites', async () => {
    const { procedeDe } = await procede();
    const gravlax = { kind: 'PREPARATION', dough_params: JSON.stringify({ steps: ['Mélanger sel, sucre et aneth.', '  ', 'Couvrir le saumon, 48 h au froid.', 'Rincer, sécher, trancher fin.'] }) };
    const p = procedeDe(gravlax);
    assert.deepStrictEqual(p.etapes.map((e) => e.texte), ['Mélanger sel, sucre et aneth.', 'Couvrir le saumon, 48 h au froid.', 'Rincer, sécher, trancher fin.'],
        'dough_params en chaîne JSON, comme l\'API le rend ; les étapes vides ne comptent pas');
    assert.equal(p.cuisson, null, 'une préparation n\'a pas de cuisson à dire');
    assert.deepStrictEqual(procedeDe({ kind: 'PREPARATION', dough_params: { steps: [] } }).etapes, [], 'rien à montrer : rien d\'affiché');
    assert.deepStrictEqual(procedeDe({ kind: 'PREPARATION', dough_params: null }).etapes, []);
});

test('le procédé d\'une réalisation, et sa cuisson en une ligne', async () => {
    const { procedeDe } = await procede();
    const p = procedeDe({ kind: 'RECETTE', dough_params: { steps: ['Étaler le pâton.'], cooking: { type: 'Four à bois', temp: '430', time: '1.5', energy: '' } } });
    assert.deepStrictEqual(p.etapes.map((e) => e.texte), ['Étaler le pâton.']);
    assert.equal(p.cuisson, 'Four à bois · 430 °C · 1,5 min');
});

test('le procédé d\'une pâte : le déroulé que le calculateur génère', async () => {
    const { procedeDe } = await procede();
    const p = procedeDe({ kind: 'PATE', servings: 10, paton_g: 250, flour_price: 1.2, dough_params: JSON.stringify({ hydra: 60, sel: 2.5, huile: 2, levure: 0.2 }) });
    assert.ok(p.etapes.length >= 5, 'frasage, coulage, assaisonnement, pointage, division…');
    assert.ok(p.etapes.every((e) => e.titre && e.texte), 'chaque étape générée a son titre et son geste');
});

test('la carte le montre replié, hors du corps qui ouvre la fiche', () => {
    /* Placé DANS `.comm-card2-body`, un clic sur « Procédé » ouvrirait la fenêtre de la fiche au
       lieu de déplier le procédé. */
    assert.match(COMM, /<\/div>\s*\{\/\*[^*]*\*\/\}\s*<ProcedeRepli fiche=\{s\} \/>\s*<div className="comm-foot">/,
        'entre le corps cliquable et la barre d\'actions');
    assert.match(COMM, /<details className=\{"comm-procede"/, 'un <details> natif : clavier et lecteur d\'écran sans rien ajouter');
    assert.match(COMM, /<ProcedeRepli fiche=\{detail\} dansDetail \/>/, 'le même dans le détail');
    assert.doesNotMatch(COMM, /Déroulé des étapes \(/, 'la pâte n\'a plus son bloc à part');
});
