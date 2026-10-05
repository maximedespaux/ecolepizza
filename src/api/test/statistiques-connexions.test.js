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
const { trancheDe, repartition, connectesDepuis, fenetreJours, densifier, TRANCHES, FENETRES, pondererFormations, relancer } = require('../lib/statsConnexions.js');

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

/* ── Enrichissements du 2026-10-04 : détail par formation, résumé, assidus, à relancer, fenêtre ── */

test('pondererFormations : un stagiaire multi-formations compte 50/50, et la somme = stagiaires du jour', () => {
    const stag = new Map([['2026-10-03', 3]]); // 3 stagiaires distincts connectés ce jour
    const rows = [
        { jour: '2026-10-03', uid: 'u1', key: 'p1', label: 'NIV1' },
        { jour: '2026-10-03', uid: 'u1', key: 'p2', label: 'NIV2' }, // u1 dans 2 formations → 0,5 chacune
        { jour: '2026-10-03', uid: 'u2', key: 'p2', label: 'NIV2' }, // u2 dans NIV2 seul → 1
        // u3 connecté sans aucune formation → « Sans formation » = 1 (3 − 2 avec formation)
    ];
    const { parJour, cles } = pondererFormations(rows, stag);
    const liste = parJour.get('2026-10-03');
    const n = Object.fromEntries(liste.map((f) => [f.key, f.n]));
    assert.strictEqual(n.p1, 0.5, 'NIV1 : la moitié de u1');
    assert.strictEqual(n.p2, 1.5, 'NIV2 : la moitié de u1 + u2');
    assert.strictEqual(n.__autre, 1, 'u3, sans formation');
    assert.strictEqual(liste.reduce((s, f) => s + f.n, 0), 3, 'la somme des parts = les stagiaires du jour');
    // Ordre global : NIV2 (1,5) avant NIV1 (0,5), « Sans formation » en dernier.
    assert.deepStrictEqual(cles.map((c) => c.key), ['p2', 'p1', '__autre']);
    assert.strictEqual(cles[0].label, 'NIV2');
});

test('relancer : noms des JAMAIS connectés et des +30 jours, triés ; les récents sont exclus', () => {
    const now = new Date('2026-10-04T12:00:00');
    const comptes = [
        { nom: 'Zoe', last_login_at: null },                              // jamais
        { nom: 'Alice', last_login_at: null },                            // jamais
        { nom: 'Bob', last_login_at: new Date(+now - 40 * 24 * 3600e3) }, // j90 (>30)
        { nom: 'Carl', last_login_at: new Date(+now - 200 * 24 * 3600e3) },// vieux (>30)
        { nom: 'Dan', last_login_at: new Date(+now - 10 * 24 * 3600e3) }, // j30 (<30) → exclu
    ];
    const r = relancer(comptes, now);
    assert.deepStrictEqual(r.jamais, ['Alice', 'Zoe'], 'triés');
    assert.deepStrictEqual(r.anciens, ['Bob', 'Carl'], 'plus de 30 jours, pas les récents');
});

test('FENETRES propose 7 / 14 / 30, défaut 14', () => {
    assert.deepStrictEqual(FENETRES, [7, 14, 30]);
});

test('le contrôleur enrichit : fenêtre réglable, détail par formation, résumé, assidus, à relancer', () => {
    const c = lire(path.join(API, 'controllers/statistiques.controller.js'));
    // Fenêtre réglable, bornée aux valeurs proposées.
    assert.match(c, /Number\(req\.query\.jours\)/);
    assert.match(c, /if \(!stats\.FENETRES\.includes\(fenetre\)\) fenetre = FENETRE_DEFAUT/);
    // Détail PAR FORMATION (stagiaires) PONDÉRÉ : lignes brutes (jour, stagiaire, formation).
    assert.match(c, /JOIN training_program p ON p\.id = s\.program_id/);
    assert.match(c, /p\.id AS pkey/);
    assert.match(c, /stats\.pondererFormations/);
    assert.match(c, /formations_cle: formationsCle/, 'l\'ordre global des formations part à l\'écran (couleurs + légende)');
    // Résumé (personnes distinctes) + assidus (plus de jours) + à relancer.
    assert.match(c, /COUNT\(DISTINCT user_id\) AS n\s+FROM connexion_jour/);
    assert.match(c, /ORDER BY jours DESC, nom ASC\s+LIMIT 8/);
    assert.match(c, /relancer: stats\.relancer\(stagiaires, maintenant\)/);
});

