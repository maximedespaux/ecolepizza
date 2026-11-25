/**
 * REDEMANDER UNE SIGNATURE DE STAGIAIRE RATÉE (blanche) — demandé par l'école le 2026-11-25.
 *
 * Une signature de stagiaire ne se remplaçait plus (décidé le 2026-09-26, contre la falsification :
 * `rattraperPresence` refuse 409 une demi-journée déjà signée). EXCEPTION assumée : un pad validé À
 * VIDE n'est pas une signature. `resignPresence` ÉCRASE alors l'image (le stagiaire resigne sur le
 * poste), mais SEULEMENT là où il y en avait une — sinon c'est le rattrapage, pas une resignature.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · on ne resigne QUE par-dessus une signature existante (409 sans signature) — la garde est
 *     l'inverse exact de celle du rattrapage, pour ne pas en faire un second chemin de rattrapage ;
 *   · l'UPDATE porte le garde-fou `signature_data IS NOT NULL` (course : deux resignatures) et ne
 *     touche AUCUNE colonne de la migration 184 (`rattrapage_*`) — d'où : aucune migration, et un
 *     motif de rattrapage éventuel survit ;
 *   · une image invalide est refusée (422), comme partout où une signature s'écrit (XSS stocké) ;
 *   · le geste est tracé (`attendance.resign`), c'est la trace qui tient lieu de garde-fou.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* ── Base simulée, commune au fichier (même procédé que emargement-feuille.test.js) ─────────────── */
let repondre = () => [[]];
let ecritures = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (/^(UPDATE|DELETE|INSERT)/.test(q)) ecritures.push([q, params]);
            return repondre(q, params);
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { resignPresence } = require('../controllers/attendance.controller.js');

const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

// Un data-URL image valide (motif ancré de lib/signatures.js).
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

async function resign({ signee = 1, trouve = true, body = { signature_data: IMG } } = {}) {
    repondre = (q) => {
        if (q.includes('FROM attendance_record r JOIN attendance_sheet s ON s.id = r.sheet_id JOIN training_session ts')) {
            return trouve
                ? [[{ id: 'r1', learner_id: 'l1', signee, session_id: 's1', first_name: 'Camille', last_name: 'BERGER' }]]
                : [[]];
        }
        if (q.startsWith('UPDATE attendance_record')) return [{ affectedRows: 1 }];
        return [[]]; // enrollment (pas de regen), audit, …
    };
    ecritures = [];
    let code = 200; let json = null;
    const res = { status(c) { code = c; return this; }, json(b) { json = b; return this; } };
    await resignPresence({ user: { id: 'u9', organization_id: 'org1', first_name: 'Jean-Jacques', last_name: 'DESPAUX' }, params: { id: 'r1' }, body, headers: {}, ip: '127.0.0.1' }, res);
    return { code, json };
}

test('RESIGNER : écrase l\'image par-dessus une signature existante, au nom du stagiaire', async () => {
    const r = await resign();
    assert.strictEqual(r.code, 200);
    const maj = ecritures.find(([q]) => q.startsWith('UPDATE attendance_record'));
    assert.ok(maj, 'un UPDATE attendance_record est attendu');
    // Le garde-fou de course : on n'écrase que si la signature existe encore.
    assert.match(maj[0], /WHERE id = \? AND signature_data IS NOT NULL$/);
    // Le nom redevient celui du stagiaire ; la nouvelle image part chiffrée.
    assert.ok(maj[1].includes('BERGER Camille'), 'le nom du stagiaire est écrit');
    assert.ok(maj[1].some((p) => typeof p === 'string' && p.startsWith('enc:')), 'la signature est chiffrée au repos');
});

test('RESIGNER : jamais une colonne de rattrapage — aucune migration, le motif éventuel survit', async () => {
    await resign();
    const maj = ecritures.find(([q]) => q.startsWith('UPDATE attendance_record'));
    assert.doesNotMatch(maj[0], /rattrapage_/, 'la resignature ne touche pas aux colonnes de la 184');
});

test('RESIGNER : refusé s\'il n\'y a pas de signature à refaire (409), rien n\'est écrit', async () => {
    const r = await resign({ signee: 0 });
    assert.strictEqual(r.code, 409);
    assert.match(r.json.message, /pas de signature/i);
    assert.strictEqual(ecritures.filter(([q]) => q.startsWith('UPDATE')).length, 0);
});

test('RESIGNER : image invalide refusée (422), avant toute lecture', async () => {
    for (const body of [{}, { signature_data: 'data:image/png;base64,AA"><img src=x>' }, { signature_data: 'coucou' }]) {
        const r = await resign({ body });
        assert.strictEqual(r.code, 422, `attendu 422 pour ${JSON.stringify(body)}`);
        assert.deepStrictEqual(ecritures, [], 'rien ne doit être écrit');
    }
});

test('RESIGNER : présence d\'un autre organisme introuvable (404)', async () => {
    const r = await resign({ trouve: false });
    assert.strictEqual(r.code, 404);
    assert.strictEqual(ecritures.filter(([q]) => q.startsWith('UPDATE')).length, 0);
});

test('la route est câblée, derrière l\'authentification', () => {
    const routes = lire('routes/attendance.routes.js');
    assert.match(routes, /router\.post\('\/record\/:id\/resign', authenticateToken, resignPresence\);/);
});

test('le journal d\'audit nomme la resignature', () => {
    assert.match(lireUi('lib/auditLabels.js'), /'attendance\.resign':/);
});

test('l\'écran ne propose QUE des demi-journées déjà signées, et câble le bouton', () => {
    const modal = lireUi('components/RedemanderSignatureModal.jsx');
    // Les candidates sont filtrées sur has_signature : on ne « redemande » que ce qui existe.
    assert.match(modal, /byKey\[`\$\{l\.id\}\|\$\{s\.id\}`\]\?\.has_signature/);
    assert.match(modal, /resignEmargement/);
    const emarg = lireUi('components/Emargement.jsx');
    assert.match(emarg, /aDesSignatures/);
    assert.match(emarg, /Redemander une signature/);
    assert.match(emarg, /<RedemanderSignatureModal/);
});
