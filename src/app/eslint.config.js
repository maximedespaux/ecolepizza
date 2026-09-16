/**
 * ESLint pour l'interface — ce que ni `esbuild` ni `vite build` ne voient.
 *
 * POURQUOI CE FICHIER EXISTE, ET CE QU'IL A COÛTÉ DE NE PAS L'AVOIR. Le paquet installait
 * ESLint et ses deux greffons, et `package.json` portait un script `lint` — mais la
 * configuration manquait. La commande répondait « ESLint couldn't find an eslint.config file »,
 * donc personne ne la lançait, et CLAUDE.md a fini par affirmer qu'il n'y avait pas d'ESLint
 * dans le projet. Un outil installé mais muet est pire qu'un outil absent : on croit être
 * couvert.
 *
 * Deux défauts du 2026-09-16 tiennent entièrement dans `no-undef` :
 *   · le bouton « ＋ Ajouter une étape » du parcours entreprise appelait `setOuFor`, un état
 *     d'un AUTRE composant. Le composant se rendait parfaitement, le build passait, et seul le
 *     clic échouait — deux cent trois `ReferenceError` dans la console d'un écran de production,
 *     sans un mot à l'écran ;
 *   · un `rows.map` resté dans un composant extrait, où `rows` n'existait plus.
 *
 * `esbuild` ne détecte pas les références non définies (CLAUDE.md § 2.4) : c'est un
 * empaqueteur, pas un analyseur. D'où cette configuration, et d'où sa règle centrale.
 *
 * SÉVÉRITÉS : ERREUR pour ce qui casse à l'exécution, AVERTISSEMENT pour ce qui salit. Le dépôt
 * porte déjà une quarantaine de variables inutilisées ; les passer en erreur rendrait la
 * commande rouge dès le premier jour, et un contrôle toujours rouge ne se lit plus.
 */
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist-react/**", "node_modules/**"] },
  {
    files: ["ui/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      /* LA RÈGLE POUR LAQUELLE TOUT CECI EXISTE — cf. l'en-tête. */
      "no-undef": "error",
      /* Les dépendances d'un effet : c'est cette règle que visent les `eslint-disable-next-line`
         déjà présents dans le dépôt. Sans le greffon, ces directives devenaient « inutilisées »
         et l'on ne comprenait plus ce qu'elles taisaient. En avertissement : une dépendance
         manquante se discute, elle ne casse pas toujours. */
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none",
        varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      /* Une espace insécable ou fine dans du CODE passe inaperçue et casse l'analyse ; dans une
         CHAÎNE et un commentaire, elle est voulue — l'interface est en français. */
      "no-irregular-whitespace": ["error", { skipStrings: true, skipComments: true,
        skipTemplates: true, skipJSXText: true }],
    },
  },
];
