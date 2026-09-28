/**
 * CÔTÉ ORGANISME : retirer UN fichier d'une pièce, pas toute la pièce (demandé le 2026-09-24).
 *
 * Une pièce peut porter plusieurs fichiers (« Justificatifs », jusqu'à six). Quand une seule page
 * est en trop ou illisible, le personnel doit pouvoir l'enlever sans obliger le stagiaire à tout
 * redéposer — la revue offrait Valider/Refuser sur le dépôt entier, jamais le retrait d'une pièce
 * seule. Le serveur, lui, savait déjà le faire.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

test('l\'écran de revue retire un fichier à la fois', () => {
    const rev = lireUi('components/PiecesReview.jsx');
    /* Un bouton PAR fichier, dans la ligne du fichier — pas une action sur toute la pièce. */
    assert.match(rev, /onClick=\{\(\) => retirerFichier\(f, p\)\}/);
    assert.match(rev, /aria-label=\{`Retirer \$\{f\.nom \|\| `le fichier \$\{i \+ 1\}`\} de \$\{p\.label\}`\}/);
    /* SUPPRESSION DÉFINITIVE (purge d'une copie chiffrée) → confirmation obligatoire. */
    assert.match(rev, /window\.confirm\(`Retirer/);
    assert.match(rev, /await supprimerPieceFichier\(f\.id\)/);
    /* UNE CORBEILLE SUR UNE PIÈCE VALIDÉE AUSSI (2026-09-28). Elle en était retirée — « une pièce
       acceptée est figée » —, mais une pièce que l'ÉCOLE dépose est validée du même geste : un
       fichier joint par erreur ne s'enlevait plus. La confirmation dit ce qui arrive : la pièce reste
       validée, sauf si c'était son dernier fichier (le serveur la remet « à fournir »). */
    assert.doesNotMatch(rev, /\{p\.statut !== "VALIDEE" && \(\s*<button className="btn sm ghost danger"/,
        'la corbeille ne dépend plus du statut de la pièce');
    assert.match(rev, /"\\nLa pièce reste validée\."/);
    assert.match(rev, /C'est son dernier fichier : la pièce redeviendra « à fournir »\./);
    /* Le client API vise le FICHIER, pas le dépôt. */
    const api = lireUi('api/apiClient.js');
    assert.match(api, /supprimerPieceFichier\(fichierId\) \{ return request\(`\/pieces\/fichier\/\$\{fichierId\}`, \{ method: "DELETE" \}\)/);
});

test('le serveur supprime un seul fichier et rend la pièce « à fournir » quand c\'était le dernier', () => {
    const ctrl = lire('controllers/piece.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('const supprimerFichier'), ctrl.indexOf('const supprimerFichier') + 2200);
    /* UN fichier par son id, pas le dépôt. */
    assert.match(fn, /DELETE FROM piece_fichier WHERE id = \?/);
    /* Le personnel peut retirer à tout moment ; le stagiaire seulement tant que non validée.
       LE PERSONNEL EST NOMMÉ (2026-09-28). Ce test gelait « tout sauf STAGIAIRE et INTERVENANT »,
       qui laissait un compte ENTREPRISE effacer les pièces d'un dossier qui n'est pas le sien.
       `piece-garde-personnel.test.js` l'éprouve sur les quatre routes, rôle par rôle. */
    assert.match(fn, /const staff = estPersonnel\(req\.user\);/);
    assert.match(fn, /if \(f\.statut === 'VALIDEE'\) return res\.status\(409\)/);
    /* Plus aucun fichier → la pièce redevient « à fournir », elle ne promet pas une pièce absente. */
    assert.match(fn, /if \(!n\.n\) \{[\s\S]*?statut = 'ATTENDUE'/);
    assert.match(fn, /logAudit\(req, 'piece\.fichier_supprime'/);
    /* La route existe et n'est pas filtrée par rôle (garde de propriété dans le contrôleur). */
    assert.match(lire('routes/piece.routes.js'), /router\.delete\('\/fichier\/:id', supprimerFichier\);/);
});
