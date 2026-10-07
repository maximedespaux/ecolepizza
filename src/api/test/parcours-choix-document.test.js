/**
 * Choisir un document dans l'éditeur de parcours : un seul panneau, et rien de rogné.
 *
 * LE DÉFAUT GELÉ ICI, mesuré dans le navigateur. Le bouton « ＋ OU » ouvrait un menu flottant
 * (`cat-pop`, `position:absolute`) rendu DANS `.parcours-flow` — un conteneur en `overflow:auto`,
 * puisque le parcours défile horizontalement. Le menu s'arrêtait donc pile au bord de ce
 * conteneur : relevé à 708 px pour le menu comme pour le flux, c'est-à-dire ROGNÉ. Et comme il
 * vivait dans le flux, faire défiler le parcours l'emportait avec lui.
 *
 * Dix-huit documents y tenaient dans une boîte de 220 px de haut, sans recherche, avec le slug
 * technique tronqué à côté du libellé (« ATTESTATION_AS… »).
 *
 * LA CORRECTION N'EST PAS UN PORTAIL mais une SUPPRESSION : « ＋ OU » ouvre désormais le MÊME
 * panneau que « Ajouter une étape », posé sous le flux, sur toute la largeur. Les deux gestes
 * choisissent la même chose dans la même liste ; deux surfaces différentes obligeaient à
 * apprendre deux fois. Un seul panneau à la fois — ouvrir l'un referme l'autre.
 *
 * Ce que la skill UI/UX a apporté ici : la recherche dès qu'une liste dépasse une poignée
 * d'entrées, et l'interdiction des culs-de-sac — « aucun résultat » doit proposer une sortie.
 * Sa proposition de design system (palette verte, police Inter, motif « hero search ») a été
 * écartée : elle vise un produit neuf, la demande était la cohérence avec l'existant.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'app');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Formations.jsx'), 'utf8');
const srcCss = fs.readFileSync(path.join(APP, 'ui/styles/app.css'), 'utf8');

test('plus de menu flottant piégé dans un conteneur qui défile', () => {
    assert.doesNotMatch(srcPage, /className="cat-pop"/,
        'le menu flottant etait rogne par `.parcours-flow` (overflow:auto) — mesure a 708px');
    // Et le conteneur en question défile toujours : c'est bien lui le piège, pas une régression.
    assert.match(srcCss, /\.parcours-flow\{[^}]*overflow-x:auto/, 'le flux defile horizontalement, par nature');
    assert.match(srcPage, /\{adding && \(\(\) => \{/, 'le panneau d\'ajout d\'une étape, sous le flux');
});

test('le « + OU » a QUITTÉ le parcours : les équivalences se gèrent dans Modèles → Équivalences', () => {
    /* 2026-10-08 : une équivalence est org-wide ; la créer/étendre depuis le parcours d'UNE formation
       surprenait par sa portée. L'écriture a été retirée d'ici (addOuVariant/removeOuVariant, appels
       create/update/deleteEquivalence) ; le parcours ne fait plus qu'AFFICHER les jalons groupés. */
    assert.doesNotMatch(srcPage, /＋ OU|pf-or-add|onAddOu|addOuVariant|removeOuVariant|onRetirerOu/,
        'plus aucun geste d\'écriture « OU » dans le parcours');
    assert.doesNotMatch(srcPage, /createEquivalence|updateEquivalence|deleteEquivalence/,
        'le parcours n\'écrit plus les équivalences (lecture seule via getEquivalences)');
    // L'AFFICHAGE groupé reste : un jalon « OU » empile ses variantes (groupMilestones + eqMap).
    assert.match(srcPage, /function groupMilestones\(steps, eqMap\)/, 'les jalons se groupent toujours pour l\'affichage');
    assert.match(srcPage, /\{j > 0 && <div className="pf-or">OU<\/div>\}/, 'les variantes restent empilées « OU »');
});

test('une liste longue se cherche, une liste courte non', () => {
    /* Vingt-deux documents au référentiel : sans recherche on parcourt. Mais afficher un champ
       au-dessus de trois entrées est du bruit — d'où le seuil. */
    assert.match(srcPage, /\{pool\.length > 6 && \(/, 'la recherche n\'apparait que si elle sert');
    assert.match(srcPage, /<span className="gs-search"/, 'le meme champ que partout ailleurs');
    // Elle porte sur le libellé ET le type/slug : on cherche parfois « CONVENTION », pas le titre.
    assert.match(srcPage, /\[s\.label, s\.doc_type, s\.slug\]\.some/, 'libelle, type et slug');
});

test('« aucun résultat » n\'est jamais une impasse', () => {
    assert.match(srcPage, /Aucun document ne correspond à « \{chercheDoc\.trim\(\)\} »/,
        'le message doit redire CE QUI a ete cherche');
    assert.match(srcPage, /className="lien-nu" onClick=\{\(\) => setChercheDoc\(""\)\}>Tout afficher/,
        'et offrir une sortie en un clic');
    assert.match(srcCss, /\.lien-nu\{border:0;background:none/, 'ecrite comme un lien, pas comme une action principale');
});

test('le panneau d\'ajout sépare les natures d\'étape en groupes nommés', () => {
    /* QUATRE natures, quatre groupes : ranger une pièce parmi les « Documents » tromperait — ceux-là,
       l'école les produit ; la pièce, le stagiaire l'envoie ; la remise, l'école la transmet et le
       stagiaire en accuse réception. Chacune a son titre. (Le « OU » des pièces a été retiré le
       2026-09-09 : une pièce est une étape exigée ; cf. `groupes-pieces.test.js`.) */
    assert.match(srcPage, /const isPiece = \(s\) => s\.doc_type === "PIECE";/, 'la nature « pièce »');
    assert.match(srcPage, /const isRemise = \(s\) => s\.doc_type === "REMISE";/, 'la nature « remise »');
    assert.match(srcPage, /Documents\{docs\.length/, 'groupe Documents');
    assert.match(srcPage, /Pièces à fournir par le stagiaire\{pieces\.length/, 'groupe Pièces');
    assert.match(srcPage, /Documents remis au stagiaire\{remises\.length/, 'groupe Remises');
    assert.match(srcPage, /QCM\{quizzes\.length/, 'groupe QCM');
});
