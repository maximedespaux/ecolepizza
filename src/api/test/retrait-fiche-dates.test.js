/**
 * Retirer une fiche du fil, et lire une date sans la déchiffrer.
 *
 * RETIRER N'EST PAS SUPPRIMER, et c'est tout l'objet de la route séparée. La modération pouvait
 * retirer un COMMENTAIRE mais pas la fiche qui le portait : il ne restait qu'à supprimer la
 * fiche entière — ce que `deleteRecipe` refuse d'ailleurs à quiconque n'en est pas l'auteur.
 *
 * Or une fiche partagée appartient AUSSI à son auteur : elle vit dans ses empâtements, ses
 * garnitures, ses réalisations, et c'est souvent le travail d'une session. La détruire parce que
 * sa publication dérange punit la personne pour le geste, et sans recours. `unshareRecipe` la
 * repasse en PRIVÉE : elle quitte le fil, l'auteur la garde, et cela se défait.
 *
 * La route est SÉPARÉE de `updateRecipe` — un modérateur n'a rien à faire dans le contenu d'une
 * fiche qui n'est pas la sienne. Il peut la retirer du fil, un point.
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

test('retirer une fiche la DÉPUBLIE, sans jamais la détruire', () => {
    assert.match(srcRecipe, /UPDATE recipe SET visibility = \? WHERE id = \?', \['PRIVATE'/,
        'la fiche doit repasser en privee, pas etre supprimee');
    /* Le corps est ISOLÉ avant d'être inspecté. Cherché dans tout le fichier, un
       `[\s\S]*?DELETE FROM recipe` partant de `unshareRecipe` finissait toujours par tomber sur
       le `DELETE FROM recipe_like` d'une AUTRE fonction, cent lignes plus bas — l'assertion
       échouait quoi qu'on écrive, et n'aurait donc rien gelé du tout. */
    const corps = /const unshareRecipe = async \(req, res\) => \{[\s\S]*?\n\};/.exec(srcRecipe);
    assert.ok(corps, 'unshareRecipe introuvable');
    assert.doesNotMatch(corps[0], /DELETE FROM/,
        'aucun DELETE dans le retrait — l\'auteur garde son travail');
    assert.match(srcRoutes, /router\.post\('\/:id\/retirer', authenticateToken, unshareRecipe\)/,
        'route dediee attendue');
    // Supprimer pour de bon reste à l'auteur SEUL : la modération n'y touche pas.
    assert.match(srcRecipe, /if \(cur\.author_user_id !== req\.user\.id\) return res\.status\(403\)/,
        'deleteRecipe doit rester reserve a l\'auteur');
});

test('le retrait est tracé, et refusé à qui n\'y a pas droit', () => {
    assert.match(srcRecipe, /if \(cur\.author_user_id !== req\.user\.id && !await peutModerer\(req\.user\)\)/,
        'l\'auteur ou la moderation, personne d\'autre');
    // Le WHERE porte aussi sur l'organisme : on ne retire pas la fiche d'une autre école.
    assert.match(srcRecipe, /FROM recipe WHERE id = \? AND organization_id = \?/,
        'le retrait doit etre cadre sur l\'organisme');
    assert.match(srcRecipe, /logAudit\(req, 'recipe\.unshare', 'Recipe', req\.params\.id\)/,
        'retirer la publication de quelqu\'un doit laisser une trace');
});

test('le bouton n\'apparaît qu\'à la modération, et jamais sur sa propre fiche', () => {
    // Sur la sienne, « Retirer du fil » ferait doublon avec le partage, réglé dans ses fiches.
    assert.match(srcPage, /\{detail\.can_moderate && !detail\.mine && \(/,
        'bouton reserve a la moderation, hors de ses propres fiches');
    assert.match(srcPage, /await unshareRecipe\(d\.id\)/, 'il doit appeler la route de retrait');
    // La confirmation doit DIRE ce qui se passe : « retirer » et « supprimer » ne se confondent pas.
    assert.match(srcPage, /Retirer «[^»]*» de la communauté \?/, 'confirmation attendue');
    assert.match(srcPage, /la garde dans ses propres fiches/, 'elle doit dire que l\'auteur garde sa fiche');
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
    assert.match(srcFormat, /if \(!v\) return "";/, 'une date vide rend une chaine vide');
    assert.match(srcFormat, /if \(!m\) return String\(v\);/, 'une forme inconnue passe telle quelle');
    assert.match(srcFormat, /\(\?:\[T \]/, 'ISO avec `T` ou espace, les deux formes circulent');
    assert.match(srcFormat, /\+ \(h \? ` \$\{h\}:\$\{mi\}` : ""\)/, 'l\'heure reste facultative');
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
