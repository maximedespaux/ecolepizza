/**
 * TOUTE IMAGE ENVOYÉE PAR QUELQU'UN EST RÉDUITE DANS SON NAVIGATEUR (demandé le 2026-09-23).
 *
 * L'OUTIL EXISTAIT, IL NE SERVAIT QU'UNE FOIS. `lib/image.js` réduisait déjà les photos de la
 * Communauté ; les dix autres chemins d'envoi partaient en brut. Le plus parlant : l'image d'un
 * e-mail, plafonnée à 600 Ko côté serveur, quand une photo de téléphone en pèse 3 à 5 mille —
 * elle repartait en 413, et le commentaire du contrôleur supposait pourtant une réduction
 * navigateur qui n'existait pas.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · chaque écran qui envoie une image passe par `reduireSiImage` / `reduireEnDataUrl` ;
 *   · le plafond de chaque PROFIL reste SOUS la limite du serveur qu'il alimente — sinon une
 *     image réduite dans les règles se ferait refuser à l'arrivée, ce qui est le pire des deux
 *     mondes : on a dégradé la qualité ET l'envoi échoue ;
 *   · un PDF passe INTACT — on ne recompresse pas un document dans un navigateur ;
 *   · la réduction ne JETTE jamais : un format exotique repart tel quel plutôt que d'être perdu.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(APP, 'ui', f), 'utf8');
const IMAGE = lireUi('lib/image.js');

/**
 * Le plafond DUR d'un profil, lu dans le source : personne ne le retape ici.
 *
 * C'est `maxDur` qu'il faut confronter au serveur, pas `maxKo`. `maxKo` n'est qu'une CIBLE —
 * une image très détaillée peut la dépasser sans franchir son plancher de qualité, et on
 * l'envoie alors quand même (cf. lib/image.js). Le seul engagement vis-à-vis du serveur est
 * donc : ce qui part reste sous `maxDur`.
 */
function profilKo(nom) {
    const bloc = new RegExp(`${nom}: \\{([^}]*)\\}`).exec(IMAGE);
    assert.ok(bloc, `profil « ${nom} » introuvable`);
    const dur = /maxDur: (\d+)/.exec(bloc[1]);
    const cible = /maxKo: (?:PHOTO_MAX_KO|(\d+))/.exec(bloc[1]);
    assert.ok(dur, `profil « ${nom} » : un plafond DUR est obligatoire, c'est lui que le serveur voit`);
    assert.ok(cible, `profil « ${nom} » : cible manquante`);
    return Number(dur[1]);
}
const nombre = (src, re, quoi) => {
    const m = re.exec(src);
    assert.ok(m, `${quoi} introuvable`);
    return Number(m[1]);
};

test('chaque écran qui envoie une image la réduit d\'abord', () => {
    /* LA LISTE EST LE CONTRAT. Un écran ajouté plus tard qui enverrait une image en brut ne
       serait pas attrapé par ce test — mais celui qui RETIRE une réduction existante l'est, et
       c'est la régression qu'on craint : elle ne se voit qu'en production, sur le téléphone de
       quelqu'un dont l'envoi échoue. */
    const chemins = [
        ['pages/Mailing.jsx', /televerserImageMail\(await reduireSiImage\(f, PROFILS\.mail\)\)/, 'image d’e-mail'],
        ['pages/StudentFormationDetail.jsx', /deposerPiece\(id, pieceCible\.current, await reduireSiImage\(f, PROFILS\.piece\)\)/, 'pièce déposée par le stagiaire'],
        ['pages/StagiaireDetail.jsx', /deposerPiece\(curEnrId, step\.piece_id, await reduireSiImage\(f, PROFILS\.piece\)\)/, 'pièce déposée par le personnel'],
        ['pages/StagiaireDetail.jsx', /fd\.append\("file", await reduireSiImage\(file, PROFILS\.piece\), file\.name\)/, 'document reçu'],
        ['components/RemisesReview.jsx', /deposerRemise\(enrollmentId, remiseTypeId, await reduireSiImage\(file, PROFILS\.piece\)\)/, 'remise'],
        ['pages/Reglages.jsx', /await reduireEnDataUrl\(file, PROFILS\.marque\)/, 'signature de l’organisme'],
        ['pages/EmargementEditor.jsx', /await reduireEnDataUrl\(f, PROFILS\.marque\)/, 'logo de l’organisme'],
        ['pages/RepresentantEspace.jsx', /saveStamp\(await reduireEnDataUrl\(file, PROFILS\.marque\)\)/, 'cachet d’entreprise'],
        ['pages/IntervenantEspace.jsx', /saveSignature\(await reduireEnDataUrl\(file, PROFILS\.marque\)\)/, 'signature d’intervenant'],
        ['pages/Quiz.jsx', /await reduireEnDataUrl\(f, PROFILS\.quiz\)/, 'illustration de QCM'],
        ['components/QuestionPost.jsx', /await reduireImage\(f\)/, 'photo de la communauté'],
    ];
    for (const [fichier, motif, quoi] of chemins) {
        assert.match(lireUi(fichier), motif, `${quoi} : l’image doit être réduite avant l’envoi`);
    }
    /* `e.target.value = ""` SUR CHAQUE ENTRÉE : sans lui, rechoisir LE MÊME fichier après un
       refus ne déclenche aucun `change`, et le bouton paraît mort. */
    for (const f of ['pages/Reglages.jsx', 'pages/EmargementEditor.jsx', 'pages/Quiz.jsx']) {
        assert.match(lireUi(f), /e\.target\.value = "";/, `${f} : l’entrée doit se réarmer`);
    }
});

