/**
 * Les cadres de Pizza Quest : la progression du jeu, portée sur l'avatar.
 *
 * CE QUI MANQUAIT. Les cadres récompensaient les formations RÉELLEMENT TERMINÉES — Bronze à
 * une, Maestro à huit. C'est un rythme d'années. Entre deux formations, un stagiaire qui revient
 * jouer tous les jours et boucle ses chapitres ne voyait rien changer : Pizza Quest ne laissait
 * aucune trace hors de Pizza Quest, alors que c'est le seul endroit où il revient de lui-même.
 *
 * TROIS PALIERS PAR FORMATION (moitié · bouclé · sans faute), À LA COULEUR DE CETTE FORMATION.
 * Un « Sans faute » n'existe pas dans l'absolu : il est sans faute SUR quelque chose, et sa
 * teinte le dit. C'est ce qui distingue deux stagiaires du même palier.
 *
 * LES DÉFAUTS GELÉS ICI, dans l'ordre où ils se seraient produits :
 *   · une formation SANS CHAPITRE (banque de questions vide) validait « tous les chapitres à 3
 *     étoiles » — zéro sur zéro est vrai — et distribuait le palier le plus rare à qui n'avait
 *     jamais joué ;
 *   · la moitié arrondie VERS LE BAS fêtait le palier avant qu'il ne soit franchi (2 chapitres
 *     sur 5) ;
 *   · la couleur ne faisait pas partie de la possession : un stagiaire « Sans faute » sur la
 *     formation bleue pouvait porter le rouge d'une formation jamais ouverte — un cadre qui dit
 *     quelque chose de faux, ce qui est pire que de ne rien dire ;
 *   · la règle est ÉCRITE DEUX FOIS (serveur pour la possession, client pour fêter à l'instant
 *     du clic sans aller-retour). Les deux copies sont épinglées ici : les faire diverger casse
 *     le test, pas l'écran.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { palierDuMonde, cadresQuest, possedeCadreQuest, parseCadre, couleurFormation, PALIER_IDS, EXPLOIT_IDS, PALETTE } = require('../lib/cadresQuest.js');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcClient = fs.readFileSync(path.join(APP, 'ui/lib/questPaliers.js'), 'utf8');
const srcServeur = fs.readFileSync(path.join(API, 'lib/cadresQuest.js'), 'utf8');
const srcEspace = fs.readFileSync(path.join(API, 'controllers/espace.controller.js'), 'utf8');
const srcCadres = fs.readFileSync(path.join(APP, 'ui/lib/cadres.js'), 'utf8');
const srcCss = fs.readFileSync(path.join(APP, 'ui/styles/app.css'), 'utf8');
const srcQuest = fs.readFileSync(path.join(APP, 'ui/pages/PizzaQuest.jsx'), 'utf8');
const srcModale = fs.readFileSync(path.join(APP, 'ui/components/ProfileModal.jsx'), 'utf8');

const etoiles = (liste) => Object.fromEntries(liste.map((n, i) => [i, n]));

test('une banque VIDE ne donne aucun cadre', () => {
    /* LE PREMIER DÉFAUT, et le plus vicieux : « tous les chapitres à 3 étoiles » est VRAI sur
       zéro chapitre. Le palier le plus rare serait tombé dans l'escarcelle de tout stagiaire
       ouvrant une formation dont l'école n'a pas encore écrit les questions. */
    assert.strictEqual(palierDuMonde({}, 0), null);
    assert.strictEqual(palierDuMonde(etoiles([3, 3]), 0), null, 'meme avec de la progression fantome');
    /* NI PALIER, NI EXPLOIT. La progression d'une formation dont l'école a vidé la banque est
       ORPHELINE : elle décrochait « Premier pas », un exploit que plus personne ne pourrait
       obtenir puisque les chapitres n'existent plus. */
    assert.deepStrictEqual(cadresQuest({ NIV1: { 0: 3 } }, [{ code: 'NIV1', color: '#111111', chapitres: 0 }]), []);
});

test('les EXPLOITS récompensent ce que les paliers ignorent', () => {
    /* Les trois paliers portent sur UNE formation : on les gagne vite, puis plus rien ne bouge
       tant qu'on n'attaque pas un autre monde. Les exploits couvrent la largeur (plusieurs
       mondes) et la durée (le total d'étoiles) — il reste donc toujours un objectif devant. */
    const mondes = [
        { code: 'A', color: '#111111', chapitres: 4 },
        { code: 'B', color: '#222222', chapitres: 4 },
        { code: 'C', color: '#333333', chapitres: 4 },
    ];
    const par = (n, v) => Object.fromEntries([...Array(n)].map((_, i) => [i, v]));
    const ids = (prog) => cadresQuest(prog, mondes).filter((c) => c.global).map((c) => c.id);

    assert.deepStrictEqual(ids({ A: { 0: 1 } }), ['qpas'], 'un seul chapitre : le premier pas, rien d\'autre');
    assert.deepStrictEqual(ids({ A: { 0: 1 }, B: { 0: 1 }, C: { 0: 1 } }).sort(), ['qpas', 'qtouche']);
    // Trois mondes bouclés sans les étoiles : le collectionneur, pas l'intouchable.
    const boucles = { A: par(4, 1), B: par(4, 1), C: par(4, 1) };
    assert.ok(ids(boucles).includes('qcollec') && !ids(boucles).includes('qintouch'));
    // Trois mondes parfaits : intouchable ET grand chelem — tous les mondes jouables y passent.
    const parfaits = { A: par(4, 3), B: par(4, 3), C: par(4, 3) };
    assert.ok(ids(parfaits).includes('qintouch') && ids(parfaits).includes('qchelem'));

    /* LE GRAND CHELEM EXIGE AU MOINS DEUX MONDES. Sans ce garde-fou, un organisme n'ayant écrit
       les questions que d'une formation le distribuerait EN MÊME TEMPS que « Monde bouclé » — le
       cadre le plus rare du jeu, obtenu sans rien faire de plus que le troisième palier. */
    const seul = [{ code: 'A', color: '#111111', chapitres: 4 }];
    assert.ok(!cadresQuest({ A: par(4, 3) }, seul).some((c) => c.id === 'qchelem'));
});

