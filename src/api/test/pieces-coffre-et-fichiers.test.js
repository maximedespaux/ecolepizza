/**
 * LES PIÈCES N'APPARAISSAIENT PAS DANS LE COFFRE, ET UN SEUL DE LEURS FICHIERS ÉTAIT VISIBLE.
 *
 * DEUX DÉFAUTS, signalés ensemble parce qu'ils se répondent : on ne voyait ni les pièces là où
 * on va chercher les documents un an plus tard, ni le détail de ce qui avait été déposé.
 *
 * 1. LE COFFRE IGNORAIT LES PIÈCES. `getArchive` réunissait trois sources — les documents
 *    générés au nom du stagiaire, ceux de l'entreprise, et les PDF importés à la main. Les
 *    pièces justificatives (identité, domicile) n'y figuraient nulle part, alors qu'elles font
 *    partie du dossier au même titre. UNE LIGNE PAR FICHIER : un justificatif peut en compter
 *    six, et n'en montrer qu'un rendrait les autres introuvables.
 *
 * 2. L'ÉCRAN NE LISAIT QUE `fichiers[0]`. Sur un justificatif de six pages, une seule était
 *    consultable ; les cinq autres restaient invisibles — donc invérifiables, alors qu'on
 *    demande justement de les vérifier avant de valider. Le défaut existait des DEUX côtés : la
 *    revue du personnel et l'espace du stagiaire, qui n'avait aucun moyen de contrôler que ses
 *    six pages étaient bien parties. L'API, elle, renvoyait la liste complète depuis toujours.
 *
 * CE QU'ON N'A PAS OUVERT : ni téléchargement ni suppression d'une pièce depuis le coffre. Le
 * fichier n'est pas forcément un PDF (une photo, le plus souvent) et s'ouvre déjà en ligne.
 * Surtout, l'effacer appartient au dossier, où il passe par la purge prévue — un scan d'identité
 * ne se supprime pas isolément depuis un coffre qui range par formation. Et une suppression en
 * lot le DIT désormais, au lieu d'ignorer les pièces en silence : croire qu'on a tout effacé
 * alors que les scans restent est le pire des deux mondes.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const SUIVI = fs.readFileSync(path.join(__dirname, '..', 'controllers/suivi.controller.js'), 'utf8');
const COFFRE = fs.readFileSync(path.join(RACINE, 'app/ui/pages/Suivi.jsx'), 'utf8');
const REVUE = fs.readFileSync(path.join(RACINE, 'app/ui/components/PiecesReview.jsx'), 'utf8');
const ESPACE = fs.readFileSync(path.join(RACINE, 'app/ui/pages/StudentFormationDetail.jsx'), 'utf8');

test('le coffre réunit QUATRE sources, pièces comprises', () => {
    assert.match(SUIVI, /res\.json\(\{ data: \[\.\.\.gen, \.\.\.comp, \.\.\.arch, \.\.\.pieces\] \}\)/,
        'les pièces déposées doivent rejoindre le coffre');
    assert.match(SUIVI, /FROM piece_fichier pf/, 'une ligne par FICHIER, pas par dépôt');
    assert.match(SUIVI, /source: 'piece'/, 'la provenance doit être identifiable par l\'écran');
});

test('le coffre reste lisible sans la table des pièces', () => {
    /* Règle du projet : le code marche AVANT comme APRÈS la migration. Sans la 127, le coffre
       doit montrer ses trois autres sources plutôt que de tomber en 500. */
    const bloc = SUIVI.slice(SUIVI.indexOf('let pieces = [];'));
    const corps = bloc.slice(0, bloc.indexOf('res.json('));
    assert.match(corps, /ER_NO_SUCH_TABLE/);
    assert.match(corps, /ER_BAD_FIELD_ERROR/);
});

test('les octets d\'une pièce ne transitent pas par la liste du coffre', () => {
    /* Une liste porte des dizaines de dossiers : y faire passer les fichiers ferait des
       dizaines de mégaoctets à chaque ouverture de l'écran. */
    const bloc = SUIVI.slice(SUIVI.indexOf('FROM piece_fichier pf') - 900, SUIVI.indexOf("source: 'piece'"));
    assert.doesNotMatch(bloc, /pf\.bytes/, 'jamais les octets dans la liste');
});

test('le rang « 2/6 » n\'apparaît que s\'il y a plusieurs fichiers', () => {
    /* « (1/1) » n'apprend rien et alourdit chaque ligne. */
    assert.match(SUIVI, /total > 1 \? `\$\{f\.piece_label\} \(\$\{rang\}\/\$\{total\}\)` : f\.piece_label/);
});

test('le coffre ouvre une pièce par sa propre route', () => {
    assert.match(COFFRE, /d\.source === "piece" \? window\.open\(pieceFichierUrl\(d\.doc_id\)/,
        'une pièce ne se lit ni par archiveFileUrl ni par l\'aperçu des documents générés');
    assert.match(COFFRE, /VALIDEE: \["Validée", "g"\], DEPOSEE: \["À vérifier", "a"\]/,
        'sans ces libellés, le coffre affichait « VALIDEE » brut au milieu de libellés soignés');
});

test('une suppression en lot annonce les pièces qu\'elle NE supprime pas', () => {
    assert.match(COFFRE, /const pieces = docs\.filter\(\(d\) => d\.source === "piece"\)\.length;/);
    assert.match(COFFRE, /ne seront PAS supprimées/,
        'les compter en silence laisserait croire que les scans d\'identité sont partis');
    assert.match(COFFRE, /isAdmin && d\.source !== "piece"/,
        'pas de bouton de suppression sur une pièce : son effacement appartient au dossier');
});

for (const [nom, SRC] of [['la revue du personnel', REVUE], ['l\'espace du stagiaire', ESPACE]]) {
    test(`${nom} montre CHAQUE fichier d'une pièce`, () => {
        assert.doesNotMatch(SRC, /pieceFichierUrl\((?:e\.p\.)?fichiers\[0\]\.id\)(?![\s\S]*fichiers\.map)/,
            'lire `fichiers[0]` seul rendait les autres pages invisibles, donc invérifiables');
        assert.match(SRC, /fichiers\.map\(\(f, [ik]\) =>/, 'tous les fichiers doivent être rendus');
        assert.match(SRC, /pieceFichierUrl\(f\.id\)/, 'chaque fichier a son propre lien');
    });
}

test('valider ou refuser porte sur le dépôt, jamais sur un fichier', () => {
    /* C'est la pièce qu'on accepte : un justificatif incomplet se refuse en bloc. Brancher ces
       boutons sur un fichier laisserait un dépôt à moitié validé, que rien ne sait représenter. */
    assert.match(REVUE, /decider\(p\.depot_id, "VALIDEE"\)/);
    assert.match(REVUE, /decider\(p\.depot_id, "REFUSEE"\)/);
    assert.doesNotMatch(REVUE, /decider\(f\.id/);
});