test('le plafond d\'un profil reste SOUS la limite du serveur qu\'il alimente', () => {
    /* LE PIRE DES DEUX MONDES SERAIT L'INVERSE : on dégraderait la qualité, ET l'envoi
       échouerait quand même. L'utilisateur verrait « réduite à 700 Ko » puis un refus, et les
       deux nombres auraient l'air d'accord. */
    const mail = nombre(lireApi('controllers/mailing.controller.js'), /MAX_IMAGE_OCTETS = (\d+) \* 1024/, 'plafond image d’e-mail');
    assert.ok(profilKo('mail') < mail, `profil mail ${profilKo('mail')} Ko >= serveur ${mail} Ko`);

    const piece = nombre(lireApi('controllers/piece.controller.js'), /const MAX_OCTETS = (\d+) \* 1024 \* 1024;/, 'plafond d’une pièce');
    assert.ok(profilKo('piece') < piece * 1024, `profil piece ${profilKo('piece')} Ko >= serveur ${piece} Mo`);

    const avatar = nombre(lireApi('controllers/espace.controller.js'), /> (\d+) \* 1024\)/, 'plafond avatar');
    assert.ok(profilKo('avatar') < avatar, `profil avatar ${profilKo('avatar')} Ko >= serveur ${avatar} Ko`);

    /* SIGNATURE, CACHET, LOGO, QCM voyagent en data-URL DANS du JSON. Deux plafonds les
       bornent, et le base64 pèse un TIERS de plus que les octets qu'il transporte : c'est ce
       tiers, oublié, qui faisait refuser des images qui semblaient pourtant sous la limite. */
    const b64 = (ko) => Math.ceil(ko * 4 / 3);
    const sign = nombre(lireApi('lib/signatures.js'), /MAX_SIGNATURE = (\d+) \* 1024 \* 1024/, 'plafond d’une signature');
    assert.ok(b64(profilKo('marque')) < sign * 1024, 'le profil marque doit tenir dans MAX_SIGNATURE, base64 compris');
    const json = nombre(lireApi('server.js'), /limit: '(\d+)mb'/, 'plafond du corps JSON');
    assert.ok(b64(profilKo('marque')) < json * 1024, 'et dans le corps JSON');
    /* LE QCM EST LE CAS SERRÉ : toutes ses images partagent UN SEUL corps. Le profil doit en
       laisser passer plusieurs, sinon le cinquième ajout ferait échouer l'enregistrement du QCM
       entier — et le message parlerait du QCM, pas de l'image. */
    assert.ok(b64(profilKo('quiz')) * 5 < json * 1024, 'cinq questions illustrées doivent tenir dans un QCM');
});

test('un PDF passe INTACT, et rien n\'est jamais perdu', () => {
    /* ON NE RECOMPRESSE PAS UN DOCUMENT DANS UN NAVIGATEUR : il faudrait embarquer une
       bibliothèque lourde, et réencoder un PDF risquerait de l'abîmer. `reduireSiImage` fait
       donc le tri, et les écrans n'ont pas à le savoir — c'est pour ça qu'ils peuvent tous
       appeler la même fonction sur des pièces jointes de nature inconnue. */
    assert.match(IMAGE, /const REENCODABLES = \/\^image\\\/\(jpeg\|png\|webp\|gif\|bmp\)\$\/i;/);
    assert.match(IMAGE, /if \(!file \|\| !REENCODABLES\.test\(file\.type \|\| ''\)\) return file;/);
    /* NE JETTE JAMAIS : perdre le document de quelqu'un parce que le redimensionnement a
       hoqueté serait pire que de l'envoyer gros. Le serveur, lui, tranchera. */
    assert.match(IMAGE, /try \{ return await reduireImage\(file, profil\); \} catch \{ return file; \}/);
});

test('l\'orientation, la transparence et le « jamais plus lourd » sont tenus', () => {
    /* L'ORIENTATION VIT DANS L'EXIF. Sans cette précaution, une carte d'identité photographiée
       debout repart COUCHÉE — et c'est irrattrapable, l'étiquette disparaissant au réencodage. */
    assert.match(IMAGE, /createImageBitmap\(file, \{ imageOrientation: "from-image" \}\)/);
    /* LA TRANSPARENCE D'UN LOGO : aplatie sur du blanc, elle colle un rectangle visible sur le
       papier à en-tête et sur le thème sombre. Les profils `marque` posent donc `fond: null`. */
    assert.match(IMAGE, /marque: \{[^}]*fond: null/);
    assert.match(IMAGE, /if \(fond\) \{/, 'le fond ne se peint que si le profil en demande un');
    /* ⚠️ Le JPEG n'a PAS de transparence : le repli d'un profil qui la garde DOIT repeindre un
       fond, sinon le dessin sort sur du noir. */
    assert.match(IMAGE, /if \(!fond\) \{ ctx\.globalCompositeOperation = "destination-over";/);
    /* NE JAMAIS RENDRE PLUS LOURD QUE L'ORIGINAL : un logo de 12 Ko réencodé GROSSIT, et on
       aurait perdu de la qualité pour rien. */
    assert.match(IMAGE, /const dejaLeger = file\.size <= maxKo \* 1024 && facteur === 1;/);
    /* LE PLANCHER DE QUALITÉ : descendre à 0,34 convient à une photo de plat ; sur une carte
       d'identité, c'est là que le numéro cesse de se lire. */
    assert.match(IMAGE, /\.filter\(\(q\) => q >= qualiteMin\)/);
    assert.match(IMAGE, /piece: \{[^}]*qualiteMin: 0\.72/, 'une pièce justificative est une PREUVE : qualité haute');
});
