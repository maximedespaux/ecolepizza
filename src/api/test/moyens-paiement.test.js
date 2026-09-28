/**
 * LES MOYENS DE PAIEMENT, UNE LISTE, ET LE MODÈLE DE FACTURE DE CHACUN — demandé le 2026-09-28 :
 * « dans Facturation, choisir quel modèle de FACTURE utiliser pour les moyens de paiement, avec la
 * possibilité d'en ajouter ». Décidé le même jour : UNE liste dans Paramètres → Facturation, et le
 * moyen choisi à la caisse ou en facturant une demande PRÉ-SÉLECTIONNE son modèle, qui reste
 * modifiable ; un règlement ventilé suit sa PREMIÈRE ligne.
 *
 * LES DÉFAUTS D'AVANT. Les moyens vivaient en texte à virgules à deux endroits qui ne se parlaient
 * pas : chaque entité émettrice (lue par la caisse) et les anciens réglages boutique (lus en
 * facturant une demande, que plus aucun écran ne modifie) — un moyen ajouté sur une entité
 * n'apparaissait jamais en facturant une demande. Et le modèle se choisissait à la main à chaque
 * vente.
 *
 * Ce fichier gèle :
 *   · la reprise des moyens d'avant, réunis sans doublon, et la liste semée UNE fois ;
 *   · l'ajout (jamais avant la reprise), le renommage, le modèle (une FACTURE active, ou rien),
 *     l'ordre, et le dernier moyen qu'on ne retire pas ;
 *   · le modèle du PREMIER moyen quand aucun n'est choisi, au serveur (caisse, demandes) ;
 *   · la migration, la garde de rubrique, le journal ;
 *   · les écrans : la carte de Facturation, la caisse et la demande qui pré-sélectionnent.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const plat = (s) => s.replace(/\s+/g, ' ').trim();
/* L'égalité de la clé unique (utf8mb4_general_ci) : casse et accents confondus. */
const cleCi = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* ── Une fausse base : la table des moyens, les listes d'avant, et le journal ─────────────────── */
let b;
function base(o = {}) {
    b = {
        sansTable: false, moyens: [], entites: [], boutique: null, journal: [], requetes: [], ...o,
    };
    return b;
}
base();
const ORG = 'org-1';
const erreur = (code, msg) => Object.assign(new Error(msg || code), { code });
const trier = (l) => [...l].sort((x, y) => x.sort_order - y.sort_order || x.libelle.localeCompare(y.libelle));
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            b.requetes.push(q);
            if (/moyen_paiement/.test(q) && b.sansTable) throw erreur('ER_NO_SUCH_TABLE', "Table 'impastio.moyen_paiement' doesn't exist");
            const doublon = (libelle, sauf) => b.moyens.some((m) => m.id !== sauf && cleCi(m.libelle) === cleCi(libelle));
            if (/^SELECT payment_methods FROM billing_profile/.test(q)) {
                return [[...b.entites].sort((x, y) => y.is_default - x.is_default).map((e) => ({ payment_methods: e.payment_methods }))];
            }
            if (/^SELECT payment_methods FROM shop_settings/.test(q)) return [b.boutique == null ? [] : [{ payment_methods: b.boutique }]];
            if (/^SELECT id, libelle, template_slug, sort_order FROM moyen_paiement/.test(q)) return [trier(b.moyens)];
            if (/^INSERT IGNORE INTO moyen_paiement/.test(q)) {
                if (!doublon(p[2])) b.moyens.push({ id: p[0], libelle: p[2], template_slug: null, sort_order: p[3] });
                return [{ affectedRows: 1 }];
            }
            if (/^SELECT COALESCE\(MAX\(sort_order\), -1\) AS n FROM moyen_paiement/.test(q)) {
                return [[{ n: b.moyens.length ? Math.max(...b.moyens.map((m) => m.sort_order)) : -1 }]];
            }
            if (/^INSERT INTO moyen_paiement \(id, organization_id, libelle, template_slug, sort_order\)/.test(q)) {
                if (doublon(p[2])) throw erreur('ER_DUP_ENTRY', 'Duplicate entry');
                b.moyens.push({ id: p[0], libelle: p[2], template_slug: p[3], sort_order: p[4] });
                return [{ affectedRows: 1 }];
            }
            if (/^SELECT libelle FROM moyen_paiement WHERE id = \?/.test(q)) return [b.moyens.filter((m) => m.id === p[0])];
            if (/^UPDATE moyen_paiement SET sort_order = \? WHERE id = \?/.test(q)) {
                const m = b.moyens.find((x) => x.id === p[1]); if (m) m.sort_order = p[0];
                return [{ affectedRows: m ? 1 : 0 }];
            }
            if (/^UPDATE moyen_paiement SET /.test(q)) {
                const champs = /SET (.*) WHERE/.exec(q)[1].split(', ').map((c) => c.replace(' = ?', ''));
                const m = b.moyens.find((x) => x.id === p[champs.length]);
                const i = champs.indexOf('libelle');
                if (i > -1 && doublon(p[i], m && m.id)) throw erreur('ER_DUP_ENTRY', 'Duplicate entry');
                if (m) champs.forEach((c, k) => { m[c] = p[k]; });
                return [{ affectedRows: m ? 1 : 0 }];
            }
            if (/^SELECT id, libelle FROM moyen_paiement WHERE organization_id = \?/.test(q)) return [b.moyens.map(({ id, libelle }) => ({ id, libelle }))];
            if (/^SELECT id FROM moyen_paiement WHERE organization_id = \?/.test(q)) return [b.moyens.map(({ id }) => ({ id }))];
            if (/^DELETE FROM moyen_paiement WHERE id = \?/.test(q)) { b.moyens = b.moyens.filter((m) => m.id !== p[0]); return [{ affectedRows: 1 }]; }
            if (/^SELECT libelle, template_slug FROM moyen_paiement/.test(q)) return [b.moyens.map(({ libelle, template_slug }) => ({ libelle, template_slug }))];
            return [[]];
        },
    }),
    // Le journal (logAudit écrit par rappel) : action et libellé figé.
    query: (sql, p, cb) => { if (/INSERT INTO audit_log/.test(sql)) b.journal.push({ action: p[3], id: p[5], libelle: p[6] }); if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
/* Les modèles de l'organisme : deux factures actives, une désactivée, un devis. */
const MODELES = [
    { slug: 'facture-acquittee', label: 'Facture acquittée', doc_type: 'FACTURE', active: 1 },
    { slug: 'facture-rib', label: 'Facture avec RIB', doc_type: 'FACTURE', active: 1 },
    { slug: 'facture-ancienne', label: 'Ancienne facture', doc_type: 'FACTURE', active: 0 },
    { slug: 'devis-particulier', label: 'Devis particulier', doc_type: 'DEVIS', active: 1 },
];
const cheminModeles = require.resolve('../controllers/template.controller.js');
require.cache[cheminModeles] = { id: cheminModeles, filename: cheminModeles, loaded: true, exports: { loadOrgSteps: async () => MODELES } };

const lib = require('../lib/moyensPaiement.js');
const ctrl = require('../controllers/moyenPaiement.controller.js');
const db = faux.promise();

async function appeler(fn, req = {}) {
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: ORG, id: 'u-bureau' }, params: {}, body: {}, ...req }, res); }
    finally { console.error = avant; }
    await new Promise((f) => setImmediate(f)); // le journal s'écrit sans être attendu
    return r;
}

