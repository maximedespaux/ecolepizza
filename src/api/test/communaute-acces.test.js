/**
 * La communauté est atteignable par l'école, et « le bureau » y désigne des rôles qui existent.
 *
 * LE DÉFAUT GELÉ ICI. `community.controller` et `Communaute.jsx` testaient tous deux le rôle
 * `'ADMIN'`. Ce rôle N'EXISTE PAS : la valeur réelle est `ADMIN_ORGANISME` (cf. auth.middleware,
 * ROLE_LABELS). Un administrateur d'organisme était donc traité comme un simple stagiaire par les
 * quatre controles que `estStaff` commande — publier une ANNONCE, épingler, modifier ou supprimer
 * la publication d'un autre.
 *
 * Le defaut ne se voyait pas tant que SEUL l'espace stagiaire ouvrait cette page : un
 * administrateur n'y allait jamais. Il devient bloquant a l'instant ou l'ecole y accede depuis
 * son propre menu — c'est-a-dire maintenant.
 *
 * SECOND DEFAUT, corrige en meme temps : INTERVENANT figurait dans cette liste. Il est du cote
 * des STAGIAIRES — il entre par le meme layout (`isStudent || isIntervenant`) — et l'y laisser
 * lui donnait le droit de parler AU NOM DE L'ECOLE, d'epingler devant tout le monde, et de
 * modifier ou supprimer la publication de n'importe qui. Il participe au fil comme les autres.
 *
 * Le fil est le MEME des deux cotes : l'API cadre sur `organization_id`, pas sur le stagiaire.
 * Il n'y a donc pas deux communautes a tenir, mais une seule vue par deux portes.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcCtrl = fs.readFileSync(path.join(API, 'controllers/community.controller.js'), 'utf8');
// `STAFF` est sorti du contrôleur le jour où `recipe.controller` a eu besoin de la même
// règle pour les commentaires de fiche. Le contrat, lui, n'a pas bougé.
const srcModer = fs.readFileSync(path.join(API, 'lib/moderation.js'), 'utf8');
const srcAuth = fs.readFileSync(path.join(API, 'middlewares/auth.middleware.js'), 'utf8');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Communaute.jsx'), 'utf8');
const srcNav = fs.readFileSync(path.join(APP, 'ui/lib/nav.js'), 'utf8');
const srcMain = fs.readFileSync(path.join(APP, 'ui/main.jsx'), 'utf8');

/** Rôles réellement acceptés par l'authentification — la seule source de vérité. */
function rolesReels() {
    const m = /const STAFF_ROLES = \[([^\]]+)\]/.exec(srcAuth);
    assert.ok(m, 'STAFF_ROLES introuvable dans auth.middleware');
    return new Set([...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]));
}

test('les rôles « bureau » de la communauté existent vraiment', () => {
    const reels = rolesReels();
    const m = /const STAFF = \[([^\]]+)\]/.exec(srcModer);
    const declares = [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
    const inconnus = declares.filter((r) => !reels.has(r));
    assert.deepStrictEqual(inconnus, [],
        `role(s) inexistant(s) cote serveur : ${inconnus.join(', ')} — un administrateur serait traite comme un stagiaire`);
    assert.ok(declares.includes('ADMIN_ORGANISME'), 'l\'administrateur d\'organisme doit etre du bureau');
    assert.ok(!declares.includes('INTERVENANT'),
        'INTERVENANT est du cote des stagiaires : il ne parle pas au nom de l\'ecole et ne modere personne');
    assert.ok(!declares.includes('FORMATEUR'),
        'le formateur atteint le fil et y participe, mais « le bureau » reste le bureau');
});

test('la page déclare la MÊME liste que le serveur', () => {
    // Deux listes qui divergent donneraient un bouton visible que le serveur refuserait — ou
    // l'inverse, une capacite reelle que rien ne propose.
    // La liste vivait dans l'attribut JSX ; elle est devenue une constante nommée le jour où le
    // BANDEAU des annonces s'en est servi lui aussi. Le contrat, lui, n'a pas bougé.
    const ctrl = [...(/const STAFF = \[([^\]]+)\]/.exec(srcModer)[1]).matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
    const page = [...(/const peutAnnoncer = \[([^\]]+)\]/.exec(srcPage)[1]).matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
    assert.deepStrictEqual(page, ctrl, 'la page et le serveur doivent s\'accorder sur qui est « le bureau »');
});

test('l\'école atteint la communauté depuis son propre menu', () => {
    assert.match(srcNav, /\{ to: "\/communaute", ic: "[a-z-]+", label: "Communauté", roles: STAFF \}/,
        'entree de menu attendue');
    assert.match(srcNav, /"\/communaute": "Communauté"/, 'titre de page attendu');
    assert.match(srcNav, /"\/communaute": "\/communaute"/, 'rubrique attendue (SECTION_OF)');
    assert.match(srcMain, /path="communaute" element=\{<Guard nav="\/communaute" roles=\{STAFF\}>/,
        'route cote organisme attendue, sous la meme garde que le menu');
});

test('les deux cotes partagent UNE page, pas deux copies', () => {
    // Le fil est cadre sur l'organisme (pas sur le stagiaire) : une seconde page divergerait.
    assert.strictEqual((srcMain.match(/element=\{<Communaute \/>\}|<Communaute \/><\/Guard>/g) || []).length, 2,
        'la meme page doit servir les deux chemins');
    assert.match(srcCtrl, /WHERE p\.organization_id = \?/,
        'le fil doit etre cadre sur l\'organisme, sinon les deux vues divergeraient');
});
