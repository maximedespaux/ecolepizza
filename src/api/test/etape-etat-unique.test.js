/**
 * « TERMINÉ » EN BAS, « MANQUANT » EN HAUT — le même écran, les mêmes données.
 *
 * LE DÉFAUT, MESURÉ EN PRODUCTION le 2026-09-15. Le bandeau « Ce qui manque » du suivi Qualiopi
 * réclamait QUATRE pièces d'identité et QUATRE justificatifs. Quinze pixels plus bas, le détail
 * du dossier affichait « Pièce d'identité — Terminé ». Relevé sur l'API : `status: "A_FAIRE"`,
 * `piece: true`, `pieceStatus: "VALIDEE"`.
 *
 * LA CAUSE : deux définitions de l'état d'une étape. `components/Roadmap.jsx` portait la
 * référence, `pages/Suivi.jsx` en gardait une copie annoncée « identique à Roadmap.stepState ».
 * Elle ne l'était plus — le cas des pièces avait été ajouté à l'une et pas à l'autre. Une
 * copie ne se signale jamais elle-même comme périmée ; c'est son commentaire qui ment en
 * premier.
 *
 * POURQUOI LE TEST QUI EXISTAIT N'A RIEN VU. `piece-depot-ecole-vaut-verification.test.js`
 * gelait bien la règle des pièces — en cherchant `if (doc.piece) {` DANS Roadmap.jsx. Il
 * prouvait donc que le correctif était appliqué là où il était appliqué. Un test qui vérifie un
 * motif dans UN fichier ne dit rien du fichier d'à côté qui fait le même travail.
 *
 * D'OÙ CE FICHIER, qui gèle deux choses que l'ancien ne pouvait pas gêler : le COMPORTEMENT de
 * la règle (elle est désormais dans une lib sans JSX, donc importable), et son UNICITÉ.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');

test('UNE PIÈCE VALIDÉE EST TERMINÉE — le cas exact relevé en production', async () => {
    const { stepState } = await import('../../app/ui/lib/etapes.js');
    /* Les valeurs viennent de l'API de production, pas d'une invention : une pièce n'a jamais
       de document généré, donc son `status` reste « A_FAIRE » à vie. Lire ce champ-là pour
       juger une pièce, c'est la déclarer manquante pour toujours. */
    const piece = { label: "Pièce d'identité", status: 'A_FAIRE', piece: true, pieceStatus: 'VALIDEE' };
    assert.strictEqual(stepState(piece), 'done');
    assert.strictEqual(stepState({ ...piece, pieceStatus: 'DEPOSEE' }), 'progress', 'déposée, pas encore vérifiée');
    assert.strictEqual(stepState({ ...piece, pieceStatus: 'REFUSEE' }), 'todo', 'refusée : il y a bien à refaire');
    assert.strictEqual(stepState({ ...piece, pieceStatus: 'ATTENDUE' }), 'todo');
});

test('LES DOCUMENTS ORDINAIRES GARDENT LEUR RÈGLE', async () => {
    const { stepState } = await import('../../app/ui/lib/etapes.js');
    assert.strictEqual(stepState({ status: 'SIGNE' }), 'done');
    // Signable par le stagiaire : généré ou envoyé ne suffit pas, il manque la signature.
    assert.strictEqual(stepState({ status: 'ENVOYE', stagiaireSign: true }), 'progress');
    assert.strictEqual(stepState({ status: 'A_FAIRE', stagiaireSign: true }), 'todo');
    // Non signable : terminé dès qu'il existe.
    assert.strictEqual(stepState({ status: 'GENERE' }), 'done');
    assert.strictEqual(stepState({ status: 'A_FAIRE' }), 'todo');
});

test('IL N\'EXISTE QU\'UNE SEULE DÉFINITION DANS TOUT LE FRONT', () => {
    /* LE CŒUR DU SUJET. Corriger la copie sans la SUPPRIMER aurait remis le compteur à zéro en
       attendant la prochaine règle ajoutée d'un seul côté. On gèle donc l'unicité, pas la
       présence du correctif : la règle se reconnaît à sa liste de statuts, qui n'a aucune raison
       d'apparaître ailleurs. */
    const fichiers = [];
    const parcourir = (rel) => {
        for (const e of fs.readdirSync(path.join(UI, rel), { withFileTypes: true })) {
            const p = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) parcourir(p);
            else if (/\.(js|jsx)$/.test(e.name)) fichiers.push(p);
        }
    };
    parcourir('');
    const porteurs = fichiers.filter((f) => /\["GENERE", "ENVOYE", "CONSULTE"\]/.test(lire(f)));
    assert.deepStrictEqual(porteurs, ['lib/etapes.js'],
        'la règle d\'état ne doit vivre QU\'À UN endroit — toute copie finira par diverger.');
});

test('LES DEUX ÉCRANS TIRENT DE LA MÊME SOURCE', () => {
    for (const f of ['components/Roadmap.jsx', 'pages/Suivi.jsx']) {
        assert.match(lire(f), /import \{ stepState \} from ["']\.\.\/lib\/etapes\.js["']/,
            `${f} doit importer la règle, pas la réécrire`);
    }
    assert.doesNotMatch(lire('pages/Suivi.jsx'), /function docState/,
        'la copie de Suivi.jsx est supprimée, pas seulement corrigée');
});