/* ── La reprise des moyens d'avant ────────────────────────────────────────────────────────────── */

test('LES MOYENS D\'AVANT, RÉUNIS : l\'entité par défaut d\'abord, sans doublon, casse et accents confondus', async () => {
    base({
        entites: [
            { is_default: 0, payment_methods: 'Espèces, Chèque vacances,cb' },
            { is_default: 1, payment_methods: 'Espèces,CB,Virement , Chèque' },
        ],
        boutique: 'Cheque,Alma  3x,,',
    });
    assert.deepStrictEqual(await lib.moyensDAvant(db, ORG), ['Espèces', 'CB', 'Virement', 'Chèque', 'Chèque vacances', 'Alma 3x'],
        '« cb » est CB, « Cheque » est Chèque — deux lignes jumelles se choisiraient au hasard');
    base();
    assert.deepStrictEqual(await lib.moyensDAvant(db, ORG), ['Espèces', 'CB', 'Virement', 'Chèque'], 'rien nulle part : les quatre habituels');
});

test('LA PREMIÈRE LECTURE SÈME LA LISTE, une seule fois — et sans la 187, les moyens d\'avant sans modèle', async () => {
    base({ entites: [{ is_default: 1, payment_methods: 'Espèces,Chèque vacances' }] });
    const r = await lib.lireMoyens(db, ORG);
    assert.strictEqual(r.disponible, true);
    assert.deepStrictEqual(r.moyens.map((m) => [m.libelle, m.sort_order]), [['Espèces', 0], ['Chèque vacances', 1]],
        'l\'école retrouve SES moyens, « Chèque vacances » compris, sans rien ressaisir');
    const semis = b.requetes.filter((q) => /^INSERT IGNORE INTO moyen_paiement/.test(q)).length;
    await lib.lireMoyens(db, ORG);
    assert.strictEqual(b.requetes.filter((q) => /^INSERT IGNORE INTO moyen_paiement/.test(q)).length, semis, 'pas une seconde fois');
    base({ sansTable: true, entites: [{ is_default: 1, payment_methods: 'Espèces,CB' }] });
    assert.deepStrictEqual(await lib.lireMoyens(db, ORG), {
        disponible: false,
        moyens: [{ id: null, libelle: 'Espèces', template_slug: null, sort_order: 0 }, { id: null, libelle: 'CB', template_slug: null, sort_order: 1 }],
    }, 'avant la migration, la caisse propose ce qu\'elle proposait');
});

