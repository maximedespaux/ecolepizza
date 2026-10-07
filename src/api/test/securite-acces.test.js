/**
 * CORRECTIFS DE L'AUDIT D'ACCÈS DU 2026-10-07.
 *
 * Trois défauts relevés en vérifiant que stagiaires et entreprises n'accèdent qu'à LEURS données :
 *
 *   1. (Moyen) GET /api/notifications rendait les notifications d'ORGANISME (user_id nul) à tout
 *      compte connecté — un stagiaire ou une entreprise y lisait les commandes boutique (nom,
 *      montant, retrait) et les signatures (« Signé par X ») de TOUT LE MONDE, et pouvait d'un
 *      « tout marquer lu » éteindre la cloche de l'équipe. La cloche d'organisme est désormais
 *      réservée à l'équipe interne (liste POSITIVE) ; les non-équipe gardent leurs notifications
 *      NOMINATIVES (leur « Émargement à signer »).
 *   2. (Faible) GET /api/recipes/author/:userId rendait le nom d'un compte de n'importe quel
 *      organisme ; désormais borné à l'organisme de l'appelant.
 *   3. (Faible) GET /api/stagiaires/:id (fiche) embarquait, via `...rows[0]`, le certificat de
 *      signature (clé privée P12, chiffrée) du stagiaire ; retiré de la réponse.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');

// ── Fausse base, AVANT de requérir le contrôleur (comme stagiaire-a-recontacter) ───────────────
let requetes = [];
const faux = {
    promise: () => ({ query: async (sql, params) => { requetes.push({ sql, params }); return [[]]; } }),
    query: (sql, params, cb) => { requetes.push({ sql, params }); if (typeof cb === 'function') cb(null, { affectedRows: 1 }); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { voitClocheOrg, porteeNotif, markRead, markAllRead } = require('../controllers/notification.controller.js');

async function appeler(fn, user) {
    requetes = [];
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const err = console.error; console.error = () => {};
    try { await fn({ user, params: { id: 'n1' } }, res); } finally { console.error = err; }
    // markRead est en callback : laisser le microtask se vider.
    await new Promise((r) => setImmediate(r));
    return { code, corps };
}
const majNotif = () => requetes.find((q) => /UPDATE notification SET is_read/.test(q.sql));

// ── Finding 1 : la portée de la cloche ─────────────────────────────────────────────────────────
test('la cloche d\'ORGANISME est réservée à l\'équipe interne (liste positive)', () => {
    for (const r of ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR']) {
        assert.strictEqual(voitClocheOrg(r), true, `${r} fait partie de l'équipe`);
        assert.strictEqual(porteeNotif(r), '(user_id = ? OR user_id IS NULL)', `${r} voit aussi l'organisme`);
    }
    // Les comptes « participants » ne voient QUE leurs notifications nominatives.
    for (const r of ['STAGIAIRE', 'ENTREPRISE', 'INTERVENANT']) {
        assert.strictEqual(voitClocheOrg(r), false, `${r} n'est pas l'équipe`);
        assert.strictEqual(porteeNotif(r), 'user_id = ?', `${r} : seulement ses lignes nominatives`);
    }
});

test('markRead : un stagiaire ne touche QUE ses lignes nominatives, un secrétariat aussi l\'organisme', async () => {
    await appeler(markRead, { id: 'u-stg', organization_id: 'o1', role: 'STAGIAIRE' });
    const q1 = majNotif();
    assert.match(q1.sql, /AND user_id = \?/);
    assert.doesNotMatch(q1.sql, /user_id IS NULL/, 'un stagiaire ne peut pas marquer une notification d\'organisme');

    await appeler(markRead, { id: 'u-sec', organization_id: 'o1', role: 'SECRETARIAT' });
    assert.match(majNotif().sql, /\(user_id = \? OR user_id IS NULL\)/, 'l\'équipe marque aussi l\'organisme');
});

test('markAllRead : même portée — le stagiaire ne peut pas éteindre la cloche de l\'équipe', async () => {
    await appeler(markAllRead, { id: 'u-stg', organization_id: 'o1', role: 'ENTREPRISE' });
    const q = majNotif();
    assert.match(q.sql, /WHERE organization_id = \? AND user_id = \? AND is_read = 0/);
    assert.doesNotMatch(q.sql, /user_id IS NULL/);

    await appeler(markAllRead, { id: 'u-adm', organization_id: 'o1', role: 'ADMIN_ORGANISME' });
    assert.match(majNotif().sql, /\(user_id = \? OR user_id IS NULL\) AND is_read = 0/);
});

test('getNotifications : la liste ET le compteur passent par la portée (source)', () => {
    const src = lire('controllers/notification.controller.js');
    // Les deux requêtes utilisent le fragment de portée, plus aucune n'écrit « user_id IS NULL » en dur.
    const occ = (re) => (src.match(re) || []).length;
    assert.ok(occ(/\$\{porteeNotif\(role\)\}/g) >= 2, 'liste + compteur bornés par la portée');
    assert.ok(occ(/\$\{porteeNotif\(req\.user\.role\)\}/g) >= 2, 'markRead + markAllRead aussi');
    // Le fragment « OR user_id IS NULL » n'existe plus QU'UNE fois : dans la définition du helper,
    // jamais recopié en dur dans une requête (chaque requête passe par porteeNotif).
    assert.strictEqual(occ(/user_id = \? OR user_id IS NULL/g), 1, 'le fragment ne vit que dans le helper');
    // La liste est bien une liste POSITIVE (pas une exclusion « sauf stagiaire »).
    assert.match(src, /ROLES_CLOCHE_ORG = \[\.\.\.new Set\(\[\.\.\.STAFF_ROLES, \.\.\.AUDIT_ROLES\]\)\]/);
    assert.doesNotMatch(src, /role !== 'STAGIAIRE'/, 'jamais par exclusion');
});

// ── Finding 2 : le profil d'auteur est borné à l'organisme ─────────────────────────────────────
test('author profile : le nom n\'est rendu que pour un compte du MÊME organisme', () => {
    const src = lire('controllers/recipe.controller.js');
    assert.match(src,
        /SELECT first_name, last_name, email, phone FROM user WHERE id = \? AND organization_id = \?/,
        'la requête du nom d\'auteur porte le filtre d\'organisme');
    assert.match(src, /\[uid, req\.user\.organization_id\]/, 'et lie bien l\'organisme de l\'appelant');
});

// ── Finding 3 : la clé privée de signature ne sort pas de la fiche ─────────────────────────────
test('fiche stagiaire : le certificat de signature (clé privée) est retiré de la réponse', () => {
    const src = lire('controllers/learner.controller.js');
    assert.match(src, /delete learner\.sign_cert;/, 'sign_cert ne doit pas partir au client');
    // Le modèle qu'on suit existe toujours ailleurs (cohérence).
    assert.match(lire('controllers/organization.controller.js'), /delete org\.sign_cert;/);
    assert.match(lire('controllers/invoice.controller.js'), /sign_cert/);
});
