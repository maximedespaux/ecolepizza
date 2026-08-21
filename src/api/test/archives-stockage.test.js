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

test('l\'inventaire suit la suppression, sans relire la base', () => {
    /* Une première version relançait l'analyse complète après chaque corbeille. Corrigé : on
       retranche ce qu'on sait avoir supprimé (cf. le test dédié plus bas). Reste l'exigence qui
       rend l'un ou l'autre possible — `deleteDocs` doit DIRE si la suppression a eu lieu, sinon
       l'écran ne peut ni relire ni retrancher au bon moment. */
    assert.match(ui, /if \(await onSupprime\([\s\S]{0,140}?\)\) \{/,
        'L\'écran doit attendre le résultat avant de toucher à l\'inventaire.');
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
    assert.match(bloc[0], /exemplaires: g\.map\(\(\{ empreinte, \.\.\.x \}\) =>/,
        'L\'empreinte doit être retirée des doublons.');
});

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   LE VERROU DE CONFIRMATION — l'inventaire ne se lance pas par curiosité.
   ═════════════════════════════════════════════════════════════════════════════════════════════ */

test('l\'inventaire se lance en recopiant un mot, et le mot est en clair', () => {
    /* La requête lit les 681 Mo de blobs : 7,4 secondes mesurées, pendant lesquelles la base
       travaille pour tout le monde. Un bouton se clique par curiosité et se REclique en attendant
       que ça vienne ; un mot à recopier, non. */
    assert.match(ui, /const MOT_INVENTAIRE = "INVENTAIRE";/, 'Le mot doit rester lisible dans le code.');
    assert.match(ui, /disabled=\{!motOk\(saisie\)\}/, 'Le bouton reste fermé tant que le mot ne correspond pas.');
    /* Tolérant sur la casse et les espaces : ce qu'on demande est un geste conscient, pas une
       dictée. Refuser « inventaire » en minuscules ne filtrerait que la patience. */
    assert.match(ui, /v\.trim\(\)\.toUpperCase\(\) === MOT_INVENTAIRE/,
        'La comparaison doit ignorer la casse et les espaces.');
});

test('« Recalculer » passe par le même verrou', () => {
    /* Sinon il suffirait d'un premier passage pour obtenir un bouton libre juste à côté — et
       c'est précisément le reclic répété qu'on veut empêcher, pas le premier. */
    const boutons = [...ui.matchAll(/<button className="btn ghost sm"[^>]*onClick=\{([^}]*)\}/g)]
        .map((m) => m[1]);
    const libres = boutons.filter((b) => /analyser/.test(b) && !/setDemande/.test(b));
    assert.deepStrictEqual(libres, [],
        `bouton(s) lançant l'inventaire sans passer par le verrou : ${libres.join(', ')}`);
});

test('supprimer une copie ne relance PAS l\'inventaire', () => {
    /* LE PIÈGE QUE J'AI CRÉÉ PUIS RETIRÉ : relancer l'analyse après chaque corbeille ferait
       relire les 681 Mo une fois par doublon traité — vingt-quatre fois pour les seuls groupes
       de sept. C'est exactement le martèlement que le verrou cherche à éviter ; le rétablir ici
       l'aurait vidé de son sens. On retranche ce qu'on sait avoir supprimé. */
    const bloc = /async function supprimerUne[\s\S]*?\n  }/.exec(ui);
    assert.ok(bloc, 'supprimerUne introuvable');
    assert.doesNotMatch(bloc[0], /\banalyser\(\)/,
        'Une suppression ne doit pas relire toute la table.');
    assert.match(bloc[0], /retirerDeLInventaire\(x\)/, 'Elle met l\'inventaire à jour sur place.');
});

test('la tranche d\'un fichier supprimé vient du SERVEUR, pas d\'un seuil recopié', () => {
    /* Deux jeux de seuils divergeraient au premier changement, et le fichier serait retranché
       d'une tranche où il n'était pas — un total juste, une répartition fausse. */
    assert.match(ctrl, /libelle: t\.libelle, min: t\.min/, 'Le serveur doit publier la borne.');
    assert.match(ui, /d\.tranches\.find\(\(u\) => x\.octets >= u\.min\)/,
        'L\'écran doit choisir la tranche avec la borne reçue.');
});

test('un groupe retombé à un exemplaire cesse d\'être un doublon', () => {
    assert.match(ui, /\.filter\(\(g\) => g\.n > 1\)/,
        '« 1 exemplaire identique » ne veut rien dire — le groupe doit disparaître.');
});
