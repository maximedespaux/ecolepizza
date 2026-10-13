/**
 * SUPPRIMER UNE ENTREPRISE NE DOIT PAS LAISSER SON REPRÉSENTANT ORPHELIN (constaté le 2026-10-14).
 *
 * LE DÉFAUT. `deleteCompany` ne faisait que `DELETE FROM company`. Le compte de connexion du
 * représentant (rôle ENTREPRISE) restait : un login que plus aucune entreprise ne gère, qui réserve
 * son e-mail et empêche d'en faire un compte STAGIAIRE (« Cette adresse appartient déjà à un compte
 * non-stagiaire… »). C'est le même défaut que les comptes stagiaire orphelins, réglé par la 139.
 *
 * LA CORRECTION. En supprimant l'entreprise, on retire aussi le compte du représentant — mais SEULEMENT
 * s'il est bien un compte ENTREPRISE et que plus RIEN ne s'y rattache (aucune autre entreprise, aucune
 * fiche stagiaire). La migration 207 nettoie les orphelins déjà en base.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const plat = (s) => String(s).replace(/\s+/g, ' ').trim();
let captures = [];
let scenario = {};
const faux = {
    promise: () => ({
        query: async (sql, p = []) => {
            const q = plat(sql);
            if (/information_schema/i.test(q)) return [[{ 1: 1 }]]; // colonneOuNull : company.user_id existe
            if (/^SELECT name, user_id FROM company WHERE id/.test(q)) return [[scenario.company]];
            if (/COUNT\(\*\) AS n FROM company WHERE user_id/.test(q)) return [[{ n: scenario.autresEntreprises }]];
            if (/COUNT\(\*\) AS n FROM learner WHERE user_id/.test(q)) return [[{ n: scenario.fiches }]];
            if (/^(INSERT|UPDATE|DELETE)/.test(q)) { captures.push({ q, p }); return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { deleteCompany } = require('../controllers/company.controller.js');

async function supprimer(sc) {
    scenario = sc; captures = [];
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(x) { r.corps = x; return this; } };
    const avant = console.error; console.error = () => {};
    try { await deleteCompany({ user: { organization_id: 'org-1', id: 'admin', role: 'ADMIN_ORGANISME' }, params: { id: 'c1' } }, res); }
    finally { console.error = avant; }
    return r;
}
const userSupprime = () => captures.find((c) => /^DELETE FROM user/.test(c.q));

test('le représentant ORPHELIN (plus rien ne s\'y rattache) est supprimé avec l\'entreprise', async () => {
    const r = await supprimer({ company: { name: 'Test', user_id: 'u-rep' }, autresEntreprises: 0, fiches: 0 });
    assert.strictEqual(r.corps && r.corps.success, true);
    const del = userSupprime();
    assert.ok(del, 'le compte du représentant orphelin doit être supprimé');
    assert.match(del.q, /role = 'ENTREPRISE'/, "garde-fou : jamais autre chose qu'un compte entreprise");
    assert.deepStrictEqual(del.p, ['u-rep', 'org-1'], 'par id, borné à l\'organisme');
});

test('le représentant ENCORE rattaché (autre entreprise OU fiche stagiaire) n\'est PAS supprimé', async () => {
    await supprimer({ company: { name: 'Test', user_id: 'u-rep' }, autresEntreprises: 1, fiches: 0 });
    assert.ok(!userSupprime(), 'rattaché à une autre entreprise → on garde le compte');
    await supprimer({ company: { name: 'Test', user_id: 'u-rep' }, autresEntreprises: 0, fiches: 1 });
    assert.ok(!userSupprime(), 'rattaché à une fiche stagiaire → on garde le compte');
});

test('une entreprise SANS compte représentant : rien à nettoyer', async () => {
    const r = await supprimer({ company: { name: 'Test', user_id: null }, autresEntreprises: 0, fiches: 0 });
    assert.strictEqual(r.corps && r.corps.success, true);
    assert.ok(!userSupprime(), 'pas de compte à supprimer');
});

/* ─── La migration qui nettoie les orphelins déjà en base ──────────────────────────────────────── */
test('la migration 207 retire les comptes ENTREPRISE que plus rien ne référence', () => {
    const mig = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database/migrations/207_comptes_entreprise_orphelins.sql'), 'utf8');
    assert.match(mig, /role = 'ENTREPRISE'/, 'ne touche que les comptes entreprise');
    assert.match(mig, /NOT EXISTS \(SELECT 1 FROM company c\s+WHERE c\.user_id = u\.id\)/, 'aucune entreprise ne le référence');
    assert.match(mig, /NOT EXISTS \(SELECT 1 FROM learner l WHERE l\.user_id = u\.id\)/, 'aucune fiche stagiaire ne le référence');
    const rev = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database/migrations/207_revert_comptes_entreprise_orphelins.sql'), 'utf8');
    assert.match(rev, /DO 0/, 'un compte effacé ne se recrée pas : revert neutre');
});