test('la page : courbe AVANT la récence, survol par formation, résumé, assidus, à relancer, fenêtre', () => {
    const p = lire(path.join(UI, 'pages/Statistiques.jsx'));
    // La courbe « Connexions des N derniers jours » passe AVANT « Depuis la dernière connexion ».
    assert.ok(p.indexOf('Connexions des {fenetre} derniers jours') < p.indexOf('Depuis la dernière connexion'),
        'la récence est désormais SOUS la courbe');
    // Survol : badges par formation COLORÉS (la couleur de chaque formation), nombres stagiaires / équipe.
    assert.match(p, /className="stat-badge"/);
    assert.match(p, /j\.formations && j\.formations\.length > 0/);
    // La part stagiaire de la barre est colorée PAR FORMATION, avec les couleurs EXISTANTES de l'app.
    assert.match(p, /from "\.\.\/lib\/levels\.js"/, 'les couleurs viennent de la source unique (badges/sessions/carte)');
    assert.match(p, /colorForLevel\(lbl\.get\(key\) \|\| key\)/);
    assert.match(p, /couleursFormations/);
    assert.match(p, /<LegendeFormations cles=\{d\.formations_cle\} couleur=\{couleur\}/);
    assert.match(p, /fill=\{couleur\(f\.key\)\}/, 'chaque segment de formation à sa couleur');
    // Les quatre enrichissements.
    assert.match(p, /<Resume /);
    assert.match(p, /<Assidus /);
    assert.match(p, /<Relancer r=\{d\.stagiaires\.relancer\}/);
    assert.match(p, /<Fenetre valeur=\{fenetre\}/);
    // Le sélecteur refait la requête avec la fenêtre choisie.
    assert.match(p, /getStatistiquesConnexions\(fenetre\)/);
    const api = lire(path.join(UI, 'api/apiClient.js'));
    assert.match(api, /\/statistiques\/connexions\$\{jours \? `\?jours=\$\{jours\}` : ""\}/);
});

test('la récence est colorée PAR FORMATION, comme la courbe (serveur + écran)', () => {
    const c = lire(path.join(API, 'controllers/statistiques.controller.js'));
    // Le serveur RÉUTILISE pondererFormations, la TRANCHE jouant le rôle du « jour ». Lu sur
    // enrollment (pas connexion_jour) → disponible même sans la migration 200.
    assert.match(c, /jour: stats\.trancheDe\(r\.last_login_at, maintenant\)/, 'la tranche joue le rôle du jour');
    assert.match(c, /FROM user u[\s\S]*?JOIN enrollment e[\s\S]*?JOIN training_program p/, 'récence formations lue sur enrollment');
    assert.match(c, /recence_formations: recenceFormations/);
    // Une formation vue SEULEMENT en récence s'unifie à formations_cle (mêmes couleurs, même légende).
    assert.match(c, /for \(const c of pr\.cles\)/);
    // L'écran : la barre stagiaire de la récence est colorée par formation (segments empilés).
    const p = lire(path.join(UI, 'pages/Statistiques.jsx'));
    assert.match(p, /function Recence\(\{ d, couleur \}\)/, 'Recence reçoit le résolveur de couleurs');
    assert.match(p, /d\.stagiaires\.recence_formations/);
    assert.match(p, /<Recence d=\{d\} couleur=\{couleur\}/);
    assert.match(p, /f\.key === "__autre" \? UNKNOWN_COLOR : couleur\(f\.key\)/, 'chaque segment à la couleur de sa formation');
});

test('récence par formation : pondererFormations marche avec la TRANCHE comme clé (50/50)', () => {
    // Deux stagiaires « Aujourd'hui » : l'un en NIV1, l'autre en NIV1+NIV2 → NIV1 1,5 / NIV2 0,5.
    const rows = [
        { jour: 'j1', uid: 'a', key: 'niv1', label: 'NIV1' },
        { jour: 'j1', uid: 'b', key: 'niv1', label: 'NIV1' },
        { jour: 'j1', uid: 'b', key: 'niv2', label: 'NIV2' },
    ];
    const { parJour } = pondererFormations(rows, new Map([['j1', 2]]));
    const seg = parJour.get('j1');
    assert.equal(seg.find((s) => s.key === 'niv1').n, 1.5);
    assert.equal(seg.find((s) => s.key === 'niv2').n, 0.5);
    assert.ok(Math.abs(seg.reduce((a, s) => a + s.n, 0) - 2) < 1e-9, 'la somme des parts = les stagiaires distincts de la tranche');
});

test('la légende de la récence et les pastilles des assidus suivent la FORMATION (2026-10-05)', () => {
    const c = lire(path.join(API, 'controllers/statistiques.controller.js'));
    // Le serveur rattache à chaque assidu stagiaire SES formations (depuis les mêmes lignes récence).
    assert.match(c, /cj\.user_id AS uid/, 'l\'assidu porte son uid pour rattacher ses formations');
    assert.match(c, /formations: a\.stagiaire \?/, 'un assidu stagiaire reçoit ses formations ; l\'équipe non');
    const p = lire(path.join(UI, 'pages/Statistiques.jsx'));
    // La pastille d'un assidu stagiaire prend la couleur de sa formation (camembert si plusieurs).
    assert.match(p, /function Assidus\(\{ assidus, couleur \}\)/);
    assert.match(p, /conic-gradient/, 'multi-formations : camembert à parts égales');
    assert.match(p, /<Assidus assidus=\{d\.assidus\} couleur=\{couleur\}/);
    // L'ancienne légende « Stagiaires / Équipe » est retirée ; la récence porte celle des FORMATIONS.
    assert.doesNotMatch(p, /function Legende\(\)/, 'plus de légende « Stagiaires / Équipe »');
    const recCard = p.slice(p.indexOf('Depuis la dernière connexion'));
    assert.match(recCard, /<LegendeFormations cles=\{d\.formations_cle\} couleur=\{couleur\}/, 'récence : légende des formations');
});
