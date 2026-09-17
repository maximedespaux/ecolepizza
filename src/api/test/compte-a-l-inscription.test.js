/**
 * LE COMPTE DE CONNEXION D'UN STAGIAIRE NAÎT À SON INSCRIPTION À UNE SESSION.
 *
 * DÉCIDÉ LE 2026-09-17. Jusque-là, enregistrer une fiche créait aussitôt le compte et envoyait un
 * mot de passe — or une fiche est souvent celle d'un PROSPECT, qui recevait des identifiants pour
 * un espace VIDE : sans session, ni dossier, ni document à signer, ni pièce à déposer, et Pizza
 * Quest comme la Communauté restent fermés jusqu'à l'inscription. Rattacher un stagiaire à son
 * entreprise SANS session en créait un aussi. En production ce jour-là : 20 comptes pour 1 075
 * fiches, l'envoi des identifiants activé.
 *
 * L'inscription créait déjà le compte manquant : elle devient le seul moment où il naît de
 * lui-même. Le bouton « ＋ Compte » de la liste reste pour les exceptions.
 *
 * ET LE MOT DE PASSE NE SE PERD PAS. Il n'est gardé qu'en empreinte : l'inscription ne le montrait
 * jamais, et comptait sur l'e-mail. Si l'envoi des identifiants est coupé (Mailing) ou le SMTP
 * absent, l'écran le reçoit — une fois — sinon personne ne le connaîtrait.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : scénario par test, requêtes capturées ──────────────────────
let requetes = [];
let reponses = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            const r = reponses.find(([motif]) => motif.test(sql));
            return r ? (typeof r[1] === 'function' ? r[1](sql, params) : r[1]) : [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

// ── Messagerie : on décide si les identifiants partiraient, on compte les envois ──
const vraiMailer = require('../lib/mailer.js');
let envoiOk = true;
let envois = [];
const cheminMailer = require.resolve('../lib/mailer.js');
require.cache[cheminMailer] = {
    id: cheminMailer, filename: cheminMailer, loaded: true,
    exports: { ...vraiMailer, sendMail: async (m) => { envois.push(m); return { sent: true }; }, envoiPossible: () => envoiOk },
};

const { createLearner } = require('../controllers/learner.controller.js');
const { createEnrollment } = require('../controllers/enrollment.controller.js');
const { registerCompanyStagiaires } = require('../controllers/company.controller.js');

async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'u0', role: 'SUPER_ADMIN' }, params: {}, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const creeUnCompte = () => requetes.some((q) => /INSERT INTO user\b/.test(q.sql));
const nouveauScenario = (r) => { requetes = []; envois = []; reponses = r; };

// La session d'une formation au parcours complet (garde `parcoursManquant` satisfaite).
const SESSION = [
    [/FROM training_session s\s+JOIN training_program p/, [[{ badge: 'RS7404', id: 'p1', code: 'RS7404', title: 'RS7404', company_steps: '["convention"]' }]]],
    [/FROM program_step/, [[{ n: 3 }]]],
];

test('enregistrer une fiche ne crée plus de compte, et n\'envoie rien', async () => {
    nouveauScenario([[/information_schema\.columns/, [[{ c: 'first_name' }, { c: 'last_name' }, { c: 'email' }, { c: 'phone' }]]]]);
    const { code, corps } = await appeler(createLearner, { body: { first_name: 'Marie', last_name: 'Dupont', email: 'marie@exemple.fr', phone: '0612345678' } });
    assert.strictEqual(code, 201, JSON.stringify(corps));
    assert.ok(!creeUnCompte(), 'aucun INSERT INTO user à la création de la fiche');
    assert.strictEqual(envois.length, 0, 'aucun e-mail d\'identifiants');
    const insertion = requetes.find((q) => /INSERT INTO learner/.test(q.sql));
    assert.strictEqual(insertion.params[3], null, 'la fiche naît sans user_id');
    assert.ok(!('password' in corps), 'plus de mot de passe dans la réponse');
});

test('l\'inscription à une session crée le compte et envoie les identifiants', async () => {
    envoiOk = true;
    nouveauScenario([
        [/FROM learner WHERE id = \?/, [[{ id: 'l1', financing: 'PARTICULIER', levels: '', user_id: null, email: 'marie@exemple.fr', first_name: 'Marie', last_name: 'DUPONT', phone: null }]]],
        ...SESSION,
    ]);
    const { code, corps } = await appeler(createEnrollment, { body: { learner_id: 'l1', session_id: 's1', crm_stage: 'INSCRIT' } });
    assert.strictEqual(code, 201, JSON.stringify(corps));
    assert.ok(creeUnCompte(), 'le compte naît ici');
    assert.ok(requetes.some((q) => /UPDATE learner SET user_id = \?/.test(q.sql)), 'et il est relié à la fiche');
    assert.strictEqual(envois.length, 1, 'les identifiants partent par e-mail');
    assert.deepStrictEqual(corps.compte, { email: 'marie@exemple.fr', envoye: true, password: null },
        'envoyés : le mot de passe ne s\'affiche pas');
});

test('si les identifiants ne peuvent pas partir, l\'écran reçoit le mot de passe', async () => {
    envoiOk = false;
    nouveauScenario([
        [/FROM learner WHERE id = \?/, [[{ id: 'l1', financing: 'PARTICULIER', levels: '', user_id: null, email: 'marie@exemple.fr', first_name: 'Marie', last_name: 'DUPONT', phone: null }]]],
        ...SESSION,
    ]);
    const { corps } = await appeler(createEnrollment, { body: { learner_id: 'l1', session_id: 's1', crm_stage: 'INSCRIT' } });
    assert.strictEqual(corps.compte.envoye, false);
    assert.ok(typeof corps.compte.password === 'string' && corps.compte.password.length >= 8, 'le seul endroit où le lire');
    envoiOk = true;
});

test('un stagiaire qui a déjà un compte n\'en reçoit pas un second', async () => {
    nouveauScenario([
        [/FROM learner WHERE id = \?/, [[{ id: 'l1', financing: 'PARTICULIER', levels: '', user_id: 'u9', email: 'marie@exemple.fr', first_name: 'Marie', last_name: 'DUPONT', phone: null }]]],
        ...SESSION,
    ]);
    const { corps } = await appeler(createEnrollment, { body: { learner_id: 'l1', session_id: 's1', crm_stage: 'INSCRIT' } });
    assert.ok(!creeUnCompte());
    assert.strictEqual(corps.compte, null);
});

const ENTREPRISE = [
    [/FROM company WHERE id = \?/, [[{ id: 'c1', opco: null }]]],
    [/FROM learner WHERE id IN \(\?\)/, [[{ id: 'l1', user_id: null, email: 'marie@exemple.fr', first_name: 'Marie', last_name: 'DUPONT', phone: null }]]],
];

test('rattacher un stagiaire à son entreprise SANS session ne lui crée pas de compte', async () => {
    nouveauScenario([...ENTREPRISE]);
    const { code, corps } = await appeler(registerCompanyStagiaires, { params: { id: 'c1' }, body: { learner_ids: ['l1'] } });
    assert.strictEqual(code, 201, JSON.stringify(corps));
    assert.ok(!creeUnCompte(), '« rattacher un stagiaire existant » envoyait des identifiants');
    assert.strictEqual(envois.length, 0);
    assert.strictEqual(corps.data.created[0].identifiants_envoyes, null);
});

test('l\'inscription de groupe À UNE SESSION crée les comptes manquants', async () => {
    envoiOk = true;
    nouveauScenario([...ENTREPRISE, ...SESSION]);
    const { corps } = await appeler(registerCompanyStagiaires, { params: { id: 'c1' }, body: { session_id: 's1', learner_ids: ['l1'] } });
    assert.ok(creeUnCompte());
    assert.deepStrictEqual({ envoyes: corps.data.created[0].identifiants_envoyes, password: corps.data.created[0].password }, { envoyes: true, password: null });
});

test('les écrans disent où est passé le compte', () => {
    const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
    // La fiche : plus de mot de passe à noter, mais l'annonce de ce qui viendra.
    const modale = lire('components/EditStagiaireModal.jsx');
    assert.doesNotMatch(modale, /res\.password/);
    assert.match(modale, /Son compte de connexion sera créé à son inscription à une session\./);
    // La session : l'inscription dit qu'un compte est créé, et montre le mot de passe s'il n'est pas parti.
    const session = lire('pages/SessionDetail.jsx');
    assert.match(session, /message: `Stagiaire inscrit\.\$\{messageCompte\(r\?\.compte\)\}`/);
    assert.match(session, /identifiants envoyés à \$\{compte\.email\}/);
    // L'entreprise : le mot de passe éventuel apparaît dans la liste du résultat.
    assert.match(lire('pages/EntrepriseDetail.jsx'), /\{c\.password\s*\? <span className="hint"/);
});
