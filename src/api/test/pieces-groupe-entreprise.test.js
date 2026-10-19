/**
 * UNE PIÈCE SUR LA FICHE ENTREPRISE — relevé le 2026-10-19 sur « Attestation contribution au faf » :
 * la fiche entreprise affichait « 0/1 reçu(s) · À faire » pour une pièce POURTANT validée sur la fiche
 * du stagiaire (qui, elle, disait « Validé »).
 *
 * DEUX DÉFAUTS :
 *   · getCompanyParcours n'avait pas de branche « pièce » : une étape pièce (s.piece_id) tombait dans
 *     le `else` « document », se cherchait sous un `template_slug` qui n'existe pas — une pièce vit dans
 *     `piece_depot`, pas dans `generated_document` —, et restait donc à gen:0, quoi qu'ait déposé le
 *     stagiaire. Exactement le même défaut qu'avait eu la remise (cf. remise-groupe-entreprise).
 *   · le mot « reçu(s) » était faux de surcroît : une pièce est reçue DU stagiaire (déposée), pas
 *     envoyée À lui. Elle se DÉPOSE puis se VALIDE.
 *
 * Ce qu'on gèle : comptePieceGroupe (déposée/validée), etatPieceGroupe (reçu ≠ envoyé), la branche
 * pièce du serveur, et l'affichage « validée / déposée » de l'écran.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { comptePieceGroupe, etatPieceGroupe } = require('../lib/parcours.js');

const lireApi = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
/* Le corps d'une fonction, jusqu'à la suivante (indentation du composant). */
const fonction = (src, debut, fin = '\n  }\n') => { const i = src.indexOf(debut); assert.ok(i >= 0, `${debut} introuvable`); return src.slice(i, src.indexOf(fin, i) + fin.length); };

/* ─── Domaine PUR ─────────────────────────────────────────────────────────────────────────────── */

test('comptePieceGroupe : déposée (DEPOSEE|VALIDEE) = reçue, validée (VALIDEE) = faite ; un refus ne compte pas', () => {
    const lignes = [
        { enrollment_id: 'e1', statut: 'VALIDEE' },
        { enrollment_id: 'e2', statut: 'DEPOSEE' },
        { enrollment_id: 'e3', statut: 'REFUSEE' },
        // e4 : aucune ligne → ATTENDUE
    ];
    assert.deepStrictEqual(comptePieceGroupe(['e1', 'e2', 'e3', 'e4'], lignes),
        { total: 4, gen: 2, signed: 1, done: false }, 'déposées = e1+e2 ; validée = e1 ; refus et rien ne comptent pas');
    // LE CAS DU BUG : une seule pièce, validée → 1/1, faite (et non « 0/1 · À faire »).
    assert.deepStrictEqual(comptePieceGroupe(['e1'], [{ enrollment_id: 'e1', statut: 'VALIDEE' }]),
        { total: 1, gen: 1, signed: 1, done: true }, 'une pièce validée : l\'étape est faite');
    assert.deepStrictEqual(comptePieceGroupe(['e1'], [{ enrollment_id: 'e1', statut: 'DEPOSEE' }]),
        { total: 1, gen: 1, signed: 0, done: false }, 'déposée mais pas validée : reçue, pas faite');
    assert.deepStrictEqual(comptePieceGroupe([], []), { total: 0, gen: 0, signed: 0, done: false },
        'aucun dossier : rien de fait');
});

test('etatPieceGroupe : une pièce déposée est REÇUE (à vérifier), jamais « envoyée »', () => {
    assert.strictEqual(etatPieceGroupe({ total: 0 }), 'SANS_OBJET', 'personne concerné');
    assert.strictEqual(etatPieceGroupe({ total: 2, deposes: 2, valides: 2 }), 'VALIDE', 'toutes validées');
    assert.strictEqual(etatPieceGroupe({ total: 2, deposes: 1, valides: 0 }), 'RECU', 'au moins une déposée, à vérifier');
    assert.strictEqual(etatPieceGroupe({ total: 2, deposes: 2, valides: 1 }), 'RECU', 'déposées mais pas toutes validées');
    assert.strictEqual(etatPieceGroupe({ total: 2, deposes: 0, valides: 0 }), 'A_FAIRE', 'rien de déposé');
});

