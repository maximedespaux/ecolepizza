/**
 * Supprimer une fiche depuis la Communauté (modération), et lire une date sans la déchiffrer.
 *
 * LA MODÉRATION SUPPRIME (décidé le 2026-10-14). Avant, « retirer du fil » repassait la fiche en
 * privée et l'auteur la gardait. Mais toute fiche est désormais partagée d'office (plus de choix
 * côté auteur) : garder une copie privée n'avait plus de sens. Un membre qui MODÈRE SUPPRIME donc
 * la fiche — elle part de la communauté ET des fiches de son auteur. `deleteRecipe` l'autorise à
 * l'AUTEUR ou à la MODÉRATION (peutModerer), bornée à l'organisme, et la trace (`recipe.delete`).
 * L'ancien `unshareRecipe` (dépublier → privée) a été retiré, route comprise.
 *
 * LES DATES. Le fil affichait « 2026-08-01 » : format ISO, et sans heure. Trois questions du même
 * jour sortaient toutes avec la même date — on ne savait plus laquelle venait d'arriver.
 *
 * Le piège de ce changement : le fil TRIE sur cette valeur en comparant des CHAÎNES
 * (`localeCompare`). Basculer le serveur en `jj-mm-aaaa` aurait trié sur le JOUR d'abord — le 31
 * janvier devant le 1er décembre — sans rien casser de visible au build. L'ISO reste donc sur le
 * fil de transport, et c'est l'ÉCRAN qui met en français.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcRecipe = fs.readFileSync(path.join(API, 'controllers/recipe.controller.js'), 'utf8');
const srcRoutes = fs.readFileSync(path.join(API, 'routes/recipe.routes.js'), 'utf8');
const srcComm = fs.readFileSync(path.join(API, 'controllers/community.controller.js'), 'utf8');
const srcFormat = fs.readFileSync(path.join(APP, 'ui/lib/format.js'), 'utf8');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Communaute.jsx'), 'utf8');
const srcPost = fs.readFileSync(path.join(APP, 'ui/components/QuestionPost.jsx'), 'utf8');

/* Le corps de deleteRecipe, ISOLÉ avant inspection : cherché dans tout le fichier, un
   `DELETE FROM recipe` finirait sur celui d'une autre fonction. */
function corpsDelete() {
    const m = /const deleteRecipe = async \(req, res\) => \{[\s\S]*?\n\};/.exec(srcRecipe);
    assert.ok(m, 'deleteRecipe introuvable');
    return m[0];
}

test('SUPPRIMER une fiche la DÉTRUIT — l\'ancien « retirer du fil » n\'existe plus', () => {
    const corps = corpsDelete();
    assert.match(corps, /DELETE FROM recipe WHERE id = \? AND organization_id = \?/,
        'la fiche est SUPPRIMÉE, et cadrée sur l\'organisme');
    // Plus de dépublier → privée : ni la fonction, ni la route, ni l'appel écran.
    assert.doesNotMatch(srcRecipe, /const unshareRecipe/, 'le dépublier (→ privée) a été retiré du contrôleur');
    assert.doesNotMatch(srcRoutes, /\/:id\/retirer/, 'et sa route aussi');
});

test('la suppression de modération est TRACÉE, bornée à l\'organisme, et refusée aux autres', () => {
    const corps = corpsDelete();
    // Auteur OU modération dans SON organisme — personne d'autre (403).
    assert.match(corps, /cur\.organization_id === orgId && await peutModerer\(req\.user\)/,
        'la modération ne vaut que dans son organisme');
    assert.match(corps, /return res\.status\(403\)/, 'tout autre que l\'auteur ou la modération : refusé');
    assert.match(corps, /logAudit\(req, 'recipe\.delete', 'Recipe', req\.params\.id, \{ libelle: cur\.name \}\)/,
        'supprimer la fiche d\'un autre laisse une trace nommée');
    // Le nom est lu AVANT la suppression (migration 186 : une fiche effacée ne se nomme plus).
    const sel = corps.search(/SELECT author_user_id, organization_id, name FROM recipe/);
    assert.ok(sel > -1 && sel < corps.indexOf('DELETE FROM recipe'), 'le nom est lu avant le DELETE');
});

