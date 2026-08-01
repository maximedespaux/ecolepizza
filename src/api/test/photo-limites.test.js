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
