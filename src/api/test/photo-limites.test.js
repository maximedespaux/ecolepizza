/**
 * Les plafonds d'une photo de publication : annoncés à l'écran, et cohérents avec le serveur.
 *
 * TROIS CHIFFRES EN JEU, et ils doivent rester dans cet ordre :
 *   · 550 Ko  — la cible de la réduction faite dans le NAVIGATEUR (lib/image.js) ;
 *   · 600 Ko  — ce que le CONTRÔLEUR accepte, au-delà il répond 413 ;
 *   · 800 Ko  — la coupure de `multer`, volontairement au-dessus, pour que le contrôleur puisse
 *               répondre un message lisible plutôt qu'une erreur brute de transport.
 *
 * SI LA CIBLE PASSAIT AU-DESSUS DU PLAFOND SERVEUR, une photo réduite dans les règles se ferait
 * refuser à l'arrivée — et personne ne comprendrait pourquoi : l'écran aurait dit « réduite à
 * 620 Ko », l'envoi aurait échoué, et les deux nombres auraient l'air d'accord. Le genre de
 * dérive qui ne se voit qu'en production, sur la photo de quelqu'un.
 *
 * ET CE QUI EST ANNONCÉ COMPTE AUTANT. Écrire « 550 Ko maximum » tout court laisserait croire
 * qu'il faut fournir une photo déjà légère — or une photo de téléphone pèse 3 à 8 Mo et passe
 * très bien : elle est réduite avant l'envoi. Mesuré : un PNG de 10 Mo ressort à 523 Ko. La
 * mention dit donc d'abord que la réduction est AUTOMATIQUE.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcImage = fs.readFileSync(path.join(APP, 'ui/lib/image.js'), 'utf8');
const srcPost = fs.readFileSync(path.join(APP, 'ui/components/QuestionPost.jsx'), 'utf8');
const srcComm = fs.readFileSync(path.join(API, 'controllers/community.controller.js'), 'utf8');
const srcRoutes = fs.readFileSync(path.join(API, 'routes/community.routes.js'), 'utf8');

const nombre = (src, re, quoi) => {
    const m = re.exec(src);
    assert.ok(m, `${quoi} introuvable`);
    return Number(m[1]);
};

test('la cible de réduction reste SOUS ce que le serveur accepte', () => {
    const cible = nombre(srcImage, /export const PHOTO_MAX_KO = (\d+);/, 'PHOTO_MAX_KO');
    const serveur = nombre(srcComm, /f\.buffer\.length > (\d+) \* 1024/, 'plafond du controleur');
    const transport = nombre(srcRoutes, /fileSize: (\d+) \* 1024/, 'coupure multer');
    assert.ok(cible < serveur,
        `une photo reduite a ${cible} Ko serait refusee par un serveur qui plafonne a ${serveur} Ko`);
    assert.ok(serveur < transport,
        `multer (${transport} Ko) doit couper APRES le controleur (${serveur} Ko), sinon le message lisible n'arrive jamais`);
});

test('le plafond affiché vient du code, il n\'est pas retapé', () => {
    // Un nombre écrit en dur dans le JSX dériverait le jour où l'on change la réduction.
    assert.match(srcImage, /export const PHOTO_MAX_KO/, 'la limite doit etre exportee');
    assert.match(srcImage, /export const PHOTO_MAX_PX/, 'la taille aussi');
    assert.match(srcImage, /\{ maxPx = PHOTO_MAX_PX, maxKo = PHOTO_MAX_KO \}/,
        'la reduction doit utiliser ces memes constantes');
    assert.match(srcPost, /import \{ reduireImage, PHOTO_MAX_KO, PHOTO_MAX_PX \}/, 'l\'ecran doit les importer');
    assert.match(srcPost, /\{PHOTO_MAX_KO\} Ko et \{PHOTO_MAX_PX\} px maximum/, 'et les afficher, pas les retaper');
});

test('la mention dit que la réduction est AUTOMATIQUE avant d\'annoncer un plafond', () => {
    /* L'ordre des mots fait le sens. « 550 Ko maximum » en tête ferait renoncer quelqu'un dont
       la photo de 6 Mo serait passée sans problème. */
    assert.match(srcPost, /Réduite automatiquement · \{PHOTO_MAX_KO\}/,
        'la reduction automatique doit venir en premier');
    // Une fois la photo choisie, son poids RÉEL : c'est la seule preuve que la réduction a eu lieu.
    assert.match(srcPost, /Réduite à <b>\{Math\.round\(photo\.size \/ 1024\)\} Ko<\/b>/,
        'le poids reel doit s\'afficher apres le choix');
});

const srcCam = fs.readFileSync(path.join(APP, 'ui/components/PriseDePhoto.jsx'), 'utf8');

