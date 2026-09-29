/**
 * LA PHOTO D'UNE FICHE TECHNIQUE (migration 191, demandée le 2026-09-29 avec le nouvel éditeur).
 *
 * Le modèle est celui des photos de la Communauté (114) : les octets EN BASE, chiffrés au repos,
 * servis par une route authentifiée ; le navigateur réduit, le serveur plafonne. L'école a demandé
 * qu'elle ne soit « pas grasse » : 1 000 px au navigateur, 250 Ko au plus au serveur, une photo
 * par fiche.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · la migration et son revert, rejouables, à la collation de `recipe` (sinon MariaDB refuse la
 *     clé étrangère) ;
 *   · le FORMAT lu dans les octets, jamais dans le type déclaré par l'envoi — l'image est resservie
 *     avec le type enregistré ;
 *   · seul l'AUTEUR pose ou retire la photo ; la LIRE, c'est pouvoir ouvrir la fiche ;
 *   · sans la migration, rien ne tombe : les listes s'affichent sans photo, l'envoi répond 503.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { formatImage } = require('../lib/formatImage.js');

const API = path.join(__dirname, '..');
const MIG = path.join(API, '..', '..', 'database', 'migrations');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const CTRL = lire('controllers/recipe.controller.js');
const PHOTO = lire('controllers/photoFiche.controller.js');
const LIB = lire('lib/photoFiche.js');
const ROUTES = lire('routes/recipe.routes.js');
const corpsDans = (src, nom) => new RegExp(`const ${nom} = async \\(req, res\\) => \\{[\\s\\S]*?\\n\\};`).exec(src)[0];
const corps = (nom) => corpsDans(PHOTO, nom);

test('la migration 191 : une photo par fiche, qui part avec sa fiche', () => {
    const aller = fs.readFileSync(path.join(MIG, '191_fiche_photo.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(MIG, '191_revert_fiche_photo.sql'), 'utf8');
    assert.match(aller, /CREATE TABLE IF NOT EXISTS recipe_photo/);
    assert.match(aller, /PRIMARY KEY \(recipe_id\)/, 'une seule photo par fiche');
    assert.match(aller, /FOREIGN KEY \(recipe_id\) REFERENCES recipe \(id\) ON DELETE CASCADE/);
    assert.match(aller, /bytes\s+MEDIUMBLOB/, 'la colonne dit qu\'elle n\'attend pas de gros fichiers');
    /* La collation de `recipe` : une clé étrangère entre collations différentes est refusée, et la
       migration échouerait entière le jour où on la joue. */
    assert.match(aller, /COLLATE=utf8mb4_general_ci;/);
    assert.match(retour, /DROP TABLE IF EXISTS recipe_photo;/);
    for (const sql of [aller, retour]) assert.doesNotMatch(sql, /^\s*--/m, 'commentaires en blocs /* */');
});

test('le format se lit dans les octets, pas dans ce que l\'envoi déclare', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
    assert.equal(formatImage(jpeg), 'image/jpeg');
    assert.equal(formatImage(png), 'image/png');
    assert.equal(formatImage(webp), 'image/webp');
    // Une page HTML déclarée « image/png » par l'envoi reste une page HTML : refusée.
    assert.equal(formatImage(Buffer.from('<html><script>alert(1)</script></html>')), null);
    assert.equal(formatImage(Buffer.from('GIF89a......')), null, 'GIF : non accepté');
    assert.equal(formatImage(Buffer.alloc(4)), null, 'trop court');
    assert.equal(formatImage('RIFF....WEBP'), null, 'une chaîne n\'est pas un tampon');
});

test('seul l\'auteur pose ou retire la photo, dans les limites', () => {
    const pose = corps('savePhoto');
    assert.match(pose, /if \(f\.buffer\.length > MAX_PHOTO_FICHE\)[\s\S]*?status\(413\)/, 'trop lourde : 413 lisible');
    assert.match(pose, /const mime = formatImage\(f\.buffer\);\s*\n\s*if \(!mime\) return res\.status\(415\)/, 'le type ENREGISTRÉ est celui des octets');
    assert.match(pose, /if \(cur\.author_user_id !== req\.user\.id\) return res\.status\(403\)/);
    assert.match(pose, /encryptBytes\(f\.buffer\)/, 'chiffrée au repos, comme les photos de la Communauté');
    assert.match(pose, /if \(noTable\(err\)\) return res\.status\(503\)/, 'sans la migration : 503, dit comme tel');
    const retrait = corps('deletePhoto');
    assert.match(retrait, /if \(cur\.author_user_id !== req\.user\.id\) return res\.status\(403\)/);
});

test('la lire, c\'est pouvoir ouvrir la fiche — et rien d\'autre', () => {
    const lecture = corps('getPhoto');
    /* `accessibleRecipe` : l'auteur, ou tout compte de l'organisme si la fiche est PARTAGÉE. Une
       fiche privée ne montre pas sa photo au reste de la promotion — et un 404 ne dit même pas
       qu'elle existe. */
    assert.match(lecture, /if \(!await accessibleRecipe\(conn, req\.params\.id, req\.user\)\) return res\.status\(404\)\.end\(\);/);
    assert.match(lecture, /res\.set\('Content-Type', p\.mime\);/);
    assert.match(lecture, /decryptBytes\(p\.bytes\)/);
});

test('les routes : lire pour qui ouvre la fiche, écrire en mémoire sous un plafond', () => {
    assert.match(ROUTES, /router\.get\('\/:id\/photo', authenticateToken, getPhoto\);/);
    assert.match(ROUTES, /router\.put\('\/:id\/photo', authenticateToken, photoUpload\.single\('photo'\), savePhoto\);/);
    assert.match(ROUTES, /router\.delete\('\/:id\/photo', authenticateToken, deletePhoto\);/);
    assert.match(ROUTES, /multer\(\{ storage: multer\.memoryStorage\(\), limits: \{ fileSize: \d+ \* 1024, files: 1 \} \}\)/);
});

test('les listes portent la version de la photo, et ne tombent pas sans la migration', () => {
    /* `photo_v` est l'EMPREINTE de la photo : elle entre dans l'adresse de l'image, si bien qu'une
       photo remplacée change d'adresse — le cache long ne ressert jamais l'ancienne. */
    assert.match(LIB, /SELECT recipe_id, empreinte FROM recipe_photo WHERE recipe_id IN \(\?\)/);
    const aide = /async function ajouterPhotos\(conn, rows\) \{[\s\S]*?\n\}/.exec(LIB)[0];
    assert.match(aide, /if \(noTable\(e\)\) return false;/, 'sans la table, aucune fiche n\'a de photo — voilà tout');
    for (const f of ['listMine', 'listShared', 'getRecipe']) {
        assert.match(corpsDans(CTRL, f), /await ajouterPhotos\(conn, /, `${f} porte photo_v`);
    }
    assert.match(corpsDans(CTRL, 'getRecipe'), /photo_disponible: photoDisponible/, 'l\'éditeur sait s\'il peut proposer une photo');
});

test('la règle « fiche qu\'on peut ouvrir » n\'existe qu\'une fois', () => {
    /* La photo et les interactions (j'aime, commentaires) posent la même question. Deux copies
       d'une règle d'accès finissent par diverger — et c'est la plus permissive qu'on découvre. */
    assert.doesNotMatch(CTRL, /async function accessibleRecipe/);
    assert.doesNotMatch(PHOTO, /async function accessibleRecipe/);
    for (const src of [CTRL, PHOTO]) assert.match(src, /const \{ accessibleRecipe \} = require\('\.\.\/lib\/ficheAccessible\.js'\);/);
});
