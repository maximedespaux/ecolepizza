/**
 * L'école a un visage dans la Communauté, et modérer n'est plus le privilège d'un rôle.
 *
 * DÉFAUT 1 — LE PERSONNEL N'AVAIT PAS D'AVATAR. L'avatar et le cadre sont nés côté stagiaire,
 * sur `learner`. Tant que seul l'espace stagiaire ouvrait la Communauté, cela suffisait. Depuis
 * que l'école y entre par son propre menu et y publie des annonces, ses publications sortaient
 * avec un rond gris et des initiales : un membre du bureau n'a pas de fiche `learner`. Sur un
 * fil où chacun se reconnaît à sa pizza, l'école était la seule silhouette anonyme — et c'est
 * elle qui parle. D'où `user.avatar` / `user.cadre` (migration 126), et NON une fiche `learner`
 * fantôme, qui polluerait les effectifs, Qualiopi, les exports et les listes de session.
 *
 * DÉFAUT 2 — LA MODÉRATION N'EXISTAIT SUR AUCUN ÉCRAN. Le serveur autorisait depuis toujours le
 * bureau à modifier et supprimer la publication d'un autre (`estStaff` dans updatePost,
 * deletePost, deleteAnswer). Mais le front n'affichait ces boutons que sur `mine` — l'auteur.
 * Personne n'a donc jamais pu modérer quoi que ce soit : trois gardes serveur qui ne se sont
 * jamais exécutées. Le droit descend maintenant par `can_moderate`.
 *
 * ET LA RÈGLE QUI TIENT LE TOUT : `estStaff` ne commande plus que ce qui ENGAGE l'école —
 * publier une ANNONCE, épingler. Modérer s'accorde nominativement (`cap:moderate-community`,
 * bouton boussole d'Équipe & accès), relu EN BASE à chaque appel : retirer la capacité doit
 * prendre effet tout de suite, pas à l'expiration du jeton (jusqu'à 7 jours).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const MIG = path.join(API, '..', '..', 'database', 'migrations');
const srcComm = fs.readFileSync(path.join(API, 'controllers/community.controller.js'), 'utf8');
const srcEspace = fs.readFileSync(path.join(API, 'controllers/espace.controller.js'), 'utf8');
const srcNav = fs.readFileSync(path.join(APP, 'ui/lib/nav.js'), 'utf8');
const srcCadres = fs.readFileSync(path.join(APP, 'ui/lib/cadres.js'), 'utf8');
const srcPost = fs.readFileSync(path.join(APP, 'ui/components/QuestionPost.jsx'), 'utf8');
const srcSide = fs.readFileSync(path.join(APP, 'ui/components/Sidebar.jsx'), 'utf8');
const srcProfil = fs.readFileSync(path.join(APP, 'ui/components/ProfilPersonnel.jsx'), 'utf8');

test('modérer et parler au nom de l\'école ne sont plus la même chose', () => {
    // Ce qui ENGAGE l'école reste au bureau…
    assert.match(srcComm, /kind === 'ANNONCE' && estStaff\(req\.user\)/, 'l\'annonce reste au bureau');
    assert.match(srcComm, /req\.body\?\.pinned !== undefined && estStaff\(req\.user\)/, 'l\'epingle reste au bureau');
    // …les trois gestes d'ENTRETIEN passent à la capacité.
    const moder = [...srcComm.matchAll(/!await peutModerer\(req\.user\)/g)].length;
    assert.strictEqual(moder, 3,
        'modifier / supprimer une publication et supprimer une reponse doivent passer par peutModerer');
});

test('la capacité est relue EN BASE, jamais prise dans le jeton', () => {
    // Le jeton ne porte que id/email/role/organization_id, et vit jusqu'à 7 jours : une capacité
    // retirée n'y disparaîtrait pas. Même choix que sectionAccess.middleware, pour la même raison.
    assert.match(srcComm, /SELECT nav_access FROM user WHERE id = \?/,
        'peutModerer doit relire nav_access en base');
    assert.match(srcComm, /const CAP_MODERER = 'cap:moderate-community'/, 'la capacite doit etre nommee');
    assert.match(srcNav, /to: "cap:moderate-community"/, 'elle doit etre proposee par le bouton boussole');
    // Le front et le serveur doivent désigner LA MÊME chaîne : une faute de frappe donnerait une
    // case à cocher sans effet, et rien ne le signalerait.
    const cote = /const CAP_MODERER = '([^']+)'/.exec(srcComm)[1];
    const face = /to: "(cap:[a-z-]+)",\n\s*label: "Modérer/.exec(srcNav)[1];
    assert.strictEqual(face, cote, 'la capacite du menu et celle du serveur doivent porter le meme nom');
});

test('la modération est enfin VISIBLE — trois gardes serveur sans aucun bouton', () => {
    assert.match(srcComm, /can_moderate: await peutModerer\(req\.user\)/,
        'getPost doit dire au front s\'il peut moderer');
    assert.match(srcPost, /\(p\.mine \|\| moi === p\.author_user_id \|\| p\.can_moderate\)/,
        'le bouton de suppression de publication doit suivre can_moderate');
    assert.match(srcPost, /\(a\.mine \|\| p\.mine \|\| p\.can_moderate\)/,
        'le bouton de suppression de reponse aussi');
});

test('le cadre « École » ne se croise avec aucun cadre de parcours', () => {
    // Un secrétariat en « Maestro » se lirait comme un stagiaire chevronné ; un stagiaire en
    // « École » passerait pour le bureau. Le serveur refuse LES DEUX SENS — l'écran n'est pas
    // la seule garde, la route est ouverte à tout compte authentifié.
    assert.match(srcEspace, /const CADRE_PERSONNEL = 'ecole'/, 'le cadre du personnel doit etre nomme');
    assert.match(srcEspace, /if \(perso && !estPersonnel\(req\.user\)\)/, 'un stagiaire ne porte pas « École »');
    assert.match(srcEspace, /if \(!perso && estPersonnel\(req\.user\)\)/, 'le personnel ne porte pas les paliers');
    assert.match(srcCadres, /export const CADRES_PERSONNEL/, 'le front doit proposer la liste reduite');
    assert.match(srcProfil, /CADRES_PERSONNEL\.map/, 'la modale du personnel n\'affiche que celle-la');
    assert.doesNotMatch(srcProfil, /\bCADRES\.map/, 'elle ne doit surtout pas afficher tous les cadres');
});

test('l\'avatar du personnel vit sur `user`, sans fiche stagiaire fantôme', () => {
    for (const f of ['126_user_avatar_cadre.sql', '126_revert_user_avatar_cadre.sql']) {
        assert.ok(fs.existsSync(path.join(MIG, f)), `migration ${f} attendue`);
    }
    const sql = fs.readFileSync(path.join(MIG, '126_user_avatar_cadre.sql'), 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS avatar/, 'rejouable sans risque');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS cadre/, 'rejouable sans risque');
    assert.doesNotMatch(sql, /^\s*--/m, 'commentaires en blocs, jamais en `--`');
    // LE POINT QUI COMPTE : le code doit marcher AVANT comme APRÈS. `estPersonnel` remplace le
    // 404, et l'écriture reste sous le try/catch `isMissingSchema` qui absorbe ER_BAD_FIELD_ERROR.
    assert.match(srcEspace, /if \(!learner && !estPersonnel\(req\.user\)\) return res\.status\(404\)/,
        'le personnel ne doit plus se voir refuser « Aucune fiche stagiaire »');
    assert.match(srcEspace, /const \[table, cible\] = learner \? \['learner', learner\.id\] : \['user', req\.user\.id\]/,
        'l\'avatar du personnel s\'ecrit sur `user`');
    assert.match(srcComm, /SELECT id, avatar, cadre FROM user WHERE id IN \(\?\)/,
        'le fil doit aller chercher l\'avatar du personnel');
});

test('la modale de la barre latérale sort du contexte d\'empilement', () => {
    // `.sidebar` est `position:sticky; z-index:40` : elle crée un contexte d'empilement dans
    // lequel le `z-index:100` de l'overlay reste enfermé. Mesuré dans le navigateur : la modale
    // était bien rendue, aux bonnes dimensions, et le contenu principal passait devant — on ne
    // voyait qu'un voile gris. Même famille que la modale de facture.
    assert.match(srcProfil, /return createPortal\(/, 'la personnalisation doit passer par un portail');
    assert.match(srcProfil, /document\.body\s*\n?\s*\);/, 'monte au niveau du body');
    assert.match(srcSide, /<ProfilPersonnel onClose=/, 'la barre laterale doit l\'ouvrir');
    // Sa voisine avait le même défaut, silencieusement, depuis toujours.
    const srcPw = fs.readFileSync(path.join(APP, 'ui/components/ChangePasswordModal.jsx'), 'utf8');
    assert.match(srcPw, /return createPortal\(/, 'le changement de mot de passe souffrait du meme defaut');
});
