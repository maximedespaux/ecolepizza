/**
 * LE BUREAU N'AVAIT PAS ACCÈS AUX OUTILS D'ATELIER.
 *
 * LE BESOIN : un membre de l'organisme veut créer des recettes — empâtements, garnitures,
 * réalisations — dans les mêmes outils que ses stagiaires. C'est lui qui les enseigne, et il
 * doit pouvoir préparer ses exemples.
 *
 * CE QUI BLOQUAIT N'ÉTAIT PAS UN DROIT, MAIS UNE COQUILLE D'ÉCRAN. Les API de recettes sont
 * cadrées sur le COMPTE (`recipe.author_user_id`), pas sur une fiche stagiaire : vérifié en
 * production, `/api/recipes/mine` répond 200 à un administrateur, qui possède déjà une recette
 * de chaque famille. Les routes n'exigent que `authenticateToken`, sans aucun contrôle de rôle.
 * Seul le routeur de l'interface réservait ces pages à l'espace stagiaire.
 *
 * ET LA BASCULE EXISTANTE NE SUFFISAIT PAS : `canBeStudent` exige `has_learner`, c'est-à-dire
 * une fiche de stagiaire rattachée au compte. Un formateur qui n'en a pas — le cas normal —
 * n'avait aucun chemin vers ces outils. Le compte qui a signalé le manque est
 * `has_learner: false`.
 *
 * LA SOLUTION SUIT UN PRÉCÉDENT DU PROJET : la Communauté a été ouverte au bureau exactement
 * pour cette raison, avec les mêmes mots (« il fallait un compte stagiaire pour voir ce qu'on y
 * disait »). Mêmes composants, deux chemins, une seule page. On ne fabrique pas une fausse
 * fiche stagiaire pour contourner une question d'affichage.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const lireUi = (f) => fs.readFileSync(path.join(RACINE, 'app/ui', f), 'utf8');
const NAV = lireUi('lib/nav.js');
const ROUTES = lireUi('main.jsx');
const PATE = lireUi('pages/PateWizard.jsx');
const RECETTES_ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes/recipe.routes.js'), 'utf8');
const RECETTES_CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers/recipe.controller.js'), 'utf8');

const OUTILS = ['/empatements', '/garnitures', '/realisations', '/notions'];

test('les quatre outils figurent au menu du bureau', () => {
    for (const to of OUTILS) {
        assert.match(NAV, new RegExp(`to: "${to}"[^}]*roles: STAFF`),
            `${to} doit être proposé au personnel`);
    }
});

test('chaque outil a une route gardée, et pas seulement une entrée de menu', () => {
    /* Une entrée de menu sans route mène au `path="*"`, qui renvoie ailleurs sans un mot — le
       défaut déjà payé sur « Maîtrise sanitaire », dont le commentaire subsiste dans le menu
       stagiaire : « un menu qui promet un outil et ramène à l'accueil use la confiance qu'on a
       dans les autres ». */
    for (const to of OUTILS) {
        const p = to.slice(1);
        assert.match(ROUTES, new RegExp(`path="${p}" element=\\{<Guard nav="${to}" roles=\\{STAFF\\}>`),
            `${to} doit avoir une route du bureau, gardée sur STAFF`);
    }
});

test('chaque outil a un titre de page et une rubrique', () => {
    /* Sans eux, le fil d'Ariane affiche un chemin brut et la page n'appartient à aucune
       rubrique — le menu ne se surligne plus. */
    for (const to of OUTILS) {
        assert.ok(new RegExp(`"${to}": "[^"]+"`).test(NAV), `${to} doit avoir un libellé de page`);
        assert.ok(new RegExp(`"${to}": "${to}"`).test(NAV), `${to} doit désigner sa propre rubrique`);
    }
});

test('les recettes restent cadrées sur le COMPTE, pas sur une fiche stagiaire', () => {
    /* C'EST LA PRÉMISSE DE TOUT LE RESTE. Si quelqu'un rattachait un jour les recettes au
       stagiaire plutôt qu'au compte, ces quatre pages se videraient pour le bureau sans que
       rien ne le signale — les écrans continueraient de s'ouvrir. */
    assert.match(RECETTES_CTRL, /WHERE author_user_id = \?/,
        'la liste « mes recettes » se lit par auteur (compte), pas par stagiaire');
    assert.doesNotMatch(RECETTES_CTRL, /FROM recipe WHERE learner_id/);
    for (const ligne of RECETTES_ROUTES.split('\n').filter((l) => l.startsWith('router.'))) {
        assert.doesNotMatch(ligne, /authorizeRoles/,
            `les routes de recettes ne filtrent pas par rôle : ${ligne.trim()}`);
    }
});

test('le bureau garde les options avancées de l\'empâtement', () => {
    /* Elles se débloquent par les formations SUIVIES, et `getMyFormations` répond 404 à qui n'a
       pas de fiche stagiaire. Sans ce cas, un formateur de niveau II se voyait refuser la
       napolitaine dans l'outil qu'il fait utiliser à ses stagiaires. */
    assert.match(PATE, /const estPersonnel = \[.*"FORMATEUR"\]\.includes\(user\?\.role\)/);
    assert.match(PATE, /if \(estPersonnel\) \{ setNiv2\(true\); setNapo\(true\); setSpe\(true\); return; \}/);
});
