/**
 * ESLINT EXISTE, ET IL MORD — le contrôle qui empêche la première panne de se répéter.
 *
 * CE QUI S'ÉTAIT PASSÉ. Le paquet du front installait ESLint et ses deux greffons, et son
 * `package.json` portait un script `lint`. Mais le FICHIER DE CONFIGURATION manquait. La
 * commande répondait « ESLint couldn't find an eslint.config file », donc personne ne la
 * lançait, et CLAUDE.md a fini par affirmer qu'il n'y avait pas d'ESLint dans le projet. Un
 * outil installé mais muet est pire qu'un outil absent : on se croit couvert.
 *
 * Deux défauts du 2026-09-16 tiennent entièrement dans `no-undef` — un état React appelé depuis
 * un autre composant, et une fonction appelée sans son `require`. Dans les deux cas le fichier
 * se chargeait, le build passait, et seul le clic échouait.
 *
 * CE TEST NE LANCE PAS ESLINT : deux secondes et demie contre quatre dixièmes pour toute la
 * suite, ce serait payer six fois le prix à chaque exécution. Il vérifie que le DISPOSITIF est
 * en place — configuration présente, règle armée, commande branchée. C'est ce qui a manqué, pas
 * l'outil.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

test('chaque paquet a sa configuration ESLint, et elle arme `no-undef`', () => {
    for (const p of ['app/eslint.config.js', 'api/eslint.config.js']) {
        assert.ok(fs.existsSync(path.join(RACINE, p)), `${p} manque : la commande répondra « couldn't find an eslint.config file »`);
        assert.match(lire(p), /['"]no-undef['"]:\s*['"]error['"]/,
            `${p} doit armer no-undef EN ERREUR — c'est la règle pour laquelle tout ceci existe`);
    }
});

test('la configuration de l\'API ne dépend de rien', () => {
    /* ESLint n'est installé QUE dans `src/app`. Une configuration d'API qui importerait
       `@eslint/js` ou `globals` ne se chargerait pas — et l'erreur ne se verrait qu'en lançant
       la commande, c'est-à-dire jamais. */
    const c = lire('api/eslint.config.js');
    assert.ok(!/^\s*import\s/m.test(c), 'aucun import : les paquets ne sont pas là');
    assert.match(c, /module\.exports = \[/, '`type: commonjs` : la configuration s\'écrit en CJS');
    assert.match(c, /require: 'readonly'/, 'les globales Node sont déclarées à la main');
});

test('les deux commandes `lint` sont branchées', () => {
    const app = JSON.parse(lire('app/package.json'));
    const api = JSON.parse(lire('api/package.json'));
    /* `eslint ui` et non `eslint .` : le point engloberait `dist-react`, des milliers de
       fichiers construits, et la configuration elle-même. */
    assert.strictEqual(app.scripts.lint, 'eslint ui');
    // L'API emprunte le binaire du front plutôt que d'installer ESLint deux fois.
    assert.match(api.scripts.lint, /app\/node_modules\/\.bin\/eslint/);
});

test('CLAUDE.md ne dit plus qu\'il n\'y a pas d\'ESLint', () => {
    /* La phrase était vraie EN EFFET — sans configuration, l'outil ne disait rien — et c'est
       précisément ce qui l'a rendue durable : elle décrivait le symptôme, pas la cause, et
       personne n'est allé voir pourquoi. */
    const md = fs.readFileSync(path.join(RACINE, '..', 'CLAUDE.md'), 'utf8');
    assert.ok(!/Pas d'ESLint dans le projet/.test(md));
    assert.match(md, /npm run lint/, 'et il dit comment le lancer');
});