/* ── Le modèle d'un règlement ─────────────────────────────────────────────────────────────────── */

test('LE PREMIER MOYEN DÉCIDE : un règlement ventilé suit sa première ligne', async () => {
    base({ moyens: [
        { id: 'm1', libelle: 'Espèces', template_slug: 'facture-acquittee', sort_order: 0 },
        { id: 'm2', libelle: 'Virement', template_slug: 'facture-rib', sort_order: 1 },
        { id: 'm3', libelle: 'CB', template_slug: null, sort_order: 2 },
    ] });
    const parts = (...m) => m.map((method) => ({ method, amount: 10 }));
    assert.strictEqual(await lib.modeleDuReglement(db, ORG, parts('Virement', 'Espèces')), 'facture-rib');
    assert.strictEqual(await lib.modeleDuReglement(db, ORG, parts('especes')), 'facture-acquittee', 'casse et accents confondus');
    assert.strictEqual(await lib.modeleDuReglement(db, ORG, parts('CB')), null, '« Automatique » : la règle de l\'acheteur');
    assert.strictEqual(await lib.modeleDuReglement(db, ORG, parts('Bitcoin')), null, 'un moyen inconnu de la liste');
    assert.strictEqual(await lib.modeleDuReglement(db, ORG, [], 'Virement'), 'facture-rib', 'un moyen seul, sans ventilation');
    base({ sansTable: true });
    assert.strictEqual(await lib.modeleDuReglement(db, ORG, parts('Virement')), null, 'sans la 187 : rien de pré-choisi');
});

/* ── Le contrôleur ────────────────────────────────────────────────────────────────────────────── */

test('AJOUTER : la liste est reprise d\'ABORD, puis le moyen se met en fin — un premier ajout n\'efface pas les moyens d\'avant', async () => {
    base({ entites: [{ is_default: 1, payment_methods: 'Espèces,CB' }] });
    const r = await appeler(ctrl.creer, { body: { libelle: '  Chèque   vacances ', template_slug: 'facture-acquittee' } });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    assert.deepStrictEqual(trier(b.moyens).map((m) => [m.libelle, m.template_slug]),
        [['Espèces', null], ['CB', null], ['Chèque vacances', 'facture-acquittee']]);
    assert.deepStrictEqual(b.journal.map((j) => [j.action, j.libelle]), [['moyen_paiement.create', 'Chèque vacances']],
        'le journal nomme le moyen (migration 186)');
});

