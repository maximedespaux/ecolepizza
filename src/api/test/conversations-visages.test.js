/**
 * Dans la Communauté, TOUT le monde a un visage — y compris quand il répond ou commente.
 *
 * LE DÉFAUT GELÉ ICI. Chaque publication du fil portait un avatar et son cadre ; la conversation
 * qui suivait, elle, retombait à des lignes de texte précédées d'un nom. C'est pourtant là que
 * se joue l'entraide — et une réponse de Maestro ne se lit pas comme celle d'un Bronze. Les deux
 * fils (réponses d'une question, commentaires d'une fiche) ne recevaient tout simplement pas
 * l'avatar : le serveur ne le sélectionnait pas.
 *
 * ET LA RAISON DE `lib/auteurs.js`. La résolution existait, écrite une fois, dans `listPosts`.
 * Deux listes de plus en ont eu besoin à l'identique. Trois copies auraient divergé au premier
 * changement — et il y en a déjà eu un : l'arrivée du personnel de l'organisme, qui n'a pas de
 * fiche `learner` et dont l'avatar vit sur `user` (migration 126).
 *
 * SECOND DÉFAUT — LA MODÉRATION S'ARRÊTAIT AUX PUBLICATIONS. Le fil de commentaires d'une fiche
 * n'était retirable que par l'auteur de chaque message. C'est pourtant le même fil public, avec
 * les mêmes dérapages possibles : l'école n'avait aucun moyen d'y retirer quoi que ce soit,
 * sinon supprimer la FICHE entière — ce qui punit son auteur pour le commentaire d'un tiers.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcAuteurs = fs.readFileSync(path.join(API, 'lib/auteurs.js'), 'utf8');
const srcComm = fs.readFileSync(path.join(API, 'controllers/community.controller.js'), 'utf8');
const srcRecipe = fs.readFileSync(path.join(API, 'controllers/recipe.controller.js'), 'utf8');
const srcPost = fs.readFileSync(path.join(APP, 'ui/components/QuestionPost.jsx'), 'utf8');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Communaute.jsx'), 'utf8');

test('les CINQ listes résolvent l\'auteur par le même chemin', () => {
    /* Il y en avait trois au départ, puis cinq. Les deux dernières — la liste des FICHES et les
     * pastilles « qui a commenté » — ont été trouvées parce que le cadre « École » n'apparaissait
     * sur aucune carte : elles résolvaient l'auteur par un `JOIN learner`, et la jointure
     * elle-même excluait un compte SANS fiche stagiaire. Le personnel sortait donc en rond gris
     * sur une carte, à côté d'une publication d'entraide où il avait un visage — MÊME fil. */
    assert.match(srcComm, /await enrichirAuteurs\(conn, rows\)/, 'le fil d\'entraide');
    assert.match(srcComm, /await enrichirAuteurs\(conn, answers, 'user_id'\)/, 'les reponses');
    assert.match(srcRecipe, /await enrichirAuteurs\(conn, comments, 'user_id'\)/, 'les commentaires');
    assert.match(srcRecipe, /await enrichirAuteurs\(conn, rows\)/, 'la liste des fiches');
    assert.match(srcRecipe, /await enrichirAuteurs\(conn, rows\.flatMap\(\(r\) => r\.commenters \|\| \[\]\), 'user_id', ''\)/,
        'les pastilles « qui a commente »');
    // Et il n'en reste AUCUNE copie : c'est tout l'objet du fichier commun.
    for (const [nom, src] of [['community', srcComm], ['recipe', srcRecipe]]) {
        assert.doesNotMatch(src, /SELECT user_id, avatar, completed_levels, cadre, cadres_exclusifs/,
            `copie residuelle de la resolution d'auteur dans ${nom}.controller`);
    }
    /* AUCUNE jointure `learner` ne doit plus servir à résoudre un visage : c'est la forme même
       du défaut — elle exclut silencieusement qui n'a pas de fiche stagiaire. */
    assert.doesNotMatch(srcRecipe, /JOIN learner l ON l\.user_id = r\.author_user_id/,
        'la jointure excluait le personnel de l\'organisme');
    assert.doesNotMatch(srcRecipe, /LEFT JOIN learner l ON l\.user_id = c\.user_id/,
        'idem pour les pastilles de commentateurs');
});

