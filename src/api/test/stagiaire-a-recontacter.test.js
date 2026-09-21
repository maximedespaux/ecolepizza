/**
 * « À RECONTACTER » : LE RAPPEL SUR LA FICHE DU STAGIAIRE (migration 169).
 *
 * Demandé le 2026-09-21 : « une case à cocher à la création d'un stagiaire, à recontacter, en
 * guise de rappel ; reprise sur le tableau de bord ; une liste de priorité en tête de la page des
 * stagiaires quand la case est cochée ; et une petite pastille à côté de Stagiaires dans le menu ».
 *
 * Ce fichier gèle ce qui fait d'une case un RAPPEL fiable :
 *   · sa date est posée par le serveur à la coche, GARDÉE tant qu'elle reste cochée — sinon chaque
 *     enregistrement rajeunirait l'attente, et la plus ancienne ne serait jamais en tête — et
 *     effacée à la décoche ;
 *   · avant la migration, la fiche s'enregistre et dit que la case n'a pas été prise ;
 *   · la liste et la pastille ne s'adressent qu'à qui peut décocher la case — la règle de l'API.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base (même montage que stagiaire-note-libre) ────────────────────────────────────
let requetes = [];
let colonnes = [];
let lignes = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            // `colonneExiste` : une colonne précise.
            if (/information_schema\.columns[\s\S]*column_name = \?/.test(sql)) return [colonnes.includes(params[1]) ? [{ 1: 1 }] : []];
            // `champsEcrivables` : toutes les colonnes de la table.
            if (/information_schema\.columns/.test(sql)) return [colonnes.map((c) => ({ c }))];
            if (/SELECT company_id, financing, user_id, email FROM learner/.test(sql)) return [[{ company_id: null, financing: 'PARTICULIER', user_id: null, email: 'marie@exemple.fr' }]];
            if (/FROM learner\s+WHERE organization_id = \? AND a_recontacter = 1/.test(sql)) {
                if (!colonnes.includes('a_recontacter')) { const e = new Error('Unknown column'); e.code = 'ER_BAD_FIELD_ERROR'; throw e; }
                return [lignes];
            }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const vraiMailer = require('../lib/mailer.js');
const cheminMailer = require.resolve('../lib/mailer.js');
require.cache[cheminMailer] = {
    id: cheminMailer, filename: cheminMailer, loaded: true,
    exports: { ...vraiMailer, sendMail: async () => ({ sent: false }), envoiPossible: () => false },
};

const { createLearner, updateLearner, getARecontacter } = require('../controllers/learner.controller.js');
const { peutDecocherUnRappel } = require('../controllers/badges.controller.js');

async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'u0', role: 'SUPER_ADMIN' }, params: { id: 'l1' }, query: {}, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const BASE = ['first_name', 'last_name', 'email', 'phone', 'financing'];
const APRES = [...BASE, 'a_recontacter', 'a_recontacter_depuis'];
const scenario = (c) => { requetes = []; colonnes = c; };
const FICHE = { first_name: 'Marie', last_name: 'DUPONT', email: 'marie@exemple.fr', phone: '0612345678', financing: 'PARTICULIER' };
const maj = () => requetes.find((q) => /^\s*UPDATE learner SET/.test(q.sql) && /WHERE id = \? AND organization_id = \?/.test(q.sql));
/* La valeur liée à une affectation de l'UPDATE, par sa position dans la liste SET. */
function valeurDe(q, affectation) {
    const set = q.sql.slice(q.sql.indexOf('SET') + 3, q.sql.lastIndexOf('WHERE'));
    const parties = set.split(/,\s*(?![^()]*\))/).map((x) => x.trim());
    const i = parties.findIndex((x) => x.startsWith(affectation));
    assert.ok(i >= 0, `« ${affectation} » absent de l'UPDATE`);
    return q.params[parties.slice(0, i).reduce((n, x) => n + (x.match(/\?/g) || []).length, 0)];
}

// ── La date suit la case ───────────────────────────────────────────────────────────────────
test('COCHER : la case à 1, et la date posée… ou GARDÉE si elle l\'était déjà', async () => {
    scenario(APRES);
    const { code, corps } = await appeler(updateLearner, { body: { ...FICHE, a_recontacter: true } });
    assert.strictEqual(code, 200, JSON.stringify(corps));
    const q = maj();
    assert.strictEqual(valeurDe(q, 'a_recontacter = ?'), 1);
    assert.match(q.sql, /a_recontacter_depuis = CASE WHEN \? = 1 THEN COALESCE\(a_recontacter_depuis, NOW\(\)\) ELSE NULL END/,
        'COALESCE : réenregistrer une fiche cochée ne rajeunit pas l\'attente');
    assert.strictEqual(valeurDe(q, 'a_recontacter_depuis = CASE'), 1);
});

test('DÉCOCHER : la case à 0 et la date effacée', async () => {
    scenario(APRES);
    await appeler(updateLearner, { body: { ...FICHE, a_recontacter: false } });
    const q = maj();
    assert.strictEqual(valeurDe(q, 'a_recontacter = ?'), 0);
    assert.strictEqual(valeurDe(q, 'a_recontacter_depuis = CASE'), 0);
});

