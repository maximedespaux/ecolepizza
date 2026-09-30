/**
 * MES FICHES TECHNIQUES : UN RAYON PAR TYPE — demandé par l'école le 2026-09-30 : « côté stagiaire,
 * en cliquant sur Empâtement, Préparation ou Réalisation, avoir d'abord les cartes que j'ai
 * enregistrées, et un bouton pour en créer une nouvelle, selon l'option cliquée ».
 *
 * LE DÉFAUT : ces trois cartes ouvraient l'éditeur sur une fiche VIDE. Pour rouvrir la sauce de la
 * semaine dernière, il fallait revenir en arrière et la chercher dans la liste du bas, tous types
 * mêlés.
 *
 * CE QUI EST GARDÉ ICI : le clic ouvre le RAYON (les fiches de ce type, en cartes, puis le bouton
 * qui en crée une) ; le rayon vit dans l'adresse, pour que la touche Retour ramène aux trois choix ;
 * et les mots s'accordent — « Nouvel empâtement », « Nouvelle préparation ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const rayons = () => import(pathToFileURL(path.join(UI, 'lib', 'rayonsFiches.js')).href);

test('TROIS RAYONS, et des mots qui s\'accordent', async () => {
    const { RAYONS, KIND_MODE, MODE_KIND } = await rayons();
    assert.deepStrictEqual(Object.keys(RAYONS), ['PATE', 'PREPARATION', 'RECETTE']);
    assert.deepStrictEqual([RAYONS.PATE.creer, RAYONS.PREPARATION.creer, RAYONS.RECETTE.creer],
        ['Nouvel empâtement', 'Nouvelle préparation', 'Nouvelle réalisation'], '« Nouvel » devant une voyelle, « Nouvelle » au féminin');
    assert.deepStrictEqual([RAYONS.PATE.titre, RAYONS.PREPARATION.titre, RAYONS.RECETTE.titre],
        ['Mes empâtements', 'Mes préparations', 'Mes réalisations']);
    assert.match(RAYONS.PATE.premier, /mon premier empâtement/);
    assert.match(RAYONS.PREPARATION.premier, /ma première préparation/);
    assert.match(RAYONS.PATE.attente, /enregistré, il apparaîtra/);
    assert.match(RAYONS.RECETTE.attente, /enregistrée, elle apparaîtra/);
    for (const r of Object.values(RAYONS)) for (const k of ['titre', 'creer', 'premier', 'vide', 'attente', 'lead']) assert.ok(r[k], k);
    // Le mot de l'adresse et le type de la fiche se répondent, dans les deux sens.
    for (const [kind, mode] of Object.entries(KIND_MODE)) assert.strictEqual(MODE_KIND[mode], kind);
    assert.strictEqual(MODE_KIND.nimporte, undefined, 'une adresse inconnue n\'ouvre aucun rayon');
});

test('LA CARTE RÉSUME CE QUE LA LISTE SAIT : l\'essentiel du type, puis la date', async () => {
    const { resumeFiche } = await rayons();
    assert.strictEqual(
        resumeFiche({ kind: 'PATE', dough_params: JSON.stringify({ hydra: 62.5 }), paton_g: 250, updated_at: '2026-09-30 00:56' }),
        'Hydratation 62,5\u00a0% · pâtons de 250\u00a0g · modifiée le 30/09/2026');
    assert.strictEqual(resumeFiche({ kind: 'PATE', dough_params: { hydra: 55 }, paton_g: null, updated_at: null }), 'Hydratation 55\u00a0%',
        'les réglages arrivent en objet ou en texte, selon la route');
    assert.strictEqual(resumeFiche({ kind: 'PREPARATION', yield_qty: 3330, yield_unit: 'g', updated_at: '2026-09-12 10:00' }),
        'Rendement 3330\u00a0g · modifiée le 12/09/2026');
    assert.strictEqual(resumeFiche({ kind: 'RECETTE', type: 'Classique', updated_at: '2026-09-29 08:00' }), 'Classique · modifiée le 29/09/2026');
    /* LA DATE SE LIT EN TEXTE : passée par `new Date`, « 2026-01-01 23:59 » reculerait ou avancerait
       d'un jour selon le fuseau de qui regarde. */
    assert.strictEqual(resumeFiche({ kind: 'PATE', updated_at: '2026-01-01 23:59' }), 'modifiée le 01/01/2026');
    assert.strictEqual(resumeFiche({ kind: 'PREPARATION' }), '', 'rien à dire : rien d\'écrit, pas de « 0 g »');
    assert.doesNotMatch(fs.readFileSync(path.join(UI, 'lib', 'rayonsFiches.js'), 'utf8'), /new Date\(/, 'un appel, pas sa mention en commentaire');
});

test('L\'ÉCRAN : le clic ouvre le rayon, pas l\'éditeur sur une fiche vide', () => {
    const page = fs.readFileSync(path.join(UI, 'pages', 'FichesTechniques.jsx'), 'utf8');
    // Les trois cartes de l'accueil mènent au rayon…
    for (const k of ['PATE', 'PREPARATION', 'RECETTE']) assert.match(page, new RegExp(`onClick: versRayon\\("${k}"\\)`), k);
    assert.doesNotMatch(page, /onClick: \(\) => setEdit\(\{ mode: "(empatement|preparation|realisation)", id: null \}\)/,
        'ouvrir l\'éditeur vide d\'un clic cachait les fiches déjà enregistrées');
    // …qui vit dans l'adresse : la touche Retour ramène aux trois choix.
    assert.match(page, /const \[params, setParams\] = useSearchParams\(\);/);
    assert.match(page, /const rayon = MODE_KIND\[params\.get\("type"\)\] \|\| null;/);
    assert.match(page, /const versRayon = \(kind\) => \(\) => setParams\(\{ type: KIND_MODE\[kind\] \}\);/);
    // Dans le rayon : les fiches de CE type, et le bouton qui crée CE type.
    assert.match(page, /const miennes = toutes\.filter\(\(f\) => f\.kind === rayon\);/);
    assert.match(page, /const creer = \(\) => setEdit\(\{ mode: KIND_MODE\[rayon\], id: null \}\);/);
    assert.match(page, /\{r\.creer\}<\/button>/);
    assert.match(page, /<button type="button" className="ft-carte-ouvrir" onClick=\{\(\) => ouvrir\(s\)\}/, 'la carte entière ouvre la fiche');
    // On ne dit pas « aucune fiche » pendant qu'on charge.
    assert.match(page, /const \[fiches, setFiches\] = useState\(null\);/);
    assert.match(page, /fiches === null \? \(\s*<p className="hint">Chargement…<\/p>/);
});
