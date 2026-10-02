/**
 * STATISTIQUES DE CONNEXION (Qualité & conformité) — demandé le 2026-10-02.
 *
 * Deux vues, stagiaires et équipe séparés : la RÉCENCE depuis la dernière connexion (user.last_login_at,
 * dispo tout de suite) et les CONNEXIONS PAR JOUR sur deux semaines (connexion_jour, migration 200 —
 * `last_login_at` ne gardant que la dernière, la courbe se construit à partir du déploiement).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { trancheDe, repartition, connectesDepuis, fenetreJours, densifier, TRANCHES } = require('../lib/statsConnexions.js');

test('trancheDe range la dernière connexion dans la bonne tranche (disjointes)', () => {
    const now = new Date('2026-10-02T12:00:00');
    assert.strictEqual(trancheDe(null, now), 'jamais');
    assert.strictEqual(trancheDe(new Date(+now - 2 * 3600e3), now), 'j1', 'il y a 2 h');
    assert.strictEqual(trancheDe(new Date(+now - 3 * 24 * 3600e3), now), 'j7');
    assert.strictEqual(trancheDe(new Date(+now - 20 * 24 * 3600e3), now), 'j30');
    assert.strictEqual(trancheDe(new Date(+now - 60 * 24 * 3600e3), now), 'j90');
    assert.strictEqual(trancheDe(new Date(+now - 200 * 24 * 3600e3), now), 'vieux');
    assert.deepStrictEqual(TRANCHES.map((t) => t.cle), ['j1', 'j7', 'j30', 'j90', 'vieux', 'jamais']);
});

test('repartition compte par tranche ; connectesDepuis compte une fenêtre', () => {
    const now = new Date('2026-10-02T12:00:00');
    const comptes = [
        { last_login_at: new Date(+now - 2 * 3600e3) },     // j1
        { last_login_at: new Date(+now - 2 * 24 * 3600e3) }, // j7
        { last_login_at: new Date(+now - 40 * 24 * 3600e3) },// j90
        { last_login_at: null },                             // jamais
    ];
    const r = repartition(comptes, now);
    assert.deepStrictEqual([r.j1, r.j7, r.j90, r.jamais], [1, 1, 1, 1]);
    assert.strictEqual(r.j30, 0);
    assert.strictEqual(connectesDepuis(comptes, 30, now), 2, 'j1 + j7 sont dans les 30 jours');
});

test('fenetreJours rend N jours denses jusqu’à aujourd’hui ; densifier comble les trous', () => {
    const now = new Date('2026-10-02T12:00:00');
    const jours = fenetreJours(14, now);
    assert.strictEqual(jours.length, 14);
    assert.strictEqual(jours[13], '2026-10-02', 'le dernier est aujourd’hui');
    assert.strictEqual(jours[0], '2026-09-19', 'le premier, 13 jours avant');
    const dense = densifier([{ jour: '2026-10-02', stagiaires: 3, equipe: 1 }], 14, now);
    assert.strictEqual(dense.length, 14);
    assert.deepStrictEqual(dense[13], { jour: '2026-10-02', stagiaires: 3, equipe: 1 });
    assert.deepStrictEqual(dense[0], { jour: '2026-09-19', stagiaires: 0, equipe: 0 }, 'jour sans connexion = 0');
});

/* ── Le câblage, lu au source ──────────────────────────────────────────────────────────────── */
const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(f, 'utf8');

test('le contrôleur sépare stagiaires/équipe, et tolère l’absence de la table', () => {
    const c = lire(path.join(API, 'controllers/statistiques.controller.js'));
    assert.match(c, /c\.role === 'STAGIAIRE'/);
    assert.match(c, /c\.role !== 'STAGIAIRE'/);
    assert.match(c, /ER_NO_SUCH_TABLE/, 'sans la table connexion_jour, pas de courbe (par_jour = null)');
    assert.match(c, /stats\.repartition|require\('\.\.\/lib\/statsConnexions\.js'\)/);
    const routes = lire(path.join(API, 'routes/statistiques.routes.js'));
    assert.match(routes, /authorizeRoles\('SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'AUDITEUR'\)/, 'même lecture que le Suivi/l’audit');
});

test('chaque connexion est comptée pour le jour, et la route/nav sont en place', () => {
    const auth = lire(path.join(API, 'controllers/auth.controller.js'));
    assert.match(auth, /INSERT IGNORE INTO connexion_jour \(user_id, jour, organization_id, est_stagiaire\) VALUES \(\?, CURDATE\(\), \?, \?\)/);
    const srv = lire(path.join(API, 'server.js'));
    assert.match(srv, /app\.use\('\/api\/statistiques', statistiquesRoutes\)/);
    const nav = lire(path.join(UI, 'lib/nav.js'));
    assert.match(nav, /to: "\/statistiques", ic: "bar-chart", label: "Statistiques", roles: AUDIT/);
    const main = lire(path.join(UI, 'main.jsx'));
    assert.match(main, /path="statistiques" element=\{<Guard nav="\/statistiques" roles=\{SUIVI\}><Statistiques \/><\/Guard>\}/);
});
