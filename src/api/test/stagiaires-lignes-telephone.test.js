/**
 * LISTE DES STAGIAIRES SUR TÉLÉPHONE : LE NOM A SA LARGEUR (2026-09-21).
 *
 * LE DÉFAUT, le même que sur les lignes du suivi. Une ligne tenait sur une seule ligne quelle que
 * soit la largeur : avatar et nom, puis le lien vers l'entreprise, « + Compte » (ou les deux boutons
 * d'un compte), modifier, supprimer. À 375 px, les actions prenaient environ 220 px des 300
 * disponibles. Mesuré au banc : la colonne du nom faisait de 0 à 74 px (0 pour une fiche portant
 * l'alerte « identifiant ≠ fiche »), le nom sur deux lignes, l'e-mail et le téléphone sur trois et
 * débordant sur quatre lignes de liste sur cinq, et « À recontacter » posé SUR les boutons.
 *
 * LE CORRECTIF. Les actions sont groupées en un bloc qui, sous 640 px, passe SOUS le nom, aligné sur
 * lui. Mesuré ensuite : 256 px pour le nom, une ligne pour lui comme pour le contact, plus rien sous
 * les boutons. Sur ordinateur, rien ne bouge : chaque lien, bouton, pastille et avatar des cinq
 * lignes du banc garde la même boîte, au pixel près, avant et après.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const LISTE = lireUi('pages/Stagiaires.jsx');
const CSS = lireUi('styles/app.css');

test('la ligne sort de son style en ligne, et les actions forment UN bloc', () => {
    // Une media query ne peut rien contre un `style={…}` : la mise en page passe dans app.css.
    assert.match(LISTE, /<div key=\{l\.id\} className="stagiaire-ligne">/);
    assert.doesNotMatch(LISTE, /<div key=\{l\.id\} style=\{\{ display: "flex"/);
    /* Toutes les actions dans le bloc, du lien vers l'entreprise à la suppression : c'est le bloc
       qui passe sous le nom. Une action laissée dehors resterait à côté du nom, et l'écraserait. */
    const ouvre = LISTE.indexOf('<span className="stagiaire-actions">');
    const ferme = LISTE.indexOf('</span>\n              </div>\n            ))}', ouvre);
    assert.ok(ouvre > 0 && ferme > ouvre, 'le bloc des actions existe et se referme avant la fin de la ligne');
    const bloc = LISTE.slice(ouvre, ferme);
    for (const action of ['to={`/entreprises/${l.company_id}`}', 'l.compte_email_different &&', 'onClick={() => resetPassword(l)}',
        'onClick={() => removeAccount(l)}', 'onClick={() => openEdit(l.id)}', 'onClick={() => removeLearner(l)}']) {
        assert.ok(bloc.includes(action), `dans le bloc : ${action}`);
    }
});

test('sur ordinateur, la ligne d\'avant à l\'identique ; sous 640 px, les actions sous le nom', () => {
    assert.match(CSS, /\.stagiaire-ligne\{display:flex;align-items:center;gap:11px;padding:8px 0;border-bottom:1px solid var\(--border-soft\)\}/);
    assert.match(CSS, /\.stagiaire-actions\{display:flex;align-items:center;gap:11px;flex-shrink:0\}/);
    const telephone = CSS.match(/@media \(max-width:640px\)\{\n  \.stagiaire-ligne\{[\s\S]*?\n\}/);
    assert.ok(telephone, 'le bloc téléphone de la liste existe');
    assert.match(telephone[0], /\.stagiaire-ligne\{flex-wrap:wrap;/);
    /* `flex-wrap` sur le bloc aussi : l'alerte « identifiant ≠ fiche » et les quatre boutons d'un
       compte dépassaient d'un pixel — mieux vaut deux lignes d'actions qu'un bouton hors de l'écran. */
    assert.match(telephone[0], /\.stagiaire-actions\{flex:1 1 100%;flex-wrap:wrap;[^}]*\}/);
});

test('le bloc des actions s\'aligne sur le nom : largeur de l\'avatar + l\'écart', () => {
    /* Si l'avatar change de taille, l'alignement doit suivre — ce test le rappelle. */
    const avatar = Number(CSS.match(/\.avatar\{width:(\d+)px;/)[1]);
    const ecart = Number(CSS.match(/\.stagiaire-ligne\{display:flex;align-items:center;gap:(\d+)px;/)[1]);
    const retrait = Number(CSS.match(/\.stagiaire-actions\{flex:1 1 100%;[^}]*padding-left:(\d+)px/)[1]);
    assert.strictEqual(retrait, avatar + ecart);
});
