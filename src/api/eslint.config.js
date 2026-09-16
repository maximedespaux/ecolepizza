/**
 * ESLint pour l'API — VOLONTAIREMENT SANS AUCUN `import`.
 *
 * POURQUOI. ESLint n'est installé que dans `src/app` : ce paquet-ci n'a ni `@eslint/js` ni
 * `globals`, et une configuration qui les importerait ne se chargerait pas. On déclare donc les
 * règles à la main. Elles sont peu nombreuses, et c'est délibéré — voir plus bas.
 *
 * ON LANCE DEPUIS `src/api` avec le binaire du front :
 *     ../app/node_modules/.bin/eslint .
 * ou, plus simplement, `npm run lint` — le script est là pour ça.
 *
 * `type: commonjs` dans le package.json : ce fichier s'écrit donc en `module.exports`.
 */
const NODE_GLOBALS = {
    require: 'readonly', module: 'writable', exports: 'writable', __dirname: 'readonly',
    __filename: 'readonly', process: 'readonly', Buffer: 'readonly', console: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
    clearInterval: 'readonly', setImmediate: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
    TextEncoder: 'readonly', TextDecoder: 'readonly', fetch: 'readonly', structuredClone: 'readonly',
    AbortController: 'readonly', global: 'readonly', queueMicrotask: 'readonly',
};

module.exports = [
    { ignores: ['node_modules/**', 'uploads/**'] },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: NODE_GLOBALS,
        },
        rules: {
            /* LA RÈGLE POUR LAQUELLE TOUT CECI EXISTE. Un identifiant appelé sans être défini ni
               importé : le fichier se charge quand même, et l'erreur n'arrive qu'à l'exécution de
               CETTE ligne-là. `companyStepSlugs` a été appelée sans son `require` le 2026-09-16 ;
               seule une relecture l'a vue. */
            'no-undef': 'error',
            /* Une variable déclarée deux fois, un `case` sans `break`, une promesse dans un
               constructeur : des fautes, pas des goûts. */
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-unreachable': 'error',
            'no-fallthrough': 'error',
            'no-cond-assign': 'error',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-self-assign': 'error',
            'no-unsafe-negation': 'error',
            'valid-typeof': 'error',
            /* EN AVERTISSEMENT, PAS EN ERREUR. Ce sont des signaux utiles, mais il y en a déjà
               dans le dépôt : les passer en erreur rendrait `npm run lint` rouge dès le premier
               jour, et un contrôle toujours rouge ne se lit plus. On les corrige au fil de l'eau. */
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
        },
    },
];
