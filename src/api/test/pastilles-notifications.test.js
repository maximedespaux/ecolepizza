/**
 * LES PASTILLES DE LA CLOCHE — deux natures, deux couleurs, et le VRAI nombre (2026-09-23).
 *
 * CE QUI N'ALLAIT PAS, signalé par l'école :
 *   · la cloche portait UN seul nombre, mêlant les alertes (ce qui appelle un geste) et
 *     l'activité de l'équipe (ce qui s'est passé). On ouvrait pour « 12 » et on y trouvait douze
 *     lignes de journal, alors que rien n'attendait ;
 *   · ce nombre s'arrêtait à « 9+ ». Au-delà de neuf, la cloche disait la même chose qu'on en
 *     ait dix ou deux cents — et c'est justement quand il y en a beaucoup qu'on veut le savoir ;
 *   · et il était de toute façon FAUX : il se prenait dans les listes servies, coupées à 40 et
 *     30 lignes. Un chiffre précis, donc crédible, et plafonné sans le dire.
 *
 * Les couleurs sont celles du bouton des mémos, et c'est voulu : ROUGE pour ce qui attend,
 * BLEU pour ce qui s'est passé, d'un bout à l'autre de l'application.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const formatUi = () => import('../../app/ui/lib/format.js');

test('une pastille dit le vrai nombre, et ne s\'arrête plus à neuf', async () => {
    const { compteurPastille } = await formatUi();
    assert.strictEqual(compteurPastille(3), '3');
    assert.strictEqual(compteurPastille(10), '10', '« 9+ » n\'aide pas à décider s\'il faut ouvrir');
    assert.strictEqual(compteurPastille(247), '247');
    /* UN PLAFOND QUAND MÊME, à mille : au-delà, le nombre exact n'apprend plus rien et la
       pastille deviendrait un bandeau sur un téléphone. */
    assert.strictEqual(compteurPastille(999), '999');
    assert.strictEqual(compteurPastille(1000), '999+');
    /* Une valeur illisible ne doit pas écrire « NaN » sur la barre du haut. */
    assert.strictEqual(compteurPastille(undefined), '0');
    assert.strictEqual(compteurPastille(-4), '0');
});

test('plus aucun « 9+ » dans l\'interface', () => {
    for (const f of ['components/Topbar.jsx', 'components/MemoBouton.jsx']) {
        const src = sansCommentaires(lire(f));
        assert.ok(!/9\+/.test(src), `${f} ne doit plus plafonner à neuf`);
        assert.match(src, /compteurPastille\(/, `${f} passe par le compteur commun`);
    }
});

test('la cloche porte DEUX pastilles : rouge pour les alertes, bleue pour l\'équipe', () => {
    const top = sansCommentaires(lire('components/Topbar.jsx'));
    assert.match(top, /\{alertes > 0 && <span className="notif-dot">\{compteurPastille\(alertes\)\}<\/span>\}/);
    assert.match(top, /\{activite > 0 && <span className="notif-dot ton-equipe">\{compteurPastille\(activite\)\}<\/span>\}/);
    /* Le libellé parlé dit les deux : un lecteur d'écran ne voit pas les couleurs. */
    assert.match(top, /alerte\$\{alertes > 1 \? "s" : ""\} et \$\{activite\}/);

    /* LA MÊME DISPOSITION QUE LE BOUTON DES MÉMOS — rouge en haut à droite, bleu en bas à
       gauche. Deux nombres qui ne disent pas la même chose ne doivent pas se ressembler, et
       DEUX PASTILLES D'UN MÊME BOUTON NE DOIVENT PAS SE RECOUVRIR : ancrées par des bords
       opposés sur la même ligne, celle de gauche grandissait vers la droite et passait
       par-dessus la rouge dès trois chiffres — « 999+ » recouvrait « 999+ », mesuré au banc.
       La hauteur les sépare quelle que soit la largeur du nombre. */
    const css = lire('styles/app.css');
    assert.match(css, /\.notif-dot\.ton-equipe\{top:auto;bottom:-5px;right:auto;left:-5px;background:var\(--blue\)/);
    assert.match(css, /\.memo-dot-neuf\{position:absolute;bottom:-5px;left:-5px/,
        'le mémo suit la même règle');
    /* Un nombre à trois chiffres ne doit pas danser d'un sondage à l'autre. */
    assert.match(css, /\.notif-dot\{[^}]*font-variant-numeric:tabular-nums\}/);
});

test('les deux onglets de la page portent les mêmes couleurs', () => {
    const page = sansCommentaires(lire('pages/Notifications.jsx'));
    assert.match(page, /Alertes<Compte n=\{[^}]*\} ton="r" \/>/, 'les alertes en rouge');
    assert.match(page, /Activité de l'équipe<Compte n=\{[^}]*\} ton="b" \/>/, 'l\'activité en bleu');
    /* C'ÉTAIT « (3) » EN TEXTE GRIS sur les deux onglets : rien ne distinguait ce qui appelle un
       geste de ce qui informe. */
    assert.ok(!/\` \(\$\{n\}\)\`/.test(page), 'plus de compte en texte entre parenthèses');
    /* LE NOMBRE VIENT DU SERVEUR, avec repli sur la liste : elles sont coupées, le compte non. */
    assert.match(page, /rows\?\.comptes\?\.alertes \?\? nonLues\(rows\?\.alertes\)/);
    assert.match(page, /comptes: r\.non_lues \|\| null/);
});
