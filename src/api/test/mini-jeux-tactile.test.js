/**
 * LES MINI-JEUX SE JOUENT AU DOIGT — les cibles doivent faire 44 px.
 *
 * MESURÉ SUR TÉLÉPHONE (375 px) avant d'écrire ce test :
 *  · « La commande piège » — les trois réponses (Oui / Non / À vérifier) faisaient 94 × 37,5 px ;
 *  · « Le Constructeur » — les neuf étapes et leurs neuf emplacements, 38 et 40 px.
 *
 * CE SONT LES COMMANDES PRINCIPALES DE CES JEUX, pas des boutons de réglage. La commande piège
 * est CHRONOMÉTRÉE et coûte un cœur par erreur ; le Constructeur coûte un cœur par tentative
 * imparfaite. Une cible trop petite y produit une faute qui n'est pas une faute de connaissance —
 * le jeu sanctionne alors la précision du doigt, pas le savoir, ce qui est exactement l'inverse
 * de ce qu'il mesure.
 *
 * LE RÉTRÉCISSEMENT ÉTAIT DÉLIBÉRÉ, et c'est pour cela que ce test existe : le commentaire du
 * media query explique qu'on serre pour que tout tienne sans défiler. L'intention est bonne, mais
 * elle se repaie en cibles. Mesuré après correction : les trois réponses tiennent toujours sur
 * une ligne et la carte reste entièrement visible.
 *
 * CE QUI N'EST PAS COUVERT ICI : `.btn` et le `×` des modales font 38 et 32 px. Ce sont les
 * classes GLOBALES de l'application — les relever toucherait tous les écrans, ce qui est une
 * autre décision que celle-ci.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');
const regle = (selecteur) => {
    const m = new RegExp(`\\${selecteur}\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `règle ${selecteur} introuvable`);
    return m[1];
};

test('les trois réponses de « La commande piège » gardent 44 px sur téléphone', () => {
    /* LA RÈGLE QUI COMPTE EST CELLE QUI RÉTRÉCIT — celle du cas général était déjà à 44 px.
       On la reconnaît À SON CONTENU (`padding:9px 4px`), et non à sa position : deux tentatives
       s'y sont cassées avant. Découper le bloc du media query tombait sur la fermeture d'une
       règle imbriquée ; le repérer par index échouait parce que la feuille contient PLUSIEURS
       `@media(max-width:640px)` et que le premier est très en amont. Le contenu, lui, ne se
       trouve qu'à un endroit. */
    const serree = /\.cp-rep\{[^}]*padding:9px 4px[^}]*\}/.exec(css);
    assert.ok(serree, 'la règle qui resserre les réponses sur téléphone a disparu');
    assert.match(serree[0], /min-height:44px/,
        'Les réponses ne doivent pas retomber sous 44 px en se resserrant.');
});

test('les étapes du Constructeur et leurs emplacements font 44 px', () => {
    assert.match(regle('.cg-chip'), /min-height:44px/, 'Les neuf étapes sont la manipulation du jeu.');
    assert.match(regle('.cg-slot'), /min-height:44px/, 'On tape aussi sur un emplacement, pour retirer une étape.');
    /* `inline-flex` + centrage : sans eux, un plancher de hauteur laisse le texte collé en haut. */
    assert.match(regle('.cg-chip'), /display:inline-flex[^}]*align-items:center/,
        'Le texte doit rester centré dans la pastille agrandie.');
});

test('l\'arcade est une grille en auto-FILL, pas en auto-fit', () => {
    /* En flex-wrap, la cinquième tuile se retrouvait seule sur sa ligne et son `flex-grow`
       l'étirait sur toute la largeur : « Chrono Rush », le seul jeu injouable, faisait 826 px
       quand chacun des quatre jouables en faisait 199.
       `auto-fit` REPLIE les colonnes vides et l'orpheline se réétirerait exactement pareil.
       Seul `auto-fill` la laisse à la largeur d'une colonne. La distinction est tout l'objet
       de la correction — d'où ce test, qui la nomme. */
    assert.match(regle('.pq-minis'), /grid-template-columns:repeat\(auto-fill,minmax\(160px,1fr\)\)/,
        'auto-fill, et un plancher de 160px pour tenir à deux par ligne sur téléphone.');
    assert.doesNotMatch(regle('.pq-mini'), /flex:\s*1\s+1/,
        'Un flex-grow sur la tuile rétablirait l\'étirement de l\'orpheline.');
});
