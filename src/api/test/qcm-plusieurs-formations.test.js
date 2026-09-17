/**
 * UN QCM, PLUSIEURS FORMATIONS — et un jour propre à chacune (migration 163).
 *
 * Demandé le 2026-09-17 : « créer un QCM rattaché à toutes les formations au lieu de les mettre
 * une par une ». Relevé en production ce jour-là : 22 des 23 QCM de l'école étaient des copies de
 * 6 d'entre eux, une par formation, parce qu'un QCM n'avait qu'UNE formation — et qu'activer un
 * QCM non rattaché dans un parcours le rattachait aussitôt, le retirant des autres.
 *
 * Ce que ces tests gardent, au-delà du partage lui-même :
 *  · LES ANCIENS STAGIAIRES. L'envoi automatique tourne à chaque ouverture de l'espace, pour tous
 *    les dossiers, sessions finies comprises. Sans garde, partager un QCM entre cinq formations
 *    l'aurait envoyé à des centaines de personnes qui ont déjà répondu à leur propre version ;
 *  · LA DATE DE RATTACHEMENT, qui porte cette garde : un enregistrement ne doit jamais la remettre
 *    à zéro (upsert, pas « supprimer puis réinsérer ») ;
 *  · LES QCM EUX-MÊMES : `quiz.program_id` porte ON DELETE CASCADE — supprimer une formation sans
 *    détacher d'abord emporterait ses QCM et leurs réponses.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
    formationsDesQcm, jourPour, formationsDemandees, enregistrerFormations, rattacherSiOrphelin, detacherFormation,
} = require('../lib/qcmFormations.js');

const API = path.join(__dirname, '..');
const RACINE = path.join(API, '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const sansCommentaires = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Base simulée : répond selon la requête, et garde la trace de ce qui est émis. */
function base({ table = true, reponses = [] } = {}) {
    const emises = [];
    const conn = {
        query: async (sql, params) => {
            const q = String(sql).replace(/\s+/g, ' ').trim();
            emises.push({ sql: q, params });
            if (/information_schema\.tables/.test(q)) return [table ? [{ 1: 1 }] : []];
            for (const [re, rep] of reponses) if (re.test(q)) return [typeof rep === 'function' ? rep(params) : rep];
            return [{ affectedRows: 1 }];
        },
    };
    return { conn, emises, emis: (re) => emises.filter((e) => re.test(e.sql)) };
}

test('les formations d\'un QCM : la table, PLUS la formation principale, sans doublon', async () => {
    const b = base({ reponses: [
        [/FROM quiz_program qp JOIN quiz q/, [
            { quiz_id: 'q1', program_id: 'HYG', day: 3, lie_le: '2026-08-01' },
            { quiz_id: 'q1', program_id: 'NIV1H', day: 4, lie_le: '2026-09-17' },
        ]],
        // q1 : sa principale est déjà une ligne ; q2 : rattaché par l'ancien code, sans ligne.
        [/FROM quiz q WHERE q\.organization_id = \? AND q\.program_id IS NOT NULL/, [
            { quiz_id: 'q1', program_id: 'HYG', day: null, lie_le: '2026-07-01' },
            { quiz_id: 'q2', program_id: 'NIV2', day: null, lie_le: '2026-06-15' },
        ]],
    ] });
    const m = await formationsDesQcm(b.conn, 'org');
    assert.deepStrictEqual(m.get('q1'), [
        { program_id: 'HYG', day: 3, lie_le: '2026-08-01' },
        { program_id: 'NIV1H', day: 4, lie_le: '2026-09-17' },
    ], 'la principale n\'est pas comptée deux fois — et la ligne de la table fait foi');
    assert.deepStrictEqual(m.get('q2'), [{ program_id: 'NIV2', day: null, lie_le: '2026-06-15' }],
        'un QCM rattaché par l\'ancien code, entre migration et déploiement, n\'est pas perdu');
});

test('sans la migration : la seule formation principale, comme avant', async () => {
    const b = base({ table: false, reponses: [
        [/FROM quiz q WHERE/, [{ quiz_id: 'q1', program_id: 'NIV1', day: null, lie_le: '2026-01-01' }]],
    ] });
    const m = await formationsDesQcm(b.conn, 'org');
    assert.deepStrictEqual(m.get('q1').map((l) => l.program_id), ['NIV1']);
    assert.strictEqual(b.emis(/quiz_program/).length, 0, 'la table absente n\'est jamais interrogée');
});

