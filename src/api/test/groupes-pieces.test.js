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

test('une pièce ne porte JAMAIS de groupe « OU »', () => {
    /* Le cas de RS7404 : « Justificatif » dormait attaché à « Pièce d'identité ». Mais la règle
       ne s'arrête plus là — deux pièces ACTIVES ne se groupent pas davantage. Le « OU » des pièces
       a été retiré : les deux sont exigées, toujours. */
    const r = normaliserGroupesPieces([
        piece('identite', true, 'g1'), piece('justificatif', false, 'g1'),
        piece('rib', true, 'g2'), piece('iban', true, 'g2'),
    ]);
    assert.deepStrictEqual(r.map((s) => s.or_group), [null, null, null, null]);
});

test('la colonne reste en base — on l\'ignore, on ne migre pas', () => {
    /* `or_group` sert toujours aux documents ; une migration pour effacer des valeurs devenues
       inertes ne vaut pas son risque. La règle vaut donc à la lecture ET à l'écriture, ce qui
       nettoie la base au premier enregistrement, sans toucher au schéma. */
    const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers/formationProgram.controller.js'), 'utf8');
    assert.match(CTRL, /const propres = normaliserGroupesPieces\(steps\);/, 'lecture');
    assert.match(CTRL, /const aEcrire = normaliserGroupesPieces\(steps\);/, 'écriture');
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

test('la boucle d\'écriture lit la version normalisée, pas l\'entrée brute', () => {
    const boucle = CTRL.slice(CTRL.indexOf('const aEcrire'), CTRL.indexOf("message: 'Parcours enregistré."));
    assert.doesNotMatch(boucle, /steps\[i\]/, 'aucune lecture résiduelle du tableau d\'origine');
});

test('L\'ÉCRAN n\'offre plus de « OU » sur une pièce', () => {
    /* Le serveur seul ne suffisait pas : l'écran continuait de proposer « ＋ OU » sur une carte
       « pièce », et l'ajout venait s'empiler DANS cette carte au lieu de créer une étape. C'est
       ce qui rendait impossible de poser « Justificatif » APRÈS « Pièce d'identité » — il n'y
       avait aucune position où le glisser. */
    const PAGE = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/pages/Formations.jsx'), 'utf8');
    assert.match(PAGE, /&& g\.steps\[0\]\.doc_type !== "PIECE" && \(/, 'pas de « ＋ OU » sur une pièce');
    for (const mort of ['grouperPiece(', 'degrouperPiece(', 'onGrouperPiece', 'jalonPiece']) {
        assert.ok(!PAGE.includes(mort), `${mort} ne doit plus exister`);
    }
    // Et l'enregistrement n'entretient plus la valeur morte.
    assert.doesNotMatch(PAGE, /or_group: s\.or_group \|\| null/, 'plus de or_group envoyé pour une pièce');
});
