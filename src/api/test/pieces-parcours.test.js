/**
 * Deux défauts trouvés en ajoutant une variante « OU », et le plafond de fichiers d'une pièce.
 *
 * ── LE RENOMMAGE NE SUIVAIT PAS DANS LES ÉQUIVALENCES ──
 * Renommer le slug d'un modèle cascade sur sept cibles : `program_step`, les factures, les
 * documents produits, les points de rupture, trois colonnes JSON de `training_program`. Il en
 * manquait une, et c'était la plus punitive : `document_equivalence.members`, un tableau JSON de
 * slugs comme les autres.
 *
 * Oublié là, le renommage laissait le VIEUX slug dans le groupe « OU ». Or la validation exige
 * que tous les membres existent : le groupe devenait IMPOSSIBLE À MODIFIER par l'écran, avec un
 * message citant un identifiant que personne n'avait tapé. Constaté sur le parcours RS7404 après
 * `devis-particulier-copie` → `devis-professionnel` : plus aucune variante ajoutable.
 *
 * DEUX CORRECTIONS, pas une. La cascade suit désormais dans les équivalences — c'est la
 * prévention. Et un membre mort ne bloque plus : il est retiré, et signalé — c'est la réparation
 * des groupes déjà cassés, qu'aucune cascade ne rattrapera.
 *
 * ── LE REFUS QUI RESTAIT, LUI, EST LÉGITIME ──
 * Un « OU » ne sert qu'à CHOISIR : si deux variantes s'appliquent au même cas, rien ne permet de
 * trancher au moment de produire le document. Le message nomme les deux documents et la condition
 * qu'ils partagent, et il s'affiche DANS le panneau — le clic a lieu tout en bas d'une modale qui
 * défile, un message posé en tête passait inaperçu et l'on concluait que « rien ne se passe ».
 * Le panneau reste ouvert sur refus, sans quoi la surface d'affichage disparaît avec lui.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcEq = fs.readFileSync(path.join(API, 'lib/equivalence.js'), 'utf8');
const srcTpl = fs.readFileSync(path.join(API, 'controllers/template.controller.js'), 'utf8');
const srcPiece = fs.readFileSync(path.join(API, 'controllers/piece.controller.js'), 'utf8');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Formations.jsx'), 'utf8');

test('renommer un slug suit AUSSI dans les équivalences', () => {
    assert.match(srcTpl, /UPDATE document_equivalence SET members = REPLACE\(members, \?, \?\)/,
        'la cible manquante de la cascade');
    // Remplacement borné par les guillemets, comme les autres colonnes JSON : sans eux,
    // « facture » toucherait « facture-copie ».
    assert.match(srcTpl, /\[`"\$\{oldSlug\}"`, `"\$\{newSlug\}"`, orgId, `%"\$\{oldSlug\}"%`\]\);/,
        'le jeton exact, jamais un prefixe');
});

test('un membre qui n\'existe plus ne bloque plus le groupe', () => {
    /* C'est la réparation : aucune cascade ne rattrapera les groupes déjà cassés, et refuser
       éternellement laissait l'utilisateur sans issue par l'écran. */
    assert.match(srcEq, /const retires = brut\.filter\(\(slug\) => !stepsBySlug\.get\(slug\)\);/,
        'les membres morts sont retires');
    assert.doesNotMatch(srcEq, /return \{ ok: false, error: `Document inconnu/,
        'et ne provoquent plus de refus');
    // Retiré, mais DIT : supprimer en silence serait pire que refuser.
    assert.match(srcEq, /return \{ ok: true, value: list, retires \}/, 'le retrait doit remonter');
});

test('deux conditions identiques restent refusées, et on dit lesquelles', () => {
    assert.match(srcEq, /s'appliquent au même cas \(\$\{conditionEnClair\(s\.applies_when\)\}\)/,
        'le message nomme la condition partagee');
    assert.match(srcEq, /Donnez-leur des conditions différentes dans Modèles de documents/,
        'et dit quoi faire');
    /* Les conditions PERSO arrivent dans un tableau : les rendre en JSON donnait
       « conditions = ["financeur-professionnel"] » au milieu d'une phrase française. */
    assert.match(srcEq, /if \(Array\.isArray\(a\.conditions\) && a\.conditions\.length\)/,
        'les conditions perso se lisent en clair');
});

test('le refus s\'affiche là où le clic a eu lieu', () => {
    assert.match(srcPage, /\{refusOu && \(/, 'le motif doit vivre dans le panneau');
    /* Le panneau se fermait d'office : un refus faisait donc disparaître la surface où le motif
       devait s'afficher. On ne ferme que si l'ajout a abouti. */
    assert.match(srcPage, /const ok = await onAddOu\(jalon\.steps\.map\(\(x\) => x\.slug\), s\.slug\);\s*\n\s*if \(ok\) \{/,
        'fermeture conditionnee au succes');
    assert.match(srcPage, /return true;/, 'addOuVariant doit dire si elle a reussi');
});

test('le nombre de fichiers d\'une pièce est un PLAFOND, et il est appliqué', () => {
    /* Une pièce d'identité tient en UN fichier — recto et verso sur la même image ; un
       justificatif peut en demander six. Sans plafond appliqué, le champ n'était qu'un texte. */
    assert.match(srcPiece, /if \(dejaN\.n >= max\) \{/, 'le plafond doit bloquer, pas seulement informer');
    assert.match(srcPiece, /accepte \$\{max\} fichier\$\{max > 1 \? 's' : ''\} au maximum/,
        'le refus nomme le nombre attendu');
    assert.match(srcPiece, /Retirez-en un avant d\\'en ajouter un autre/,
        'et le geste de sortie, que personne ne trouve seul');
});