test('une fiche enregistrée sans la case ne touche pas au rappel', async () => {
    /* Un autre écran, un appel direct : `a_recontacter` absent du corps ne doit ni cocher ni décocher. */
    scenario(APRES);
    await appeler(updateLearner, { body: { ...FICHE } });
    assert.doesNotMatch(maj().sql, /a_recontacter/);
});

test('la case vaut 0 ou 1, jamais NULL ni une chaîne (colonne NOT NULL)', async () => {
    for (const [envoye, attendu] of [['true', 1], ['1', 1], [1, 1], ['', 0], [null, 0], ['non', 0]]) {
        scenario(APRES);
        await appeler(updateLearner, { body: { ...FICHE, a_recontacter: envoye } });
        assert.strictEqual(valeurDe(maj(), 'a_recontacter = ?'), attendu, `« ${envoye} »`);
    }
});

test('À LA CRÉATION, née cochée : la date de maintenant, posée par le serveur', async () => {
    scenario(APRES);
    let r = await appeler(createLearner, { body: { ...FICHE, a_recontacter: true } });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    assert.match(requetes.find((q) => /INSERT INTO learner/.test(q.sql)).sql, /a_recontacter/);
    assert.ok(requetes.some((q) => /UPDATE learner SET a_recontacter_depuis = NOW\(\) WHERE id = \?/.test(q.sql)));
    scenario(APRES);
    r = await appeler(createLearner, { body: { ...FICHE, a_recontacter: false } });
    assert.ok(!requetes.some((q) => /a_recontacter_depuis = NOW\(\)/.test(q.sql)), 'non cochée : pas de date');
});

test('AVANT LA MIGRATION, la fiche s\'enregistre et DIT que la case n\'a pas été prise', async () => {
    scenario(BASE);
    const { code, corps } = await appeler(updateLearner, { body: { ...FICHE, a_recontacter: true } });
    assert.strictEqual(code, 200);
    assert.doesNotMatch(maj().sql, /a_recontacter/, 'aucune colonne inexistante nommée');
    assert.deepStrictEqual(corps.ignores, ['a_recontacter']);
    // Décochée, rien n'est perdu : rien à signaler.
    scenario(BASE);
    assert.ok(!('ignores' in (await appeler(updateLearner, { body: { ...FICHE, a_recontacter: false } })).corps));
});

// ── La liste de priorité ───────────────────────────────────────────────────────────────────
test('LA LISTE : la plus ancienne attente en tête, et de quoi rappeler', async () => {
    scenario([...APRES, 'note_libre']);
    lignes = [{ id: 'l1' }];
    const { code, corps } = await appeler(getARecontacter, {});
    assert.strictEqual(code, 200);
    assert.deepStrictEqual(corps.data, [{ id: 'l1' }]);
    const q = requetes.find((x) => /a_recontacter = 1/.test(x.sql));
    assert.match(q.sql, /ORDER BY a_recontacter_depuis IS NULL, a_recontacter_depuis, last_name, first_name/);
    for (const c of ['phone', 'email', 'contacted_by', 'note_libre']) assert.match(q.sql, new RegExp(`\\b${c}\\b`));
    assert.strictEqual(q.params[0], 'o1', 'l\'organisme de l\'appelant, et lui seul');
});

test('avant la migration, la liste est VIDE — pas une panne', async () => {
    scenario(BASE);
    const { code, corps } = await appeler(getARecontacter, {});
    assert.strictEqual(code, 200);
    assert.deepStrictEqual(corps.data, []);
});

test('la route est celle du bureau, et passe AVANT /:id', () => {
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'learner.routes.js'), 'utf8');
    const liste = routes.indexOf("router.get('/a-recontacter', authorizeRoles(...ADMIN_ROLES), getARecontacter);");
    assert.ok(liste > 0 && liste < routes.indexOf("router.get('/:id'"), 'sinon « a-recontacter » serait pris pour un identifiant');
});

// ── La pastille du menu ────────────────────────────────────────────────────────────────────
test('LA PASTILLE : la clé /stagiaires, comptée seulement pour qui peut décocher la case', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'badges.controller.js'), 'utf8');
    assert.match(src, /'\/stagiaires': rappels,/);
    assert.match(src, /COUNT\(\*\) AS n FROM learner WHERE organization_id = \? AND a_recontacter = 1/);
    const conn = (nav) => ({ query: async () => [[{ nav_access: nav }]] });
    const cas = [
        [{ role: 'ADMIN_ORGANISME' }, null, true, 'propriétaire : toujours'],
        [{ role: 'FORMATEUR', id: 'f' }, JSON.stringify({ '/stagiaires': 'write' }), true, 'délégué en écriture'],
        [{ role: 'FORMATEUR', id: 'f' }, JSON.stringify({ '/stagiaires': 'read' }), false, 'en lecture : il ne décocherait rien'],
        [{ role: 'SECRETARIAT', id: 's' }, null, false, 'accès jamais enregistré : le serveur refuserait l\'écriture'],
        [{ role: 'STAGIAIRE', id: 'x' }, JSON.stringify({ '/stagiaires': 'write' }), false, 'hors rôles configurables : jamais'],
    ];
    for (const [user, nav, attendu, pourquoi] of cas) {
        assert.strictEqual(await peutDecocherUnRappel(conn(nav), user), attendu, pourquoi);
    }
});

