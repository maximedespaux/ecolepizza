/**
 * L'ESPACE STAGIAIRE SUR TÉLÉPHONE.
 *
 * Tournée du 2026-09-17 à 375 px, sur banc : la vraie coquille `StudentLayout`, les vraies pages et
 * la vraie feuille de style, des réponses d'API aux formes relevées dans les contrôleurs et aux
 * longueurs réelles. Les pages ne débordaient pas ; les défauts étaient ailleurs, et l'un d'eux
 * touchait le geste le plus important de l'espace.
 *
 *   · LA SIGNATURE. Le canevas dessine sur 520 points et s'affiche sur 325 px : la position du
 *     doigt, prise en pixels écran, était tracée telle quelle. Un trait de 250 à 300 px tombait
 *     entre 156 et 188 px — l'encre ne suivait pas le doigt, et une signature s'entassait dans les
 *     deux tiers gauches du cadre. Invisible sur ordinateur, où les deux largeurs coïncident.
 *   · « Mes demandes » : six étapes à 64 px minimum chacune, « Facturé » coupé et « Remis » caché.
 *   · Les onglets « Mes formations / Mes documents » empilés sur deux lignes dans une gélule.
 *   · Pizza Quest : « 3/2 chapitres » et une jauge à 150 % — les étoiles d'un chapitre retiré.
 *   · Le parcours d'une formation : un titre de pièce tassé à un mot par ligne.
 *   · Des cibles sous le doigt : la croix des fenêtres (26 × 32), les cases de 13 px, le retour
 *     « Mes documents » (16 px de haut).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');
const CSS = lire('styles/app.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('le doigt et l\'encre se rejoignent, quelle que soit la largeur affichée', async () => {
    const { versCanevas } = await import('../../app/ui/lib/canevasSignature.js');
    // Téléphone : 325 × 94 affichés (bordure de 1 px), 520 × 150 internes — la situation mesurée.
    const tel = { left: 25, top: 400, bordGauche: 1, bordHaut: 1, largeurAffichee: 325, hauteurAffichee: 94, largeur: 520, hauteur: 150 };
    const p = versCanevas({ clientX: 25 + 1 + 250, clientY: 400 + 1 + 47 }, tel);
    assert.strictEqual(Math.round(p.x), 400, '250 px affichés = 400 points du canevas (et non 250)');
    assert.strictEqual(Math.round(p.y), 75, 'le milieu de la hauteur affichée = le milieu du canevas');
    // Le bord droit affiché touche le bord droit du canevas : la signature peut aller jusqu'au bout.
    assert.strictEqual(Math.round(versCanevas({ clientX: 25 + 1 + 325, clientY: 401 }, tel).x), 520);
    // Ordinateur : les deux largeurs coïncident, rien ne change.
    const pc = { left: 0, top: 0, bordGauche: 0, bordHaut: 0, largeurAffichee: 520, hauteurAffichee: 150, largeur: 520, hauteur: 150 };
    assert.deepStrictEqual(versCanevas({ clientX: 123, clientY: 45 }, pc), { x: 123, y: 45 });
});

test('le canevas s\'affiche dans ses propres proportions, et la fenêtre convertit la position', () => {
    const modale = lire('components/SignatureModal.jsx');
    const w = Number((/width=\{(\d+)\}/.exec(modale) || [])[1]);
    const h = Number((/height=\{(\d+)\}/.exec(modale) || [])[1]);
    const ratio = /aspectRatio: "(\d+) \/ (\d+)"/.exec(modale);
    assert.ok(ratio, 'aspect-ratio affiché');
    /* Les MÊMES proportions : sinon le tracé serait étiré dans un seul sens, et la signature
       enregistrée sortirait déformée — sur l'écran comme dans chaque PDF. */
    assert.deepStrictEqual([Number(ratio[1]), Number(ratio[2])], [w, h]);
    assert.match(modale, /height: "auto"/);
    assert.match(modale, /versCanevas\(e\.touches \? e\.touches\[0\] : e, mesuresCanevas\(c\)\)/);
    assert.doesNotMatch(modale, /t\.clientX - r\.left/, 'la position écran brute ne doit plus être tracée');
});

test('Pizza Quest ne compte que les chapitres qui existent', () => {
    const src = lire('pages/PizzaQuest.jsx');
    const carte = src.slice(src.indexOf('function FCard('), src.indexOf('function FCard(') + 2000);
    assert.match(carte, /const faits = prog \? Object\.keys\(prog\)\.filter\(\(i\) => Number\(i\) < nbCh\) : \[\];/);
    assert.ok(carte.indexOf('const nbCh') < carte.indexOf('const faits'), 'le nombre de chapitres est connu avant le compte');
    assert.doesNotMatch(carte, /const done = prog \? Object\.keys\(prog\)\.length/);
});

/** Les blocs `@media (max-width: N)` avec leur POSITION dans la feuille. */
function blocsMedia(css) {
    const blocs = [];
    const re = /@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{/g;
    let m;
    while ((m = re.exec(css))) {
        let p = 1, i = re.lastIndex;
        while (i < css.length && p) { if (css[i] === '{') p++; else if (css[i] === '}') p--; i++; }
        blocs.push({ largeur: Number(m[1]), debut: m.index, corps: css.slice(re.lastIndex, i - 1) });
    }
    return blocs;
}
const TELEPHONE = blocsMedia(CSS).filter((b) => b.largeur <= 600);
const dansTelephone = (motif) => TELEPHONE.find((b) => motif.test(b.corps));

test('sur téléphone : étapes de commande, onglets, croix et cases à la bonne taille', () => {
    assert.ok(dansTelephone(/\.cmd-step\{min-width:0\}/), 'les six étapes se partagent la largeur');
    // L'onglet du stagiaire : la règle de téléphone doit venir APRÈS la règle de base, de même spécificité.
    const base = CSS.indexOf('.stu-app .seg-btn{padding:8px 16px');
    const tel = dansTelephone(/\.stu-app \.seg-btn\{padding-left:10px;padding-right:10px\}/);
    assert.ok(base > -1 && tel && tel.debut > base, 'placée avant, la règle de base l\'écraserait');
    assert.ok(dansTelephone(/\.modal \.x\{width:44px;height:44px;flex:none/), 'croix de 44 px, sans rétrécir dans l\'en-tête');
    // Les fenêtres sont rendues hors de `.stu-app` (portail) : la règle des cases doit les viser aussi.
    assert.ok(dansTelephone(/\.modal input\[type=radio\],\.modal input\[type=checkbox\]\{width:20px;height:20px/));
});

test('le parcours d\'une formation : titres qui passent à la ligne, retour à la taille du doigt', () => {
    const page = lire('pages/StudentFormationDetail.jsx');
    assert.doesNotMatch(page, /<b style=\{\{ flex: 1, minWidth: 0 \}\}>/, 'une base nulle laisse le titre s\'écraser');
    assert.strictEqual((page.match(/<b style=\{\{ flex: "1 1 160px", minWidth: 0 \}\}>/g) || []).length, 3, 'pièce, remise, document');
    assert.match(page, /padding: "12px 0", margin: "-12px 0"/);
});
