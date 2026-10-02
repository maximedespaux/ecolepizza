/**
 * DÉSACTIVATION VOLONTAIRE D'UN PROFIL STAGIAIRE (demandé le 2026-10-02).
 *
 * Un stagiaire peut désactiver son profil (Mon profil → Compte). On pose la date ; TOUTE CONNEXION
 * l'efface (se reconnecter = garder son profil). Au bout de 15 SEMAINES sans connexion, un passage
 * quotidien SUPPRIME ses données non essentielles — Pizza Quest, mercuriale, fiches techniques —
 * et COUPE son accès (active = 0). Les PREUVES (documents, pièces, parcours, émargement, factures,
 * consentements) ne sont JAMAIS touchées.
 *
 * Ce fichier gèle ce qui, s'il cédait, effacerait trop (une preuve) ou trop peu (rien), sans bruit.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { purgerComptesDesactives, SEMAINES } = require('../lib/purgeComptesDesactives.js');

/** Fausse base : enregistre les requêtes ; `manquantes` = tables/colonnes qui lèvent une erreur. */
function fauxConn(comptes, { manquantes = [] } = {}) {
    const requetes = [];
    return {
        requetes,
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            requetes.push({ sql: q, params });
            if (/FROM user u\s+LEFT JOIN learner l/.test(q)) {
                if (manquantes.includes('user.deactivated_at')) { const e = new Error('x'); e.code = 'ER_BAD_FIELD_ERROR'; throw e; }
                return [comptes];
            }
            for (const t of manquantes) {
                if (t !== 'user.deactivated_at' && new RegExp(`\\b${t}\\b`).test(q)) { const e = new Error('x'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }
            }
            return [{ affectedRows: 1 }];
        },
    };
}

test('ne prend que les profils désactivés depuis plus de 15 semaines, et encore actifs', async () => {
    const conn = fauxConn([]);
    const maintenant = new Date('2026-10-02T12:00:00Z');
    await purgerComptesDesactives({ conn, maintenant });
    const sel = conn.requetes.find((r) => /FROM user u/.test(r.sql));
    assert.match(sel.sql, /deactivated_at IS NOT NULL AND u\.deactivated_at <= \? AND u\.active = 1/);
    assert.strictEqual(+new Date(sel.params[0]), +new Date(maintenant.getTime() - 15 * 7 * 24 * 60 * 60 * 1000), 'coupure à 15 semaines');
    assert.strictEqual(SEMAINES, 15);
});

test('supprime les données non essentielles, GARDE les preuves, et coupe l’accès', async () => {
    const conn = fauxConn([{ user_id: 'u1', organization_id: 'o1', learner_id: 'l1' }]);
    assert.strictEqual(await purgerComptesDesactives({ conn }), 1);
    const ecrit = conn.requetes.filter((r) => /^DELETE|^UPDATE/.test(r.sql)).map((r) => r.sql);

    // Ce qui part :
    assert.ok(ecrit.some((q) => /DELETE FROM recipe WHERE author_user_id = \?/.test(q)), 'fiches techniques');
    for (const t of ['recipe_like', 'recipe_comment', 'recipe_read', 'mercuriale_item']) {
        assert.ok(ecrit.some((q) => new RegExp(`DELETE FROM ${t} WHERE user_id = \\?`).test(q)), t);
    }
    assert.ok(ecrit.some((q) => /DELETE FROM learner_quest_progress WHERE learner_id = \?/.test(q)), 'progression Pizza Quest');
    assert.ok(ecrit.some((q) => /DELETE FROM learner_quest_life WHERE learner_id = \?/.test(q)), 'cœurs');
    assert.ok(ecrit.some((q) => /UPDATE learner SET avatar = NULL, cadre = NULL WHERE id = \?/.test(q)), 'avatar/cadre');
    assert.ok(ecrit.some((q) => /UPDATE user SET active = 0 WHERE id = \?/.test(q)), 'accès coupé');

    // Les PREUVES ne sont JAMAIS touchées :
    for (const t of ['generated_document', 'piece_depot', 'piece_fichier', 'enrollment', 'attendance_record', 'invoice', 'payment', 'consent_record', 'audit_log', 'archive_document']) {
        assert.ok(!ecrit.some((q) => new RegExp(`\\b${t}\\b`).test(q)), `${t} ne doit JAMAIS être touché`);
    }
    // On garde les badges de formation et les cadres accordés par l'école :
    assert.ok(!ecrit.some((q) => /\b(levels|completed_levels|cadres_exclusifs)\b/.test(q)), 'levels / cadres_exclusifs gardés');
});

test('une table absente (mercuriale, cœurs) ne fait pas échouer la purge — l’accès est quand même coupé', async () => {
    const conn = fauxConn([{ user_id: 'u1', learner_id: 'l1' }], { manquantes: ['mercuriale_item', 'learner_quest_life'] });
    assert.strictEqual(await purgerComptesDesactives({ conn }), 1);
    assert.ok(conn.requetes.some((r) => /UPDATE user SET active = 0/.test(r.sql)));
});

test('sans la colonne deactivated_at (migration 199 non jouée), rien ne se passe', async () => {
    const conn = fauxConn([], { manquantes: ['user.deactivated_at'] });
    assert.strictEqual(await purgerComptesDesactives({ conn }), 0);
    assert.ok(!conn.requetes.some((r) => /^DELETE|active = 0/.test(r.sql)), 'aucune écriture');
});

/* ── Le câblage, lu au source ──────────────────────────────────────────────────────────────── */
const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(f, 'utf8');

test('se reconnecter annule la désactivation, et seul un stagiaire peut se désactiver', () => {
    const auth = lire(path.join(API, 'controllers/auth.controller.js'));
    assert.match(auth, /UPDATE user SET deactivated_at = NULL WHERE id = \? AND deactivated_at IS NOT NULL/,
        'la connexion efface la date — par une requête à part de celle de last_login_at');
    assert.match(auth, /if \(req\.user\.role !== 'STAGIAIRE'\)/, 'le bureau ne peut pas se désactiver (sinon on couperait l’école)');
    const routes = lire(path.join(API, 'routes/auth.routes.js'));
    assert.match(routes, /router\.post\('\/deactivate', authenticateToken, deactivateMyAccount\)/);
    assert.match(routes, /router\.post\('\/reactivate', authenticateToken, reactivateMyAccount\)/);
});

test('le passage quotidien est programmé, et le bouton est au Compte (stagiaire seulement)', () => {
    const srv = lire(path.join(API, 'server.js'));
    assert.match(srv, /purgerComptesDesactives/);
    assert.match(srv, /setInterval\(purgerDesactives, 24 \* 60 \* 60 \* 1000\)/, 'une fois par jour');
    const modal = lire(path.join(UI, 'components/ProfileModal.jsx'));
    assert.match(modal, /Désactiver mon profil/);
    assert.match(modal, /deactivateMyProfile\(\)/);
    assert.match(modal, /role === "STAGIAIRE" &&/, 'le bouton ne s’affiche que pour un stagiaire');
});