test('le jour : celui de la formation, sinon celui du QCM', () => {
    assert.strictEqual(jourPour({ day: 2 }, { day: 4 }), 4);
    assert.strictEqual(jourPour({ day: 2 }, { day: null }), 2);
    assert.strictEqual(jourPour({ day: null }, { day: null }), null);
    assert.strictEqual(jourPour({ day: -7 }, null), -7, 'un test de positionnement J-7');
});

test('les formations demandées sont nettoyées — et jamais celles d\'un autre organisme', async () => {
    const b = base({ reponses: [[/FROM training_program WHERE organization_id = \? AND id IN/, [{ id: 'A' }, { id: 'B' }]]] });
    const f = await formationsDemandees(b.conn, 'org', {
        formations: [{ program_id: 'A', day: '3' }, { program_id: 'A', day: 9 }, { program_id: 'B', day: '' }, { program_id: 'AUTRE-ORG', day: 1 }, {}],
    });
    assert.deepStrictEqual(f, [{ program_id: 'A', day: 3 }, { program_id: 'B', day: null }]);
    assert.deepStrictEqual(b.emis(/FROM training_program/)[0].params, ['org', ['A', 'B', 'AUTRE-ORG']]);
    // Un écran d'avant n'envoie que `program_id` : il est compris.
    const legacy = await formationsDemandees(base({ reponses: [[/FROM training_program/, [{ id: 'A' }]]] }).conn, 'org', { program_id: 'A' });
    assert.deepStrictEqual(legacy, [{ program_id: 'A', day: null }]);
});

test('enregistrer : ce qui n\'est plus coché part, le reste est mis à jour SANS perdre sa date', async () => {
    const b = base();
    await enregistrerFormations(b.conn, 'q1', [{ program_id: 'A', day: 3 }, { program_id: 'B', day: null }], true);
    const sup = b.emis(/^DELETE FROM quiz_program/);
    assert.strictEqual(sup.length, 1);
    assert.match(sup[0].sql, /WHERE quiz_id = \? AND program_id NOT IN \(\?\)/, 'seules les formations décochées');
    assert.deepStrictEqual(sup[0].params, ['q1', ['A', 'B']]);
    const ins = b.emis(/^INSERT INTO quiz_program/);
    assert.strictEqual(ins.length, 2);
    assert.ok(ins.every((i) => /ON DUPLICATE KEY UPDATE day = VALUES\(day\)$/.test(i.sql)),
        'upsert : une formation déjà liée garde sa date de rattachement — la garde des anciens stagiaires en dépend');
    assert.strictEqual(b.emis(/REPLACE INTO|created_at/).length, 0);
});

test('un écran d\'avant (sans `formations`) n\'efface AUCUNE formation en enregistrant', async () => {
    const b = base();
    await enregistrerFormations(b.conn, 'q1', [{ program_id: 'A', day: null }], false);
    assert.strictEqual(b.emis(/^DELETE FROM quiz_program/).length, 0);
    assert.strictEqual(b.emis(/^INSERT INTO quiz_program/).length, 1, 'il ajoute la sienne, et c\'est tout');
});

test('sans la migration, plusieurs formations cochées : on le DIT', async () => {
    const r = await enregistrerFormations(base({ table: false }).conn, 'q1', [{ program_id: 'A' }, { program_id: 'B' }], true);
    assert.match(r.avertissement, /Migration 163 non jouée : seule la première formation cochée est enregistrée/);
    assert.deepStrictEqual(await enregistrerFormations(base({ table: false }).conn, 'q1', [{ program_id: 'A' }], true), {});
});

