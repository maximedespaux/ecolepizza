/**
 * OUVRIR L'APP COMPTE COMME UNE CONNEXION DU JOUR (demandé le 2026-10-13).
 *
 * LE DÉFAUT. `connexion_jour` (migration 200) n'était écrit qu'au LOGIN, et `last_login_at` de même.
 * Or le jeton « rester connecté » dure 7 jours : un compte actif chaque jour ne se reconnecte pas, et
 * n'apparaissait donc dans la page Statistiques que le jour de son login. La courbe « Connexions par
 * jour » comptait des LOGINS, pas des comptes ACTIFS ; la récence disait « depuis la dernière
 * connexion » au lieu de « depuis la dernière activité ».
 *
 * LA CORRECTION. `/auth/me` — le passage que l'app fait à CHAQUE ouverture — pose désormais la même
 * trace que le login (`tracerConnexion`, une seule copie partagée) : une ligne par compte et par jour
 * (INSERT IGNORE), et `last_login_at` à maintenant. On NE touche PAS `deactivated_at` ici : annuler une
 * désactivation reste réservé au VRAI login (la purge, migration 199, se compte sur `deactivated_at`).
 *
 * Ces tests gèlent : les DEUX écritures sur /auth/me, le rôle qui fige `est_stagiaire`, le garde-fou
 * `active = 0`, et l'absence d'annulation de désactivation sur /auth/me.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminDb = require.resolve('../config/database.js');
let requetes = [];
let userRow = null;
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            requetes.push({ sql: q, params });
            if (/^SELECT \* FROM user WHERE id/.test(q)) return [userRow ? [userRow] : []];
            if (/FROM learner WHERE user_id/.test(q)) return [[{ n: 0 }]];
            if (/FROM company WHERE user_id/.test(q)) return [[{ n: 0 }]];
            return [{ affectedRows: 1 }];
        },
    }),
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { getCurrentUser } = require('../controllers/auth.controller.js');

function appeler(row) {
    requetes = [];
    userRow = row;
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    return getCurrentUser({ user: { id: row.id } }, res).then(() => res);
}
const aConnexionJour = () => requetes.find((r) => /INSERT IGNORE INTO connexion_jour/.test(r.sql));
const aMajLastLogin = () => requetes.find((r) => /UPDATE user SET last_login_at = NOW\(\)/.test(r.sql));
const aAnnulDesactivation = () => requetes.find((r) => /deactivated_at = NULL/.test(r.sql));

test('ouvrir l\'app (/auth/me) écrit la connexion DU JOUR *et* rafraîchit la récence', async () => {
    await appeler({ id: 'u1', organization_id: 'o1', role: 'STAGIAIRE', active: 1, nav_access: null });
    const cj = aConnexionJour();
    assert.ok(cj, 'une ligne connexion_jour doit être écrite — sinon la courbe ne compte que les logins');
    assert.deepStrictEqual(cj.params, ['u1', 'o1', 1], 'user, org, est_stagiaire=1 pour un stagiaire');
    assert.ok(aMajLastLogin(), 'last_login_at doit passer à maintenant — c\'est la récence « depuis la dernière activité »');
});

test('le rôle fige est_stagiaire : l\'équipe est comptée à part (0)', async () => {
    await appeler({ id: 'u2', organization_id: 'o1', role: 'SECRETARIAT', active: 1, nav_access: null });
    assert.deepStrictEqual(aConnexionJour().params, ['u2', 'o1', 0], 'un non-stagiaire → est_stagiaire=0');
});

test('un compte désactivé par l\'administration (active=0) n\'est PAS compté', async () => {
    const res = await appeler({ id: 'u3', organization_id: 'o1', role: 'STAGIAIRE', active: 0, nav_access: null });
    assert.strictEqual(res.code, 200, 'le profil se lit encore');
    assert.ok(!aConnexionJour(), 'pas de ligne de connexion pour un compte coupé');
    assert.ok(!aMajLastLogin(), 'ni de récence rafraîchie');
});

test('/auth/me N\'ANNULE PAS une désactivation en attente — seul le vrai login le fait', async () => {
    await appeler({ id: 'u4', organization_id: 'o1', role: 'STAGIAIRE', active: 1, deactivated_at: '2026-10-01', nav_access: null });
    assert.ok(aConnexionJour(), 'l\'activité est bien tracée');
    assert.ok(!aAnnulDesactivation(), 'mais deactivated_at ne doit PAS être effacé par une simple ouverture de l\'app');
});

/* ─── La trace est UNE SEULE règle, partagée login + /auth/me ───────────────────────────────────── */
test('le login ET /auth/me passent par le même tracerConnexion ; l\'annulation de désactivation reste au login', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/auth.controller.js'), 'utf8');
    // Une seule fonction décrit la trace, et elle porte les DEUX écritures.
    const bloc = src.slice(src.indexOf('function tracerConnexion'));
    const corps = bloc.slice(0, bloc.indexOf('\n}'));
    assert.match(corps, /UPDATE user SET last_login_at = NOW\(\)/, 'last_login_at (récence)');
    assert.match(corps, /INSERT IGNORE INTO connexion_jour/, 'connexion_jour (courbe)');
    assert.doesNotMatch(corps, /deactivated_at/, 'l\'annulation de désactivation n\'appartient pas à la trace partagée');
    // Les deux appelants s'en servent.
    assert.ok((src.match(/tracerConnexion\(conn, user\)/g) || []).length >= 2, 'login + getCurrentUser appellent tracerConnexion');
    // L'annulation de désactivation (199) vit au login, hors de la trace partagée.
    assert.match(src, /UPDATE user SET deactivated_at = NULL WHERE id = \? AND deactivated_at IS NOT NULL/);
});
