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

test("la photo d'une annonce se voit dans le fil, pas seulement à l'ouverture", () => {
    /* UNE CAPACITÉ SANS PORTE, dans son état le plus trompeur : tout marchait SAUF la dernière
       marche. Le formulaire propose explicitement une photo pour une annonce (« un plan, une
       affiche, une photo du lieu »), la route la stocke, `QuestionModal` l'affiche en grand à
       l'ouverture — mais la ligne du bandeau n'en disait rien. Relevé sur le fil réel : SEPT
       annonces sur neuf portaient une photo, et aucune ne le montrait. Une pièce jointe que rien
       n'annonce n'est pas consultée, donc autant ne pas l'avoir demandée.

       La carte-question, elle, affichait bien sa vignette depuis toujours : c'est ce qui rendait
       l'oubli invisible — on voyait DES photos dans la Communauté, juste jamais celles des
       annonces. */
    const ui = path.join(__dirname, '..', '..', 'app', 'ui');
    const src = fs.readFileSync(path.join(ui, 'components/QuestionPost.jsx'), 'utf8');
    const carte = src.slice(src.indexOf('export function AnnonceCard'), src.indexOf('export function QuestionModal'));
    assert.match(carte, /post\.has_image > 0/,
        "AnnonceCard doit tester `has_image` — le serveur le renvoie déjà sur la liste.");
    assert.match(carte, /className="annonce-vignette"/,
        'et rendre une vignette, sinon la photo reste invisible tant qu\'on n\'ouvre pas.');
    /* PAS la grande image des cartes-questions : la forme textuelle de l'annonce est un choix
       assumé (« une annonce se lit, elle ne se parcourt pas du regard au milieu de vignettes »).
       Réutiliser `.q-vignette`, c'est 150 px de haut en pleine largeur — une carte, pas une ligne. */
    assert.doesNotMatch(carte, /q-vignette/,
        'la vignette d\'annonce est un carré à elle, pas l\'image pleine largeur des questions.');

    const css = fs.readFileSync(path.join(ui, 'styles/app.css'), 'utf8');
    /* HAUTEUR FIXE, LARGEUR LIBRE. Le carré de 46×46 en `cover` recadrait au centre : une affiche
       de 1349×250 — le format naturel d'une pièce jointe d'annonce — n'en montrait qu'un fragment
       blanc, illisible. Ici la hauteur tient la ligne et la largeur suit le ratio : mesuré,
       248×46 pour l'affiche et 61×46 pour une photo 4:3, ratio conservé dans les deux cas. */
    assert.match(css, /\.annonce-vignette\{flex:none;height:46px;width:auto;max-width:260px;object-fit:contain/,
        'La hauteur est fixe et la largeur suit le ratio — sinon les affiches larges se recadrent '
        + 'en un carré vide.');
    /* ET LE PLAFOND MOBILE DOIT ÊTRE DÉCLARÉ APRÈS LA RÈGLE DE BASE. Écrit plus haut avec les
       autres media queries il était ignoré — à spécificité égale c'est la dernière déclaration qui
       gagne. Mesuré à 375 px : l'affiche sortait à 248 px, la colonne de texte tombait à ZÉRO et
       la page débordait horizontalement. */
    const base = css.indexOf('.annonce-vignette{flex:none');
    const mobile = css.indexOf('.annonce-vignette{max-width:110px}');
    assert.ok(mobile > base, 'le plafond mobile doit venir APRÈS la règle de base, sinon il est écrasé');
});

test('le serveur renvoie `has_image` sur la liste des publications', () => {
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'community.controller.js'), 'utf8');
    assert.match(ctrl, /FROM community_image i WHERE i\.post_id = p\.id\) AS has_image/,
        'Sans ce drapeau sur la LISTE, le fil devrait charger chaque image pour savoir si elle '
        + 'existe — ou ne rien afficher, ce qui était le cas.');
});
