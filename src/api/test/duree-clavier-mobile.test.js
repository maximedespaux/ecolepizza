/**
 * LE CLAVIER DU TÉLÉPHONE NE POUVAIT PAS TAPER « 12:33 ».
 *
 * SIGNALÉ le 2026-09-16 : sur la notation, impossible de saisir une durée au téléphone. Le
 * champ portait `inputMode="numeric"` — le pavé chiffré d'un mobile n'a NI deux-points, NI
 * apostrophe, NI lettre « m ». Or ce sont les trois séparateurs que le champ accepte. Le
 * placeholder affichait « 1:30 » : il montrait une saisie que le clavier interdisait.
 *
 * ET C'EST LE CAS D'USAGE PRINCIPAL. La notation d'une épreuve chronométrée se fait sur le
 * terrain, chronomètre en main — donc au téléphone, presque jamais au clavier.
 *
 * `text` OUVRE UN CLAVIER COMPLET, où le deux-points est à une bascule « 123 ». On a écarté
 * `decimal`, qui garderait le pavé chiffré en ajoutant un séparateur décimal : « 12.5 » se
 * lirait alors 12 min 05 s quand tout le monde comprend 12 min 30 s. Un raccourci qui ment à
 * moitié coûte plus cher que deux taps.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const NOTATION = sansCommentaires(fs.readFileSync(path.join(UI, 'components/SessionEvaluation.jsx'), 'utf8'));

test('LE CHAMP DE DURÉE N\'IMPOSE PLUS UN PAVÉ CHIFFRÉ', () => {
    const zone = NOTATION.slice(NOTATION.indexOf('placeholder="1:30"') - 200,
        NOTATION.indexOf('placeholder="1:30"') + 200);
    assert.match(zone, /inputMode="text"/);
    assert.ok(!/inputMode="numeric"/.test(zone),
        'un pavé chiffré ne peut taper aucun des séparateurs que le champ accepte');
    assert.ok(!/inputMode="decimal"/.test(zone),
        '« 12.5 » se lirait 12 min 05 s : un séparateur décimal ment sur une durée');
});

test('TOUT CE QUE LE CHAMP PROMET EST BIEN LISIBLE', async () => {
    /* Le placeholder annonce « 1:30 » et l'aide « min:s — ou des secondes » : les deux doivent
       correspondre à ce que `lireDuree` sait réellement lire, sinon l'écran promet une saisie
       que le code refuse. */
    const { lireDuree } = await import('../../app/ui/lib/format.js');
    assert.strictEqual(lireDuree('12:33'), 12 * 60 + 33);
    assert.strictEqual(lireDuree("12'33"), 12 * 60 + 33, 'apostrophe : la notation des minutes');
    assert.strictEqual(lireDuree('12m33'), 12 * 60 + 33);
    assert.strictEqual(lireDuree('1:30'), 90, 'exactement le placeholder');
    /* LE CHEMIN SANS SÉPARATEUR, qui n'a jamais eu besoin d'aucun clavier particulier : un
       nombre nu vaut des secondes. C'est lui que l'aide annonce désormais. */
    assert.strictEqual(lireDuree('753'), 753);
    assert.strictEqual(lireDuree('753'), lireDuree('12:33'), 'les deux chemins mènent au même résultat');
    assert.strictEqual(lireDuree('abc'), null, 'et l\'illisible reste illisible');
});

test('L\'AIDE ANNONCE LES DEUX CHEMINS', () => {
    /* Le nombre nu marchait déjà, mais l'aide ne disait que « min:s » : personne ne pouvait
       deviner qu'il suffisait de taper 753. Une issue qu'on n'annonce pas n'existe pas. */
    assert.match(NOTATION, /"min:s — ou des secondes"/);
});