test('activer un QCM dans un parcours ne le rattache que s\'il est ORPHELIN, et de son organisme', async () => {
    // D'un autre organisme : rien.
    let b = base({ reponses: [[/SELECT id FROM quiz WHERE id = \? AND organization_id = \?/, []]] });
    assert.strictEqual(await rattacherSiOrphelin(b.conn, 'org', 'qX', 'P'), false);
    assert.strictEqual(b.emis(/^(UPDATE|INSERT)/).length, 0);
    // Déjà rattaché ailleurs : rien — il n'était d'ailleurs pas proposé ici.
    b = base({ reponses: [
        [/SELECT id FROM quiz WHERE id = \? AND organization_id = \?/, [{ id: 'q1' }]],
        [/FROM quiz_program qp JOIN quiz q/, [{ quiz_id: 'q1', program_id: 'AILLEURS', day: null, lie_le: null }]],
        [/FROM quiz q WHERE/, []],
    ] });
    assert.strictEqual(await rattacherSiOrphelin(b.conn, 'org', 'q1', 'P'), false);
    assert.strictEqual(b.emis(/^(UPDATE|INSERT)/).length, 0);
    // Orphelin : rattaché, dans les deux sources.
    b = base({ reponses: [[/SELECT id FROM quiz WHERE id = \? AND organization_id = \?/, [{ id: 'q1' }]], [/FROM quiz_program qp JOIN quiz q/, []], [/FROM quiz q WHERE/, []]] });
    assert.strictEqual(await rattacherSiOrphelin(b.conn, 'org', 'q1', 'P'), true);
    assert.strictEqual(b.emis(/^UPDATE quiz SET program_id = \? WHERE id = \? AND organization_id = \? AND program_id IS NULL$/).length, 1);
    assert.strictEqual(b.emis(/^INSERT IGNORE INTO quiz_program/).length, 1);
});

test('supprimer une formation : ses QCM gardent les AUTRES, et la principale passe à l\'une d\'elles', async () => {
    const b = base();
    await detacherFormation(b.conn, 'org', 'P');
    const ordre = b.emises.map((e) => e.sql).filter((q) => /^(DELETE|UPDATE)/.test(q));
    assert.match(ordre[0], /^DELETE FROM quiz_program WHERE program_id = \?$/, 'le lien part d\'abord…');
    assert.match(ordre[1], /^UPDATE quiz q SET q\.program_id = \(SELECT qp\.program_id FROM quiz_program qp WHERE qp\.quiz_id = q\.id ORDER BY qp\.created_at LIMIT 1\)/,
        '…puis la principale est reprise parmi les formations RESTANTES');
    const sans = base({ table: false });
    await detacherFormation(sans.conn, 'org', 'P');
    assert.strictEqual(sans.emis(/^UPDATE quiz SET program_id = NULL WHERE program_id = \? AND organization_id = \?$/).length, 1, 'sans la table : comme avant');
});

test('la suppression d\'une formation détache AVANT, et n\'avale pas l\'échec', () => {
    const src = sansCommentaires(lire('src/api/controllers/formationProgram.controller.js'));
    const fn = src.slice(src.indexOf('const deleteProgram'));
    const detache = fn.indexOf('await detacherFormation(conn, orgId, req.params.id);');
    assert.ok(detache > -1, 'appelé, et sans `.catch(() => {})` : un échec doit empêcher la suppression');
    assert.ok(detache < fn.indexOf('DELETE FROM training_program'), 'avant : ON DELETE CASCADE emporterait les QCM');
});

test('l\'envoi automatique épargne les sessions déjà terminées au rattachement', () => {
    const src = sansCommentaires(lire('src/api/controllers/espace.controller.js'));
    const fn = src.slice(src.indexOf('async function releaseAutoQuizzes'), src.indexOf('async function learnerForUser'));
    assert.match(fn, /DATE_FORMAT\(s\.end_date, '%Y-%m-%d'\) AS end_date/, 'la fin de session est lue');
    assert.match(fn, /formationsDesQcm\(conn, learner\.organization_id, quizzes\.map\(\(q\) => q\.id\)\)/, 'toutes les formations de chaque QCM');
    assert.match(fn, /const jour = jourPour\(q, lien\);/, 'au jour de CHAQUE formation');
    assert.match(fn, /if \(lien\.lie_le && e\.end_date && e\.end_date < lien\.lie_le\) continue;/,
        'une session finie avant le rattachement ne reçoit rien');
    // La SESSION, pas le jour : un test J-7 créé deux jours avant le début doit partir.
    assert.doesNotMatch(fn, /dayDate < lien\.lie_le/);
});

test('le parcours d\'une formation propose ses QCM, à SON jour', () => {
    const src = lire('src/api/controllers/formationProgram.controller.js');
    const zone = src.slice(src.indexOf('const selQuiz'), src.indexOf('const quizSteps'));
    assert.match(zone, /COALESCE\(qp\.day, q\.day\) AS day/);
    assert.match(zone, /LEFT JOIN quiz_program qp ON qp\.quiz_id = q\.id AND qp\.program_id = \?/);
    assert.match(zone, /qp\.quiz_id IS NOT NULL OR q\.program_id = \?/, 'une de ses formations, ou sa principale');
    assert.match(zone, /q\.program_id IS NULL AND NOT EXISTS \(SELECT 1 FROM quiz_program x WHERE x\.quiz_id = q\.id\)/,
        'orphelin = AUCUNE formation, dans les deux sources');
    assert.match(src, /rattacherSiOrphelin\(conn, req\.user\.organization_id, slug\.slice\(5\), req\.params\.id\)/);
    assert.doesNotMatch(sansCommentaires(src), /UPDATE quiz SET program_id = \? WHERE id = \? AND organization_id = \? AND program_id IS NULL/,
        'plus de rattachement direct : il volait le QCM aux autres formations');
});

