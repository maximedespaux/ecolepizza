/**
 * LA PALETTE DE SIGNATURES, DÉBROUSSAILLÉE (demandé le 2026-09-24).
 *
 * DÉFAUT GELÉ : le bloc « Signatures » montrait, sur TOUT modèle, huit blocs nommés (Jury 1/2,
 * Président du jury, Formateur, Stagiaire 1 à 4). Ils ne servent qu'aux modèles « Externe », où
 * chacun s'attribue à une personne de la session à l'envoi ; sur une convention ou un devis,
 * personne ne les remplit — ils encombraient un écran déjà chargé. On ne les montre donc que là.
 *
 * ET « Signature de l'organisme » figurait DEUX fois : en CADRE (bloc Signatures) ET en jeton brut
 * (groupe « Signature » du catalogue). Deux entrées identiques pour la même signature : on garde le
 * cadre, on retire la puce en double.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const EDITEUR = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'TemplateEditor.jsx'), 'utf8');

test('les blocs nommés (jury, formateur, stagiaires) ne s\'affichent que sur un modèle « Externe »', () => {
    /* SIG_PRESETS.map vit SOUS la garde signeParExterne — pas à la racine du bloc, où il paraissait
       sur une convention comme sur une grille de jury. */
    assert.match(EDITEUR, /\{signeParExterne && \(\s*<>[\s\S]*?SIG_PRESETS\.map/,
        'les blocs nommés sont gardés par « Externe »');
});

test('« Signature de l\'organisme » n\'est offerte qu\'UNE fois — le cadre, pas le jeton en double', () => {
    /* La puce brute du groupe « Signature » du catalogue est filtrée. */
    assert.match(EDITEUR, /filter\(\(t\) => !\(g\.group === "Signature" && \(t\.key === "Signature organisme" \|\| t\.key === "Signature stagiaire"\)\)\)/);
    /* Le CADRE, lui, reste le point d'entrée (garde anti-régression). */
    assert.match(EDITEUR, /JSON\.stringify\(SIG_ORGANISME\)/);
});

/* ─── La signature du stagiaire (2026-09-25) ────────────────────────────────────────────────── */

/* « Gros problème : dans les jetons des documents pour le stagiaire, je n'ai pas de signature. » Depuis
   que les blocs nommés « Stagiaire 1…4 » ne s'offrent qu'aux modèles « Externe » (plus haut), la
   signature du stagiaire n'était plus qu'une puce du groupe « Signature », replié. Et le « Contrat » de
   production, que le stagiaire signe, n'avait AUCUN cadre pour elle : le contrat signé sortait sans sa
   signature visible, sans que rien ne le dise. */
const puce = (cle, libelle) => `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${libelle}">${libelle}</span>`;

test('le cadre « Signature du stagiaire » est offert dans le bloc Signatures, sur tout modèle de dossier', () => {
    assert.match(EDITEUR, /const SIG_STAGIAIRE = \{ key: "Signature stagiaire", label: "Signature du stagiaire" \};/);
    assert.match(EDITEUR, /\{!modeleEntreprise && \(\s*<button className="tok-chip" draggable[\s\S]{0,400}?JSON\.stringify\(SIG_STAGIAIRE\)/,
        'hors de la garde « Externe » : seul un document de GROUPE, que le stagiaire ne signe pas, ne l\'offre pas');
    const bloc = EDITEUR.slice(EDITEUR.indexOf('JSON.stringify(SIG_ORGANISME)'), EDITEUR.indexOf('SIG_PRESETS.map'));
    assert.ok(bloc.includes('JSON.stringify(SIG_STAGIAIRE)'), 'juste après celui de l\'organisme, AVANT les blocs réservés à « Externe »');
    // Et plus en double dans le groupe « Signature » du catalogue.
    assert.match(EDITEUR, /t\.key === "Signature organisme" \|\| t\.key === "Signature stagiaire"/);
});

test('un modèle que le stagiaire signe, sans cadre pour sa signature, le DIT — le cas du Contrat de production', async () => {
    const { aUnCadreStagiaire, CASE_STAGIAIRE } = await import('../../app/ui/lib/signatures.js');
    const { CASE_STAGIAIRE: SERVEUR } = require('../lib/documents.js');
    assert.strictEqual(String(CASE_STAGIAIRE), String(SERVEUR), 'la règle de l\'écran est celle du rendu');
    // Les formes que le rendu remplit de sa signature (htmlfill : jeton intégré, et repli STAG_SLOT).
    assert.ok(aUnCadreStagiaire(`<p>${puce('Signature stagiaire', 'Signature du stagiaire')}</p>`), 'le droit à l\'image');
    assert.ok(aUnCadreStagiaire(`<p>${puce('sig:stagiaire1', 'Stagiaire 1')}</p>`), 'les deux devis');
    assert.ok(aUnCadreStagiaire(`<p>${puce('sig:cadre', 'Signature de l\'élève')}</p>`), 'par son libellé');
    // Le Contrat de production : l'organisme seul. Et un cadre de jury n'est pas celui du stagiaire.
    assert.ok(!aUnCadreStagiaire(`<p>${puce('Signature organisme', "Signature de l'organisme")}</p>`));
    assert.ok(!aUnCadreStagiaire(`<p>${puce('sig:jury1', 'Jury 1')}</p>`));
    assert.ok(!aUnCadreStagiaire(''));
    // L'éditeur lit « qui signe » au chargement, et le dit tant que le cadre manque.
    assert.match(EDITEUR, /setSigneParStagiaire\(Array\.isArray\(d\.signers\) && d\.signers\.includes\("STAGIAIRE"\)\);/);
    assert.match(EDITEUR, /\{signeParStagiaire && !modeleEntreprise\s*&& !aUnCadreStagiaire\(\[header\?\.getHTML\(\), body\?\.getHTML\(\), footer\?\.getHTML\(\)\]\.join\(""\)\) && \(/);
    assert.match(EDITEUR, /<b>Le stagiaire signe ce modèle, mais aucun cadre ne porte sa signature<\/b>/);
});

test('les deux formes se remplissent bien de SA signature au rendu', () => {
    const { fillHtml } = require('../lib/htmlfill.js');
    const IMAGE = 'data:image/png;base64,U1RBR0lBSVJF';
    const ctx = { org: {}, learner: {}, signature: { data: IMAGE, name: 'Léa MARTIN' } };
    for (const cadre of [puce('Signature stagiaire', 'Signature du stagiaire'), puce('sig:stagiaire1', 'Stagiaire 1')]) {
        assert.ok(fillHtml(`<p>${cadre}</p>`, ctx).includes(`<img src="${IMAGE}"`), cadre);
    }
});
