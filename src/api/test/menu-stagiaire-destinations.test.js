/**
 * CHAQUE DESTINATION DU MENU STAGIAIRE DOIT MENER QUELQUE PART.
 *
 * LE DÉFAUT TROUVÉ : « Maîtrise sanitaire » pointait sur `/hygiene`, un chemin qu'AUCUNE route ne
 * servait. Le `<Route path="*">` de fin renvoyait donc le stagiaire sur `/mon-espace` — sans
 * erreur, sans message, sans rien. On clique sur un outil, on se retrouve à l'accueil, et l'on
 * croit avoir mal cliqué. Un menu qui promet une page et ramène ailleurs use la confiance qu'on
 * accorde aux autres entrées.
 *
 * RIEN NE POUVAIT LE SIGNALER : pas de 404, pas de page blanche, pas d'erreur en console. Le
 * fourre-tout de fin de liste — qui est une bonne chose pour une URL tapée de travers — avale
 * exactement de la même façon une entrée de menu écrite pour une page qui n'existe pas.
 *
 * Ce test lit le source : la table de routes est du JSX, qu'on ne peut pas charger depuis les
 * tests d'API (React n'y est pas). Ce qu'il garde, c'est l'accord entre les deux listes.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');

test('aucune entrée du menu stagiaire ne mène à une route inexistante', () => {
    const layout = lire('layouts/StudentLayout.jsx');
    const main = lire('main.jsx');

    /* Les destinations déclarées dans le menu. `OUTILS` porte les outils ; les autres entrées
       (accueil, boutique…) sont écrites directement dans le JSX du layout. On prend les deux :
       une entrée morte est aussi gênante d'un côté que de l'autre. */
    /* `<Navigate>` EST EXCLU : c'est une redirection, pas une entrée de menu. Le compter
       faisait remonter `/login` — vers lequel on renvoie l'utilisateur déconnecté — comme une
       destination morte, alors qu'il mène parfaitement quelque part. */
    const destinations = [...layout.matchAll(/\bto:\s*"(\/[a-z0-9-]+)"/g)].map((m) => m[1])
        .concat([...layout.matchAll(/<(?:NavLink|DrawerLink)\s+to="(\/[a-z0-9-]+)"/g)].map((m) => m[1]));

    /* Les chemins réellement servis. `path="x"` dans les routes (sans le slash initial), plus
       les redirections `Navigate to="/x"`, qui mènent bien quelque part. */
    /* Avec ou sans slash initial : `main.jsx` écrit les routes publiques en absolu
       (`path="/login"`) et celles des espaces en relatif (`path="notions"`). */
    const servis = new Set([...main.matchAll(/path="\/?([a-z0-9-]+)"/g)].map((m) => '/' + m[1]));

    const mortes = [...new Set(destinations)].filter((d) => !servis.has(d));
    assert.deepStrictEqual(mortes, [],
        `entrée(s) de menu sans route : ${mortes.join(', ')} — le fourre-tout `
        + 'renverra le stagiaire sur /mon-espace sans rien dire.');
});

test('« Maîtrise sanitaire » ne revient pas sans sa page', () => {
    /* COMMENTAIRES RETIRÉS AVANT DE CHERCHER. Sans ça, l'assertion trouvait le commentaire qui
       explique le retrait — elle vérifiait sa propre documentation, et serait restée rouge quoi
       qu'on fasse au code. Le piège s'est déjà refermé trois fois sur ce projet. */
    const rendu = lire('layouts/StudentLayout.jsx')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(rendu, /Maîtrise sanitaire/,
        'L\'entrée a été retirée faute de page : la remettre suppose d\'écrire la page ET la route.');
});
