/**
 * UN « OU » ENTRE PIÈCES N'EXISTE QU'À PARTIR DE DEUX VARIANTES ACTIVES.
 *
 * LE DÉFAUT, relevé sur les données de production (formation RS7404). Deux pièces partageaient un
 * groupe « OU » : « Pièce d'identité » (active) et « Justificatif » (INACTIVE). Le parcours
 * annonçait donc un choix entre UNE seule option — et surtout, réactiver « Justificatif » ne
 * rendait pas les deux pièces exigées : il les rendait INTERCHANGEABLES, en silence, le groupe
 * étant resté collé à la variante endormie. L'organisme croyait demander deux documents au
 * stagiaire, il n'en obtenait qu'un — et rien à l'écran ne le disait.
 *
 * La règle rétablit le comportement attendu par défaut : deux pièces = les deux exigées. Le
 * « OU » redevient ce qu'il doit être, un choix DÉLIBÉRÉ entre deux variantes réellement en jeu.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { normaliserGroupesPieces } = require('../lib/groupesPieces.js');

const CTRL = fs.readFileSync(
    path.join(__dirname, '..', 'controllers/formationProgram.controller.js'), 'utf8');

const piece = (label, active, or_group) => ({ slug: `piece:${label}`, doc_type: 'PIECE', label, active, or_group });

test('une variante endormie ne maintient plus le choix en vie', () => {
    // Le cas exact de RS7404.
    const r = normaliserGroupesPieces([piece('identite', true, 'g1'), piece('justificatif', false, 'g1')]);
    assert.deepStrictEqual(r.map((s) => s.or_group), [null, null],
        'réactiver « Justificatif » doit donner deux pièces exigées, pas un choix entre les deux');
});

test('un vrai choix entre deux variantes ACTIVES est conservé', () => {
    const r = normaliserGroupesPieces([piece('rib', true, 'g2'), piece('iban', true, 'g2')]);
    assert.deepStrictEqual(r.map((s) => s.or_group), ['g2', 'g2'], 'là, le OU a un sens : on ne le casse pas');
});

test('les documents ne sont pas touchés', () => {
    /* Leur « OU » passe par les équivalences d'organisme, pas par program_step : appliquer la
       règle ici dissoudrait des équivalences qui ne nous appartiennent pas. */
    const r = normaliserGroupesPieces([{ slug: 'doc:convention', doc_type: 'DOC', active: true, or_group: 'g3' }]);
    assert.strictEqual(r[0].or_group, 'g3');
});

test('la forme de l\'ENREGISTREMENT est reconnue, pas seulement celle de la lecture', () => {
    /* L'écran n'envoie que `{slug, active, or_group, applies_when}` — sans `doc_type`. Sans la
       reconnaissance par slug, la règle vaudrait à l'affichage et pas à la sauvegarde : la base
       garderait ses groupes fantômes et ils ressurgiraient au chargement suivant. */
    const r = normaliserGroupesPieces([
        { slug: 'piece:a', active: true, or_group: 'g' },
        { slug: 'piece:b', active: false, or_group: 'g' },
    ]);
    assert.deepStrictEqual(r.map((s) => s.or_group), [null, null]);
});

test('l\'ordre et les autres champs passent intacts', () => {
    const entree = [{ slug: 'piece:a', doc_type: 'PIECE', active: true, or_group: 'g', applies_when: { x: 1 }, sort_order: 10 }];
    const r = normaliserGroupesPieces(entree);
    assert.deepStrictEqual(r[0].applies_when, { x: 1 });
    assert.strictEqual(r[0].sort_order, 10);
    assert.strictEqual(entree[0].or_group, 'g', 'l\'entrée n\'est pas modifiée sur place');
});

test('la règle vaut À LA LECTURE comme à l\'écriture', () => {
    /* À la lecture pour que les parcours DÉJÀ enregistrés se présentent correctement sans qu'on
       les rouvre un par un ; à l'écriture pour que la base se nettoie d'elle-même. Sans le second,
       le groupe fantôme est réenregistré tel quel et le nettoyage ne finit jamais. */
    assert.match(CTRL, /const propres = normaliserGroupesPieces\(steps\);/, 'lecture');
    assert.match(CTRL, /const aEcrire = normaliserGroupesPieces\(steps\);/, 'écriture');
    // La boucle d'écriture lit la version normalisée, pas l'entrée brute.
    const boucle = CTRL.slice(CTRL.indexOf('const aEcrire'), CTRL.indexOf("message: 'Parcours enregistré."));
    assert.doesNotMatch(boucle, /steps\[i\]/, 'aucune lecture résiduelle du tableau d\'origine');
});
