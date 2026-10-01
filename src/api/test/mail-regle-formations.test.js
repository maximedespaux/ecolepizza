/**
 * PLUSIEURS FORMATIONS POUR UN ENVOI PROGRAMMÉ (migration 198) — « Toutes / une / plusieurs ».
 *
 * CE QUE CES TESTS GÈLENT :
 *   · la table d'association fait autorité quand elle porte des lignes ; sinon on retombe sur
 *     `program_id` (une formation, ou NULL = toutes) — avant comme après la migration ;
 *   · une règle multi vise un document / un dossier d'UNE de ses formations, pas des autres ;
 *   · `program_id` reste EN PHASE avec la liste (une seule → la colonne la porte, pour le repli) ;
 *   · le passage filtre en `IN`, l'écran propose des cases quand la 198 est là, un select sinon.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { formationsDeRegle, regleViseDocument } = require('../lib/reglesDocument.js');
const { lireRegle } = require('../lib/mailsProgrammes.js');
const API = path.join(__dirname, '..');

test('formationsDeRegle : la liste prime, sinon program_id, sinon toutes (null)', () => {
    assert.deepStrictEqual(formationsDeRegle({ program_ids: ['a', 'b'] }), ['a', 'b']);
    assert.deepStrictEqual(formationsDeRegle({ program_ids: [], program_id: 'x' }), ['x']);
    assert.deepStrictEqual(formationsDeRegle({ program_id: 'x' }), ['x']);
    assert.strictEqual(formationsDeRegle({ program_ids: [], program_id: null }), null);
    assert.strictEqual(formationsDeRegle({}), null);
});

test('regleViseDocument : le document doit être de l’une des formations visées', () => {
    const r = { program_ids: ['f1', 'f2'] };
    assert.ok(regleViseDocument(r, { program_id: 'f2' }));
    assert.ok(!regleViseDocument(r, { program_id: 'f3' }));
    assert.ok(!regleViseDocument(r, { program_id: null }), 'un document sans formation n’est d’aucune des formations visées');
    assert.ok(regleViseDocument({ program_ids: [] }, { program_id: 'f9' }), 'aucune formation = toutes');
    assert.ok(regleViseDocument({ program_id: 'f1' }, { program_id: 'f1' }), 'repli sur program_id unique');
    assert.ok(!regleViseDocument({ program_id: 'f1' }, { program_id: 'f2' }));
});

test('lireRegle : program_ids analysé, program_id gardé en phase', () => {
    const base = { nom: 'R', declencheur: 'fin_session', objet: 'O', corps: 'C' };
    const un = lireRegle({ ...base, program_ids: ['f1'] }).valeurs;
    assert.deepStrictEqual(un.program_ids, ['f1']);
    assert.strictEqual(un.program_id, 'f1', 'une seule → la colonne la porte (repli sans 198)');

    const multi = lireRegle({ ...base, program_ids: ['f1', 'f2', 'f1'] }).valeurs;
    assert.deepStrictEqual(multi.program_ids, ['f1', 'f2'], 'dédoublonné');
    assert.strictEqual(multi.program_id, null, 'plusieurs → NULL');

    const toutes = lireRegle({ ...base, program_ids: [] }).valeurs;
    assert.deepStrictEqual(toutes.program_ids, []);
    assert.strictEqual(toutes.program_id, null);

    const vieux = lireRegle({ ...base, program_id: 'f7' }).valeurs; // ancien client : program_id seul
    assert.deepStrictEqual(vieux.program_ids, ['f7'], 'relu comme une liste d’un');
    assert.strictEqual(vieux.program_id, 'f7');
});

test('serveur : écrit/lit la table d’association, et le passage filtre en IN', () => {
    const ctrl = fs.readFileSync(path.join(API, 'controllers/mailing.controller.js'), 'utf8');
    assert.match(ctrl, /INSERT INTO mail_regle_formation/);
    assert.match(ctrl, /DELETE FROM mail_regle_formation WHERE regle_id = \?/);
    assert.match(ctrl, /formations_multiples: a198/);
    assert.match(ctrl, /MIGRATION_198/, 'plusieurs formations sans la 198 → 503, pas un repli silencieux sur « toutes »');
    const passage = fs.readFileSync(path.join(API, 'lib/passageMailsProgrammes.js'), 'utf8');
    assert.match(passage, /AND s\.program_id IN \(\?\)/);
    assert.match(passage, /formationsDeRegle/);
});

test('écran : cases de formations quand la 198 est jouée, select sinon', () => {
    const page = fs.readFileSync(path.join(API, '..', 'app/ui/pages/Mailing.jsx'), 'utf8');
    assert.match(page, /formationsMultiples/);
    assert.match(page, /mail-form-multi/);
    assert.match(page, /setMultiFormations\(!!r\.formations_multiples\)/);
});

test('la 198 crée la table d’association, son revert la détruit', () => {
    const MIG = path.join(API, '..', '..', 'database', 'migrations');
    const aller = fs.readFileSync(path.join(MIG, '198_mail_regle_formation.sql'), 'utf8');
    assert.match(aller, /CREATE TABLE IF NOT EXISTS mail_regle_formation/);
    assert.match(aller, /ON DELETE CASCADE/);
    assert.ok(!/--/.test(aller), 'commentaires en blocs');
    assert.match(fs.readFileSync(path.join(MIG, '198_revert_mail_regle_formation.sql'), 'utf8'), /DROP TABLE IF EXISTS mail_regle_formation/);
});
