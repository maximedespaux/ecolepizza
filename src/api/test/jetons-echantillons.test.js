const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');

test('les cinq colonnes qui tombaient sur « Exemple » ont un vrai échantillon', () => {
    /* « Exemple » est le dernier recours de `sampleForField`. Dans l'aperçu d'un modèle, il
       occupe la place d'un paragraphe sans en donner ni la longueur ni la forme : on ne voit pas
       si le bloc tient sur la page. Les colonnes sont en ANGLAIS (`objectives`,
       `objective_general`) alors que le motif ne testait que le français — elles passaient à côté
       de leur propre règle. */
    for (const [motif, attendu] of [
        [/if \(\/horaire\/\.test\(c\)\) return '9h00 – 12h30 \/ 13h30 – 17h00';/, 'horaires'],
        [/if \(\/duration_detail\|duree_detail\/\.test\(c\)\) return '35 h sur 5 jours';/, 'duration_detail'],
        [/if \(\/prerequis\|prerequisite\/\.test\(c\)\) return 'Savoir lire/, 'prerequisites'],
        [/objectiv\\w\*_general\|objectif\\w\*_general/, 'objective_general'],
    ]) assert.match(CTRL, motif, `échantillon manquant : ${attendu}`);
    // `objective_general` AVANT `objectives`, sinon le motif général l'attrape le premier.
    assert.ok(CTRL.indexOf('_general/.test(c)) return \'Devenir pizzaïolo') < CTRL.indexOf("(objectiv|objectif|programme"));
});

test('un jeton personnalisé montre CE QU\'IL PRODUIRA', () => {
    /* Son exemple était la chaîne vide : dans la palette, « Periode de la formation » ne montrait
       rien et il fallait l'insérer puis lancer un aperçu pour savoir ce qu'il donne. Un jeton
       personnalisé n'étant qu'une composition d'autres jetons, on la résout contre leurs
       exemples — avec `resolveCustomTokens`, la fonction qui les calcule à la génération, donc
       le même moteur et le même résultat. */
    assert.match(CTRL, /const resolus = resolveCustomTokens\(defs, echantillons\);/);
    assert.match(CTRL, /sample: resolus\[`custom:\$\{d\.token_key\}`\] \|\| ''/);
    assert.doesNotMatch(CTRL, /label: d\.label, sample: '' \}/, 'plus d\'exemple vide en dur');
    // La carte d'échantillons se construit APRÈS les autres groupes, sinon elle serait vide.
    assert.ok(CTRL.indexOf('const echantillons = {}') > CTRL.indexOf('groups.push(factureTokensGroup())'));
});
