/**
 * SUR TÉLÉPHONE, RIEN NE SORT DE L'ÉCRAN.
 *
 * Tournée du 2026-09-17, page par page, à 375 px sur la production (lecture seule) : six pages
 * faisaient défiler l'écran de côté, et des boutons se retrouvaient hors de vue — le défaut exact
 * signalé (« des boutons ne sont pas visibles »).
 *
 *   · Sessions : le mois faisait 600 px et la liste des sessions 959 px ;
 *   · une session : « Notes de suivi », « Retirer de la session », « Générer le document » dehors ;
 *   · Pizza Quest : les onglets « Questions » et « Usage », et une corbeille ;
 *   · l'éditeur de modèles : « Aperçu » et « Enregistrer » ;
 *   · la fiche stagiaire : 3 px, un e-mail trop long pour sa colonne.
 *
 * DEUX CAUSES, TOUJOURS LES MÊMES :
 *   1. `grid-template-columns: 1fr` — le MINIMUM d'un `1fr` nu est la largeur de son contenu. Une
 *      puce insécable, un intitulé en `nowrap`, un e-mail suffisent à élargir la grille, et la page
 *      avec. `minmax(0,1fr)` laisse la colonne rétrécir ; sans effet quand tout tient.
 *   2. une rangée flexible sans `min-width: 0` ni retour à la ligne — un élément flexible ne
 *      rétrécit jamais sous la largeur de son contenu, et pousse ses voisins dehors.
 *
 * Un test node ne met rien en page : il gèle les règles qui ont réglé chaque cas. La tournée elle-
 * même se refait dans un navigateur à 375 px (mesure : `scrollWidth` du document, et tout bouton
 * dont le bord dépasse l'écran hors d'un conteneur défilant).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');
const CSS = lire('styles/app.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** Les blocs `@media (max-width: N)` et leur contenu, accolades imbriquées comprises. */
function blocsMedia(css) {
    const blocs = [];
    const re = /@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{/g;
    let m;
    while ((m = re.exec(css))) {
        let profondeur = 1, i = re.lastIndex;
        while (i < css.length && profondeur) { if (css[i] === '{') profondeur++; else if (css[i] === '}') profondeur--; i++; }
        blocs.push({ largeur: Number(m[1]), corps: css.slice(re.lastIndex, i - 1) });
    }
    return blocs;
}

test('aucune grille resserrée pour les écrans étroits ne garde un « 1fr » nu', () => {
    /* Une règle d'écran étroit qui passe une grille en colonnes est précisément celle qui voit des
       contenus plus larges que ses colonnes. Chaque `fr` y doit pouvoir rétrécir. */
    const fautifs = [];
    for (const { largeur, corps } of blocsMedia(CSS)) {
        for (const decl of corps.match(/grid-template-columns\s*:[^;}]+/g) || []) {
            const valeur = decl.split(':').slice(1).join(':');
            const nus = valeur.replace(/minmax\(\s*0\s*,[^)]*\)/g, '').match(/[\d.]*fr\b/g);
            if (nus) fautifs.push(`@media ${largeur}px : ${decl.trim()}`);
        }
    }
    assert.deepStrictEqual(fautifs, []);
    // Hors @media aussi, la colonne unique du catalogue sans panier.
    assert.doesNotMatch(CSS, /grid-template-columns\s*:\s*1fr\s*[;}]/);
});

test('le calendrier des sessions tient dans 375 px', () => {
    assert.match(CSS, /\.cal-grid\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\);gap:8px\}/);
    assert.match(CSS, /\.cal-grid\.withweeks\{grid-template-columns:36px repeat\(7,minmax\(0,1fr\)\)\}/);
    const telephone = blocsMedia(CSS).filter((b) => b.largeur <= 600).map((b) => b.corps).join('\n');
    assert.match(telephone, /\.cal-grid\.withweeks\{grid-template-columns:20px repeat\(5,minmax\(0,1fr\)\) repeat\(2,minmax\(0,\.5fr\)\)\}/);
    assert.match(telephone, /\.cal-evt \.n\{display:none\}/);
    assert.match(telephone, /\.sess-list\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('les en-têtes de carte, les sélecteurs segmentés et l\'éditeur passent à la ligne', () => {
    assert.match(CSS, /\.card-head\{[^}]*flex-wrap:wrap[^}]*\}/, 'en-tête de carte');
    const telephone = blocsMedia(CSS).filter((b) => b.largeur <= 600).map((b) => b.corps).join('\n');
    assert.match(telephone, /\.seg\{flex-wrap:wrap;max-width:100%;border-radius:14px\}/, 'sélecteur segmenté');
    assert.match(telephone, /\.tpl-editor-head\{flex-wrap:wrap\}\.tpl-editor-actions\{margin-left:0;flex-wrap:wrap\}/, 'éditeur');
    // L'ancien groupe d'actions en style en ligne ne pouvait pas être repris par une règle d'écran.
    const editeur = lire('pages/TemplateEditor.jsx');
    assert.match(editeur, /<div className="tpl-editor-actions">/);
    assert.doesNotMatch(editeur, /<div style=\{\{ marginLeft: "auto", display: "flex", gap: 8 \}\}>/);
});

test('les rangées flexibles laissent rétrécir ce qui est long', () => {
    // Session : le stagiaire inscrit ne pousse plus ses deux boutons dehors.
    const session = lire('pages/SessionDetail.jsx');
    assert.match(session, /style=\{\{ flex: 1, minWidth: 0, textAlign: "left"/);
    assert.match(session, /\{e\.email \|\| "-"\}/);
    assert.match(session, /overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" \}\}>\{e\.email/);
    // Pizza Quest : le nom d'un rangement.
    assert.match(lire('pages/QuestManager.jsx'), /<b style=\{\{ flex: 1, minWidth: 0, overflowWrap: "anywhere" \}\}>\{cat\.name\}<\/b>/);
    // Fiche stagiaire : l'intitulé suit la largeur, la valeur peut rétrécir.
    const fiche = lire('pages/StagiaireDetail.jsx');
    assert.match(fiche, /flex: "0 0 clamp\(96px, 36%, 220px\)"/);
    assert.match(fiche, /flex: 1, minWidth: 0, overflowWrap: "anywhere", fontWeight: 500/);
    assert.doesNotMatch(fiche, /flex: "0 0 220px"/);
});
