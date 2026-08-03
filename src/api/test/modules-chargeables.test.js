/**
 * CHAQUE MODULE DU SERVEUR DOIT POUVOIR SE CHARGER.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A MOTIVÉ CE FICHIER, et il est embarrassant : une ERREUR DE SYNTAXE dans
 * `consentement.controller.js` a traversé 611 tests sans en faire échouer un seul.
 *
 * La raison est structurelle. Beaucoup de tests de ce projet lisent le SOURCE (`readFileSync` +
 * expression régulière) plutôt que d'exécuter le code : c'est un choix assumé, il permet de geler
 * des invariants qu'aucun test unitaire n'atteindrait. Mais un fichier illisible par Node reste
 * parfaitement lisible par une expression régulière. Les assertions passaient donc au vert sur un
 * fichier que le serveur aurait refusé de démarrer.
 *
 * Un simple `require` de chaque module ferme le trou : il déclenche l'analyse syntaxique, résout
 * les imports, et exécute le corps du module.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI ÇA NE FAIT PAS DE CONNEXION À LA BASE : le pool est PARESSEUX (cf.
 * `config/database.js`), précisément pour que charger un contrôleur n'ouvre rien. Si ce test se
 * met un jour à ne plus rendre la main, c'est que quelqu'un a rendu la connexion immédiate — et
 * c'est cela qu'il faudra corriger, pas ce fichier.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');

function modules(dossier) {
    const d = path.join(API, dossier);
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => `${dossier}/${f}`);
}

for (const dossier of ['controllers', 'lib', 'routes', 'middlewares']) {
    test(`les modules de ${dossier}/ se chargent`, () => {
        const fichiers = modules(dossier);
        assert.ok(fichiers.length > 0, `aucun module trouvé dans ${dossier}/ — chemin cassé ?`);
        const fautes = [];
        for (const f of fichiers) {
            try { require(path.join(API, f)); }
            catch (e) { fautes.push(`${f} : ${e.message.split('\n')[0]}`); }
        }
        assert.deepStrictEqual(fautes, [],
            'Un module qui ne se charge pas fait tomber le serveur au démarrage — et les tests '
            + 'qui lisent le SOURCE ne le voient pas : une regex lit très bien un fichier que '
            + 'Node refuse.');
    });
}