test('un exploit s\'enregistre SANS couleur, et se vérifie quand même', () => {
    // Il n'appartient à aucune formation : sa valeur est son seul identifiant.
    const possedes = cadresQuest({ A: { 0: 1 } }, [{ code: 'A', color: '#111111', chapitres: 4 }]);
    assert.ok(possedes.some((c) => c.valeur === 'qpas' && c.global === true));
    assert.ok(possedeCadreQuest('qpas', possedes));
    assert.ok(!possedeCadreQuest('qlegende', possedes), 'un exploit non gagne reste refuse');
    assert.ok(!possedeCadreQuest('qpas|#111111', possedes), 'et on ne lui invente pas de couleur');
    /* Les exploits sont listés CÔTÉ CLIENT en plus d'être reçus du serveur, et c'est nécessaire :
       le serveur ne renvoie que ce qui est GAGNÉ. S'en tenir à sa liste ferait disparaître les
       six autres, alors que ce sont eux qui donnent envie de rejouer — même parti pris que les
       cadres exclusifs, affichés verrouillés avec leur condition depuis toujours. */
    for (const id of EXPLOIT_IDS) {
        assert.match(srcCadres, new RegExp(`\\{ id: "${id}", nom: "[^"]+", condition: "[^"]+" \\}`),
            `${id} doit etre nomme ET porter sa condition`);
    }
    assert.match(srcModale, /const acquis = new Set\(quest\.filter\(\(q\) => q\.global\)\.map\(\(q\) => q\.valeur\)\);/,
        'le picker doit croiser la liste locale avec les acquis du serveur');
    // Et chacun doit avoir sa règle CSS, sinon l'anneau ne se peint pas.
    for (const id of EXPLOIT_IDS) assert.match(srcCss, new RegExp(`\\.cadre-${id}[,{:]`), `.cadre-${id} manquant`);
});

