/**
 * Les ANNONCES de l'école ont leur bandeau, et l'épingle sert enfin à quelque chose.
 *
 * LE DÉFAUT GELÉ ICI — l'épingle était ÉCRITE ET INJOIGNABLE. Le serveur l'accepte à la
 * création (`pinned` sur POST, réservé au bureau et à une ANNONCE) comme à la modification
 * (`pinned` sur PATCH, réservé au bureau), et il trie déjà `pinned DESC` avant la date. Rien,
 * côté écran, n'envoyait jamais ce champ : aucune annonce ne pouvait donc être épinglée, et
 * les trois quarts de ce dispositif serveur ne s'exécutaient jamais. Même famille de défaut
 * que la pastille de stock ou les produits partenaires — la capacité existait, la porte non.
 *
 * SECOND POINT — une annonce se classait comme le reste. Mêlée aux fiches et aux questions,
 * elle passait sous le tri « Populaires » : une question très commentée pouvait pousser « la
 * session de mardi est décalée » hors du premier écran. Elle sort donc du fil pour un bandeau
 * placé AVANT la barre d'outils, que les filtres ne touchent pas.
 *
 * Corollaire à ne pas défaire : puisque les annonces quittent le fil, le fil ne doit PLUS
 * trier sur `pinned` — ce serait un second classement à tenir d'accord avec celui du serveur,
 * pour des éléments qui n'y sont plus.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcCtrl = fs.readFileSync(path.join(API, 'controllers/community.controller.js'), 'utf8');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Communaute.jsx'), 'utf8');
const srcPost = fs.readFileSync(path.join(APP, 'ui/components/QuestionPost.jsx'), 'utf8');
const srcCss = fs.readFileSync(path.join(APP, 'ui/styles/app.css'), 'utf8');

test('l\'épingle est enfin ENVOYÉE — elle n\'était acceptée que par le serveur', () => {
    // À la création : le formulaire doit transmettre `pinned`, sinon la case cochée ne va nulle part.
    assert.match(srcPost, /createPost\(\{[^}]*\bpinned\b/,
        'le formulaire doit transmettre `pinned` a la creation');
    assert.match(srcPost, /type="checkbox"[^>]*checked=\{epingler\}/,
        'la case « epingler » doit exister dans le formulaire d\'annonce');
    // Après coup : le bandeau doit pouvoir épingler/dépingler une annonce déjà publiée.
    assert.match(srcPage, /updatePost\(\s*a\.id\s*,\s*\{\s*pinned:\s*!a\.pinned\s*\}\s*\)/,
        'le bandeau doit basculer l\'epingle via PATCH');
    assert.match(srcPage, /import \{[^}]*updatePost[^}]*\} from "\.\.\/api\/apiClient\.js"/,
        '`updatePost` doit etre importe — sinon la bascule casse a l\'execution, pas au build');
});

test('le serveur garde l\'épingle au bureau, et à une ANNONCE', () => {
    // Ces deux gardes existaient AVANT l'écran : les geler évite qu'on les relâche en câblant
    // l'interface (« ça ne marche pas, enlevons la condition »).
    assert.match(srcCtrl, /const pinned = kind === 'ANNONCE' && req\.body\?\.pinned \? 1 : 0/,
        'seule une ANNONCE s\'epingle a la creation');
    assert.match(srcCtrl, /req\.body\?\.pinned !== undefined && estStaff\(req\.user\)/,
        'seul le bureau modifie l\'epingle');
    assert.match(srcCtrl, /ORDER BY p\.pinned DESC, p\.created_at DESC/,
        'l\'ordre est decide par le serveur, pas recalcule par la page');
});

test('les annonces QUITTENT le fil pour leur bandeau', () => {
    assert.match(srcPage, /const annonces = posts\.filter\(\(p\) => p\.kind === "ANNONCE"\)/,
        'le bandeau doit isoler les annonces');
    assert.match(srcPage, /posts\.filter\(\(p\) => p\.kind !== "ANNONCE"\)/,
        'le fil doit les exclure — sinon elles s\'affichent DEUX fois');
    // Le bandeau passe avant la barre d'outils : une annonce ne se cherche pas.
    const posBandeau = srcPage.indexOf('comm-annonces');
    const posBarre = srcPage.indexOf('comm-toolbar');
    assert.ok(posBandeau > 0 && posBarre > 0 && posBandeau < posBarre,
        'le bandeau doit etre rendu AVANT la barre de filtres');
    assert.doesNotMatch(srcPage, /if \(a\.pinned !== b\.pinned\)/,
        'le fil ne doit plus trier sur `pinned` : les annonces n\'y sont plus');
});

test('« Créer une annonce » ouvre le formulaire DU BON CÔTÉ', () => {
    // Sans `kindInitial`, le bouton ouvrait sur « Question » : il fallait recliquer sur l'onglet
    // pour dire ce que le bouton disait déjà.
    assert.match(srcPost, /kindInitial = "QUESTION"/, '`kindInitial` doit avoir un defaut');
    assert.match(srcPost, /useState\(kindInitial\)/, 'le formulaire doit s\'ouvrir sur `kindInitial`');
    assert.match(srcPage, /kindInitial=\{composer\}/, 'la page doit passer la nature a ouvrir');
    assert.match(srcPage, /setComposer\("ANNONCE"\)/, 'le bouton « Creer une annonce » doit ouvrir en ANNONCE');
});

test('l\'état « épinglée » se VOIT', () => {
    // `.iconbtn.on` n'est stylé nulle part ailleurs que dans `.q-reponse` : sans une règle
    // propre au bandeau, la punaise allumée restait grise — un état sans couleur.
    assert.match(srcCss, /\.annonce-row \.iconbtn\.on\{[^}]*color:var\(--ember1\)/,
        'le bouton epingle doit porter la couleur de l\'annonce quand il est actif');
    assert.match(srcCss, /\.annonce-row\.epinglee\{/, 'la ligne epinglee doit se distinguer');
});
