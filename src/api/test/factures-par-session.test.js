/**
 * FACTURER LES STAGIAIRES D'UNE SESSION — demandé par l'école le 2026-09-30 : « dans la
 * facturation, retravailler Dossiers / lignes facturées pour sélectionner les stagiaires qui sont
 * dans la session ».
 *
 * LE DÉFAUT : chaque ligne se rattachait à un dossier par une liste déroulante de TOUS les dossiers
 * de l'organisme (« NOM Prénom, RS7404 », à la file). Pour facturer une session, il fallait les
 * retrouver un à un ; et rien ne disait lesquels étaient déjà facturés. Or depuis la veille, un
 * stagiaire ne compte en Comptabilité que si une facture le désigne : en oublier un le laisse
 * dehors, en reprendre un le fait payer deux fois.
 *
 * CE QUI EST GARDÉ ICI : l'écran choisit une SEMAINE (le sélecteur partagé), puis coche les
 * stagiaires de ses sessions ; chaque case cochée est une ligne ; « Facturé : … » vient de la MÊME
 * règle que la Comptabilité (lib/inscriptionsFacturees.js).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ORG = '11111111-1111-4111-8111-111111111111';

// ── Fausse base ──────────────────────────────────────────────────────────────────────────────────
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();
let lignes = [];
let requetes = [];
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: async (sql, params) => { requetes.push({ q: plat(sql), params }); return [lignes]; } }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };
const factures = require('../controllers/invoice.controller.js');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (base, rel) => fs.readFileSync(path.join(base, rel), 'utf8');

/* Deux sessions la même semaine (S38), rendues par date décroissante, comme la requête les trie. */
const LIGNES = [
    { session_id: 's-niv1', year: 2026, week: 38, program_code: 'NIV1', program_title: 'Pizzaiolo niveau 1', debut: '2026-09-16', fin: '2026-09-18',
        enrollment_id: 'e3', learner_id: 'l3', last_name: 'PETIT', first_name: 'Paul', company_id: null, company_name: null,
        prix_dossier: null, tarif: '890.00', factures: null, brouillons: 'F-2026-0031' },
    { session_id: 's-rs', year: 2026, week: 38, program_code: 'RS7404', program_title: 'Hygiène', debut: '2026-09-14', fin: '2026-09-18',
        enrollment_id: 'e1', learner_id: 'l1', last_name: 'DUPONT', first_name: 'Jean', company_id: 'c1', company_name: 'LA CUISINE DE JULIEN',
        prix_dossier: '1200.00', tarif: '1500.00', factures: 'F-2026-0012', brouillons: null },
    { session_id: 's-rs', year: 2026, week: 38, program_code: 'RS7404', program_title: 'Hygiène', debut: '2026-09-14', fin: '2026-09-18',
        enrollment_id: 'e2', learner_id: 'l2', last_name: 'MARTIN', first_name: 'Léa', company_id: 'c1', company_name: 'LA CUISINE DE JULIEN',
        prix_dossier: '0.00', tarif: '1500.00', factures: null, brouillons: null },
];