test('AJOUTER : un nom, 30 caractères au plus, pas de doublon, et un modèle qui est une FACTURE active', async () => {
    base({ moyens: [{ id: 'm1', libelle: 'Chèque', template_slug: null, sort_order: 0 }] });
    const essai = async (body) => (await appeler(ctrl.creer, { body })).code;
    assert.strictEqual(await essai({ libelle: '   ' }), 422);
    assert.strictEqual(await essai({ libelle: 'x'.repeat(31) }), 422, 'invoice.payment_method en tient 30');
    assert.strictEqual(await essai({ libelle: 'cheque' }), 409, '« cheque » est « Chèque »');
    assert.strictEqual(await essai({ libelle: 'Virement', template_slug: 'devis-particulier' }), 422, 'un devis n\'est pas une facture');
    assert.strictEqual(await essai({ libelle: 'Virement', template_slug: 'facture-ancienne' }), 422, 'un modèle désactivé non plus');
    assert.strictEqual(await essai({ libelle: 'Virement', template_slug: 'inconnu' }), 422);
    assert.strictEqual(await essai({ libelle: 'Virement' }), 201, 'sans modèle : « Automatique »');
    base({ sansTable: true });
    assert.strictEqual(await essai({ libelle: 'Virement' }), 503, 'avant la 187 : dit, pas cassé');
});

test('MODIFIER : le nom, le modèle, ou les deux — et « Automatique » se remet', async () => {
    base({ moyens: [
        { id: 'm1', libelle: 'Espèces', template_slug: null, sort_order: 0 },
        { id: 'm2', libelle: 'CB', template_slug: 'facture-acquittee', sort_order: 1 },
    ] });
    assert.strictEqual((await appeler(ctrl.modifier, { params: { id: 'm1' }, body: { libelle: 'Liquide', template_slug: 'facture-rib' } })).code, 200);
    assert.deepStrictEqual(b.moyens[0], { id: 'm1', libelle: 'Liquide', template_slug: 'facture-rib', sort_order: 0 });
    assert.strictEqual((await appeler(ctrl.modifier, { params: { id: 'm2' }, body: { template_slug: '' } })).code, 200);
    assert.strictEqual(b.moyens[1].template_slug, null);
    assert.strictEqual((await appeler(ctrl.modifier, { params: { id: 'm2' }, body: { libelle: 'liquide' } })).code, 409);
    assert.strictEqual((await appeler(ctrl.modifier, { params: { id: 'mX' }, body: { libelle: 'Chèque' } })).code, 404);
    assert.strictEqual((await appeler(ctrl.modifier, { params: { id: 'm2' }, body: {} })).code, 422);
});

test('RETIRER : jamais le dernier — une caisse sans moyen ne pourrait plus encaisser', async () => {
    base({ moyens: [
        { id: 'm1', libelle: 'Espèces', template_slug: null, sort_order: 0 },
        { id: 'm2', libelle: 'CB', template_slug: null, sort_order: 1 },
    ] });
    assert.strictEqual((await appeler(ctrl.supprimer, { params: { id: 'm2' } })).code, 200);
    assert.deepStrictEqual(b.journal.map((j) => [j.action, j.libelle]), [['moyen_paiement.delete', 'CB']]);
    const r = await appeler(ctrl.supprimer, { params: { id: 'm1' } });
    assert.strictEqual(r.code, 409);
    assert.match(r.corps.message, /au moins un moyen/);
    assert.strictEqual(b.moyens.length, 1, 'et rien n\'est parti');
});

