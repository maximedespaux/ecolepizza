/**
 * LE PRÉNOM D'UN MEMBRE DU JURY SURVIT À L'ENREGISTREMENT (défaut du 2026-10-09).
 *
 * Le nom et le prénom d'un membre ont été séparés en deux champs (noms composés). La saisie
 * envoyait bien les deux, mais `juryPropre` — la liste blanche qui nettoie le jury AVANT écriture —
 * ne gardait que `nom` : le prénom était JETÉ au moment d'enregistrer, et revenait VIDE au
 * rechargement de la page. À retaper à chaque fois.
 *
 * PAS DE MIGRATION : le jury vit en JSON dans `exam_session.jury`. Ajouter un champ à l'objet ne
 * touche pas le schéma — il suffit que `juryPropre` le conserve. Ce test capture ce qui part à
 * l'écriture et vérifie que le prénom y est.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

let commission = null; // aucune commission existante → chemin INSERT
let ecrit = null;      // la requête d'écriture capturée (sql + params)
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            if (/FROM training_session/i.test(sql)) return [[{ id: 's-1' }]];
            if (/FROM exam_session/i.test(sql)) return [commission ? [commission] : []];
            if (/FROM exam_result/i.test(sql)) return [[]];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [[]];
            if (/INSERT INTO exam_session|UPDATE exam_session/i.test(sql)) { ecrit = { sql, params }; return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { saveCommission } = require('../controllers/examen.controller.js');

function faireRes() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    return res;
}
const enregistrer = async (jury) => {
    ecrit = null;
    const body = { pv_ref: 'EPJJD-2026-38', date_examen: '2026-12-18', certification: 'Titre pizzaïolo', jury };
    const res = faireRes();
    await saveCommission({ user: { organization_id: 'o1', id: 'u1' }, params: { id: 's-1' }, body, headers: {}, ip: '' }, res);
    const p = (ecrit && ecrit.params || []).find((x) => typeof x === 'string' && /^\[/.test(x));
    return { res, juryEcrit: p ? JSON.parse(p) : null };
};

test('le prénom part à l\'écriture, à côté du nom', async () => {
    const { res, juryEcrit } = await enregistrer([
        { nom: 'Le Faou', prenom: 'Dominique Marie', qualite: 'présidente', externe: true, na_pas_forme: true },
    ]);
    assert.notStrictEqual(res.code, 500, JSON.stringify(res.corps));
    assert.ok(juryEcrit, 'une liste de jury a bien été écrite');
    assert.strictEqual(juryEcrit[0].nom, 'Le Faou');
    assert.strictEqual(juryEcrit[0].prenom, 'Dominique Marie', 'le prénom n\'est plus jeté');
    // Et les règles de validité restent écrites (on n'a rien cassé en ajoutant le prénom).
    assert.strictEqual(juryEcrit[0].externe, true);
    assert.strictEqual(juryEcrit[0].na_pas_forme, true);
});

test('un membre sans prénom (ancien format) garde un prénom vide, pas undefined', async () => {
    const { juryEcrit } = await enregistrer([{ nom: 'Ferrand Hélène', qualite: 'membre du jury' }]);
    assert.strictEqual(juryEcrit[0].nom, 'Ferrand Hélène');
    assert.strictEqual(juryEcrit[0].prenom, '', 'champ présent et vide — l\'écran le relira sans planter');
});

test('juryPropre garde le prénom dans sa liste blanche (lu au source)', () => {
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'examen.controller.js'), 'utf8');
    const corps = ctrl.slice(ctrl.indexOf('function juryPropre'), ctrl.indexOf('function juryPropre') + 600);
    assert.match(corps, /prenom: texte\(m && m\.prenom, 120\)/, 'le prénom est conservé à l\'écriture');
});
