/**
 * LE PIED DES FENÊTRES SUR TÉLÉPHONE : UN BOUTON PASSE À LA LIGNE, IL NE SE COUPE PAS (2026-09-22).
 *
 * LE DÉFAUT. Le pied d'une fenêtre (`.mfoot`) tenait sur une seule rangée, quelle que soit la
 * largeur. Or `.btn` masque son débordement (`overflow:hidden`), et dans une rangée flex une boîte
 * qui masque son débordement peut rétrécir jusqu'à zéro : quand la place manquait, le bouton se
 * rognait au lieu de pousser ses voisins. Mesuré au banc à 375 px : « Supprimer le stagiaire » se
 * lisait « Supprimer le sta » (122 px pour 174), et le pied du document côté personnel — Fermer,
 * Ouvrir le PDF, PDF, Lien externe — rognait ses quatre boutons.
 *
 * LE CORRECTIF. Un bouton de pied ne rétrécit plus, et le pied passe à la ligne. Dans la fiche
 * stagiaire, la suppression reste à gauche, seule sur sa rangée au téléphone, et Annuler /
 * Enregistrer passent dessous, à droite — sans quoi le pied, aligné à droite, posait la suppression
 * juste au-dessus d'« Enregistrer ». Sur ordinateur, rien ne bouge : quinze boutons de six pieds
 * mesurés au banc avant et après, même boîte au pixel près.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const CSS = lireUi('styles/app.css');
/** Le corps d'une règle écrite en tête de ligne : `.mfoot{…}`, pas `.mhead,.mbody,.mfoot{…}`. */
const regle = (sel) => {
    const m = CSS.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`));
    assert.ok(m, `règle introuvable : ${sel}`);
    return m[1];
};

test('un bouton de pied garde la largeur de son libellé, et le pied passe à la ligne', () => {
    assert.match(regle('.mfoot'), /flex-wrap:wrap/, 'le pied se replie au lieu de rogner');
    assert.match(regle('.mfoot .btn'), /flex-shrink:0/, 'sans quoi `overflow:hidden` laisse le bouton rétrécir jusqu\'à zéro');
});

test('la fiche stagiaire : la suppression à gauche, seule sur sa rangée ; les actions à droite', () => {
    const FICHE = lireUi('components/EditStagiaireModal.jsx');
    assert.match(FICHE, /<div className="mfoot">\s*\{onDelete && <button type="button" className="btn ghost danger mfoot-suppr" onClick=\{onDelete\}>Supprimer le stagiaire<\/button>\}\s*<div className="mfoot-actions">/);
    assert.match(regle('.mfoot-actions'), /margin-left:auto/, 'Annuler / Enregistrer à droite, même seuls sur leur rangée');
    assert.match(regle('.mfoot-suppr'), /margin-right:auto/, 'seule sur sa rangée, la suppression reste à gauche, loin d\'« Enregistrer »');
});