test('ORDONNER : toute la liste, telle qu\'elle est — sinon « rechargez »', async () => {
    base({ moyens: ['a', 'b', 'c'].map((id, i) => ({ id, libelle: id.toUpperCase(), template_slug: null, sort_order: i })) });
    assert.strictEqual((await appeler(ctrl.ordonner, { body: { ids: ['c', 'a', 'b'] } })).code, 200);
    assert.deepStrictEqual(trier(b.moyens).map((m) => m.id), ['c', 'a', 'b']);
    for (const ids of [['c', 'a'], ['c', 'a', 'b', 'z'], ['c', 'c', 'a']]) {
        assert.strictEqual((await appeler(ctrl.ordonner, { body: { ids } })).code, 409, JSON.stringify(ids));
    }
    assert.strictEqual((await appeler(ctrl.ordonner, { body: {} })).code, 422);
});

/* ── Le serveur applique la même règle que l'écran ────────────────────────────────────────────── */

test('SANS MODÈLE CHOISI, celui du PREMIER moyen — à la caisse comme en facturant une demande', () => {
    const vente = plat(lire('src/api/controllers/sale.controller.js'));
    assert.match(vente, /const templateSlug = String\(req\.body\.invoice_template_slug \|\| ''\)\.trim\(\)\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9-\]\/g, '-'\) \|\| \(hasInvTemplate \? await modeleDuReglement\(conn, orgId, parts, req\.body\.payment_method\) : null\) \|\| null;/,
        'le choix fait à la caisse l\'emporte, le moyen ne décide qu\'à défaut');
    const demande = plat(lire('src/api/controllers/shopRequest.controller.js'));
    assert.match(demande, /ajouter\('template_slug', slugChoisi \|\| await modeleDuReglement\(conn, orgId, parts, req\.body\?\.payment_method\)\)/);
    // Et la facture se rend toujours avec ce qu'elle porte : un slug qui n'est plus une facture
    // active retombe sur la règle de l'acheteur (inchangé).
    assert.match(plat(lire('src/api/controllers/invoice.controller.js')),
        /const step = \(data\.templateSlug && factures\.find\(\(x\) => x\.slug === data\.templateSlug\)\) \|\| pickInvoiceTemplate\(/);
});

/* ── Migration, garde, journal ────────────────────────────────────────────────────────────────── */

