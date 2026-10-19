/**
 * UN REPRÉSENTANT D'ENTREPRISE PEUT DEVENIR AUSSI STAGIAIRE (demandé le 2026-10-19).
 *
 * LE DÉFAUT. Une personne pouvait être stagiaire PUIS représentant d'une entreprise (le compte reste
 * STAGIAIRE, l'entreprise se superpose — has_company). L'autre sens était bloqué : un représentant
 * (compte rôle ENTREPRISE) à qui l'école voulait donner un accès stagiaire se voyait refuser —
 * « Cette adresse appartient déjà à un compte non-stagiaire » (uq_user_org_email : un e-mail = un
 * compte dans l'organisme). Après de bons résultats, un chef d'entreprise veut s'inscrire : impossible.
 *
 * LA CORRECTION (miroir du sens qui marche). Quand on crée l'accès stagiaire d'une fiche dont l'e-mail
 * est DÉJÀ un compte ENTREPRISE, on relie la fiche à CE compte et on le passe STAGIAIRE. Il GARDE son
 * entreprise (l'espace entreprise est gardé par les DONNÉES, company.user_id, pas par le rôle), et —
 * choix de l'école — SES IDENTIFIANTS : ni mot de passe ni sessions touchés.
 *
 * LA GARDE DE SÉCURITÉ RESTE. Seul le rôle ENTREPRISE est promu. Un compte du BUREAU (admin, secrétariat)
 * reste refusé : sinon un SECRETARIAT créerait une fiche à l'e-mail d'un admin pour s'emparer du compte.
 */
const test = require('node:test');
const assert = require('node:assert');

const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
let captures = [];
let scenario = {};
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            if (/^SELECT id, user_id, email, first_name, last_name, phone FROM learner WHERE id/.test(q)) return [[scenario.learner]];
            if (/^SELECT id, role FROM user WHERE email/.test(q)) return [scenario.userByEmail ? [scenario.userByEmail] : []];
            if (/^SELECT role FROM user WHERE id/.test(q)) return [[{ role: scenario.linkedRole || 'STAGIAIRE' }]];
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) { captures.push({ q, p }); return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { resetStagiairePassword } = require('../controllers/learner.controller.js');

async function creerCompte(sc) {
    scenario = sc; captures = [];
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try {
        await resetStagiairePassword(
            { user: { organization_id: 'org-1', id: 'admin', role: 'ADMIN_ORGANISME' }, params: { id: 'f1' } }, res);
    } finally { console.error = avant; }
    return r;
}
const trouve = (re) => captures.find((c) => re.test(c.q));

test('e-mail d\'un REPRÉSENTANT (rôle ENTREPRISE) : on le passe STAGIAIRE et on relie la fiche', async () => {
    const r = await creerCompte({
        learner: { id: 'f1', user_id: null, email: 'chef@pizza.fr', first_name: 'Léa', last_name: 'Roux', phone: null },
        userByEmail: { id: 'u-rep', role: 'ENTREPRISE' },
    });
    assert.strictEqual(r.code, 200, 'relié, pas refusé');
    assert.strictEqual(r.corps.linked, true);
    assert.strictEqual(r.corps.created, false, 'on ne crée pas un nouveau compte, on relie l\'existant');
    const promo = trouve(/^UPDATE user SET role = 'STAGIAIRE'/);
    assert.ok(promo, 'le compte entreprise est promu STAGIAIRE');
    assert.match(promo.q, /AND role = 'ENTREPRISE'/, 'garde-fou : on ne promeut QUE depuis ENTREPRISE');
    assert.deepStrictEqual(promo.p, ['u-rep', 'org-1']);
    assert.ok(trouve(/^UPDATE learner SET user_id/), 'la fiche est reliée au compte');
});

test('IDENTIFIANTS INCHANGÉS : pas de reset de mot de passe, pas de coupure de session (pas de déconnexion)', async () => {
    await creerCompte({
        learner: { id: 'f1', user_id: null, email: 'chef@pizza.fr', first_name: 'Léa', last_name: 'Roux', phone: null },
        userByEmail: { id: 'u-rep', role: 'ENTREPRISE' },
    });
    assert.ok(!trouve(/^UPDATE user SET password/), 'le mot de passe n\'est PAS réinitialisé');
    assert.ok(!trouve(/sessions_valid_after/), 'les sessions ne sont PAS coupées (il reste connecté)');
});

test('GARDE DE SÉCURITÉ : un compte du BUREAU n\'est PAS promu (409), aucune écriture', async () => {
    const r = await creerCompte({
        learner: { id: 'f1', user_id: null, email: 'admin@ecole.fr', first_name: 'X', last_name: 'Y', phone: null },
        userByEmail: { id: 'u-admin', role: 'ADMIN_ORGANISME' },
    });
    assert.strictEqual(r.code, 409, 'un compte non-stagiaire autre qu\'entreprise reste refusé');
    assert.match(r.corps.error, /non-stagiaire/);
    assert.ok(!trouve(/^UPDATE user SET role/), 'aucune promotion');
    assert.ok(!trouve(/^UPDATE learner SET user_id/), 'aucune liaison : pas de prise de contrôle');
});

test('e-mail d\'un STAGIAIRE existant : on le relie et on réinitialise son mot de passe (inchangé)', async () => {
    const r = await creerCompte({
        learner: { id: 'f1', user_id: null, email: 'lea@pizza.fr', first_name: 'Léa', last_name: 'Roux', phone: null },
        userByEmail: { id: 'u-stg', role: 'STAGIAIRE' },
    });
    assert.strictEqual(r.code, 200);
    assert.ok(!r.corps.linked, 'ce n\'est pas le cas « entreprise reliée »');
    assert.ok(trouve(/^UPDATE user SET password/), 'mot de passe (ré)initialisé');
    assert.ok(trouve(/sessions_valid_after/), 'sessions coupées, comme avant');
    assert.ok(trouve(/^UPDATE learner SET user_id/), 'fiche reliée');
});
