/**
 * DEUX PORTES D'ENVOI RESTÉES OUVERTES, fermées le 2026-09-23.
 *
 * ELLES ONT ÉTÉ TROUVÉES EN RECENSANT LES CHEMINS D'UPLOAD pour y brancher la réduction d'images.
 * Aucune des deux n'était une régression : elles étaient là depuis le début, et c'est justement
 * ce qui les rendait invisibles — personne ne relit un chemin qui marche.
 *
 * 1. `PATCH /organisation` était le SEUL chemin « signature » à ne pas passer par
 *    `estSignatureValide`. Le représentant d'entreprise et le signataire public l'avaient depuis
 *    SECURITY_AUDIT #2 ; l'organisme, non. Or sa signature ET son logo sont réinjectés dans du
 *    HTML — la première par le jeton RAW `signatureBox`, le second par la feuille d'émargement.
 *
 * 2. `POST /documents/import` stockait le `mimetype` ANNONCÉ PAR LE CLIENT, puis le renvoyait en
 *    `Content-Type` avec `Content-Disposition: inline`. Déposer un fichier annoncé `text/html`
 *    et l'ouvrir exécutait son contenu dans l'origine de l'API.
 *
 * ⚠️ `X-Content-Type-Options: nosniff` (server.js) NE COUVRAIT NI L'UNE NI L'AUTRE : il empêche
 * un navigateur de DEVINER un type, pas d'en HONORER un qui lui est déclaré. C'est le piège de
 * ce genre d'audit — on voit l'en-tête, on coche la case, et le trou reste.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const { estSignatureValide } = require('../lib/signatures.js');

test('la charge utile qui passait est bien refusée', () => {
    /* LE PAYLOAD EXACT décrit dans lib/signatures.js : il satisfait `^data:image/`, que
       l'ancienne garde des autres chemins employait, et s'échappe de l'attribut `src`. */
    const attaque = 'data:image/png;base64,AA"><img src=x onerror=alert(document.cookie)>';
    assert.ok(/^data:image\//.test(attaque), 'il passait le préfixe — c’est tout le sujet');
    assert.strictEqual(estSignatureValide(attaque), false, 'le motif ANCRÉ doit le refuser');
    /* Et une vraie image passe : la garde ne doit pas fermer l'écran à qui s'en sert. */
    assert.strictEqual(estSignatureValide('data:image/webp;base64,UklGRhYAAABXRUJQ'), true);
    assert.strictEqual(estSignatureValide('data:image/png;base64,iVBORw0KGgo='), true);
});

