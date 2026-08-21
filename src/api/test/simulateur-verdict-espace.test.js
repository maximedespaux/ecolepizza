/**
 * « 62 %parfait. » — L'ESPACE QUE JSX AVALE.
 *
 * Le verdict du Simulateur écrit la valeur mesurée, puis l'appréciation :
 *
 *     <b>{a.label}</b> : {a.val}
 *     {a.note === 2 ? "parfait." : `, ${a.sens}.`}
 *
 * JSX SUPPRIME LE SAUT DE LIGNE qui sépare deux expressions. « 62 % » et « parfait » se
 * retrouvaient donc collés. L'autre branche s'en tirait PAR HASARD — elle commence par sa
 * propre virgule — ce qui rendait le défaut invisible une fois sur deux, selon le réglage.
 *
 * L'espace vit donc DANS la chaîne, seul endroit où JSX ne peut pas le manger.
 *
 * CE QUE JE N'AI PAS FIGÉ, faute d'instrument fiable : un garde-fou général contre ce piège.
 * Le détecteur écrit pour balayer l'application a rendu DEUX cas, tous deux faux — une icône
 * suivie d'un texte dans un `.btn` (séparés par `gap:8px`, donc très bien) et un endroit qui
 * portait déjà un `{" "}` explicite. Un test qui crie à tort là où tout va bien apprend à
 * ignorer les tests.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui',
    'components', 'SimulateurPizza.jsx'), 'utf8');

test('« parfait » garde son espace, du bon côté des guillemets', () => {
    assert.match(src, /\{a\.note === 2 \? " parfait\." : `, \$\{a\.sens\}\.`\}/,
        'Sans l\'espace dans la chaîne, JSX colle la valeur à l\'appréciation.');
    /* Et la valeur reste bien sur la ligne d'avant : c'est cette disposition qui crée le
       piège, et la corriger en rapprochant les deux expressions le masquerait sans le
       comprendre — le prochain qui remet à la ligne le réintroduirait. */
    assert.match(src, /<b>\{a\.label\}<\/b> : \{a\.val\}\n/,
        'La valeur et l\'appréciation restent sur deux lignes.');
});