test('la 187 : une table, une clé unique par organisme, 30 caractères comme invoice.payment_method — et son revert', () => {
    const code = (t) => plat(t.replace(/\/\*[\s\S]*?\*\//g, ''));
    const mig = lire('database/migrations/187_moyens_paiement.sql');
    assert.doesNotMatch(mig, /^\s*--/m, 'commentaires en blocs');
    const c = code(mig);
    assert.match(c, /^CREATE TABLE IF NOT EXISTS moyen_paiement \(/, 'rejouable');
    assert.match(c, /libelle varchar\(30\) NOT NULL/);
    assert.match(lire('database/schema.sql'), /payment_method\s+varchar\(30\)/, 'la taille qu\'on s\'impose vient de là');
    assert.match(c, /UNIQUE KEY uq_moyen_paiement_libelle \(organization_id, libelle\)/);
    assert.match(c, /FOREIGN KEY \(organization_id\) REFERENCES organization \(id\) ON DELETE CASCADE/);
    assert.doesNotMatch(c, /INSERT/, 'aucune donnée : la liste se sème en JavaScript, éprouvée ici');
    assert.match(code(lire('database/migrations/187_revert_moyens_paiement.sql')), /^DROP TABLE IF EXISTS moyen_paiement;$/);
});

test('la garde : lire pour tout le personnel, écrire pour le bureau — et sous la rubrique Facturation', () => {
    const routes = lire('src/api/routes/moyenPaiement.routes.js');
    assert.match(routes, /router\.get\('\/', authorizeRoles\(\.\.\.STAFF_ROLES\), lister\)/);
    for (const r of [/router\.post\('\/', authorizeRoles\(\.\.\.ADMIN_ROLES\), creer\)/, /router\.put\('\/ordre', authorizeRoles\(\.\.\.ADMIN_ROLES\), ordonner\)/,
        /router\.patch\('\/:id', authorizeRoles\(\.\.\.ADMIN_ROLES\), modifier\)/, /router\.delete\('\/:id', authorizeRoles\(\.\.\.ADMIN_ROLES\), supprimer\)/]) {
        assert.match(routes, r);
    }
    assert.ok(routes.indexOf("'/ordre'") < routes.indexOf("'/:id'"), '« ordre » avant « :id », sinon il serait pris pour un identifiant');
    assert.match(lire('src/api/server.js'), /app\.use\('\/api\/moyens-paiement', moyenPaiementRoutes\)/);
    const { sectionFor } = require('../middlewares/sectionAccess.middleware.js');
    // Un secrétariat en LECTURE sur Facturation lit la liste, mais ne la modifie pas.
    assert.strictEqual(sectionFor('moyens-paiement', ''), '/reglages-facturation');
    const { sectionDeLEntite, estEvenement } = require('../lib/activite.js');
    assert.strictEqual(sectionDeLEntite('MoyenPaiement'), '/reglages-facturation');
    assert.strictEqual(estEvenement('MoyenPaiement'), false, 'un réglage : la cloche se tait, le journal le garde');
});

/* ── Les écrans ───────────────────────────────────────────────────────────────────────────────── */

const UI = (f) => lire(`src/app/ui/${f}`);

test('FACTURATION : la carte des moyens, et les entités n\'ont plus la leur', () => {
    assert.match(UI('pages/FacturationReglages.jsx'), /<MoyensPaiement onError=\{erreur\} \/>/);
    const entites = UI('components/BillingProfiles.jsx');
    assert.doesNotMatch(entites, /PaiementPicker|Moyens de paiement \(caisse\)/, 'une seule liste, pas une par entité');
    const carte = UI('components/MoyensPaiement.jsx');
    assert.match(carte, /<option value="">Automatique \(selon l'acheteur\)<\/option>/);
    assert.match(carte, /\{t\.label \|\| t\.slug\}/, 'le nom du modèle, pas son identifiant');
    assert.match(carte, /disabled=\{enCours \|\| moyens\.length <= 1\}/, 'le dernier ne se retire pas, et l\'écran le montre');
    assert.match(carte, /if \(abandons\.current\.delete\(m\.id\)\) return;/, 'Échap abandonne vraiment le renommage');
    assert.match(carte, /Ce modèle n'existe plus ou n'est plus actif/, 'un modèle disparu se dit sur la ligne');
});

test('LA CAISSE ET LA DEMANDE : la liste de l\'école, et le premier moyen pré-sélectionne son modèle', () => {
    const caisse = UI('pages/Ventes.jsx');
    assert.match(caisse, /getMoyensPaiement\(\)\.then\(\(r\) => setMoyens\(r\.data \|\| \[\]\)\)/);
    assert.match(caisse, /moyens\.length \? moyens\.map\(\(m\) => m\.libelle\)/);
    assert.match(caisse, /const methodePrincipale = payments\[0\]\?\.method \|\| "";/, 'le PREMIER moyen décide');
    assert.match(caisse, /useEffect\(\(\) => \{ if \(modeleDuMoyen\) setFactureSlug\(modeleDuMoyen\); \}, \[modeleDuMoyen\]\);/,
        'l\'effet ne dépend que du modèle : saisir un montant ne défait pas un choix fait à la main');
    assert.match(caisse, /Choisi d'après le moyen de paiement « \{methodePrincipale\} »/);
    const demande = UI('pages/DemandesBoutique.jsx');
    assert.match(demande, /const premierMoyen = paiements\[0\]\?\.method \|\| "";/);
    assert.match(demande, /useEffect\(\(\) => \{ if \(modeleDuMoyen\) setSlug\(modeleDuMoyen\); \}, \[modeleDuMoyen\]\);/);
    assert.match(demande, /\{t\.label \|\| t\.slug\}/, 'la liste des modèles n\'affichait que leurs identifiants');
});
