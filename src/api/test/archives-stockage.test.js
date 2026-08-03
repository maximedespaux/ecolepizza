/**
 * L'INVENTAIRE DU COFFRE DOCUMENTAIRE.
 *
 * CE QUE LA MESURE A MONTRÉ, et qui a dicté cet écran. Sur 1188 PDF et 681 Mo, la masse n'est pas
 * répartie : 148 fichiers — 12 % — portent 378 Mo, soit 55 % du total, quand les 1040 autres font
 * 291 Ko de moyenne, ce qui est normal pour un scan. Trier par poids règle donc le problème en
 * trente lignes.
 *
 * ET POURQUOI PAS « COMPRESSER ». Gzip sur quarante fichiers réels rend 8,8 % : le contenu des PDF
 * est déjà en Flate, et compresser du déjà-compressé ne donne rien. L'anomalie est ailleurs —
 * certains fichiers pèsent 2,2 à 4,0 octets par pixel quand un JPEG en fait 0,13, et un bitmap RVB
 * brut vaut exactement 3,0. Ces documents-là ne sont pas compressés du tout.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const ctrl = fs.readFileSync(path.join(API, 'controllers/suivi.controller.js'), 'utf8');
const routes = fs.readFileSync(path.join(API, 'routes/suivi.routes.js'), 'utf8');
const ui = fs.readFileSync(path.join(APP, 'ui/pages/Suivi.jsx'), 'utf8');
const bloc = /const getArchiveStockage[\s\S]*?\n};/.exec(ctrl);

test('l\'inventaire ne lit les blobs QU\'UNE FOIS', () => {
    assert.ok(bloc, 'getArchiveStockage introuvable');
    /* `LENGTH()` et `MD5()` obligent InnoDB à lire chaque blob : sur 681 Mo c'est ~7 secondes
       mesurées. Une seconde requête doublerait ce coût. On lit tout une fois, on calcule le
       reste en mémoire — 1188 lignes de métadonnées, c'est gratuit. */
    const requetes = bloc[0].match(/\.query\(/g) || [];
    assert.strictEqual(requetes.length, 1,
        `${requetes.length} requête(s) : chacune relit les 681 Mo de blobs.`);
    assert.match(bloc[0], /LENGTH\(file\) AS octets,\s*MD5\(file\) AS empreinte/,
        'Taille et empreinte doivent être prises dans la MÊME lecture.');
});

test('l\'inventaire est réservé à l\'administration', () => {
    /* Autant pour le coût que pour le droit : ce n'est pas une consultation, c'est un inventaire
       qui lit toute la table. */
    const ligne = routes.split('\n').find((l) => l.includes("'/archives/stockage'"));
    assert.ok(ligne, 'la route doit exister');
    assert.match(ligne, /ADMIN_ROLES/, 'L\'inventaire ne doit pas être ouvert à tout le personnel.');
});

test('« ne garder que le premier » laisse toujours un exemplaire', () => {
    /* LE DÉFAUT QU'ON NE VEUT PAS : proposer la suppression du groupe ENTIER. Ces fichiers sont
       des pièces Qualiopi ; supprimer les N copies au lieu de N-1 efface le document. Le `.slice(1)`
       est la seule chose qui garantit qu'il en reste un. */
    assert.match(ui, /d\.exemplaires\.slice\(1\)\.map\(\(x\) => x\.id\)/,
        'On ne propose que les copies AU-DELÀ de la première.');
});

test('un doublon se montre avec ceux qui le détiennent', () => {
    /* Supprimer une copie retire le document du dossier d'un stagiaire. Le même PDF sous sept
       personnes peut être une erreur de classement — le cas rencontré — ou une pièce commune
       légitimement partout. L'écran ne peut pas trancher : il doit nommer, et avertir. */
    assert.match(bloc[0], /exemplaires: g\.map/, 'Le serveur doit renvoyer chaque exemplaire.');
    assert.match(ui, /\{x\.learner_name \|\| "sans stagiaire"\}/,
        'Chaque copie doit afficher qui la détient.');
    assert.match(ui, /Supprimer une copie retire le document de/,
        'L\'écran doit dire ce que la suppression retire.');
});

test('l\'empreinte ne sort jamais de l\'API', () => {
    /* `MD5(file)` sert à grouper, pas à être publié : une empreinte de document permet de
       vérifier qu'on détient le même fichier sans l'avoir. Elle est retirée des deux listes. */
    assert.match(bloc[0], /lourds:[\s\S]{0,200}?\.map\(\(\{ empreinte, \.\.\.x \}\)/,
        'L\'empreinte doit être retirée de la liste des plus lourds.');
    assert.match(bloc[0], /exemplaires: g\.map\(\(\{ empreinte, \.\.\.x \}\) => x\)/,
        'L\'empreinte doit être retirée des doublons.');
});
