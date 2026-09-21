/**
 * SUIVI QUALIOPI SUR TÉLÉPHONE : LE NOM A SA LARGEUR (2026-09-21).
 *
 * LE DÉFAUT. Une ligne de dossier tenait sur une seule ligne quelle que soit la largeur : chevron,
 * formation, nom, avancement (90 px), score. À 375 px, tout ce qui n'était pas le nom prenait
 * environ 270 px des 313 disponibles. Mesuré au banc : la colonne du nom faisait de 0 à 24 px, un
 * mot par ligne, le sous-titre s'étalait sur sept ou huit lignes, « stagiaire(s) » débordait sous
 * la barre, et chaque dossier montait à près de 200 px de haut.
 *
 * LE CORRECTIF. Sous 640 px, la ligne devient une grille et l'état — avancement ET score, groupés —
 * passe SOUS le nom, dans sa colonne. Mesuré ensuite : 164 à 217 px pour le nom, une ligne pour lui,
 * deux pour le sous-titre, 100 px par dossier. Sur ordinateur, rien ne bouge : la géométrie relevée
 * avant et après (lignes, colonne du nom, barre, score, feuille de route) est identique au pixel.
 *
 * Ce test ne mesure rien — un test Node n'a pas de moteur de rendu. Il fige les deux conditions
 * sans lesquelles la mesure redeviendrait fausse : l'état groupé dans un seul bloc (sinon la barre
 * et le score se séparent en passant à la ligne), et la grille du téléphone.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const SUIVI = lireUi('pages/Suivi.jsx');
const CSS = lireUi('styles/app.css');

test('la ligne d\'un dossier et l\'en-tête d\'une entreprise partagent la même mise en page', () => {
    assert.strictEqual(SUIVI.match(/<button type="button" onClick=\{[^}]*\}(\})? className="suivi-ligne">/g)?.length, 2,
        'deux lignes : le dossier et le groupe d\'entreprise');
    assert.strictEqual(SUIVI.match(/className="suivi-ligne-texte"/g)?.length, 2);
    /* L'avancement et le score dans UN bloc : c'est lui qui passe sous le nom. Laissés côte à
       côte dans la ligne, ils prendraient chacun leur place dans la grille. */
    assert.strictEqual(SUIVI.match(/<span className="suivi-ligne-etat">\s*<ProgressPct [^>]*\/>\s*<Badge /g)?.length, 2);
    // Plus de mise en page en ligne pour ces rangées : une media query ne passe pas un style `style={…}`.
    assert.doesNotMatch(SUIVI, /width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px"/);
});

test('sous 640 px, l\'état passe sous le nom, dans sa colonne', () => {
    assert.match(CSS, /\.suivi-ligne\{width:100%;display:flex;align-items:center;gap:12px;padding:12px 14px;/,
        'sur ordinateur, la ligne d\'avant, à l\'identique');
    const telephone = CSS.match(/@media \(max-width:640px\)\{\n  \.suivi-ligne\{[\s\S]*?\n\}/);
    assert.ok(telephone, 'le bloc téléphone du suivi existe');
    /* Chevron et formation à leur largeur, le nom dans la colonne qui prend le reste. (`1fr` ou
       `minmax(0,1fr)`, c'est égal ici : le `min-width:0` de .suivi-ligne-texte empêche déjà un long
       mot d'élargir la grille — vérifié au banc avec un nom d'entreprise de 46 lettres sans espace.) */
    assert.match(telephone[0], /\.suivi-ligne\{display:grid;grid-template-columns:auto auto (minmax\(0,)?1fr\)?;/);
    assert.match(telephone[0], /\.suivi-ligne-etat\{grid-row:2;grid-column:3\}/,
        'deuxième rangée, colonne du nom : aligné sous lui');
    // Les retraits de 40 et 34 px, pensés pour l'ordinateur, fondent aussi.
    assert.match(telephone[0], /\.suivi-detail\{padding:12px 12px 14px\}/);
    assert.match(telephone[0], /\.suivi-groupe-membres\{padding:10px 10px 12px\}/);
});
