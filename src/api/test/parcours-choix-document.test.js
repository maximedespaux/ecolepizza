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
    assert.match(srcPage, /\{\(adding \|\| ouFor\) && \(\(\) => \{/, 'un seul panneau, pour les deux gestes');
});

test('ouvrir un panneau referme l\'autre', () => {
    // Deux panneaux ouverts en même temps donneraient deux listes concurrentes sous le flux.
    /* On vérifie les EFFETS, pas leur ordre exact : la liste s'est allongée d'un
       `onEffacerRefus()` sans que la règle change. Un contrat trop littéral se casse à chaque
       ajout et finit par être « corrigé » en le supprimant. */
    const ou = /onClick=\{\(\) => \{([^}]*)setOuFor\(ouFor === g\.steps\[0\]\.slug/.exec(srcPage);
    assert.ok(ou && /setAdding\(false\)/.test(ou[1]), '« OU » doit fermer « Ajouter une etape »');
    const ajout = /onClick=\{\(\) => \{([^}]*)setAdding\(\(a\) => !a\)/.exec(srcPage);
    assert.ok(ajout && /setOuFor\(null\)/.test(ajout[1]), 'et reciproquement');
    // Le titre dit lequel des deux est en cours, sinon le panneau est ambigu.
    assert.match(srcPage, /jalon \? <>Variante « OU » de <b[^>]*>\{jalon\.steps\[0\]\.label\}<\/b><\/> : "Ajouter une étape"/,
        'le titre doit nommer le geste, et le jalon concerne');
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

test('les variantes « OU » respectent la nature de l\'étape', () => {
    /* Un jalon-DOCUMENT ne se voit proposer que des documents en variante (jamais QCM, émargement
       ni pièce : leur « OU » n'a pas la même mécanique). */
    assert.match(srcPage, /!s\.quiz_id && !s\.company_level && s\.doc_type !== "EMARGEMENT"\s*\n\s*&& s\.doc_type !== "PIECE"/,
        'un jalon-document exclut QCM / émargement / pièce de ses variantes');
    /* Un jalon-PIÈCE, lui, ne propose que d'AUTRES pièces : « identité OU justificatif » se
       choisit par condition du dossier, pas en mélangeant pièce et document. C'est la capacité
       nouvelle — l'ancienne exclusion pure et simple des pièces du « OU » est levée. */
    assert.match(srcPage, /jalonPiece\s*\n?\s*\? steps\.filter\(\(s\) => s\.doc_type === "PIECE" && !jalon\.steps\.some/,
        'un jalon-pièce ne propose que des pièces en variante');
    // La section « Pièces » s'affiche donc en ajout libre OU quand on cherche une variante de pièce.
    assert.match(srcPage, /\{\(jalonPiece \|\| !jalon\) && \(/,
        'les pièces sont proposées comme variante d\'un jalon-pièce (plus seulement en ajout libre)');
    /* TROIS natures d'étape dans le sélecteur : ranger une pièce parmi les « Documents » tromperait
       — ceux-là, l'école les produit ; celle-ci, le stagiaire l'envoie. */
    assert.match(srcPage, /const isPiece = \(s\) => s\.doc_type === "PIECE";/, 'la troisieme nature');
    assert.match(srcPage, /Pièces à fournir par le stagiaire\{pieces\.length/, 'son propre groupe, nomme sans ambiguite');
});