// ── Les écrans ─────────────────────────────────────────────────────────────────────────────
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (...p) => fs.readFileSync(path.join(UI, ...p), 'utf8');

test('LE FORMULAIRE : la case dans la prise de contact, et la pastille suit l\'enregistrement', () => {
    const modale = lire('components', 'EditStagiaireModal.jsx');
    assert.match(modale, /a_recontacter: false,/, 'dans l\'état initial');
    assert.match(modale, /const BOOL_FIELDS = \[[^\]]*"a_recontacter"/, 'relue en booléen par toForm');
    const contacte = modale.indexOf('<SelectField label="Contacté par"');
    const caseRappel = modale.indexOf('checked={!!form.a_recontacter} onChange={toggle("a_recontacter")}');
    const civilite = modale.indexOf('<SelectField label="Civilité"');
    assert.ok(contacte > 0 && contacte < caseRappel && caseRappel < civilite, 'sous « Contacté par », avant l\'identité');
    assert.match(modale, /a_recontacter: \["le rappel « à recontacter »", 169\]/, 'avant la migration, le message le dit');
    assert.match(modale, /\}\n\s+bumpBadges\(\); \/\/ la pastille « Stagiaires »/, 'la pastille du menu sans attendre la minute');
});

test('LA LISTE DE PRIORITÉ : en tête de la page des stagiaires, avant la recherche', () => {
    const page = lire('pages', 'Stagiaires.jsx');
    const liste = page.indexOf('<ARecontacter refresh={rappelsRefresh}');
    assert.ok(liste > page.indexOf('<StatusMessage status={status} />') && liste < page.indexOf('<div className="recherche">'));
    assert.match(page, /rappels\.has\(l\.id\) && <Badge tone="a" className="rappel-chip"/, 'et marquée sur sa ligne plus bas');
    assert.match(page, /load\(query\); setRappelsRefresh\(\(n\) => n \+ 1\);/, 'rechargée après l\'enregistrement d\'une fiche');
});

test('LE TABLEAU DE BORD : la carte sous « À traiter », et plus de « rien à faire » qui mente', () => {
    const tb = lire('pages', 'Dashboard.jsx');
    assert.ok(tb.indexOf('<ARecontacter limite={8}') > tb.indexOf('className="todo-calme"'), 'sous la zone « À traiter »');
    assert.match(tb, /\) : nbRappels === 0 \? \(\s+<div className="todo-calme">/,
        '« Rien ne demande d\'action » seulement quand personne n\'attend d\'appel');
});

test('« RAPPELÉ » : pour qui peut écrire, décoche la case, et la pastille suit', () => {
    const carte = lire('components', 'ARecontacter.jsx');
    assert.match(carte, /const peutAgir = peutEcrire\(user, "\/stagiaires"\);/, 'la règle du serveur, pas une liste de rôles');
    assert.match(carte, /\{peutAgir && \(/);
    const geste = carte.slice(carte.indexOf('async function rappele'), carte.indexOf('if (!liste || liste.length === 0)'));
    assert.match(geste, /await updateStagiaire\(l\.id, \{ a_recontacter: false \}\);[\s\S]*bumpBadges\(\);/);
    assert.match(carte, /href=\{`tel:\$\{String\(l\.phone\)\.replace\(/, 'le numéro s\'appelle d\'un geste');
});

test('« EDOF » s\'ajoute aux canaux de « Contacté par »', () => {
    assert.match(lire('components', 'EditStagiaireModal.jsx'), /const CONTACTS = \["Mail", "Téléphone", "EDOF"\];/);
});

test('LA MIGRATION 169 et son revert', () => {
    const M = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const aller = fs.readFileSync(path.join(M, '169_stagiaire_a_recontacter.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(M, '169_revert_stagiaire_a_recontacter.sql'), 'utf8');
    assert.match(aller, /ADD COLUMN IF NOT EXISTS a_recontacter TINYINT\(1\) NOT NULL DEFAULT 0,\s+ADD COLUMN IF NOT EXISTS a_recontacter_depuis DATETIME DEFAULT NULL;/);
    assert.match(retour, /DROP COLUMN IF EXISTS a_recontacter_depuis,\s+DROP COLUMN IF EXISTS a_recontacter;/);
    for (const f of [aller, retour]) {
        assert.strictEqual((f.match(/;/g) || []).length, 1, 'un seul « ; », en fin d\'instruction (cf. la 146)');
        assert.ok(!f.includes('\\'), 'aucune barre oblique inverse');
    }
});