test('les cadres RARES se voient rares — sans déborder', () => {
    /* DEUX DÉFAUTS, ET LE SECOND EST NÉ DU PREMIER.
     *
     * 1. Jury et Fondateur n'étaient qu'un dégradé figé, exactement comme Bronze qu'on obtient en
     *    venant deux fois : leur rareté ne se lisait que dans le texte de la condition, donc nulle
     *    part sur un avatar de 38 px dans un fil.
     * 2. On leur a donc donné un HALO — une couche à `inset:-7px` avec 16 px de flou par-dessus.
     *    Mesuré dans la Communauté : la lueur débordait d'une vingtaine de pixels de chaque côté
     *    d'un avatar de 38 et mordait sur le nom de l'auteur. Une lueur ne s'arrête pas à la boîte
     *    de son élément — c'est précisément ce qu'on lui demande — donc aucun réglage d'`inset` ne
     *    pouvait la faire tenir en place.
     *
     * LE MÉDAILLON règle les deux : un emoji A UNE TAILLE. Il se pose dans le coin, dans l'emprise
     * de l'avatar, et dit ce que le halo faisait deviner — un trophée se reconnaît, une lueur
     * dorée s'interprète. */
    /* DES JETONS DESSINÉS, PAS DES EMOJI — l'emoji était l'étape intermédiaire, et c'est un
       anti-patron nommé par la charte du projet comme par la grille UI/UX consultée. Il est rendu
       par LA POLICE DU SYSTÈME : 🏆 n'a ni le même dessin, ni la même palette, ni le même cadrage
       sur macOS, Windows et Android — une récompense qui change de visage selon la machine n'est
       pas une identité. Chaque jeton est maintenant un SVG embarqué : disque de couleur, liseré
       blanc, silhouette pleine, même grille de 24 que le reste du jeu d'icônes. */
    for (const cadre of ['champion', 'jury', 'fondateur', 'qparfait', 'qcent', 'qintouch', 'qlegende', 'qchelem']) {
        assert.match(srcCss, new RegExp(`\\.cadre-${cadre}::after\\{--jeton:url\\('data:image/svg\\+xml,`),
            `${cadre} doit porter un jeton dessine`);
        assert.doesNotMatch(srcCss, new RegExp(`\\.cadre-${cadre}::after\\{content:"[^"]`), `${cadre} ne doit plus etre un emoji`);
    }
    /* PLEINES et non au trait, contrairement au reste du jeu d'icônes : à 15 px, un trait de 2 px
       sur une grille de 24 se referme et devient une tache. */
    assert.doesNotMatch(srcCss, /--jeton:url\('data:image\/svg\+xml,[^']*stroke-width="2"/, 'silhouettes pleines');
    /* Le plus rare porte LA PART DE PIZZA, le motif de l'école : le Grand Chelem ne pouvait pas se
       contenter d'un symbole de podium interchangeable. Sa pointe et ses trois garnitures. */
    const chelem = /\.cadre-qchelem::after\{--jeton:url\('[^']*'\)\}/.exec(srcCss)[0];
    assert.ok((chelem.match(/1\.2 1\.2 0 1 1 0 2\.4/g) || []).length === 3, 'trois garnitures sur la part');
    /* AUCUN DÉBORDEMENT : deux pixels de coin, et plus un `box-shadow` ni un `blur` sur ces
       couches — c'est cela qui mordait sur le fil.
       On ancre sur le DERNIER sélecteur de la liste : le même groupe réapparaît plus haut dans le
       bloc « mouvement réduit », et `right:-2px;bottom:-2px` seul attrape `.pf-lock`, le cadenas
       des cadres verrouillés, posé exactement au même endroit. Un test qui lit le mauvais bloc ne
       vérifie rien. */
    const medaillon = /\.cadre-qchelem::after\{\n\s+content:"";position:absolute;right:-2px;bottom:-2px;[\s\S]*?\n\s+animation:[^}]*\}/.exec(srcCss);
    assert.ok(medaillon, 'le medaillon doit se poser dans le coin, dans l\'emprise de l\'avatar');
    assert.doesNotMatch(medaillon[0], /box-shadow|blur\(/, 'plus aucune lueur : c\'est elle qui debordait');
    // La taille suit le diamètre, sinon l'emoji sort à la taille du texte hérité sur une pastille.
    /* DEUX MONTAGES, DEUX DIAMÈTRES, et cela se voyait dans le sélecteur où les deux familles se
       suivent. Un jeton de distinction embarque son disque ET son liseré dans le SVG : le liseré
       interne mange 15 % de la boîte. Un jeton de palier tire le disque du fond CSS : il occupe
       100 %. À boîte égale, une distinction paraissait plus petite.
       On compense la BOÎTE (.42/.85 ≈ .494) plutôt que d'unifier les montages — l'unification a
       été essayée : le glyphe y tombait à 58 % du disque, deux fois trop petit à 15 px. */
    assert.match(srcCss, /width:calc\(var\(--av,38px\)\*var\(--jeton-t,\.494\)\)/,
        'proportionnel au diametre, avec un repli pour les emplacements sans `--av`');
    assert.match(srcCss, /\.cadre-qdemi::after,\.cadre-qfini::after,\.cadre-qparfait::after\{--jeton-t:\.42;/,
        'les paliers, dont le disque occupe toute la boite, gardent la boite plus petite');
    // Sous 26 px, le médaillon couvrirait le visage : l'anneau seul.
    assert.match(srcCss, /\.comm-face\.sm::after,\.stu-rank-cadre::after\{display:none\}/);
    // Le jury garde son balayage : c'est un mouvement DANS l'anneau, il ne déborde pas.
    assert.match(srcCss, /\.cadre-jury::before\{background-size:300% 100%;animation:cadreBalaie/);
    /* Mouvement réduit : le médaillon cesse de battre mais reste POSÉ. Le masquer ferait du cadre
       le plus rare le plus terne, pour qui a justement désactivé les animations. */
    assert.match(srcCss, /\.cadre-qchelem::after\{animation:none;transform:none\}/);
});
test('la moitié s\'arrondit VERS LE HAUT', () => {
    // Sur 5 chapitres, la moitié c'est 3. Fêter à 2 annoncerait un palier non franchi — et le
    // mot « moitié » perdrait son sens à la première vérification du stagiaire.
    assert.strictEqual(palierDuMonde(etoiles([1, 1]), 5), null, '2 sur 5 : pas encore');
    assert.strictEqual(palierDuMonde(etoiles([1, 1, 1]), 5), 'qdemi', '3 sur 5 : franchi');
    // Nombre pair : 2 sur 4, sans ambiguïté.
    assert.strictEqual(palierDuMonde(etoiles([1, 1]), 4), 'qdemi');
});

test('bouclé puis sans faute, et on ne garde que le meilleur', () => {
    assert.strictEqual(palierDuMonde(etoiles([1, 2, 1]), 3), 'qfini', 'tous faits, etoiles quelconques');
    assert.strictEqual(palierDuMonde(etoiles([3, 3, 3]), 3), 'qparfait');
    /* Un chapitre à 0 étoile n'est PAS terminé. Le jeu n'enregistre que 1 à 3 (il faut la
       moitié des bonnes réponses pour valider un chapitre), mais une donnée à 0 — venue d'une
       vieille version ou d'une écriture partielle — ne doit pas compter pour un chapitre fait,
       sans quoi « Monde bouclé » tomberait sur un monde à moitié joué. */
    assert.strictEqual(palierDuMonde(etoiles([3, 0, 3]), 3), 'qdemi', '2 chapitres reellement faits sur 3');
    assert.strictEqual(palierDuMonde(etoiles([3, 0, 3, 0]), 4), 'qdemi', 'et jamais « boucle »');
});

test('le cadre prend la COULEUR de la formation', () => {
    const [c] = cadresQuest({ NIV1: etoiles([3, 3]) }, [{ code: 'NIV1', title: 'Niveau I', color: '#0e9aa7', chapitres: 2 }]);
    assert.strictEqual(c.valeur, 'qparfait|#0e9aa7', 'palier ET teinte, sur la forme des avatars');
    assert.strictEqual(c.title, 'Niveau I');
    // Formation sans couleur : un anneau transparent serait une récompense invisible.
    const [d] = cadresQuest({ X: etoiles([1, 1]) }, [{ code: 'X', color: null, chapitres: 2 }]);
    assert.match(d.valeur, /^qfini\|#[0-9a-f]{6}$/, 'repli sur une couleur reelle');
});

test('LA COULEUR DU MONDE, pas une couleur de repli', () => {
    /* MESURÉ SUR LA BASE RÉELLE, et c'est ce qui a sauvé la fonctionnalité : sur six formations,
       QUATRE ont `color = NULL`. La première version se contentait de la colonne et retombait sur
       un rouge unique — presque tous les cadres seraient sortis de la même couleur, et « la
       couleur de ta formation » n'aurait rien voulu dire.
       Le jeu ne s'est jamais contenté de la colonne : il retombe sur `colorOf`. Le cadre reprend
       la même table, et le même hachage pour un code non répertorié. */
    assert.strictEqual(couleurFormation('NIV1', null), '#1e3a8a', 'la palette, comme dans le jeu');
    assert.strictEqual(couleurFormation('NIV2', null), '#eab308');
    assert.strictEqual(couleurFormation('NIV1H', '#47cfeb'), '#47cfeb', 'la colonne prime quand elle existe');
    /* Les valeurs de hachage sont RELEVÉES DANS LE NAVIGATEUR : `hashColor` produit une chaîne
       `hsl(...)` que seul le moteur CSS sait résoudre. On a demandé au navigateur de résoudre
       `hsl(354,52%,42%)` (NIVEXP) et `hsl(297,52%,42%)` (XYZ) — la conversion serveur tombe au
       bit près. Ce test est ce qui empêche les deux de dériver. */
    assert.strictEqual(couleurFormation('NIVEXP', null), '#a3333f', 'hsl(354,52%,42%) resolu par Chrome');
    assert.strictEqual(couleurFormation('XYZ', null), '#9d33a3', 'hsl(297,52%,42%)');

    // Et la table elle-même doit rester celle du client, entrée par entrée.
    const srcLevels = fs.readFileSync(path.join(APP, 'ui/lib/levels.js'), 'utf8');
    const bloc = /const PALETTE = \{([\s\S]*?)\n\};/.exec(srcLevels)[1];
    const duClient = Object.fromEntries([...bloc.matchAll(/([A-Z0-9_]+):\s*"(#[0-9a-f]{6})"/g)].map((m) => [m[1], m[2]]));
    assert.deepStrictEqual(PALETTE, duClient, 'les deux palettes doivent rester identiques');
});

test('la couleur fait partie de la POSSESSION', () => {
    const possedes = cadresQuest({ NIV1: etoiles([3, 3]) }, [{ code: 'NIV1', color: '#0e9aa7', chapitres: 2 }]);
    assert.ok(possedeCadreQuest('qparfait|#0e9aa7', possedes));
    /* LE DÉFAUT : sans ce contrôle, « Sans faute » repeint aux couleurs d'une formation jamais
       ouverte passait — le cadre affirmait alors quelque chose de faux. */
    assert.ok(!possedeCadreQuest('qparfait|#dc3e37', possedes), 'pas la couleur d\'un autre monde');
    assert.ok(!possedeCadreQuest('qparfait', possedes), 'ni sans couleur du tout');
    assert.ok(!possedeCadreQuest('maestro|#0e9aa7', possedes), 'ni un palier qui n\'en est pas un');
    // La casse de l'hexadécimal ne doit pas décider d'une possession.
    assert.ok(possedeCadreQuest('qparfait|#0E9AA7', possedes));
});

test('la forme « palier|#rrggbb » se relit, et refuse le reste', () => {
    assert.deepStrictEqual(parseCadre('qdemi|#abcdef'), { id: 'qdemi', couleur: '#abcdef' });
    assert.deepStrictEqual(parseCadre('maestro'), { id: 'maestro', couleur: null });
    assert.deepStrictEqual(parseCadre('qdemi|rouge'), { id: 'qdemi', couleur: null }, 'pas un hexa : pas de couleur');
    assert.deepStrictEqual(parseCadre(null), { id: null, couleur: null });
});

test('LA MÊME RÈGLE des deux côtés', () => {
    /* Elle est écrite deux fois, et c'est assumé : le serveur décide de la possession, le client
       recalcule pour fêter à l'INSTANT du clic — un aller-retour ferait arriver la fête après
       que le stagiaire a refermé la fenêtre. Ce test est le lien entre les deux copies. */
    for (const src of [srcClient, srcServeur]) {
        assert.match(src, /if \(!nbChapitres\) return null;/, 'le garde-fou de la banque vide');
        assert.match(src, /if \(parfaits >= nbChapitres\) return 'qparfait';|if \(parfaits >= nbChapitres\) return "qparfait";/);
        assert.match(src, /Math\.ceil\(nbChapitres \/ 2\)/, 'la moitie arrondie vers le haut');
    }
    // Et les trois identifiants doivent être les mêmes, sinon un cadre gagné serait inconnu.
    for (const id of PALIER_IDS) assert.ok(srcCadres.includes(id), `${id} doit exister cote client`);
});

test('le serveur REFUSE un cadre de quête non gagné', () => {
    /* Le seul cadre dont la possession se vérifie à l'écriture, et pour une raison précise : la
       couleur. Les autres cadres ne peuvent rien affirmer de faux ; celui-ci, si. */
    assert.match(srcEspace, /if \(!possedeCadreQuest\(cadre, possedes\)\) \{/, 'controle a l\'ecriture');
    assert.match(srcEspace, /Ce cadre de Pizza Quest n\\'est pas encore débloqué\./);
    // Dérivé à CHAQUE lecture, jamais stocké : un chapitre ajouté par l'école doit défaire un
    // « Monde bouclé », sinon le cadre ment dès le lendemain.
    assert.match(srcEspace, /const quest_cadres = await cadresQuestDuStagiaire\(conn, learner, progress\);/);
    assert.match(srcEspace, /LEFT JOIN quest_chapter c ON c\.program_id = p\.id AND c\.active = 1/,
        'seuls les chapitres ACTIFS comptent');
    assert.match(srcEspace, /if \(isMissingSchema\(e\)\) return \[\];/, 'migration absente : liste vide, pas d\'erreur');
});

test('la teinte passe par une VARIABLE, jamais par la classe', () => {
    /* L'organisme choisit la couleur de ses formations : écrire une règle CSS par formation est
       impossible. Une seule règle par palier, déclinée par `--cadre-c`. */
    assert.match(srcCadres, /export const cadreStyle = \(valeur\) => \{/);
    assert.match(srcCadres, /"--cadre-c": couleur/);
    for (const p of PALIER_IDS) assert.match(srcCss, new RegExp(`\\.cadre-${p}[,{]`), `la regle .cadre-${p} doit exister`);
    assert.match(srcCss, /\.cadre-qdemi,\.cadre-qfini,\.cadre-qparfait\{--cadre-c:#dc3e37;/,
        'un repli, sinon une formation sans couleur donne un anneau TRANSPARENT');
});

test('la fête tombe au franchissement, une seule fois', () => {
    // Comparer l'AVANT et l'APRÈS : regarder la progression seule referait la fête à chaque
    // chapitre terminé après le palier.
    assert.match(srcClient, /export function paliersFranchis\(code, avant, apres, nbChapitres\)/);
    assert.match(srcClient, /if \(!b \|\| a === b\) return null;/, 'rien a feter si le palier n\'a pas change');
    assert.match(srcClient, /return dejaFete\(code, b\) \? null : b;/, 'et la memoire tranche le reste');
    assert.match(srcQuest, /const palier = paliersFranchis\(code, avant, apres, nb\);/, 'appele au bon endroit');
    assert.match(srcQuest, /if \(palier\) \{ marquerFete\(code, palier\); setFete\(\{ palier, monde \}\); \}/);
    // La fête montre le VRAI cadre (mêmes classes) : un dessin approchant finirait par diverger.
    assert.match(srcQuest, /className=\{`pq-fete-cadre cadre cadre-\$\{palier\}`\}/);
});

test('le cadre entoure la PHOTO, pas la légende', () => {
    /* LE DÉFAUT SIGNALÉ, et il se voyait tout de suite : dans « Mon profil », le cadre était rendu
       en pastille de 14 px DANS LA LIGNE DE TEXTE, à dix pixels de l'avatar. On voyait bien un
       anneau, mais détaché de ce qu'il est censé entourer — alors que cet écran est exactement
       l'endroit où l'on vient vérifier de quoi on a l'air. */
    assert.match(srcModale, /<span className=\{`pf-avatar \$\{cadreClass\(cadreValeur\(cadre\)\)\}`\}/,
        'l\'anneau doit etre porte par la photo de profil');
    assert.match(srcModale, /\.\.\.cadreStyle\(cadre\.valeur\)/, 'et prendre la teinte du cadre de quete');
    /* LA PHOTO EST RONDE, comme tous les autres avatars de l'app. C'était le seul carré arrondi,
       et cette exception à elle seule obligeait l'anneau à recalculer son rayon d'angle. La règle
       spéciale a disparu AVEC son motif : la générique à 50 % suffit désormais. */
    assert.match(srcCss, /\.pf-avatar\{width:64px;height:64px;border-radius:50%/, 'ronde comme les autres');
    assert.doesNotMatch(srcCss, /\.pf-avatar\.cadre::before\{border-radius/, 'plus de rayon d\'exception a tenir');
    // Le nom du cadre reste écrit, mais SANS sa pastille : deux anneaux à dix pixels d'écart
    // posaient la question de savoir lequel est le vrai.
    assert.doesNotMatch(srcModale, /stu-rank-cadre " \+ cadreClass\(cadre\.valeur/, 'plus de pastille detachee');
});

test('le nom du cadre tient dans une tuile', () => {
    /* Le libellé portait le TITRE COMPLET de la formation — « Sans faute — Pizzaïolo Niveau II –
       Empâtements Indirects « Poolish - Biga » » — soit quatre lignes dans une tuile de 90 px,
       qui écrasaient le nom du cadre qu'on était venu lire. Le code tient en cinq caractères et
       distingue tout aussi bien ; le titre reste en info-bulle. */
    assert.match(srcCadres, /nom: p\.nom \|\| q\.palier, formation: q\.code, titre: q\.title,/);
    assert.match(srcModale, /\{c\.formation && <span className="pf-cadre-code">\{c\.formation\}<\/span>\}/);
    assert.match(srcModale, /title=\{\[c\.titre, possede \? c\.desc \|\| c\.nom : \(c\.condition \|\| c\.desc\)\]/,
        'le titre complet doit rester accessible au survol');
});

test('l\'anneau suit le diamètre, et le métal a du relief', () => {
    /* DEUX DÉFAUTS TROUVÉS EN POSANT LES CADRES CÔTE À CÔTE, à 38, 64 et 96 px.
     *
     * 1. L'ÉPAISSEUR ÉTAIT FIGÉE à 3 px. `AvatarCadre` le promet pourtant depuis toujours dans son
     *    commentaire — « l'épaisseur du cadre doit suivre le diamètre » — mais la feuille de style
     *    ne l'a jamais fait. À 38 px l'anneau est juste ; à 64 il devient un fil, et le relief n'a
     *    plus la place de se voir.
     * 2. BRONZE, ARGENT ET OR ÉTAIENT DES RUBANS. Un dégradé linéaire à trois arrêts en diagonale
     *    ne ressemble pas à du métal : sur une bordure de 3 px, les trois paliers ne se
     *    distinguaient plus que par leur teinte. La progression, qui se mérite, ne se lisait donc
     *    pas — il fallait connaître le code couleur.
     *
     * Ce qui fait le métal, c'est le SPÉCULAIRE : une bande brillante à un endroit précis, un creux
     * sombre à l'opposé, une transition franche. Un dégradé conique le donne sur un anneau — la
     * lumière tourne avec la forme, comme sur une médaille qu'on incline. */
    assert.match(srcCss, /\.cadre\{--anneau:clamp\(2px,calc\(var\(--av,38px\)\*\.085\),5px\)\}/,
        'l\'epaisseur doit se calculer sur le diametre');
    /* `inset` ET `padding` viennent de la MÊME grandeur, sinon l'anneau se décentre. Le padding
       porte en plus un demi-pixel de recouvrement — cf. le test de la couture, plus bas. */
    assert.match(srcCss, /\.cadre::before\{[\s\S]*?inset:calc\(var\(--anneau\)\*-1\);[\s\S]*?padding:calc\(var\(--anneau\)/,
        'et piloter inset ET padding, sinon l\'anneau se decentre');
    /* Les deux réglages manuels passent par la MÊME grandeur. Laisser un `inset` en dur ailleurs
       ferait repartir cet emplacement-là à l'ancienne épaisseur au prochain changement. */
    assert.doesNotMatch(srcCss, /\.cadre::before\{inset:-\d/, 'aucune epaisseur en dur ailleurs');
    assert.match(srcCss, /\.stu-rank-cadre\.cadre\{--anneau:2px\}/);
    assert.match(srcCss, /\.prof-ava\.cadre\{--anneau:5px\}/);

    // Les métaux : un conique, pas un ruban linéaire.
    for (const m of ['bronze', 'argent', 'or', 'qpas', 'qcollec', 'qcent']) {
        assert.match(srcCss, new RegExp(`\\.cadre-${m}\\{--cadre-bg:conic-gradient\\(from 210deg`),
            `${m} doit porter un speculaire`);
    }
    /* « Touche-à-tout » garde son arc-en-ciel : c'est SON sujet — plusieurs formations à la fois.
       Un spéculaire par-dessus brouillerait les teintes qu'il est censé énumérer. */
    assert.match(srcCss, /\.cadre-qtouche\{--cadre-bg:conic-gradient\(from -90deg,#dc3e37/);
});

test('les trois paliers portent la couleur de LEUR formation', () => {
    /* CE QUI MANQUAIT, et c'est l'utilisateur qui l'a vu : seul « Sans faute » avait un jeton. Les
       deux autres paliers — donc la plupart des cadres de formation — restaient un anneau nu là
       où chaque exploit portait son emblème. Le système avait l'air inachevé exactement là où il
       est le plus porté.

       Et leur dessin NE PEUT PAS être figé dans le fichier : un cadre de formation n'existe pas
       dans l'absolu, il est « sur la voie » SUR une formation et en porte la teinte. D'où le
       montage inverse des huit autres — le disque vient du fond CSS (`--cadre-c`), le glyphe est
       un SVG posé par-dessus. La forme dit le palier, la couleur dit la formation. */
    assert.match(srcCss, /\.cadre-qdemi::after,\.cadre-qfini::after,\.cadre-qparfait::after\{--jeton-t:\.42;\n\s+background:var\(--jeton\) center\/58% no-repeat,var\(--cadre-c,#dc3e37\)/,
        'le disque doit prendre la couleur de la formation');
    for (const p of ['qdemi', 'qfini', 'qparfait']) {
        assert.match(srcCss, new RegExp(`\\.cadre-${p}::after\\{--jeton:url\\('data:image/svg\\+xml,`), `${p} doit avoir son glyphe`);
    }

    /* BLANC CERNÉ DE NAVY, ET C'EST MESURÉ. Sur les couleurs réelles de l'école, aucune teinte
       unique ne passe partout : le blanc tombe à 1,23:1 sur le jaune de NIV2, le navy à 1,44:1 sur
       le bleu de NIV1. Cernée, la silhouette est portée par son remplissage sur les teintes
       sombres et par son contour sur les claires — 11:1 d'un côté, 13:1 de l'autre.
       C'est la règle de contraste (priorité 1) appliquée à une couleur qu'on ne connaît pas à
       l'avance : l'organisme choisit librement celle de ses formations. */
    for (const p of ['qdemi', 'qfini', 'qparfait']) {
        const jeton = new RegExp(`\\.cadre-${p}::after\\{--jeton:url\\('[^']*'\\)\\}`).exec(srcCss)[0];
        assert.match(jeton, /fill="%23fff"/, `${p} : remplissage blanc pour les fonds sombres`);
        assert.match(jeton, /stroke="%231b1f3a"/, `${p} : contour navy pour les fonds clairs`);
    }
});

test('le mouvement dit le palier — immobile, battement, feu', () => {
    /* Troisième lecture du même objet : la FORME dit lequel des trois paliers, la COULEUR dit sur
       quelle formation, le MOUVEMENT dit combien il coûte. À mi-chemin il n'y a rien à fêter —
       et c'est cette immobilité qui donne sa valeur au reste : si tout bouge, plus rien ne se
       remarque. */
    assert.match(srcCss, /\.cadre-qdemi::after\{animation:none\}/, 'a mi-chemin, rien ne bouge');
    assert.match(srcCss, /\.cadre-qfini::after\{animation:cadreCoche 2\.2s var\(--ease\) infinite\}/);
    assert.match(srcCss, /@keyframes cadreCoche\{0%,100%\{transform:scale\(1\)\}45%\{transform:scale\(1\.3\)\}\}/,
        'un battement franc, plus ample que le fremissement des exploits');
    assert.match(srcCss, /\.cadre-qparfait::after\{animation:cadreEclat [^,]+,cadreFeu /, 'l\'a-coup ET la gerbe');

    /* LA GERBE EST PROPORTIONNELLE AU DIAMÈTRE, et ce n'est pas de l'élégance : le jeton mesure
       42 % du diamètre, donc tout ce qui reste à moins de 21 % du centre est CACHÉ DERRIÈRE LUI.
       Les deux premières versions faisaient exactement cela — une gerbe invisible, mesurée à
       l'écran avant d'être corrigée. Les étincelles naissent donc au bord du jeton (31 %). */
    const feu = /@keyframes cadreFeu\{[\s\S]*?\n\}/.exec(srcCss)[0];
    assert.match(feu, /calc\(var\(--av,38px\)\*0\.3\d+\)/, 'les etincelles naissent au bord du jeton');
    assert.ok(!/0 0 0 -\d+px var\(--cadre-c/.test(feu), 'aucune etincelle a rayon nul : elle serait invisible');
    // Six directions, une par 60° — et le liseré blanc en tête de CHAQUE image-clé.
    for (const pct of ['0%,54%', '61%', '76%', '100%']) {
        const cle = new RegExp(`${pct.replace(/[%,]/g, m => '\\' + m)}\\{box-shadow:([^}]*)\\}`).exec(feu);
        assert.ok(cle, `image-cle ${pct} attendue`);
        // Six étincelles + le liseré = sept couches. Compter les virgules HORS parenthèses : les
        // `calc(var(--av,38px)*…)` en contiennent, et un découpage naïf en comptait le double.
        const couches = cle[1].split(/,(?![^(]*\))/);
        assert.strictEqual(couches.length, 7, `${pct} : six etincelles plus le lisere`);
        assert.match(cle[1], /^0 0 0 1\.6px #fff,/,
            'le lisere blanc est LUI AUSSI un box-shadow, et une image-cle remplace la liste entiere : '
            + 'l\'omettre le faisait disparaitre pendant toute l\'animation');
    }
    /* Mouvement réduit : la gerbe s'éteint, mais le liseré revient — sans lui, les étincelles
       resteraient figées là où l'animation s'est arrêtée, six points posés au hasard. */
    assert.match(srcCss, /\.cadre-qparfait::after\{box-shadow:0 0 0 1\.6px #fff\}/);
});

test('le sélecteur est rangé par ce qu\'il faut FAIRE pour l\'avoir', () => {
    /* CE QUI N'ALLAIT PAS. Dix-neuf cadres se suivaient à plat, dans l'ordre où les trois familles
       avaient été écrites. « Sans cadre » — le choix neutre, celui qu'on cherche précisément quand
       on veut TOUT retirer — arrivait en DIXIÈME position, coincé entre le Grand Chelem et Bronze.
       Et rien ne disait pourquoi « Premier pas » suivait « Sans faute » : deux familles
       différentes, aucune séparation.

       Quatre familles nommées, plus le choix neutre, rangées par ce qu'il faut faire pour les
       avoir : jouer sur une formation, jouer partout, venir se former, être distingué par
       l'école. L'intitulé porte le COMMENT — sans lui, « Exploits » et « Parcours » se
       ressemblent assez pour qu'on cherche la différence dans les tuiles. */
    const ordre = /const groupes = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[quest, exploits\]\);/.exec(srcModale)[0];
    const titres = [...ordre.matchAll(/titre: "([^"]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(titres, ['Aucun', 'Mes formations', 'Exploits', 'Parcours', 'Distinctions'],
        '« Aucun » d\'abord : c\'est le seul choix qu\'on cherche pour retirer, pas pour montrer');
    for (const m of ordre.matchAll(/quoi: "([^"]+)"/g)) assert.ok(m[1].length > 8, 'chaque famille dit COMMENT on la gagne');

    /* Les cadres d'une même formation restent ENSEMBLE et dans l'ordre où on les décroche : trié
       par palier seul, les trois « Sur la voie » de trois formations se seraient suivis, et on
       aurait cherché où est passée la suite de la première. */
    assert.match(ordre, /const ordrePalier = \{ qdemi: 0, qfini: 1, qparfait: 2 \};/);
    assert.match(ordre, /\.sort\(\(a, b\) => \(a\.formation \|\| ""\)\.localeCompare\(b\.formation \|\| ""\)\s*\n\s*\|\| ordrePalier\[a\.id\] - ordrePalier\[b\.id\]\)/,
        'par formation, PUIS par palier');

    /* Un groupe VIDE ne s'affiche pas : un intitulé « Mes formations » suivi de rien donnerait
       l'impression d'un chargement raté, alors qu'il signifie qu'on n'a pas encore joué. */
    assert.match(ordre, /\.filter\(\(g\) => g\.cadres\.length\)/, 'pas de section vide');
    assert.match(srcModale, /<div className="pf-cadres-titre">\{g\.titre\}<span className="hint">\{g\.quoi\}<\/span><\/div>/);
});

test('l\'anneau ne laisse pas de couture avec l\'avatar', () => {
    /* LE DÉFAUT SIGNALÉ, et la géométrie était pourtant JUSTE : le bord intérieur de l'anneau
       tombait exactement sur le bord de l'avatar, au centième de pixel près (relevé : boîte de
       38 px, `inset:-3.23px`, `padding:3.23px`). C'est le RENDU qui ne suivait pas — deux cercles
       antialiasés qui se touchent sans se chevaucher ont chacun une couverture partielle sur le
       même pixel, et la somme ne fait pas un. Il restait une ligne claire sur toute la
       circonférence, qu'on lit comme un cadre mal posé.

       Un demi-pixel de recouvrement suffit à la faire disparaître. Il passe par le PADDING, pas
       par l'`inset` : le bord extérieur ne doit pas bouger, sinon l'anneau maigrit de la même
       quantité qu'il mord — on aurait déplacé le problème au lieu de le résoudre. */
    assert.match(srcCss, /\.cadre::before\{[\s\S]*?inset:calc\(var\(--anneau\)\*-1\);/, 'le bord exterieur ne bouge pas');
    assert.match(srcCss, /padding:calc\(var\(--anneau\) \+ \.5px\)/, 'et le bord interieur mord d\'un demi-pixel');
    /* Une seule grandeur pilote l'anneau partout : les deux emplacements qui la fixent à la main
       la fixent, eux aussi, par `--anneau`. Un `padding` en dur ailleurs manquerait le
       recouvrement, et la couture reviendrait à cet endroit-là seulement. */
    assert.doesNotMatch(srcCss, /cadre::before\{[^}]*padding:\d/, 'aucune epaisseur en dur');
});

test('les résultats de concours ne se confondent plus', () => {
    /* « CHAMPION » COUVRAIT SEUL TOUS LES PODIUMS, ce qui revenait à donner le même cadre au
       vainqueur et au troisième — un organisme qui remet des prix ne peut pas les confondre.
       Trois s'y ajoutent, et chacun se distingue par sa MATIÈRE autant que par son jeton :
       l'or reste au sommet, le laurier prend une catégorie, l'argent une place de podium, et le
       prix spécial sort de l'échelle avec une couleur que rien d'autre ne porte. */
    const srcCadres2 = fs.readFileSync(path.join(APP, 'ui/lib/cadres.js'), 'utf8');
    for (const [id, nom] of [['categorie', 'Champion de catégorie'], ['podium', 'Podium'], ['prix', 'Prix spécial']]) {
        // Les déclarations sont alignées à la main : l'espacement varie d'une ligne à l'autre.
        assert.match(srcCadres2, new RegExp(`id: "${id}",\\s+nom: "${nom}",\\s+exclusif: true`), `${id} doit exister`);
        assert.match(srcCss, new RegExp(`\\.cadre-${id}\\{--cadre-[ab]`), `${id} doit avoir son anneau`);
        assert.match(srcCss, new RegExp(`\\.cadre-${id}::after\\{--jeton:url\\('data:image/svg\\+xml,`), `${id} doit avoir son jeton`);
        // Et surtout figurer dans la règle PARTAGÉE : elle pose `content`, la taille et le fond.
        // Sans elle, le cadre a un jeton et un geste, mais aucune boîte pour les porter — rien
        // ne s'affiche, et le build n'en dit pas un mot. C'est arrivé aux trois d'un coup.
        assert.match(srcCss, new RegExp(`\\.cadre-${id}::after,[\\s\\S]{0,300}?content:""`), `${id} doit avoir sa boite`);
    }
    // Le serveur doit les accepter, sinon le choix est refusé en 422 après avoir été proposé.
    assert.match(srcEspace, /'champion', 'categorie', 'podium', 'prix', 'jury', 'fondateur', 'ecole'\]/);

    /* Chaque distinction a SON geste, choisi pour dire ce qu'elle récompense : on brandit une
       coupe, une balance penche, une pousse grandit, on monte d'une marche, un ruban ondule.
       Avant, les six partageaient le même battement — pour des récompenses sans rapport. */
    for (const [id, geste] of [['champion', 'jetonBrandit'], ['categorie', 'jetonBrandit'],
        ['podium', 'jetonMarche'], ['prix', 'jetonRuban'], ['jury', 'jetonPese'], ['fondateur', 'jetonPousse']]) {
        assert.match(srcCss, new RegExp(`\\.cadre-${id}::after\\{animation:${geste} `), `${id} : ${geste}`);
    }
    /* La pousse et le ruban PIVOTENT ailleurs qu'au centre : une graine grandit par le haut, un
       ruban est épinglé en haut du disque. Au centre, l'une gonfle et l'autre tourne sur place. */
    assert.match(srcCss, /\.cadre-fondateur::after\{[^}]*transform-origin:50% 85%\}/);
    assert.match(srcCss, /\.cadre-prix::after\{[^}]*transform-origin:50% 28%\}/);
});

test('l\'arcade est en tête, et une seule fois', () => {
    /* LES JEUX ÉTAIENT RANGÉS PAR FORMATION, mais l'attribution était en trompe-l'œil : sur les
       sept groupes, le Constructeur apparaissait dans SIX et « Chrono Rush » dans les SEPT. On
       répétait deux jeux identiques sept fois pour trois variantes réellement différentes — les
       trois objectifs du Simulateur.

       ET LE MODÈLE DE DONNÉES ÉTAIT DÉJÀ D'ACCORD, c'est ce qui a tranché : `finishMini`
       enregistre sous `prog["constructeur"]`, une clé PLATE, jamais sous le monde. Jouer depuis
       Niveau I ou depuis Napolitaine écrivait au même endroit. Seul l'affichage prétendait que
       ces jeux appartenaient à une formation. */
    assert.match(srcQuest, /const next = \{ \.\.\.p, \[key\]: \{ 0: Math\.max\(stars, \(p\[key\] \|\| \{\}\)\[0\] \|\| 0\) \} \};/,
        'le score des jeux est global, et l\'etait deja');
    assert.doesNotMatch(srcQuest, /GAMES_BY_ROLE/, 'plus de catalogue par role');
    assert.doesNotMatch(srcQuest, /<WorldGames/, 'plus d\'etagere dans un monde');
    // L'arcade est rendue AVANT la carte, dans la branche « accueil ».
    assert.match(srcQuest, /<Arcade prog=\{prog\} onGame=\{\(g\) => setMini\(\{ key: g\.key, obj: g\.obj \}\)\} \/>\s*\n\s*<FormationMap/,
        'l\'arcade doit preceder la carte des formations');
    /* Le Simulateur garde ses styles, mais c'est LUI qui les propose : ouvert sans objectif, il
       affiche son choix de pizzas. Le seul lien réel avec les formations survit sans les six
       répétitions. */
    assert.match(srcQuest, /const GAME_SIM = \{ key: "simulateur", obj: null,/);
    const srcSim = fs.readFileSync(path.join(APP, 'ui/components/SimulateurPizza.jsx'), 'utf8');
    assert.match(srcSim, /\{!obj \? \(/, 'sans objectif, le simulateur ouvre son choix');

    /* LE RECORD EST PERSONNEL, ET SEULEMENT LUI. Un classement nominatif installerait, dans une
       promotion de vingt, dix-sept personnes à demeure dans la moitié basse — celles-là mêmes
       qu'on veut faire revenir. Et sur une session de trois, il serait franchement triste. */
    assert.match(srcQuest, /const record = g\.key \? \(prog\[g\.key\] \|\| \{\}\)\[0\] \|\| 0 : 0;/);
    assert.match(srcQuest, /\{record \? "ton record" : "jamais joué"\}/);
    /* Et rien ne va CHERCHER le score des autres : un motif sur les mots interdits attraperait
       ce commentaire-ci. On vérifie ce qui compte — aucun appel réseau autre que les trois
       lectures du profil et des chapitres. */
    const importees = /import \{([^}]*)\} from "\.\.\/api\/apiClient\.js";/.exec(srcQuest)[1]
        .split(',').map((x) => x.trim()).filter(Boolean).sort();
    assert.deepStrictEqual(importees, ['getMyFormations', 'getMyProfile', 'getPlayableChapters'],
        'aucune lecture du score des autres stagiaires');
});

test('la piste montre ce que la formation rapporte, et où on en est', () => {
    /* CE QUI MANQUAIT. Les trois cadres d'une formation s'obtenaient sans qu'on ait jamais su
       qu'ils existaient : la fête tombait au franchissement, et c'était la PREMIÈRE fois qu'on en
       entendait parler. Un stagiaire à 9 chapitres sur 20 n'avait aucun moyen de savoir qu'il en
       restait UN à faire pour décrocher le premier — donc aucune raison de le faire. */
    assert.match(srcQuest, /<PisteDesCadres world=\{world\} prog=\{prog\} nbChapitres=\{chapters\.length\} \/>/,
        'sous le chemin des chapitres');
    // Sans chapitre, pas de piste : elle promettrait trois cadres que la banque ne permet pas.
    assert.match(srcQuest, /if \(!nbChapitres\) return null;/);

    /* CHAQUE BARRE PART DE ZÉRO, SUR SON ÉCHELLE. Mesurer « depuis le jalon précédent » donnait
       un résultat exact mais illisible, et c'est le navigateur qui l'a montré : à 10 chapitres sur
       20, « Monde bouclé » affichait 0 % (rien depuis la moitié) pendant que « Sans faute »
       affichait 40 % — le dernier paraissait plus avancé que celui d'avant. Pire, « Sans faute »
       partageait le seuil de « Monde bouclé » tout en se comptant sur une AUTRE échelle, celle des
       chapitres à trois étoiles : son segment partait de 20 sur une échelle qui n'allait qu'à 8. */
    assert.match(srcQuest, /\{ id: "qfini", nom: "Monde bouclé", compteur: "faits", de: \(\) => 0, a: \(n\) => n \}/);
    assert.match(srcQuest, /\{ id: "qparfait", nom: "Sans faute", compteur: "parfaits", de: \(\) => 0, a: \(n\) => n \}/);
    assert.match(srcQuest, /const compte = j\.compteur === "parfaits" \? parfaits : faits;/,
        'chaque jalon porte SON compteur, au lieu de le deduire du precedent');

    /* LES JALONS SONT LES VRAIS CADRES, mêmes classes et même teinte : ce qu'on voit est ce qu'on
       portera. Verrouillé, `--cadre-c` passe au gris — l'anneau ET son jeton grisent ensemble,
       sans qu'il faille dessiner une version éteinte de chacun. */
    assert.match(srcQuest, /className=\{`pq-jalon-rond cadre cadre-\$\{j\.id\}`\}/);
    assert.match(srcQuest, /"--cadre-c": acquis \|\| encours \? world\.color : "var\(--dim\)"/);
    // Le premier jalon a son segment lui aussi, sinon la piste commence par un rond flottant.
    assert.match(srcQuest, /\(i === 0 \? " debut" : ""\)/);
    assert.match(srcCss, /\.pq-jalon-lien\.debut\{left:0;margin-left:0\}/);
});
