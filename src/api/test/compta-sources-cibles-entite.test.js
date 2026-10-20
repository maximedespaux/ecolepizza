/**
 * GESTION PAR ENTITÉ ÉMETTRICE (migration 212) — demandé le 2026-10-20 : « dans Paramètres →
 * Facturation, des paramètres par entité que lit la Comptabilité selon ce qui est sélectionné. »
 *
 * Deux choses par entité : les SOURCES de CA qu'elle a (une boutique ne fait que du matériel → ses
 * autres sources sont MASQUÉES sur la Comptabilité, sauf montant réel), et des CIBLES propres
 * (budgets de dépenses + dividende), à défaut les cibles globales de l'organisme.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
    streamsDeLentite, streamsAMontrer, ciblesDeLentite, ciblesPourBase, DEFAULT_DIVIDENDE_CIBLE,
} = require('../lib/compta.js');

// ── Les règles pures (lib/compta.js) ────────────────────────────────────────────────────────────
test('streamsDeLentite : trois sources par défaut (row nul, colonnes absentes, valeur NULL)', () => {
    const tout = { inscriptions: true, materiel: true, divers: true };
    assert.deepStrictEqual(streamsDeLentite(null), tout, '« Toutes » / serveur ancien');
    assert.deepStrictEqual(streamsDeLentite({}), tout, 'colonnes absentes (212 non jouée)');
    assert.deepStrictEqual(streamsDeLentite({ revenue_inscriptions: null, revenue_materiel: null, revenue_divers: null }), tout, 'NULL = non restreint');
    assert.deepStrictEqual(
        streamsDeLentite({ revenue_inscriptions: 0, revenue_materiel: 1, revenue_divers: 0 }),
        { inscriptions: false, materiel: true, divers: false }, 'une boutique : matériel seul');
});

test('streamsAMontrer : on masque une source non déclarée, JAMAIS si elle porte un montant réel', () => {
    const boutique = { inscriptions: false, materiel: true, divers: false };
    assert.deepStrictEqual(
        streamsAMontrer(boutique, { inscriptions: 0, materiel: 58, divers: 0 }),
        { inscriptions: false, materiel: true, divers: false });
    assert.strictEqual(
        streamsAMontrer(boutique, { inscriptions: 12, materiel: 58, divers: 0 }).inscriptions, true,
        'garde-fou : de l\'argent réel ne se cache pas');
    assert.deepStrictEqual(streamsAMontrer(null, {}), { inscriptions: true, materiel: true, divers: true }, 'pas de streams → tout');
});

test('ciblesDeLentite : null tant que l\'entité n\'a rien ; sinon ses targets + dividende', () => {
    assert.strictEqual(ciblesDeLentite(null), null);
    assert.strictEqual(ciblesDeLentite({ compta_targets: null, compta_dividende: null }), null);
    const c = ciblesDeLentite({ compta_targets: JSON.stringify({ LOYER: 15 }), compta_dividende: '12.50' });
    assert.deepStrictEqual(c.targets, { LOYER: 15 });
    assert.strictEqual(c.dividende, 12.5);
    assert.deepStrictEqual(ciblesDeLentite({ compta_targets: 'pas du json', compta_dividende: 8 }),
        { targets: null, dividende: 8 }, 'JSON illisible → targets null, le dividende compte');
});

test('ciblesPourBase : tout-ou-rien ; jeu COMPLET quand actif, (null,null) sinon', () => {
    assert.deepStrictEqual(ciblesPourBase(false, { LOYER: 15 }, 12), { targets: null, dividende: null });
    const r = ciblesPourBase(true, { LOYER: '15' }, '12,5'); // tapés en français
    assert.strictEqual(r.dividende, 12.5);
    const t = JSON.parse(r.targets);
    assert.strictEqual(t.LOYER, 15);
    assert.ok('MATIERES_PREMIERES' in t, 'les défauts comblent les postes non saisis');
    assert.strictEqual(ciblesPourBase(true, {}, 'illisible').dividende, DEFAULT_DIVIDENDE_CIBLE, 'dividende illisible → défaut');
});

// ── L'ENREGISTREMENT (billingProfile.controller) — écrit les colonnes 212 quand elles existent ────
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();
let migration212, dernier, journal;
async function requete(sql, params) {
    const q = plat(sql);
    if (/information_schema\.columns/.test(q)) {
        const present = migration212 && ['revenue_inscriptions', 'revenue_materiel', 'revenue_divers', 'compta_targets', 'compta_dividende'].includes(params[1]);
        return [present ? [{ x: 1 }] : []];
    }
    if (/^SELECT COUNT\(\*\) AS n FROM billing_profile/.test(q)) return [[{ n: 1 }]]; // pas la 1re → is_default 0
    if (/^INSERT INTO billing_profile/.test(q)) { dernier = { q, params }; return [{ insertId: 1 }]; }
    if (/^UPDATE billing_profile SET/.test(q)) { dernier = { q, params }; return [{ affectedRows: 1 }]; }
    return [[]];
}
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: requete }),
    query: (sql, params, cb) => { journal = journal || []; journal.push(plat(sql)); const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };
const entites = require('../controllers/billingProfile.controller.js');

function rep() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    return res;
}
const BOUTIQUE = {
    legal_name: 'Barousse Trad.', label: 'Boutique',
    revenue_inscriptions: 0, revenue_materiel: 1, revenue_divers: 0,
    cibles_actives: true, compta_targets: { LOYER: '15' }, compta_dividende: '12,5',
};

test('CRÉER une entité avec la 212 : l\'INSERT porte les sources et les cibles, normalisées', async () => {
    migration212 = true; dernier = null;
    const res = rep();
    await entites.create({ user: { organization_id: 'o1', id: 'u1' }, body: { ...BOUTIQUE } }, res);
    assert.strictEqual(res.code, 201, JSON.stringify(res.corps));
    assert.match(dernier.q, /revenue_inscriptions, revenue_materiel, revenue_divers, compta_targets, compta_dividende/);
    // Sources : 0 / 1 / 0. Cibles : JSON complet (LOYER 15) + dividende 12,5 lu en français.
    assert.ok(dernier.params.includes(0) && dernier.params.includes(1), 'les drapeaux 0/1 sont écrits');
    const targetsJson = dernier.params.find((p) => typeof p === 'string' && /"LOYER":15/.test(p));
    assert.ok(targetsJson && /MATIERES_PREMIERES/.test(targetsJson), 'cibles en JSON complet');
    assert.ok(dernier.params.includes(12.5), 'dividende 12,5 → 12.5');
});

test('CRÉER sans la 212 : l\'INSERT IGNORE les colonnes de gestion (rien ne casse)', async () => {
    migration212 = false; dernier = null;
    const res = rep();
    await entites.create({ user: { organization_id: 'o1', id: 'u1' }, body: { ...BOUTIQUE } }, res);
    assert.strictEqual(res.code, 201, JSON.stringify(res.corps));
    assert.doesNotMatch(dernier.q, /revenue_inscriptions|compta_targets|compta_dividende/, 'colonnes absentes → non écrites');
});

test('METTRE À JOUR en décochant « cibles propres » : targets et dividende repassent à NULL', async () => {
    migration212 = true; dernier = null;
    const res = rep();
    await entites.update(
        { user: { organization_id: 'o1', id: 'u1' }, params: { id: 'e1' }, body: { ...BOUTIQUE, cibles_actives: false } }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    // Les deux dernières colonnes 212 de l'UPDATE sont compta_targets puis compta_dividende : null, null.
    assert.match(dernier.q, /compta_targets = \?, compta_dividende = \?/);
    // Params : [...CHAMPS, revenue_*×3, compta_targets, compta_dividende, id, organization_id].
    assert.strictEqual(dernier.params[dernier.params.length - 3], null, 'compta_dividende null');
    assert.strictEqual(dernier.params[dernier.params.length - 4], null, 'compta_targets null');
});

// ── LA COMPTABILITÉ lit ces paramètres (contrat de source) ────────────────────────────────────────
test('comptabilite.controller : cibles EFFECTIVES par entité + sources renvoyées à l\'écran', () => {
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'comptabilite.controller.js'), 'utf8');
    assert.match(ctrl, /gestionDeLentite/, 'helper qui lit streams + cibles de l\'entité');
    assert.match(ctrl, /const cible = targetsEff\[cat\]/, 'les postes se comparent aux cibles EFFECTIVES');
    assert.match(ctrl, /const dividendeCible = dividendeEff/, 'le dividende suit l\'entité');
    assert.match(ctrl, /streams: gestionEntite\.streams/, 'les sources déclarées partent à l\'écran');
});
