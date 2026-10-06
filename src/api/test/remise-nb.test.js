/**
 * NOMBRE DE DOCUMENTS PAR TYPE DE REMISE (migration 203, demandé le 2026-10-06).
 *
 * Un type de remise (AGEFICE…) peut porter PLUSIEURS documents, au lieu d'en multiplier les types :
 *   · PLAFOND — « au plus N » : le dépôt plafonne à N ; l'étape est faite dès l'accusé de réception.
 *   · REQUIS  — « il en faut N » : le dépôt plafonne à N ET l'accusé est refusé tant qu'il manque des
 *     documents. La COMPLÉTION reste « accusé de réception » (parcours / conformité / groupe inchangés) :
 *     on ne la franchit qu'une fois les N déposés, parce que l'accusé lui-même est bloqué avant.
 * L'accusé reste UNIQUE pour toute la remise (choix de l'école) — pas un par document.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const S = require('../lib/remiseNb.js');

test('nbModeValide / nbDocumentsValide : normalisation et bornes', () => {
    assert.strictEqual(S.nbModeValide('REQUIS'), 'REQUIS');
    assert.strictEqual(S.nbModeValide('PLAFOND'), 'PLAFOND');
    assert.strictEqual(S.nbModeValide('x'), 'PLAFOND');
    assert.strictEqual(S.nbModeValide(undefined), 'PLAFOND');
    assert.strictEqual(S.nbDocumentsValide(5), 5);
    assert.strictEqual(S.nbDocumentsValide('5'), 5);
    assert.strictEqual(S.nbDocumentsValide(0), 0);
    assert.strictEqual(S.nbDocumentsValide(-3), 0, 'jamais négatif');
    assert.strictEqual(S.nbDocumentsValide(999), 99, 'borné à 99');
    assert.strictEqual(S.nbDocumentsValide('abc'), 0);
});

test('plafondAtteint : un nombre fixé, et déjà atteint ; 0 = pas de limite', () => {
    assert.strictEqual(S.plafondAtteint(5, 5), true);
    assert.strictEqual(S.plafondAtteint(6, 5), true);
    assert.strictEqual(S.plafondAtteint(4, 5), false);
    assert.strictEqual(S.plafondAtteint(2, 0), false, '0 = pas de limite : jamais atteint');
    assert.strictEqual(S.plafondAtteint(0, 0), false);
});

test('manquePourRequis / peutAccuser : seul REQUIS exige un compte', () => {
    assert.strictEqual(S.manquePourRequis({ nb_mode: 'REQUIS', nb_documents: 5, nb_fichiers: 2 }), 3);
    assert.strictEqual(S.manquePourRequis({ nb_mode: 'REQUIS', nb_documents: 5, nb_fichiers: 5 }), 0);
    assert.strictEqual(S.manquePourRequis({ nb_mode: 'PLAFOND', nb_documents: 5, nb_fichiers: 1 }), 0, 'un plafond n\'exige rien');
    assert.strictEqual(S.manquePourRequis({ nb_mode: 'REQUIS', nb_documents: 0, nb_fichiers: 0 }), 0, '0 = pas de requis');
    assert.strictEqual(S.peutAccuser({ nb_mode: 'REQUIS', nb_documents: 3, nb_fichiers: 3 }), true);
    assert.strictEqual(S.peutAccuser({ nb_mode: 'REQUIS', nb_documents: 3, nb_fichiers: 1 }), false);
    assert.strictEqual(S.peutAccuser({ nb_mode: 'PLAFOND', nb_documents: 3, nb_fichiers: 0 }), true);
});

test('LES DEUX FICHIERS (serveur ⇄ écran) donnent les mêmes résultats', async () => {
    const F = await import(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'remiseNb.js'));
    const cas = [
        { nb_mode: 'REQUIS', nb_documents: 5, nb_fichiers: 2 },
        { nb_mode: 'PLAFOND', nb_documents: 5, nb_fichiers: 2 },
        { nb_mode: 'REQUIS', nb_documents: 0, nb_fichiers: 0 },
        { nb_mode: 'REQUIS', nb_documents: 3, nb_fichiers: 3 },
    ];
    for (const c of cas) {
        assert.strictEqual(S.manquePourRequis(c), F.manquePourRequis(c), JSON.stringify(c));
        assert.strictEqual(S.peutAccuser(c), F.peutAccuser(c), JSON.stringify(c));
        assert.strictEqual(S.plafondAtteint(c.nb_fichiers, c.nb_documents), F.plafondAtteint(c.nb_fichiers, c.nb_documents));
    }
    for (const v of ['REQUIS', 'PLAFOND', 'x', undefined]) assert.strictEqual(S.nbModeValide(v), F.nbModeValide(v));
    for (const v of [5, 0, -3, 999, 'abc']) assert.strictEqual(S.nbDocumentsValide(v), F.nbDocumentsValide(v));
});

/* ─────────────── Le contrôleur, avec une base simulée ─────────────── */
let reponses = [];
const faux = {
    promise: () => ({
        query: async (sql, p) => {
            if (/information_schema/.test(sql)) return [[{ 1: 1 }]]; // toutes les colonnes 203/188/084 présentes
            const r = reponses.find(([m]) => m.test(sql));
            return r ? (typeof r[1] === 'function' ? r[1](sql, p) : r[1]) : [[]];
        },
    }),
    query: (sql, p, cb) => { const f = typeof p === 'function' ? p : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const remise = require('../controllers/remise.controller.js');

async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; }, set() { return this; }, send(b) { corps = b; return this; } };
    const err = console.error; console.error = () => {};
    try { await fn({ params: {}, body: {}, user: {}, ...req }, res); } finally { console.error = err; }
    return { code, corps };
}
const STAG = { id: 'u1', organization_id: 'o1', role: 'STAGIAIRE' };

