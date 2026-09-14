/**
 * LA LISTE DES DOCUMENTS S'EXÉCUTE VRAIMENT — pas seulement « ça compile ».
 *
 * LE DÉFAUT, parti en production. La requête de `listDocuments` s'est mise à appeler
 * `colonneExiste(...)` alors que le fichier n'importait que `colonneOuNull`. Rien ne l'a signalé :
 * la syntaxe est valide, `require()` du module passe, le front construit, et les 862 tests
 * existants n'exécutent jamais cette fonction — ils lisent le SOURCE. Résultat : toutes les fiches
 * stagiaires en erreur 500, découvertes par l'écran blanc.
 *
 * (La cause immédiate est une garde qui s'est vue elle-même : `if ("colonneExiste" not in source)`
 * était faux PARCE QUE le symbole venait d'être écrit dans la requête SQL. Le test, lui, ne
 * dépend pas de la façon dont l'import a été ajouté.)
 *
 * D'OÙ CE TEST : on APPELLE la fonction, contre une fausse base. Une référence non définie lève
 * alors une `ReferenceError`, comme en production — c'est la seule chose qui l'attrape.
 */
const test = require('node:test');
const assert = require('node:assert');

const cheminDb = require.resolve('../config/database.js');
const faux = {
    promise: () => ({
        query: async (sql) => {
            // `information_schema` : la colonne existe → on emprunte le chemin AVEC la jointure,
            // celui qui plantait.
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { listDocuments } = require('../controllers/document.controller.js');

test('listDocuments s\'exécute sans référence manquante', async () => {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    await listDocuments({ query: { learner_id: 'l1' }, user: { organization_id: 'o1', id: 'u1' } }, res);
    assert.notStrictEqual(code, 500, `la liste ne doit pas tomber en 500 — reçu : ${JSON.stringify(corps)}`);
    assert.ok(corps && corps.data, 'elle doit rendre des données');
});

test('elle s\'exécute AUSSI quand la table des fichiers n\'existe pas', async () => {
    /* L'autre branche : sans la migration 145, la jointure est omise. Les deux chemins doivent
       vivre — c'est la règle « le code marche avant comme après la migration », et c'est
       justement celui-là que personne n'exerce une fois la migration jouée. */
    const sansTable = {
        promise: () => ({ query: async () => [[]] }),   // information_schema ne rend rien
        query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
    };
    require.cache[cheminDb].exports = sansTable;
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    await listDocuments({ query: { learner_id: 'l1' }, user: { organization_id: 'o1', id: 'u1' } }, res);
    assert.notStrictEqual(code, 500, `sans la table, la liste doit fonctionner — reçu : ${JSON.stringify(corps)}`);
});
