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

test("toute fonction appelée sur un module existe vraiment", () => {
    /* ─────────────────────────────────────────────────────────────────────────────────────────
       LE DÉFAUT VÉCU, deux fois dans la même session : un contrôleur appelait
       `consentements.aReponduLuiMeme(...)` alors qu'une insertion avait échoué en silence et que
       la fonction n'existait pas.
       Rien ne l'a vu. Le fichier se CHARGE (l'appel n'a lieu qu'à l'exécution de la requête), et
       les tests qui lisent le source trouvent très bien le nom qu'ils cherchent — il est écrit
       dans le contrôleur. Le défaut n'apparaît qu'au premier clic de l'utilisateur, sous la forme
       d'un « x is not a function » dans les journaux.
       Ce test compare les APPELS aux EXPORTS réels, module par module. */
    const modulesLib = fs.readdirSync(path.join(API, 'lib')).filter((f) => f.endsWith('.js'));
    /* Les alias sous lesquels chaque bibliothèque est importée : `const consentements =
       require('../lib/consentements.js')` — on récupère le nom de la variable. */
    const fautes = [];
    for (const dossier of ['controllers', 'routes']) {
        for (const f of fs.readdirSync(path.join(API, dossier)).filter((x) => x.endsWith('.js'))) {
            const src = fs.readFileSync(path.join(API, dossier, f), 'utf8');
            for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*require\('\.\.\/lib\/([\w.]+)\.js'\)/g)) {
                const [, alias, lib] = m;
                if (!modulesLib.includes(`${lib}.js`)) continue;
                const mod = require(path.join(API, 'lib', `${lib}.js`));
                for (const appel of src.matchAll(new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))) {
                    if (mod[appel[1]] === undefined) {
                        fautes.push(`${dossier}/${f} appelle ${alias}.${appel[1]}() — absent de lib/${lib}.js`);
                    }
                }
            }
        }
    }
    assert.deepStrictEqual(fautes, [],
        'Un appel vers une fonction inexistante ne se voit ni au chargement du module, ni dans '
        + 'un test qui lit le source : il attend le premier clic de l\'utilisateur.');
});