test('liste, envoi manuel et fiche d\'un QCM lisent TOUTES ses formations', () => {
    const src = sansCommentaires(lire('src/api/controllers/quiz.controller.js'));
    const envoi = src.slice(src.indexOf('const sendQuiz'), src.indexOf('const sendQuizToEnrollment'));
    assert.match(envoi, /formationsDesQcm\(conn, req\.user\.organization_id, \[quiz\.id\]\)/);
    assert.match(envoi, /eligibleSessionsFor\(conn, req\.user\.organization_id, liens\)/);
    assert.doesNotMatch(envoi, /quiz\.program_id/, 'plus de lecture de la seule principale');
    const liste = src.slice(src.indexOf('const listQuizzes'), src.indexOf('const getQuiz'));
    assert.match(liste, /formationsDesFiches\(conn, req\.user\.organization_id, rows\)/);
    assert.doesNotMatch(liste, /if \(!q\.program_id\)/);
    const enr = src.slice(src.indexOf('const saveQuiz'), src.indexOf('const duplicateQuiz'));
    assert.match(enr, /enregistrerFormations\(conn, req\.params\.id, formations, Array\.isArray\(b\.formations\)\)/,
        '« liste complète » seulement si l\'écran l\'a envoyée');
    assert.match(enr, /formations\.length \? formations\[0\]\.program_id : null/, 'la première devient la principale');
    assert.match(src.slice(src.indexOf('const getQuiz'), src.indexOf('const createQuiz')), /\.\.\.quiz, formations,/);
});

test('la migration crée la table, reprend l\'existant, et son revert la retire', () => {
    const m = lire('database/migrations/163_qcm_plusieurs_formations.sql').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(m, /CREATE TABLE IF NOT EXISTS quiz_program \(/);
    assert.match(m, /day\s+int\s+DEFAULT NULL/);
    assert.match(m, /created_at\s+timestamp NOT NULL DEFAULT current_timestamp\(\)/);
    assert.match(m, /PRIMARY KEY \(quiz_id, program_id\)/);
    assert.match(m, /REFERENCES quiz \(id\) ON DELETE CASCADE/);
    assert.match(m, /INSERT IGNORE INTO quiz_program \(quiz_id, program_id, day, created_at\)\s+SELECT id, program_id, NULL, created_at\s+FROM quiz\s+WHERE program_id IS NOT NULL;/,
        'l\'existant reçoit sa ligne, datée de la création du QCM (pas de la migration)');
    assert.doesNotMatch(m, /UPDATE quiz|DELETE FROM quiz\b/, 'aucun QCM existant ne bouge');
    assert.match(lire('database/migrations/163_revert_qcm_plusieurs_formations.sql'), /DROP TABLE IF EXISTS quiz_program;/);
});

test('l\'éditeur coche des formations, « Toutes » compris, avec un jour par formation', () => {
    const page = sansCommentaires(lire('src/app/ui/pages/Quiz.jsx'));
    assert.match(page, /<b>Toutes les formations<\/b>/);
    assert.match(page, /onChange=\{basculerToutes\}/);
    assert.match(page, /className="inp qcm-formation-jour" type="number"/);
    assert.match(page, /formations: form\.formations\.map\(\(f\) => \(\{ program_id: f\.program_id, day: f\.day === "" \|\| f\.day == null \? null : Number\(f\.day\) \}\)\)/);
    assert.doesNotMatch(page, /<select value=\{form\.program_id\}/, 'plus de menu à choix unique');
    assert.match(page, /g\.plusieurs \? "Plusieurs formations" : "Non rattachés à une formation"/);
    // Une formation inactive DÉJÀ cochée reste affichée : masquée, elle se décocherait en silence.
    assert.match(page, /formations\.filter\(\(f\) => estActive\(f\) \|\| coche\(f\.id\)\)/);
});