test('l\'organisme valide SA signature et SON logo, comme tous les autres chemins', () => {
    const O = lire('controllers/organization.controller.js');
    assert.match(O, /const \{ estSignatureValide \} = require\('\.\.\/lib\/signatures\.js'\);/);
    assert.match(O, /for \(const f of \['signature_image', 'logo_image'\]\)/,
        'le LOGO aussi : il finit dans un <img> de la feuille d’émargement');
    assert.match(O, /if \(!estSignatureValide\(v\)\) \{/);
    assert.match(O, /return res\.status\(422\)/);
    /* VIDER RESTE PERMIS : sans cette porte, on ne pourrait plus retirer une signature une fois
       posée — la garde deviendrait un aller simple. */
    assert.match(O, /if \(v === undefined \|\| v === null \|\| v === ''\) continue;/);
    /* ⚠️ ET ON NE VALIDE QUE CE QUI CHANGE. L'écran Réglages renvoie le FORMULAIRE ENTIER à
       chaque enregistrement, signature comprise, telle qu'il l'a reçue. Sans cette ligne, une
       image déposée AVANT la garde — dans un format qu'elle n'accepte pas — ferait échouer toute
       modification de l'adresse ou du SIRET, avec un message parlant de signature. C'est le
       genre de régression qui ne se voit qu'en production, sur l'écran le plus banal. */
    assert.match(O, /if \(v === inchange\[f\]\) continue;/);
    assert.match(O, /SELECT signature_image, logo_image FROM organization WHERE id = \?/);
    /* LA LECTURE N'A LIEU QUE SI UNE IMAGE EST ENVOYÉE — un enregistrement ordinaire ne paie pas
       une requête de plus — et elle est GARDÉE : si elle échoue, la validation s'applique à
       tout, ce qui est le repli sûr. */
    assert.match(O, /const aImage = \['signature_image', 'logo_image'\]\.some\(\(f\) => req\.body\[f\]\);/);
    assert.match(O, /if \(aImage\) \{\s*\n\s*try \{/);
    /* ET LA GARDE PASSE AVANT L'ÉCRITURE : placée après, elle aurait laissé `encrypt` ranger la
       charge utile en base, où elle serait restée même une fois le contrôle ajouté. */
    assert.ok(O.indexOf("for (const f of ['signature_image', 'logo_image'])") < O.indexOf("f === 'signature_image') v = encrypt"),
        'la validation doit précéder le chiffrement et l’UPDATE');
});

test('un document importé ne peut plus se faire passer pour du HTML', () => {
    const D = lire('controllers/document.controller.js');
    /* LE TYPE RETENU EST CELUI DE LA LISTE, jamais la chaîne reçue : recopier `f.mimetype` après
       l'avoir seulement TESTÉ laisserait passer les variantes (« text/html; charset=… »). */
    assert.match(D, /const MIMES_IMPORT = \{/);
    assert.match(D, /const mime = MIMES_IMPORT\[String\(f\.mimetype \|\| ''\)\];/);
    assert.match(D, /if \(!mime\) \{[\s\S]{0,200}status\(415\)/);
    assert.ok(!/f\.mimetype \|\| 'application\/pdf'/.test(D), 'le type du client ne doit plus être stocké');
    assert.match(D, /\n {17}mime, encryptBytes\(f\.buffer\)/, 'c’est le type de la liste qui est rangé');
    /* ET UN PLAFOND, sous la coupure de multer, pour que le refus soit une phrase et non une
       erreur de transport. */
    assert.match(D, /const MAX_IMPORT_OCTETS = 20 \* 1024 \* 1024;/);
    const multer = /fileSize: (\d+) \* 1024 \* 1024/.exec(lire('routes/document.routes.js'));
    assert.ok(20 < Number(multer[1]), 'le contrôleur doit trancher AVANT multer');

    /* DÉFENSE DE PROFONDEUR POUR LES LIGNES DÉJÀ EN BASE : elles portent encore le type que le
       client avait annoncé, et rien ne les réécrit. On ne sert donc en ligne que ce qui se
       regarde dans un onglet ; le reste se télécharge. */
    assert.match(D, /const AFFICHABLES = new Set\(\['application\/pdf', 'image\/png', 'image\/jpeg', 'image\/webp'\]\);/);
    assert.match(D, /const type = AFFICHABLES\.has\(f\.mime\) \? f\.mime : 'application\/octet-stream';/);
    assert.match(D, /const pose = AFFICHABLES\.has\(f\.mime\) \? 'inline' : 'attachment';/);
    assert.ok(!AFFICHABLES_DU_SOURCE(D).includes('text/html'));
});

/** Les types réellement listés comme affichables, lus dans le source. */
function AFFICHABLES_DU_SOURCE(src) {
    const m = /const AFFICHABLES = new Set\(\[([^\]]*)\]\)/.exec(src);
    assert.ok(m, 'liste des affichables introuvable');
    return m[1];
}

test('un import d\'archives ne peut plus remplir la mémoire du serveur', () => {
    const R = lire('routes/suivi.routes.js');
    /* `multer` BORNE CHAQUE FICHIER ET LEUR NOMBRE, JAMAIS LEUR SOMME. 3000 × 25 Mo tenaient
       dans les limites déclarées, et `memoryStorage` garde tout en RAM. */
    assert.match(R, /const MAX_LOT_OCTETS = 1024 \* 1024 \* 1024;/);
    assert.match(R, /function limiteDuLot\(req, res, next\)/);
    /* AVANT `multer`, sinon le corps est déjà lu et la mémoire déjà prise : refuser ne la rend pas. */
    assert.match(R, /limiteDuLot, upload\.array\('files', 3000\)/);
    assert.ok(R.indexOf('function limiteDuLot') < R.indexOf("router.post('/archives/import'"));
    /* LE NOMBRE DE FICHIERS NE BOUGE PAS : importer un dossier entier EST le cas d'usage. C'est
       la taille par fichier qui se resserre — le coffre entier pèse 681 Mo pour plus d'un
       millier de pièces. */
    assert.match(R, /fileSize: 10 \* 1024 \* 1024, files: 3000/);
});

test('le sélecteur ne PROPOSE que ce que le serveur ACCEPTE', async () => {
    /* LE DÉFAUT. L'entrée de la fiche stagiaire annonçait `.doc,.docx` pour une PIÈCE
       justificative, que le serveur refuse en 415 — et son commentaire dit pourquoi : « une pièce
       justificative se lit, elle ne s'édite pas, et accepter du .docx ouvrirait la porte aux
       macros ». Le secrétariat choisissait donc un fichier que le navigateur lui présentait comme
       valide, et se prenait un refus qui contredisait ce que l'écran venait d'offrir.

       ⚠️ `accept` N'EST PAS UN CONTRÔLE : il filtre ce que la fenêtre MONTRE, rien de plus. Ce
       test ne garde pas une frontière de sécurité — il garde une PROMESSE faite à l'écran. */
    const { ACCEPT_PIECE, ACCEPT_DOCUMENT } = await import('../../app/ui/lib/formatsDepot.js');
    const { MIMES_CONNUS } = require('../controllers/piece.controller.js');

    /* CE QUE LE SERVEUR ACCEPTE POUR UNE PIÈCE, ni plus ni moins. */
    for (const m of MIMES_CONNUS) {
        assert.ok(ACCEPT_PIECE.includes(m), `« ${m} » est accepté par le serveur mais pas proposé`);
    }
    for (const bureautique of ['.doc', '.docx', 'msword', 'wordprocessingml']) {
        assert.ok(!ACCEPT_PIECE.includes(bureautique),
            `« ${bureautique} » est proposé pour une pièce alors que le serveur le refuse (415)`);
    }
    /* `image/*` NON PLUS : il laissait choisir un SVG ou un HEIC, que le serveur refuse aussi —
       et le SVG est précisément ce qu'on ne veut pas voir arriver. */
    assert.ok(!ACCEPT_PIECE.includes('image/*'));

    /* LE DOCUMENT REÇU, LUI, ADMET LE TRAITEMENT DE TEXTE : une convention signée revient souvent
       en .docx, et cet écran sert à la rattacher. Sa liste doit couvrir celle du contrôleur. */
    const D = lire('controllers/document.controller.js');
    const mimesImport = [...D.slice(D.indexOf('const MIMES_IMPORT'), D.indexOf('const MAX_IMPORT_OCTETS'))
        .matchAll(/'([a-z]+\/[a-zA-Z0-9.+-]+)'/g)].map((m) => m[1]);
    assert.ok(mimesImport.length >= 6, 'liste des types importables introuvable');
    for (const m of new Set(mimesImport)) {
        assert.ok(ACCEPT_DOCUMENT.includes(m), `« ${m} » est importable mais pas proposé`);
    }

    /* ET LES TROIS ÉCRANS LISENT LA MÊME SOURCE : trois chaînes recopiées auraient divergé au
       premier ajout de format, et l'on n'aurait corrigé que celle qu'on avait sous les yeux. */
    const UI = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');
    for (const f of ['pages/StagiaireDetail.jsx', 'pages/StudentFormationDetail.jsx', 'components/RemisesReview.jsx']) {
        assert.match(UI(f), /from "\.\.\/lib\/formatsDepot\.js"/, `${f} doit lire la liste partagée`);
        assert.ok(!/accept="[^"]*\.docx/.test(UI(f)), `${f} : plus de liste recopiée dans le JSX`);
    }
    /* LE SÉLECTEUR EST PARTAGÉ entre les deux gestes : `accept` suit donc l'étape visée, comme
       `multiple` juste au-dessus de lui. Figé dans le JSX, il mentirait pour l'un des deux. */
    assert.match(UI('pages/StagiaireDetail.jsx'),
        /fichierRef\.current\.accept = step\.piece \? ACCEPT_PIECE : ACCEPT_DOCUMENT;/);
});
