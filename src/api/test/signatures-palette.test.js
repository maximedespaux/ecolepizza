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
    assert.match(EDITEUR, /filter\(\(t\) => !\(g\.group === "Signature" && t\.key === "Signature organisme"\)\)/);
    /* Le CADRE, lui, reste le point d'entrée (garde anti-régression). */
    assert.match(EDITEUR, /JSON\.stringify\(SIG_ORGANISME\)/);
});
