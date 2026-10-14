/**
 * LES ALLERGÈNES D'UNE FICHE TECHNIQUE (migration 208, demandé le 2026-10-14).
 *
 * On coche les 14 allergènes réglementaires sur une fiche ; une RÉALISATION hérite en plus de ceux
 * des empâtements / préparations qu'elle importe (non retirables), et peut en ajouter. S'affiche
 * partout, impression comprise. Ce fichier gèle : la liste identique écran ⇄ serveur, la
 * normalisation (seuls des codes connus), et l'héritage depuis les composants.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const S = require('../lib/allergenes.js');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const frontSrc = fs.readFileSync(path.join(UI, 'lib', 'allergenes.js'), 'utf8');

/** Extrait la liste [cle, nom] d'un source (guillemets simples OU doubles). */
function extraire(src) {
    const bloc = /ALLERGENES\s*=\s*\[([\s\S]*?)\];/.exec(src);
    assert.ok(bloc, 'un tableau ALLERGENES doit être défini');
    const out = [];
    const re = /\{\s*cle:\s*["']([^"']+)["'],\s*nom:\s*["']([^"']+)["']\s*\}/g;
    let m;
    while ((m = re.exec(bloc[1]))) out.push([m[1], m[2]]);
    return out;
}

test('LES DEUX FICHIERS portent la MÊME liste (écran ⇄ serveur), et ce sont les 14', () => {
    const serveur = S.ALLERGENES.map((a) => [a.cle, a.nom]);
    assert.strictEqual(serveur.length, 14, 'les 14 allergènes du règlement INCO');
    // L'écran porte le référentiel ingrédient→allergène EN PLUS : on compare la SEULE liste ALLERGENES.
    assert.deepStrictEqual(extraire(frontSrc), serveur, 'l\'écran doit porter la même liste que le serveur');
    assert.deepStrictEqual(extraire(fs.readFileSync(path.join(__dirname, '..', 'lib', 'allergenes.js'), 'utf8')), serveur);
});

test('NORMALISER : ne garde que des codes connus, uniques, dans l\'ordre officiel', () => {
    assert.deepStrictEqual(S.normaliserAllergenes(['lait', 'gluten', 'lait', 'inconnu', 42]), ['gluten', 'lait'],
        'ordre réglementaire (gluten avant lait), doublons et intrus écartés');
    assert.deepStrictEqual(S.normaliserAllergenes(null), []);
    assert.deepStrictEqual(S.normaliserAllergenes('pas un tableau'), []);
});

test('PARSE : chaîne JSON, tableau, ou vide → tableau de codes valides', () => {
    assert.deepStrictEqual(S.parseAllergenes('["gluten","lait"]'), ['gluten', 'lait']);
    assert.deepStrictEqual(S.parseAllergenes(['oeufs', 'xxx']), ['oeufs']);
    assert.deepStrictEqual(S.parseAllergenes(null), []);
    assert.deepStrictEqual(S.parseAllergenes('{pas du json'), []);
});

test('HÉRITAGE : une réalisation prend les allergènes de ses composants, NON RETIRABLES', async () => {
    const { allergenesAffichees } = await import(pathToFileURL(path.join(UI, 'lib', 'allergenes.js')).href);
    const recette = {
        allergens: ['lait'], // propre (ajouté à la main) : la mozzarella
        ingredients: [
            { component_recipe_id: 'pate-1', component_allergens: '["gluten"]' }, // empâtement → gluten (chaîne JSON)
            { component_recipe_id: 'sauce-1', component_allergens: ['celeri'] },  // préparation → céleri (tableau)
            { label: 'Basilic frais' },                                          // produit simple : aucun composant
        ],
    };
    const al = allergenesAffichees(recette);
    assert.deepStrictEqual(al.herites, ['gluten', 'celeri'], 'hérités des composants, ordre officiel');
    assert.deepStrictEqual(al.propres, ['lait'], 'ses propres (cochés)');
    assert.deepStrictEqual(al.toutes, ['gluten', 'lait', 'celeri'], 'union dans l\'ordre réglementaire');
    // Le gluten est hérité : il est dans `toutes` SANS être dans `propres` → on ne peut pas le retirer.
    assert.ok(al.toutes.includes('gluten') && !al.propres.includes('gluten'), 'un hérité reste présent sans être « propre »');
    // Sans composant ni propre : rien.
    assert.deepStrictEqual(allergenesAffichees({ allergens: null, ingredients: [{ label: 'Farine' }] }).toutes, []);
});

/* ─── Les bouts de tuyau : stockage tolérant, propagation aux composants, affichage ────────────── */
test('le serveur stocke les allergènes À PART et TOLÈRE l\'absence de colonne (migration 208)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'recipe.controller.js'), 'utf8');
    // Colonne lue en tolérant (colonneOuNull), écrite à part en try/catch, propagée aux composants.
    assert.match(src, /colonneOuNull\(conn, 'recipe', 'allergens'\)/, 'lecture tolérante de la colonne');
    assert.match(src, /UPDATE recipe SET allergens = \? WHERE id = \?/, 'écriture à part');
    assert.match(src, /e\.code === 'ER_BAD_FIELD_ERROR'/, 'sans la colonne, l\'écriture échoue seule');
    assert.match(src, /i\.component_allergens = d\.allergens/, 'chaque ligne importée porte les allergènes de son composant');
    assert.match(src, /await ecrireAllergenes\(conn, id, req\.body \|\| \{\}\)/, 'la création les écrit');
    assert.match(src, /await ecrireAllergenes\(conn, req\.params\.id, req\.body \|\| \{\}\)/, 'la mise à jour aussi');
});

test('l\'écran les affiche partout : éditeur (boutons), Communauté, et impression', () => {
    const editeur = fs.readFileSync(path.join(UI, 'pages', 'FicheRecette.jsx'), 'utf8');
    assert.match(editeur, /BlocAllergenes/, 'les boutons d\'allergènes dans l\'éditeur');
    assert.match(editeur, /allergens: parseAllergenes\(d\.allergens\)/, 'chargés depuis la fiche');
    assert.match(editeur, /component_allergens: c\.allergens/, 'et hérités dès l\'import d\'un composant');
    const comm = fs.readFileSync(path.join(UI, 'pages', 'Communaute.jsx'), 'utf8');
    assert.match(comm, /allergenesAffichees\(detail\)/, 'affichés dans le détail de la Communauté');
    const print = fs.readFileSync(path.join(UI, 'components', 'FichePrint.jsx'), 'utf8');
    assert.match(print, /allergenesAffichees\(fiche\)/, 'et sur la version imprimable');
});
