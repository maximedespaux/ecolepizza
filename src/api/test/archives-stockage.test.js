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

test('on supprime une copie À LA FOIS, en sachant laquelle', () => {
    /* LE BOUTON GROUPÉ A ÉTÉ RETIRÉ. « Ne garder que le premier » décidait à la place de
       l'utilisateur QUEL exemplaire survit — le premier rendu par la base, un ordre qui ne veut
       rien dire. Or le choix compte : sur l'évaluation d'une stagiaire recopiée dans six autres
       dossiers, la copie à garder est celle classée sous SON nom.

       Une suppression groupée sur des pièces Qualiopi doit donc rester un geste explicite,
       document par document, avec le nom du détenteur sous les yeux. */
    assert.doesNotMatch(ui, /Ne garder que le premier/,
        'Le bouton groupé choisissait le survivant au hasard de l\'ordre SQL.');
    assert.match(ui, /onClick=\{\(\) => supprimerUne\(x\)\}/,
        'Chaque exemplaire porte sa propre corbeille.');
    /* ET LA CONFIRMATION NOMME CE QU'ELLE EFFACE — titre ET détenteur. « Supprimer 1
       document ? » ne permet pas de vérifier qu'on vise la bonne copie parmi sept identiques. */
    assert.match(ui, /onSupprime\(\[x\.id\], `« \$\{x\.title\} »\$\{x\.learner_name/,
        'La confirmation doit nommer le document et son détenteur.');
});

test('l\'inventaire se relit après une suppression', () => {
    /* Sinon la copie effacée reste affichée et son poids reste compté : le total ne bouge pas,
       et l'on croit que le clic n'a rien fait. `deleteDocs` doit donc DIRE si la suppression a
       eu lieu — d'où ses retours booléens, ajoutés pour cet écran. */
    assert.match(ui, /if \(await onSupprime\([\s\S]{0,120}?\)\) \{\s*analyser\(\);/,
        'Une suppression confirmée doit relancer l\'inventaire.');
    assert.match(ui, /const \{ deleted \} = await bulkDeleteArchives[\s\S]{0,120}?return true;/,
        'deleteDocs doit signaler le succès.');
    assert.match(ui, /\)\) return false;/, 'Et signaler l\'annulation.');
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