async function sessions() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    lignes = LIGNES; requetes = [];
    await factures.sessionsAFacturer({ user: { organization_id: ORG } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    return res.corps.data;
}

test('LES SESSIONS ET LEURS STAGIAIRES : regroupés, dans l\'ordre du serveur, avec ce qu\'ils coûtent', async () => {
    const d = await sessions();
    assert.deepStrictEqual(d.map((s) => [s.id, s.program_code, s.inscrits]), [['s-niv1', 'NIV1', 1], ['s-rs', 'RS7404', 2]],
        'la plus récente d\'abord : SelecteurSemaine compte sur cet ordre');
    // `inscrits` est un NOMBRE : le sélecteur lit `inscrits ?? stagiaires`, et une liste n'en est pas un.
    assert.strictEqual(typeof d[1].inscrits, 'number');
    const [dupont, martin] = d[1].dossiers;
    assert.deepStrictEqual([dupont.montant, dupont.source], [1200, 'dossier'], 'le prix du dossier d\'abord');
    assert.deepStrictEqual([martin.montant, martin.source], [1500, 'formation'], 'à 0, le tarif — la règle des documents');
    assert.strictEqual(dupont.factures, 'F-2026-0012');
    assert.strictEqual(dupont.entreprise, 'LA CUISINE DE JULIEN');
    assert.strictEqual(d[0].dossiers[0].brouillons, 'F-2026-0031');
});

test('LA REQUÊTE : l\'organisme partout, pas de session annulée, « facturé » selon la règle de la Comptabilité', async () => {
    await sessions();
    const { q, params } = requetes[0];
    assert.deepStrictEqual(params, [ORG]);
    assert.match(q, /WHERE e\.organization_id = \? AND s\.status <> 'ANNULEE'/);
    assert.match(q, /LEFT JOIN company c ON c\.id = e\.company_id AND c\.organization_id = e\.organization_id/,
        'le nom d\'une entreprise ne se lit que dans l\'organisme');
    assert.match(q, /ORDER BY debut DESC/);
    // Émises pour « Facturé », brouillons à part — la même fabrique que la Comptabilité.
    assert.match(q, /i\.status IN \('EMISE', 'PAYEE', 'IMPAYEE'\)/);
    assert.match(q, /i\.status IN \('BROUILLON'\)/);
    assert.match(q, /i\.organization_id = e\.organization_id/);
});

test('UNE SEULE RÈGLE « FACTURÉ » : ni la Comptabilité ni la Facturation n\'en gardent une copie', () => {
    for (const f of ['controllers/comptabilite.controller.js', 'controllers/invoice.controller.js']) {
        const src = lire(API, f);
        assert.match(src, /require\('\.\.\/lib\/inscriptionsFacturees\.js'\)/, `${f} doit emprunter la règle`);
        assert.doesNotMatch(src, /i\.status IN \('EMISE'/, `${f} : une copie de la règle diverge un jour, en silence`);
    }
    assert.match(lire(API, 'routes/invoice.routes.js'), /router\.get\('\/sessions', authenticateToken, sessionsAFacturer\)/);
});

test('LES CASES : cocher ajoute la ligne, décocher la retire, « Tout cocher » saute le déjà facturé', async () => {
    const L = await import(pathToFileURL(path.join(UI, 'lib', 'lignesFacture.js')).href);
    const libre = { enrollment_id: '', description: 'Frais de dossier', amount_net: '30' };
    const dupont = { enrollment_id: 'e1', montant: 1200, factures: 'F-2026-0012' };
    const martin = { enrollment_id: 'e2', montant: 1500, factures: null };
    const sansPrix = { enrollment_id: 'e9', montant: 0, factures: null };

    let lignesF = L.basculer([libre], martin);
    assert.deepStrictEqual(lignesF, [libre, { enrollment_id: 'e2', description: '', amount_net: '1500' }]);
    assert.ok(L.estCoche(lignesF, martin));
    assert.deepStrictEqual(L.basculer(lignesF, martin), [libre], 'décocher retire SA ligne, et elle seule');
    assert.strictEqual(L.ligneDuDossier(sansPrix).amount_net, '', 'pas de « 0 » à facturer : la case reste à remplir');
    assert.ok(!L.estCoche([libre], { enrollment_id: '' }), 'une ligne libre n\'est le dossier de personne');

    // Tout cocher : Martin seul — Dupont est déjà facturé, le recocher le ferait payer deux fois.
    lignesF = L.toutCocher([libre], [dupont, martin], true);
    assert.deepStrictEqual(lignesF.map((l) => l.enrollment_id), ['', 'e2']);
    assert.ok(L.toutEstCoche(lignesF, [dupont, martin]), 'tout ce qui reste à facturer est coché');
    // Coché à la main, Dupont reste possible (solde après acompte), et tout décocher le retire aussi.
    lignesF = L.basculer(lignesF, dupont);
    assert.deepStrictEqual(L.toutCocher(lignesF, [dupont, martin], false), [libre]);
    // Rien à facturer : la case « tout » n'est pas cochée pour autant.
    assert.ok(!L.toutEstCoche([], [dupont]));
    // Un stagiaire sur un BROUILLON non plus : émis, le brouillon le facturerait deux fois.
    const petit = { enrollment_id: 'e3', montant: 1500, factures: null, brouillons: 'F-2026-0031' };
    assert.deepStrictEqual(L.toutCocher([], [petit, martin], true).map((l) => l.enrollment_id), ['e2']);
});

test('L\'ÉCRAN : une semaine, ses sessions, des cases — plus la liste de tous les dossiers', () => {
    const page = lire(UI, 'pages/Factures.jsx');
    assert.match(page, /<SelecteurSemaine sessions=\{sessionsProposees\}/, 'le sélecteur partagé, comme Notation et le Pipeline');
    assert.match(page, /getSessionsAFacturer\(\)/);
    assert.doesNotMatch(page, /getEnrollments/, 'l\'avancement de TOUS les dossiers se calculait pour un menu déroulant');
    assert.doesNotMatch(page, /enrollments\.map\(/);
    assert.match(page, /onChange=\{\(\) => cocher\(d\)\}/);
    assert.match(page, /Facturé : \{d\.factures\}/, 'ce qui est déjà facturé se voit AVANT de cocher');
    assert.match(page, /lines: \[\] \}\);/, 'un document neuf n\'a pas de ligne vide à remplir');
    assert.match(page, /chargerSessions\(\); \/\/ « brouillon : … »/, 'après création, les cases disent le nouveau brouillon');
});
