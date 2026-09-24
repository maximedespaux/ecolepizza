/**
 * SUPPRIMER LE QCM D'UN STAGIAIRE SUPPRIME SA RÉPONSE (constaté le 2026-09-24).
 *
 * LE DÉFAUT. Le QCM du mardi d'une stagiaire, supprimé depuis sa fiche, gardait sa note dans Notation
 * et dans Résultats QCM. `quiz_response.document_id` n'a pas de clé étrangère vers `generated_document`
 * (seul le questionnaire est en cascade), et `deleteDocument` ne touchait pas à la réponse : elle
 * survivait, rattachée à un document disparu. La fiche, elle, promettait que « le serveur supprime tout ».
 *
 * La reprise n'était pas bloquée (takeQuiz cherche la réponse par questionnaire ET par document) ; mais
 * la note fantôme restait comptée partout où l'on additionne les réponses.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Base simulée : chaque requête est notée, et chaque trace d'audit (écrite par db.query à rappel).
const requetes = [];
const journal = [];
let DOC = null;
let REPONSES = [];
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({
        query: async (sql) => {
            requetes.push(sql.replace(/\s+/g, ' ').trim());
            if (/FROM generated_document WHERE id = \?/.test(sql)) return [[DOC]];
            if (/SELECT id FROM quiz_response/.test(sql)) return [REPONSES];
            return [{ affectedRows: 1 }];
        },
    }),
    query: (sql, params, cb) => { if (Array.isArray(params)) journal.push(params[3]); if (typeof cb === 'function') cb(null, {}); },
} };
const { deleteDocument } = require('../controllers/document.controller.js');

const supprimer = async (doc, reponses = []) => {
    DOC = doc; REPONSES = reponses; requetes.length = 0; journal.length = 0;
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await deleteDocument({ params: { id: doc.id }, user: { organization_id: 'o1', id: 'u1' } }, res);
    return res;
};
const rang = (motif) => requetes.findIndex((q) => motif.test(q));

test('un QCM répondu part avec sa réponse — AVANT le document, et le journal le dit', async () => {
    const res = await supprimer({ id: 'doc-qcm', type: 'QCM', enrollment_id: 'e1', quiz_id: 'quiz-mardi' },
        [{ id: 'rep-1' }, { id: 'rep-2' }]);
    assert.strictEqual(res.code, 200);
    const rep = rang(/^DELETE FROM quiz_response WHERE document_id = \? AND organization_id = \?/);
    assert.ok(rep > -1, 'la réponse du QCM doit être supprimée');
    assert.ok(rep < rang(/^DELETE FROM generated_document/),
        'la réponse part AVANT le document : jamais de réponse orpheline, même si la suite échoue');
    assert.strictEqual(journal.filter((a) => a === 'quiz.response_delete').length, 2,
        'une trace par réponse supprimée, comme depuis Résultats QCM');
    assert.ok(journal.includes('document.delete'));
});

test('un QCM jamais répondu : rien à supprimer côté réponses, rien au journal', async () => {
    await supprimer({ id: 'doc-qcm', type: 'QCM', enrollment_id: 'e1', quiz_id: 'quiz-mardi' }, []);
    assert.strictEqual(rang(/^DELETE FROM quiz_response/), -1);
    assert.ok(!journal.includes('quiz.response_delete'));
});

test('un document qui n\'est pas un QCM ne touche pas aux réponses', async () => {
    await supprimer({ id: 'doc-contrat', type: 'CONTRAT', enrollment_id: 'e1', quiz_id: null });
    assert.ok(!requetes.some((q) => /quiz_response/.test(q)), 'aucune requête sur quiz_response');
    assert.ok(rang(/^DELETE FROM generated_document/) > -1);
});

test('la confirmation annonce la réponse et la note pour un QCM répondu', () => {
    const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'StagiaireDetail.jsx'), 'utf8');
    const bloc = ui.slice(ui.indexOf('async function handleDelete'), ui.indexOf('async function handleDeleteLearner'));
    assert.match(bloc, /d\.quiz_id \?/, 'un QCM a son propre avertissement');
    assert.match(bloc, /la réponse et sa note/, 'la fiche ne promet plus « tout » sans dire ce que « tout » veut dire');
});
