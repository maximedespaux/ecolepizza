/**
 * LES FARINES DE LA PÂTE SUR LA CARTE DE « LA COMMANDE PIÈGE ».
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI REND CET AJOUT DÉLICAT : afficher une farine, c'est engager une réponse.
 *
 * « Farine de soja » sur une carte, et un stagiaire en déduit — à raison — que la pizza porte du
 * soja. Si la farine n'était qu'un décor, le jeu marquerait FAUX un raisonnement JUSTE, sur un
 * sujet où l'on apprend précisément à raisonner. C'est la pire chose qu'un outil d'entraînement
 * aux allergènes puisse faire.
 *
 * D'où le choix qui commande tout le reste : LA FARINE EST UN INGRÉDIENT, posée dans `ing` avec
 * la garniture. `verdict()` la voit donc partout — question simple, retrait, comparaison — sans
 * qu'un seul site d'appel change, et sans qu'on puisse en oublier un.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ET LA DONNÉE VIENT DU MANUEL, pas d'une liste inventée : `SUBSTITUTIONS` (lib/dough.js, p.32).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');
const jeu = lire('components/CommandePiege.jsx');
const ref = lire('lib/allergenes.js');

test('la farine entre dans la composition, pas à côté', () => {
    /* C'est ce qui fait que le verdict la prend en compte partout sans exception. */
    assert.match(jeu, /ing: \[\.\.\.\(farine \? \[farine\] : \[\]\), base, \.\.\.choisies\]/,
        'La farine doit être un ingrédient, sinon le jeu marquerait faux un raisonnement juste.');
    /* Et l'affichage la RESSORT de la garniture : elle appartient à la pâte, pas à ce qu'on
       pose dessus — c'est exactement la distinction qu'on enseigne. */
    assert.match(jeu, /p\.ing\.filter\(\(i\) => !i\.farine\)\.map/,
        'La liste des garnitures ne doit pas énumérer la farine.');
});

test('les farines viennent du manuel, et les blés en sont écartés', () => {
    assert.match(jeu, /import \{ SUBSTITUTIONS \} from "\.\.\/lib\/dough\.js"/,
        'La liste ne doit pas être recopiée dans le jeu.');
    /* Les T80/T110/T150 sont des farines de BLÉ : elles ne changent rien à la lecture des
       allergènes et alourdiraient la carte pour rien. */
    assert.match(jeu, /SUBSTITUTIONS\.filter\(\(f\) => !f\.wheat\)/,
        'Les farines de blé n\'ont rien à apprendre ici.');
});

test('le soja est le SEUL de ces mélanges à ajouter un des 14', () => {
    /* Le point qui vaut d'être enseigné, parce que l'intuition dit le contraire. */
    assert.match(ref, /farine_soja: \{ allergenes: \["soja"\] \}/, 'Le soja est un des 14.');
    /* CHÂTAIGNE : elle sonne comme un fruit à coque et n'en est pas un. Le règlement (UE)
       1169/2011, annexe II, point 8, NOMME les huit concernés — amande, noisette, noix, cajou,
       pécan, noix du Brésil, pistache, macadamia — et la châtaigne n'y figure pas. */
    assert.match(ref, /farine_chataigne: \{\}/, 'La châtaigne n\'est pas un fruit à coque au sens des 14.');
    for (const f of ['sarrasin', 'seigle', 'mais', 'epeautre']) {
        assert.match(ref, new RegExp(`farine_${f}: \\{\\}`), `${f} n'ajoute aucun des 14.`);
    }
});

test('aucune farine ne redéclare le gluten', () => {
    /* Une substitution remplace une PART du blé, à poids constant : le blé reste majoritaire et
       la pâte porte TOUJOURS du gluten, farine marquée ou non. Le poser sur chaque farine
       laisserait croire qu'une pâte sans farine marquée en serait exempte — l'inverse exact de
       la leçon, et celle qui envoie un cœliaque aux urgences. */
    const bloc = /— FARINES DE SUBSTITUTION —[\s\S]*?farine_epeautre: \{\},/.exec(ref);
    assert.ok(bloc, 'le bloc des farines est introuvable');
    assert.doesNotMatch(bloc[0].split('*/')[1] || '', /gluten/,
        'Le gluten ne se déclare pas farine par farine : il est dans la pâte, toujours.');
    /* Et le lexique le dit en toutes lettres, là où la question se pose. */
    assert.match(jeu, /toutes les pâtes contiennent du gluten<\/b>, celles-ci comprises/,
        'Le lexique doit le rappeler sous la carte.');
});

test('on ne propose jamais de retirer la farine', () => {
    /* « Sans la farine de soja, ça passe ? » n'est pas une question de comptoir : la pâte est
       faite depuis ce matin. La farine RESTE en revanche dans la composition — retirer une
       garniture ne suffira donc pas si c'est elle qui porte l'allergène, et c'est la leçon. */
    assert.match(jeu, /const otables = causes\.filter\(\(l\) => !pizza\.ing\.some\(\(i\) => i\.farine && i\.label === l\)\)/,
        'La farine doit être exclue de ce qu\'on propose d\'ôter.');
    assert.match(jeu, /if \(!otables\.length\) return null;/,
        'Et s\'il ne reste rien d\'ôtable, la question ne se pose pas.');
});
