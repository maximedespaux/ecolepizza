/**
 * QUI S'EST CONNECTÉ UN JOUR DONNÉ (demandé le 2026-10-09) : au CLIC sur une colonne de la courbe
 * des connexions, la liste NOMMÉE des stagiaires de ce jour-là.
 *
 * Le détail est chargé À LA DEMANDE (GET /connexions/jour?date=…), pas dans la charge utile de la
 * courbe qui porterait des noms pour 7 à 30 jours. On éprouve ici, base SIMULÉE :
 *   · une date mal formée est refusée (422) sans toucher la base ;
 *   · une date valide assemble { nom, formations } par stagiaire, formations groupées par compte ;
 *   · la requête des noms ne retient que les STAGIAIRES (est_stagiaire = 1) ;
 *   · sans stagiaire, on n'interroge pas les formations ;
 *   · sans la table connexion_jour (migration 200), la liste est vide, pas un plantage (503/500).
 * Puis le câblage (contrôleur, route, apiClient, écran) est lu au source.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ORG = 'org1';
let requetes = [];
let reponses = [];
const plat = (s) => String(s).replace(/\s+/g, ' ').trim();

const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = {
    id: cheminDb, filename: cheminDb, loaded: true, exports: {
        promise: () => ({
            query: async (sql, params) => {
                const q = plat(sql); requetes.push({ q, params });
                const r = reponses.find(([m]) => m.test(q));
                return r ? (typeof r[1] === 'function' ? r[1](q, params) : r[1]) : [[]];
            },
        }),
        query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
    },
};
const { connexionsJour } = require('../controllers/statistiques.controller.js');

const RE_NOMS = /FROM connexion_jour cj[\s\S]*est_stagiaire = 1/;
const RE_FORM = /JOIN training_program p ON p\.id = s\.program_id/;

function faireRes() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    return res;
}
async function get(date) {
    requetes = [];
    const res = faireRes();
    await connexionsJour({ user: { organization_id: ORG }, query: { date } }, res);
    return res;
}

test('DATE MAL FORMÉE : 422, et la base n\'est pas touchée', async () => {
    reponses = [];
    for (const mauvaise of ['', '2026-13', 'hier', '2026/10/09', '09-10-2026']) {
        const res = await get(mauvaise);
        assert.strictEqual(res.code, 422, `« ${mauvaise} » refusée`);
    }
    assert.strictEqual(requetes.length, 0, 'aucune requête pour une date invalide');
});

test('DATE VALIDE : assemble { nom, formations }, formations groupées par compte, ordre conservé', async () => {
    reponses = [
        [RE_NOMS, [[{ uid: 'u1', nom: 'Bob' }, { uid: 'u2', nom: 'Alice' }]]],
        [RE_FORM, [[
            { uid: 'u1', pkey: 'p1', label: 'NIV1' },
            { uid: 'u1', pkey: 'p2', label: 'NIV2' },
            { uid: 'u2', pkey: 'p1', label: 'NIV1' },
        ]]],
    ];
    const res = await get('2026-10-09');
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.corps.data.jour, '2026-10-09');
    assert.deepStrictEqual(res.corps.data.stagiaires, [
        { nom: 'Bob', formations: [{ key: 'p1', label: 'NIV1' }, { key: 'p2', label: 'NIV2' }] },
        { nom: 'Alice', formations: [{ key: 'p1', label: 'NIV1' }] },
    ], 'noms dans l\'ordre rendu par le SQL (ORDER BY nom), chacun avec SES formations');
    // La date et l'organisme partent en paramètres de la requête des noms.
    const qn = requetes.find((r) => RE_NOMS.test(r.q));
    assert.deepStrictEqual(qn.params, [ORG, '2026-10-09']);
});

test('UN STAGIAIRE SANS FORMATION garde une liste vide (pastille « stagiaire » à l\'écran)', async () => {
    reponses = [
        [RE_NOMS, [[{ uid: 'u9', nom: 'Chris' }]]],
        [RE_FORM, [[]]], // inscrit à aucune session
    ];
    const res = await get('2026-10-09');
    assert.deepStrictEqual(res.corps.data.stagiaires, [{ nom: 'Chris', formations: [] }]);
});

test('AUCUN STAGIAIRE CE JOUR-LÀ : liste vide, et on n\'interroge pas les formations', async () => {
    reponses = [[RE_NOMS, [[]]]];
    const res = await get('2026-10-09');
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.corps.data.stagiaires, []);
    assert.ok(!requetes.some((r) => RE_FORM.test(r.q)), 'pas de requête formations sans uid');
});

test('SANS LA TABLE (migration 200) : liste vide, pas de plantage', async () => {
    reponses = [[RE_NOMS, () => { const e = new Error('no table'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }]];
    const res = await get('2026-10-09');
    assert.strictEqual(res.code, 200, 'toléré');
    assert.deepStrictEqual(res.corps.data.stagiaires, []);
});

/* ── Le câblage, lu au source ──────────────────────────────────────────────────────────────── */
const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(f, 'utf8');

test('contrôleur + route : stagiaires seulement, date validée, table tolérée, rôles AUDIT', () => {
    const c = lire(path.join(API, 'controllers/statistiques.controller.js'));
    assert.match(c, /module\.exports = \{ connexions, connexionsJour \}/, 'le détail du jour est exporté');
    assert.match(c, /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(date\)/, 'la date est validée (AAAA-MM-JJ)');
    assert.match(c, /cj\.est_stagiaire = 1/, 'on ne liste que les stagiaires');
    const corps = c.slice(c.indexOf('const connexionsJour ='));
    assert.match(corps, /ER_NO_SUCH_TABLE|ER_BAD_FIELD_ERROR/, 'sans la table, liste vide (pas de plantage)');
    const routes = lire(path.join(API, 'routes/statistiques.routes.js'));
    assert.match(routes, /router\.get\('\/connexions\/jour',[\s\S]*authorizeRoles\('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'AUDITEUR'\)[\s\S]*connexionsJour\)/);
});

test('apiClient : getConnexionsJour pointe la bonne route, date échappée', () => {
    const api = lire(path.join(UI, 'api/apiClient.js'));
    assert.match(api, /export function getConnexionsJour\(date\)/);
    assert.match(api, /\/statistiques\/connexions\/jour\?date=\$\{encodeURIComponent\(date\)\}/);
});

test('écran : le clic d\'un jour charge et affiche la liste nommée', () => {
    const p = lire(path.join(UI, 'pages/Statistiques.jsx'));
    assert.match(p, /import \{ getStatistiquesConnexions, getConnexionsJour \}/, 'le chargeur est importé');
    assert.match(p, /onClick=\{\(\) => choisirJour\(d\.jour\)\}/, 'un clic sur la colonne ouvre le détail');
    assert.match(p, /getConnexionsJour\(iso\)/, 'le clic charge les noms du jour');
    assert.match(p, /if \(iso === jourSel\) \{ setJourSel\(null\)/, 're-cliquer le même jour referme');
    assert.match(p, /demandeRef/, 'garde anti-course sur les clics rapides');
    assert.match(p, /className="stat-jour"/, 'le panneau des noms');
    // La pastille colorée est PARTAGÉE avec « les plus assidus » (une seule implémentation).
    assert.match(p, /function pastilleFormations\(/, 'helper de pastille extrait au module');
    assert.match(p, /pastilleFormations\(a\.formations, couleur\)/);
});
