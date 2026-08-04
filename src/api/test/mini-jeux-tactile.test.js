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

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   LE VIVIER DU CONSTRUCTEUR COLLE EN BAS SUR TÉLÉPHONE.
   ═════════════════════════════════════════════════════════════════════════════════════════════

   MESURÉ AVANT : 927 px de contenu pour 589 px visibles, soit 1,57 écran. Les neuf emplacements
   prenaient toute la hauteur et les étapes à placer commençaient SOUS la ligne de flottaison —
   on ne voyait jamais ensemble ce qu'on prend et où on le pose. Un aller-retour par étape, neuf
   fois, dans un jeu qui coûte un cœur par tentative imparfaite.

   ET CE SONT BIEN LES PASTILLES QUI COMPTENT : `place(i)` empile dans l'emplacement libre
   SUIVANT — on ne choisit pas la case, on choisit l'étape. Les emplacements sont un retour
   visuel. C'est ce qui justifie de donner la place du bas aux pastilles plutôt que l'inverse.

   MESURÉ APRÈS : trois emplacements ET six pastilles visibles ensemble au départ ; après trois
   placements la barre tombe de 325 à 247 px et cinq emplacements se voient. Elle se libère
   d'elle-même à mesure qu'on joue.
*/
const cgReserve = () => {
    const m = /@media \(max-width:640px\)\{\s*\.cg-reserve\{([^}]*)\}/.exec(css);
    assert.ok(m, 'la règle téléphone de .cg-reserve est introuvable');
    return m[1];
};

test('le vivier colle dans le conteneur QUI DÉFILE', () => {
    const r = cgReserve();
    assert.match(r, /position:sticky/, 'Sans sticky, les pastilles repartent au défilement.');
    assert.match(r, /bottom:0/, 'Collé en bas : c\'est là que le pouce arrive.');
    /* `.mbody` est le conteneur qui défile (927 px de contenu pour 589 visibles). Coller au
       `.modal` ne bougerait rien : ce n'est pas lui qui défile. Le bloc doit donc rester
       ENFANT de `.mbody` — d'où cette vérification côté composant, pas seulement côté CSS. */
    const jsx = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui',
        'components', 'ConstructorGame.jsx'), 'utf8');
    const corps = /<div className="mbody">([\s\S]*?)\n        <\/div>/.exec(jsx);
    assert.ok(corps, 'le corps de la modale doit rester lisible');
    assert.match(corps[1], /className="cg-reserve"/,
        'Le vivier doit rester dans .mbody, seul élément qui défile.');
});

test('le vivier ne mange pas l\'écran, et ne laisse rien transparaître', () => {
    const r = cgReserve();
    /* Les neuf pastilles font 356 px : sans plafond, la barre prendrait les deux tiers de
       l'écran et l'on aurait remplacé un défilement par un autre. */
    assert.match(r, /max-height:40vh/, 'La barre doit rester plafonnée.');
    assert.match(r, /overflow-y:auto/, 'Et défiler elle-même quand les neuf n\'y tiennent pas.');
    /* Fond OPAQUE : sinon les emplacements défilent en transparence sous les pastilles et l'on
       ne sait plus lesquelles restent à placer. */
    assert.match(r, /background:var\(--panel/, 'Le fond de la barre doit être opaque.');
});

test('le libellé colle AVEC les pastilles, pas séparément', () => {
    /* Ils étaient deux frères : coller le second aurait laissé le premier partir au
       défilement, et la barre serait apparue sans son titre. */
    const jsx = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui',
        'components', 'ConstructorGame.jsx'), 'utf8');
    assert.match(jsx, /className="cg-reserve">[\s\S]{0,200}?cg-reserve-t[\s\S]{0,200}?cg-pool/,
        'Le libellé et les pastilles doivent vivre dans le même bloc collant.');
});