/* ─── Le serveur : une branche PIÈCE, comme la branche REMISE ─────────────────────────────────── */

test('getCompanyParcours a une branche PIÈCE qui lit piece_depot (pas generated_document)', () => {
    const co = lireApi('controllers/company.controller.js');
    const fn = co.slice(co.indexOf('const getCompanyParcours'), co.indexOf('\nconst ', co.indexOf('const getCompanyParcours') + 10));
    assert.match(fn, /\} else if \(s\.piece_id\) \{/, 'une branche propre aux pièces');
    assert.match(fn, /FROM piece_depot\s+WHERE organization_id = \? AND enrollment_id IN \(\?\) AND piece_type_id = \?/);
    assert.match(fn, /const c = comptePieceGroupe\(ids, lignes\);/);
    assert.match(fn, /piece = c;/);
    assert.match(fn, /piece: !!piece, piece_id: s\.piece_id \|\| null,/);
    // L'état d'une pièce passe par etatPieceGroupe (reçu/validé), PAS par etatDeGroupe (qui dirait « Envoyé »).
    assert.match(fn, /s\.piece \? etatPieceGroupe\(\{ total: s\.total, deposes: s\.gen, valides: s\.signed \}\)/);
    // La branche pièce passe AVANT le `else` qui interroge generated_document sous un template_slug
    // inexistant pour une pièce : c'est là qu'elle tombait, et restait à 0.
    assert.ok(fn.indexOf('} else if (s.piece_id) {') < fn.indexOf('const applicable = dossiersConcernes(s);'),
        'sans cet ordre, la pièce retombe dans le document et se cherche sous un slug qui n\'existe pas');
});

/* ─── L'écran : « validée / déposée », jamais « reçu(s) » pour une pièce de groupe ────────────── */

test('L\'ÉCRAN dit « validée / déposée » pour une pièce de groupe, jamais « reçu(s) »', () => {
    const p = lireUi('components/EnrollmentParcours.jsx');
    // listSub : une pièce de groupe a sa propre ligne, AVANT la branche générique « reçu(s) ».
    assert.match(p, /if \(isGroup\(s\) && s\.piece\) \{/);
    assert.match(p, /return s\.total > 1 \? `\$\{s\.signed\}\/\$\{s\.total\} validées` : "Validée";/);
    assert.match(p, /return `\$\{s\.gen\}\/\$\{s\.total\} déposée\(s\)`;/);
    assert.ok(p.indexOf('if (isGroup(s) && s.piece)') < p.indexOf('if (!s.signable && !s.quiz) return s.gen >= s.total ? "Reçu"'),
        'la pièce est traitée avant la branche « reçu(s) » des documents sans signature');
    // lineFor : la ligne détaillée reprend le même vocabulaire (validée / déposée).
    assert.match(p, /\$\{s\.signed\}\/\$\{s\.total\} validée\(s\) · \$\{s\.gen\}\/\$\{s\.total\} déposée\(s\)/);
});

test('LA FICHE ENTREPRISE mène une pièce à la fiche stagiaire, avec le bon mot (déposer/valider)', () => {
    const page = lireUi('pages/EntrepriseDetail.jsx');
    // Une pièce (ni remise, ni groupe) passe par gestesStagiaire, comme les documents stagiaire.
    assert.match(fonction(page, 'function gestesEtapeGroupe'), /if \(s\.remise\) return gestesRemise\(s\);\s+if \(!s\.company_level\) return gestesStagiaire\(s\);/);
    const g = fonction(page, 'function gestesStagiaire');
    assert.match(g, /const info = s\.piece/, 'le texte du lien s\'adapte à une pièce');
    assert.match(g, /se dépose et se valide sur la fiche du stagiaire/);
    assert.match(g, /vous pouvez la voir et la retirer/, 'on dit OÙ voir et retirer la pièce');
});