test('le bouton de suppression n\'apparaît qu\'à la modération, jamais sur sa propre fiche', () => {
    // Sur la sienne, on supprime depuis « Mes fiches » : ici, c'est la modération sur celle d'un autre.
    assert.match(srcPage, /\{detail\.can_moderate && !detail\.mine && \(/,
        'bouton reserve a la moderation, hors de ses propres fiches');
    assert.match(srcPage, /await deleteRecipe\(d\.id\)/, 'il supprime bien la fiche');
    // La confirmation DIT que c'est définitif et que l'auteur perd sa fiche.
    assert.match(srcPage, /Supprimer «[^»]*» \?/, 'confirmation attendue');
    assert.match(srcPage, /supprimée des fiches de/, 'elle doit dire que l\'auteur perd sa fiche');
    assert.match(srcPage, /définitive/, 'et que c\'est définitif');
});

test('les dates partent en ISO et s\'affichent en français', () => {
    /* Le format ISO est ce qui rend le fil triable. `dateHeure` ne fait que l'habiller — s'il
       venait à formater côté serveur, l'ordre du fil basculerait sur le jour sans un mot. */
    assert.match(srcComm, /DATE_FORMAT\(p\.created_at, '%Y-%m-%d %H:%i'\)/, 'heure attendue sur le fil');
    assert.match(srcRecipe, /DATE_FORMAT\(updated_at, '%Y-%m-%d %H:%i'\)/, 'heure attendue sur les fiches');
    assert.doesNotMatch(srcComm, /DATE_FORMAT\([^)]*'%d-%m-%Y/, 'le serveur ne doit PAS formater en francais');
    assert.doesNotMatch(srcRecipe, /DATE_FORMAT\([^)]*'%d-%m-%Y/, 'idem');
    assert.match(srcPage, /String\(b\._date \|\| ""\)\.localeCompare\(String\(a\._date \|\| ""\)\)/,
        'le tri compare bien des chaines — d\'ou l\'ISO');
    assert.match(srcFormat, /export function dateHeure\(v\)/, 'un seul formateur, partage');
});

test('toutes les dates du fil passent par le formateur', () => {
    // Une seule oubliée et le fil mélange deux écritures de date, ce qui se lit très mal.
    for (const [nom, src] of [['Communaute.jsx', srcPage], ['QuestionPost.jsx', srcPost]]) {
        assert.match(src, /dateHeure\(date\)/, `en-tete d'auteur dans ${nom}`);
    }
    assert.match(srcPost, /dateHeure\(post\.created_at\)/, 'bandeau des annonces');
    assert.match(srcPost, /dateHeure\(a\.created_at\)/, 'reponses a une question');
    assert.match(srcPage, /dateHeure\(c\.created_at\)/, 'commentaires d\'une fiche');
});

test('le formateur de date tient debout sur les entrées douteuses', () => {
    /* Chargé ici comme du texte : `lib/format.js` est un module ES, que ces tests (CommonJS)
       ne peuvent pas importer. On vérifie donc le contrat écrit — vide en entrée, vide en
       sortie : une date manquante ne doit pas afficher « Invalid Date » au milieu d'un fil. */
    /* LE DÉCOUPAGE A ÉTÉ EXTRAIT dans `morceaux()`, partagé par `dateFr` (date seule) et
       `dateHeure` (date + heure) — il s'écrivait deux fois sinon. Le contrat vérifié ici est
       le même, à la forme près. */
    assert.match(srcFormat, /if \(!v\) return null;/, 'une date vide ne donne aucun morceau…');
    assert.match(srcFormat, /return p \? .+ : \(v \? String\(v\) : ""\);/, '…donc une chaine vide en sortie');
    assert.match(srcFormat, /if \(!p\) return v \? String\(v\) : "";/, 'une forme inconnue passe telle quelle');
    assert.match(srcFormat, /\(\?:\[T \]/, 'ISO avec `T` ou espace, les deux formes circulent');
    assert.match(srcFormat, /\+ \(p\.h \? ` \$\{p\.h\}:\$\{p\.mi\}` : ""\)/, 'l\'heure reste facultative');
});

test('les hashtags d\'une annonce se voient DANS la phrase', () => {
    /* Une annonce se termine souvent par ce qu'elle concerne — « report de la session #niveau2 ».
     * En texte brut, ce mot se noie alors que c'est lui qu'on cherche du regard en parcourant le
     * bandeau. Les fiches ont leurs tags en pastilles depuis toujours ; l'annonce était le seul
     * endroit où un `#` restait de la ponctuation.
     *
     * Mis en valeur SUR PLACE et non extraits au-dessous : « la session est décalée » et
     * « #niveau2 » ne se lisent bien qu'ensemble. */
    assert.match(srcPost, /function CorpsAvecTags\(\{ texte \}\)/, 'le corps doit passer par le decoupage');
    assert.match(srcPost, /<span className="annonce-x"><CorpsAvecTags texte=\{post\.body\} \/><\/span>/, 'bandeau');
    assert.match(srcPost, /p\.kind === "ANNONCE" \? <CorpsAvecTags texte=\{p\.body\} \/> : p\.body/,
        'le detail montre le MEME texte : un tag qui ressort ici et pas la ferait croire a deux contenus');

    /* LE PIÈGE, gelé : `test()` sur une regex `/g` est À ÉTAT. Son `lastIndex` persiste d'un
     * appel au suivant, si bien qu'un même morceau ressort vrai puis faux une fois sur deux —
     * un tag sur deux serait passé en texte brut, au hasard de l'ordre de rendu. D'où une
     * SECONDE expression, ancrée et sans `g`, pour décider morceau par morceau. */
    assert.match(srcPost, /const EST_TAG = \/\^#\[\\p\{L\}\\p\{N\}_-\]\+\$\/u;/,
        'l\'expression de decision doit etre ancree et SANS `g`');
    assert.match(srcPost, /EST_TAG\.test\(bout\)/, 'c\'est elle qui decide, pas la globale');
    assert.doesNotMatch(srcPost, /TAG_ANNONCE\.test\(/, 'jamais `test\\(\\)` sur la regex globale');
});

test('le détail d\'une publication nomme son auteur comme la liste', () => {
    /* `p.*` rend la colonne `author_name` FIGÉE à la publication — souvent l'e-mail, pour un
     * compte créé sans prénom ni nom. La carte du fil affichait « Admin École Pizza » et son
     * détail « admin@ecole-pizza.com » : deux identités pour une personne, à un clic d'écart.
     * Même famille que l'avatar manquant — le détail était plus pauvre que la liste. */
    const detail = /const getPost = async \(req, res\) => \{[\s\S]*?\n\};/.exec(srcComm);
    assert.ok(detail, 'getPost introuvable');
    assert.match(detail[0], /COALESCE\(NULLIF\(TRIM\(CONCAT\(COALESCE\(u\.first_name/,
        'le nom doit se recalculer, pas sortir de la colonne figee');
    assert.match(detail[0], /LEFT JOIN user u ON u\.id = p\.author_user_id/, 'la jointure qui le permet');
});