test('« Prendre une photo » marche des DEUX côtés, pas seulement sur téléphone', () => {
    /* PREMIER ESSAI, INSUFFISANT : seul l'attribut `capture` d'un `<input>`. Il ouvre l'appareil
     * photo sur téléphone et est PUREMENT IGNORÉ sur ordinateur, où le bouton rouvrait le
     * sélecteur de fichiers — il mentait sur ce qu'il fait. On l'avait donc masqué sur poste
     * fixe, ce qui revenait à ne pas rendre le service : un formateur devant son écran a une
     * webcam et veut s'en servir.
     * `getUserMedia` marche partout. L'`<input capture>` ne reste que comme REPLI, pour le cas
     * d'un contexte non sécurisé (HTTP nu sur une IP de réseau local). */
    assert.match(srcPost, /navigator\.mediaDevices\?\.getUserMedia/, 'le flux en direct doit etre le chemin PRINCIPAL');
    assert.match(srcPost, /\? "flux"/, 'et etre choisi en premier');
    assert.match(srcPost, /\? "capture" : null/, 'l\'input `capture` ne reste qu\'en repli');
    assert.match(srcPost, /\{camera && \(/, 'le bouton suit le chemin disponible, plus le seul pointeur');
});

test('la caméra est TOUJOURS éteinte quand la fenêtre se ferme', () => {
    /* CE QUI SE PAIE CHER SI ON L'OUBLIE : un flux laissé ouvert garde la caméra allumée, voyant
     * compris, bien après la fermeture. Vérifié dans le navigateur sur un flux synthétique :
     * après capture, les pistes passent à « ended ».
     * QUATRE chemins mènent à l'arrêt, et il en manquerait forcément un sans y penser : la
     * fermeture, le démontage, la capture, et la course où l'on ferme PENDANT que l'utilisateur
     * répond à la demande d'autorisation — le flux arrive alors qu'il n'y a plus de fenêtre. */
    assert.match(srcCam, /fluxRef\.current\?\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/, 'un arret idempotent');
    assert.match(srcCam, /return \(\) => \{ annule = true; arreter\(\); \};/, 'au demontage');
    assert.match(srcCam, /const fermer = \(\) => \{ arreter\(\); onClose\(\); \};/, 'a la fermeture');
    assert.match(srcCam, /if \(annule\) \{ flux\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\); return; \}/,
        'et dans la course fermeture / autorisation');
});

test('la capture prend la taille du FLUX, pas celle affichée', () => {
    // L'aperçu est mis à l'échelle par le CSS : capturer sa taille à l'écran donnerait une photo
    // au rabais, dépendante de la largeur de la fenêtre.
    assert.match(srcCam, /canvas\.width = v\.videoWidth;/, 'largeur intrinseque');
    assert.match(srcCam, /canvas\.height = v\.videoHeight;/, 'hauteur intrinseque');
    /* `ideal` et non `exact` : sur téléphone on veut la caméra arrière (on photographie une
       pâte), sur ordinateur il n'y en a qu'une — `exact` y ferait ÉCHOUER la demande. */
    assert.match(srcCam, /facingMode: \{ ideal: "environment" \}/, 'camera arriere souhaitee, pas exigee');
    // Et le refus d'autorisation se dit en français, pas en « NotAllowedError ».
    assert.match(srcCam, /e\?\.name === "NotAllowedError" \? "Accès à la caméra refusé/, 'message lisible');
});

test('« Prendre une photo » n\'apparaît que là où elle fait quelque chose', () => {
    /* LIMITE DU WEB, pas choix esthétique : l'attribut `capture` ouvre l'appareil photo sur
     * téléphone et est purement IGNORÉ sur ordinateur. Un bouton visible partout y rouvrirait le
     * sélecteur de fichiers — deux boutons identiques côte à côte, dont l'un ment sur ce qu'il
     * fait. `pointer: coarse` (le doigt plutôt que la souris) est le meilleur signal disponible ;
     * une webcam branchée sur un poste fixe ne dit rien, elle, de ce que `capture` fera. */

    /* DEUX ENTRÉES SÉPARÉES, et non un attribut qu'on bascule : poser `capture` puis le retirer
       sur le même `<input>` laisse certains navigateurs sur leur première décision. */
    const entrees = [...srcPost.matchAll(/<input ref=\{(fichierRef|appareilRef)\} type="file"[^>]*/g)].map((m) => m[0]);
    assert.strictEqual(entrees.length, 2, 'une entree pour le fichier, une pour l\'appareil');
    assert.ok(!/capture/.test(entrees.find((e) => /fichierRef/.test(e))), 'celle du fichier NE doit PAS capturer');
    assert.match(entrees.find((e) => /appareilRef/.test(e)), /capture="environment"/,
        'camera ARRIERE : on photographie une pate, pas son visage');

    /* Et surtout : la photo prise passe par LE MÊME `choisirPhoto`. Un cliché de téléphone pèse
       3 à 8 Mo — sans la réduction, il serait refusé par le serveur. */
    const avecCapture = /<input ref=\{appareilRef\}[^>]*onChange=\{(\w+)\}/.exec(srcPost);
    assert.ok(avecCapture, 'gestionnaire de l\'appareil introuvable');
    assert.strictEqual(avecCapture[1], 'choisirPhoto', 'la photo prise doit etre reduite comme les autres');
    /* Les TROIS origines — fichier choisi, appareil natif, capture en direct — convergent vers
       `accepterPhoto`. C'est ce qui garantit la réduction : un cliché de webcam ou de téléphone
       pèse plusieurs mégaoctets et serait refusé par le serveur tel quel. */
    assert.match(srcPost, /const choisirPhoto = \(e\) => accepterPhoto\(e\.target\.files\?\.\[0\]\);/, 'les deux inputs');
    assert.match(srcPost, /onPhoto=\{\(f\) => \{ setAppareilOuvert\(false\); accepterPhoto\(f\); \}\}/, 'la capture en direct');
    assert.match(srcPost, /async function accepterPhoto\(f\) \{/, 'un seul point d\'entree');
});