test('accuser : un type REQUIS refuse tant qu\'il manque des documents, puis accepte', async () => {
    const ligne = (n) => [[/FROM remise_document r/, [[{ id: 'r1', statut: 'REMISE', user_id: 'u1', company_id: null,
        representant: null, destinataire: 'STAGIAIRE', nb_documents: 3, nb_mode: 'REQUIS', n }]]]];
    reponses = ligne(1);
    const trop = await appeler(remise.accuser, { params: { id: 'r1' }, user: STAG });
    assert.strictEqual(trop.code, 422, JSON.stringify(trop.corps));
    assert.match(trop.corps.message, /3 pièce|attend/);

    reponses = [...ligne(3), [/UPDATE remise_document SET statut = 'RECUE'/, [[]]]];
    const ok = await appeler(remise.accuser, { params: { id: 'r1' }, user: STAG });
    assert.strictEqual(ok.code, 200, JSON.stringify(ok.corps));
});

test('accuser : un PLAFOND n\'exige rien — un seul fichier suffit', async () => {
    reponses = [[/FROM remise_document r/, [[{ id: 'r1', statut: 'REMISE', user_id: 'u1', company_id: null,
        representant: null, destinataire: 'STAGIAIRE', nb_documents: 5, nb_mode: 'PLAFOND', n: 1 }]]],
        [/UPDATE remise_document SET statut = 'RECUE'/, [[]]]];
    const ok = await appeler(remise.accuser, { params: { id: 'r1' }, user: STAG });
    assert.strictEqual(ok.code, 200, JSON.stringify(ok.corps));
});

test('le câblage : plafond au dépôt AVANT l\'écriture, requis à l\'accusé, garde 503, écran', () => {
    const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers/remise.controller.js'), 'utf8');
    // Le plafond est vérifié AVANT l'upsert (sinon un refus effacerait l'accusé).
    const iCap = CTRL.indexOf('plafondAtteint(dejad.n');
    const iUpsert = CTRL.indexOf('INSERT INTO remise_document (id, organization_id, enrollment_id');
    assert.ok(iCap > 0 && iUpsert > iCap, 'le plafond se vérifie avant d\'écrire la remise');
    assert.match(CTRL, /manquePourRequis\(\{ nb_mode: r\.nb_mode, nb_documents: r\.nb_documents, nb_fichiers: r\.n \}\) > 0/);
    assert.match(CTRL, /if \(c\.nb_documents > 0 && !avecNb\) return res\.status\(503\)\.json\(MIGRATION_203\)/);

    const UI = (p) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', p), 'utf8');
    const rt = UI('components/RemiseTypes.jsx');
    assert.match(rt, /nb_documents:/);
    assert.match(rt, /name="nb_mode"/);
    assert.match(UI('components/RemisesReview.jsx'), /plafondAtteint\(fichiers\.length, r\.nb_documents\)/);
    assert.match(UI('pages/StudentFormationDetail.jsx'), /manquePourRequis\(\{ nb_mode: e\.r\.nb_mode/);
});
