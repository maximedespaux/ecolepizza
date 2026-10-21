/**
 * LE TITRE D'UN DOCUMENT DE GROUPE NE PORTE PLUS L'OPCO (demandé le 2026-10-21).
 *
 * LE BESOIN. Un document d'entreprise se génère UN PAR OPCO, et son titre portait l'OPCO en suffixe
 * (« OP programme de formation — FAFCEA », « CGV — FAFCEA »). L'école l'a jugé redondant dans
 * l'espace du stagiaire / du représentant : le bloc {OPCO} du document et la carte « Documents
 * remis » le disent déjà. On retire donc le suffixe du TITRE.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · la génération écrit le libellé NU comme titre, mais STOCKE toujours l'OPCO dans sa colonne —
 *     c'est elle, jamais le titre, qui regroupe les documents par OPCO et alimente le jeton {OPCO} ;
 *   · la migration 214 retire le suffixe des titres DÉJÀ en base, exactement (« espace tiret
 *     cadratin espace OPCO »), et seulement quand le titre finit par lui ; son revert le remet.
 *
 * Tests de câblage (source serveur + migration, non exécutables ici), comme leurs miroirs.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lireMig = (f) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database', 'migrations', f), 'utf8');

test('la génération écrit le libellé NU, et STOCKE toujours l\'OPCO à part', () => {
    const ctrl = lire('controllers/company.controller.js');
    assert.match(ctrl, /const title = step\.label;/, 'le titre est le libellé nu');
    assert.doesNotMatch(ctrl, /const title = step\.label \+ \(g\.opco/, 'plus de suffixe « — OPCO » dans le titre');
    /* L'OPCO reste écrit dans sa colonne (dernier paramètre de l'INSERT) : regroupement + jeton {OPCO}. */
    assert.match(ctrl, /template_slug, title, company\.id, ancre, g\.opco\]/);
});

test('la migration 214 retire le suffixe « — OPCO » des titres existants, et son revert le remet', () => {
    const aller = lireMig('214_titres_documents_sans_opco.sql');
    /* On ne coupe QUE « espace tiret cadratin espace OPCO », et seulement si le titre finit par lui :
       la longueur se mesure en CARACTÈRES (le tiret cadratin en est un seul), pas en octets. */
    assert.match(aller, /SET title = LEFT\(title, CHAR_LENGTH\(title\) - CHAR_LENGTH\(CONCAT\(' — ', opco\)\)\)/);
    assert.match(aller, /RIGHT\(title, CHAR_LENGTH\(CONCAT\(' — ', opco\)\)\) = CONCAT\(' — ', opco\)/);
    assert.match(aller, /scope = 'COMPANY'/);
    assert.ok(!/^\s*--/m.test(aller), 'commentaires en blocs');
    assert.ok(!/\\/.test(aller), 'aucune barre oblique inverse');

    const revert = lireMig('214_revert_titres_documents_sans_opco.sql');
    assert.match(revert, /SET title = CONCAT\(title, ' — ', opco\)/);
    assert.match(revert, /PERTE ASSUMÉE/);
    assert.ok(!/^\s*--/m.test(revert), 'commentaires en blocs');
});