test('le DÉTAIL d\'une publication et d\'une fiche porte aussi son auteur', () => {
    /* SIGNALÉ TEL QUEL : « sur la publication de l'admin, la photo n'apparaît pas mais le cadre
     * si ». Les deux détails viennent d'un `SELECT *` qui ne connaît ni avatar ni cadre : leur
     * en-tête retombait sur les initiales, alors que la CARTE du fil — juste avant le clic —
     * montrait le visage. Le cadre, lui, s'affichait quand même, parce qu'il se résout côté
     * écran pour l'utilisateur courant : d'où un symptôme dissocié, avatar absent / cadre
     * présent, qui ne pointait pas vers sa cause.
     * Les listes avaient été traitées, pas les fiches unitaires. */
    assert.match(srcComm, /await enrichirAuteurs\(conn, \[p\]\)/, 'le detail d\'une publication');
    assert.match(srcRecipe, /await enrichirAuteurs\(conn, \[r\]\)/, 'le detail d\'une fiche');
});

test('la résolution tient debout AVANT les migrations, et couvre le personnel', () => {
    // Deux sources, dans cet ordre : la fiche stagiaire, puis le compte (personnel de l'organisme).
    assert.match(srcAuteurs, /FROM learner WHERE user_id IN \(\?\)/, 'source stagiaire');
    assert.match(srcAuteurs, /SELECT id, avatar, cadre FROM user WHERE id IN \(\?\)/, 'source personnel');
    // Chacune dans SON try/catch : une liste sans avatar reste lisible, une 500 fait disparaitre
    // le fil entier. Les colonnes dependent des migrations 070 / 113 / 126.
    assert.strictEqual((srcAuteurs.match(/catch \(e\) \{ if \(!noSchema\(e\)\) throw e; \}/g) || []).length, 2,
        'chaque source doit degrader independamment');
    // Le cadre « École » n'est adossé à aucune formation : sans être déclaré possédé, l'écran le
    // rejette (`cadrePorteDe`) et l'école réapparaît sans cadre chez les AUTRES.
    // Les noms de champs sont devenus paramétrables (préfixe) le jour où les pastilles
    // « qui a commenté » ont voulu la même résolution sous d'autres noms.
    assert.match(srcAuteurs, /if \(u\.cadre === CADRE_PERSONNEL\) r\[EX\] = \[\.\.\.\(r\[EX\] \|\| \[\]\), CADRE_PERSONNEL\]/,
        'le cadre du personnel doit etre declare possede');
    // Une requête par SOURCE, jamais une par ligne.
    assert.strictEqual((srcAuteurs.match(/conn\.query\(/g) || []).length, 2, 'deux requetes, pas une par auteur');
});

test('réponses et commentaires portent un avatar', () => {
    assert.match(srcPost, /<AvatarCadre avatar=\{a\.author_avatar \? parseAvatar\(a\.author_avatar\) : null\}/,
        'la reponse a une question doit montrer son auteur');
    /* `cadreValeur(...)` et non `....id` : un cadre de PIZZA QUEST porte sa teinte dans sa valeur
       (« qparfait|#eab308 », à la couleur de la formation). Prendre le seul identifiant jetait la
       couleur en route, et tous ces cadres sortaient dans la teinte de repli — donc tous
       identiques, ce qui vide de son sens un cadre censé dire DE QUELLE formation il vient. */
    assert.match(srcPost, /cadre=\{cadreValeur\(cadreDe\(a\.user_id, a\.author_done, a\.author_cadre, a\.author_cadres_ex\)\)\}/,
        'avec son cadre, TEINTE COMPRISE');
    assert.match(srcPage, /<AvatarCadre avatar=\{c\.author_avatar \? parseAvatar\(c\.author_avatar\) : null\}/,
        'le commentaire d\'une fiche aussi');
    assert.match(srcPage, /cadre=\{cadreValeur\(cadreDe\(c\.user_id, c\.author_done, c\.author_cadre, c\.author_cadres_ex\)\)\}/,
        'avec son cadre, TEINTE COMPRISE');
});

test('la modération RETIRE un commentaire, elle ne le réécrit pas', () => {
    assert.match(srcRecipe, /if \(c\.user_id !== req\.user\.id && !await peutModerer\(req\.user\)\)/,
        'le commentaire d\'un autre doit etre supprimable en moderation');
    assert.match(srcRecipe, /can_moderate: await peutModerer\(req\.user\)/,
        'la fiche doit dire au front s\'il peut moderer son fil');
    assert.match(srcPage, /\{\(c\.mine \|\| peutModerer\) && editing\[c\.id\] == null &&/,
        'le bouton de suppression doit suivre la capacite');
    /* MODIFIER reste à l'auteur, et c'est la limite volontaire de cette capacité : corriger les
       mots de quelqu'un d'autre, c'est les lui faire dire. */
    assert.match(srcPage, /\{c\.mine && \(\s*\n\s*<button className="iconbtn" title="Modifier"/,
        'la moderation ne doit pas pouvoir reecrire le message d\'un autre');
});

test('le cadre « École » tient au RÔLE, pas à une attribution du serveur', () => {
    /* LE DÉFAUT, VU DANS LE NAVIGATEUR. La possession d'un cadre est revérifiée à la lecture
     * (`cadrePorteDe`), à partir de la liste des cadres possédés — que le SERVEUR fournit. Or
     * « École » n'est adossé ni à une formation ni à une attribution : il tient au rôle. Résultat,
     * on voyait son avatar changer aussitôt (localStorage) mais son cadre disparaître dans le
     * fil, chez soi, alors que la page sait parfaitement qu'on est du bureau. */
    assert.match(srcPage, /const possedes = aMoi && duBureau \? \[\.\.\.exclusifs, "ecole"\] : exclusifs;/,
        'pour soi, la page ne doit pas attendre le serveur');
    // Pour les AUTRES, c'est bien le serveur qui tranche — deux chemins, une seule règle.
    assert.match(srcAuteurs, /if \(u\.cadre === CADRE_PERSONNEL\)/, 'le fil declare le cadre du personnel');
    /* La FENÊTRE DE PROFIL ne lisait que `learner` : le personnel y sortait sans avatar ni cadre,
     * alors qu'il en porte partout ailleurs. Troisième endroit, même repli. */
    assert.match(srcRecipe, /SELECT avatar, cadre FROM user WHERE id = \? LIMIT 1/,
        'le profil d\'un membre du personnel doit aussi se rabattre sur `user`');
    assert.match(srcRecipe, /if \(uc\.cadre === CADRE_PERSONNEL\) cadres_ex = \[\.\.\.cadres_ex, CADRE_PERSONNEL\]/,
        'et declarer « École » possede, sinon l\'ecran le rejette a la lecture');
});

test('« Enregistrer dans mes fiches » ne s\'affiche pas pour le bureau', () => {
    /* Le bouton copie la fiche dans SES empâtements puis y navigue — des routes de l'espace
       stagiaire, que le bureau ne peut pas ouvrir. Il menait donc à une redirection sèche,
       après avoir tout de même créé la copie. */
    const boutons = [...srcPage.matchAll(/onClick=\{\(\) => copyToMine\(/g)].length;
    assert.strictEqual(boutons, 2, 'les deux boutons « Enregistrer » attendus (carte + detail)');
    const gardes = [...srcPage.matchAll(/\{!duBureau && \(/g)].length;
    assert.strictEqual(gardes, boutons, 'chacun doit etre garde par `duBureau`');
});
