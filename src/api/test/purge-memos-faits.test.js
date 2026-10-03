/**
 * UN MÉMO FAIT EST SUPPRIMÉ UN JOUR PLUS TARD (demandé le 2026-10-03).
 *
 * Cocher un mémo « fait » pose `fait_le` (memo.controller) mais ne supprimait rien : la liste des
 * faits s'allongeait sans fin. Un passage (server.js, horaire) supprime désormais, EN BASE, les
 * mémos faits il y a plus d'UN JOUR — la ligne `memo` et, par cascade, ses liens (177) et pièces
 * jointes (193). Décocher efface `fait_le` : le mémo redevient à faire et échappe à la purge.
 *
 * Réintroduire le défaut (retirer la condition `fait_le`, ou ne jamais purger) fait rougir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { purgerMemosFaits, JOURS } = require('../lib/purgeMemosFaits.js');

test('supprime les mémos faits il y a PLUS d\'un jour, et eux seuls', async () => {
    let sql = null; let params = null;
    const conn = { query: async (s, p) => { sql = s; params = p; return [{ affectedRows: 3 }]; } };
    const maintenant = new Date('2026-10-03T12:00:00');
    const n = await purgerMemosFaits({ conn, maintenant });
    assert.strictEqual(n, 3, 'rend le nombre supprimé');
    // La condition porte sur fait_le NON NUL (un mémo décoché, fait_le NULL, est épargné)…
    assert.match(sql, /DELETE FROM memo WHERE fait_le IS NOT NULL AND fait_le <= \?/);
    // … et le seuil est bien « il y a un jour » (24 h avant la référence).
    assert.strictEqual(JOURS, 1);
    assert.strictEqual(params[0].getTime(), maintenant.getTime() - 24 * 60 * 60 * 1000);
});

test('sans la table memo (migration 176 non jouée), le passage ne fait rien', async () => {
    const conn = { query: async () => { const e = new Error('no table'); e.code = 'ER_NO_SUCH_TABLE'; throw e; } };
    assert.strictEqual(await purgerMemosFaits({ conn }), 0);
});

test('une autre erreur SQL remonte (on ne l\'avale pas en silence)', async () => {
    const conn = { query: async () => { const e = new Error('boom'); e.code = 'ER_LOCK_WAIT_TIMEOUT'; throw e; } };
    await assert.rejects(() => purgerMemosFaits({ conn }), /boom/);
});

test('le passage est câblé dans server.js, toutes les heures', () => {
    const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(srv, /const \{ purgerMemosFaits \} = require\('\.\/lib\/purgeMemosFaits\.js'\);/);
    assert.match(srv, /setInterval\(purgerMemos, 60 \* 60 \* 1000\)\.unref\?\.\(\);/, 'passage horaire');
    assert.match(srv, /setTimeout\(purgerMemos, 4 \* 60 \* 1000\)\.unref\?\.\(\);/, 'premier passage après le démarrage');
});
