/**
 * RETIRER UN STAGIAIRE D'UNE SESSION : ON VOIT CE QUI PART, ET L'ON CHOISIT (demandé le 2026-09-24).
 *
 * LE DÉFAUT. La corbeille « Retirer de la session » supprimait le dossier d'UN clic, sans confirmation,
 * et emportait sans le dire pièces d'identité, notes, évaluations, verdict, remises et présences
 * (clés étrangères en cascade) — tandis que documents et réponses QCM restaient, détachés. Le retrait
 * n'était même pas journalisé.
 *
 * LE CHOIX DE L'UTILISATEUR : deux gestes à chaque retrait — « retirer seulement » ou « retirer et
 * effacer » (documents NON signés + réponses QCM) — et jamais rien de signé : un contrat signé reste un
 * contrat, Qualiopi veut la trace. Jamais non plus un émargement, une facture, un document de
 * l'entreprise ou de la session, un document partagé avec un autre dossier, un fichier reçu.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { trierDocuments, executerRetrait } = require('../lib/retraitDossier.js');

const doc = (id, extra) => ({ id, title: id, type: 'AUTRE', status: 'ENVOYE', quiz_id: null, scope: 'LEARNER',
    signed_at: null, autres_dossiers: 0, signatures: 0, fichier: 0, ...extra });

/* ─── Le tri : ce qui peut s'effacer, et pourquoi le reste reste ───────────────────────────── */

test('le tri n\'efface que le NON signé du stagiaire — et un QCM répondu, qui n\'est pas une signature', () => {
    const { effacables, gardes } = trierDocuments([
        doc('non-signe'),
        doc('qcm-repondu', { type: 'QCM', quiz_id: 'q1', status: 'SIGNE', signed_at: '2026-09-24 20:47' }),
        doc('signe', { status: 'SIGNE', signed_at: '2026-09-24 19:18' }),
        doc('signe-en-partie', { status: 'ENVOYE', signatures: 1 }),
        doc('emargement', { type: 'EMARGEMENT' }),
        doc('facture', { type: 'FACTURE' }),
        doc('avoir', { type: 'AVOIR' }),
        doc('de-l-entreprise', { scope: 'COMPANY' }),
        doc('de-la-session', { scope: 'SESSION' }),
        doc('partage', { autres_dossiers: 1 }),
        doc('fichier-recu', { fichier: 1 }),
    ]);
    assert.deepStrictEqual(effacables.map((d) => d.id), ['non-signe', 'qcm-repondu']);
    const raison = Object.fromEntries(gardes.map((d) => [d.id, d.raison]));
    assert.strictEqual(raison.signe, 'signé');
    assert.strictEqual(raison['signe-en-partie'], 'signé', 'une seule signature posée suffit à garder');
    assert.match(raison.emargement, /Qualiopi/);
    assert.match(raison.facture, /comptable/);
    assert.match(raison.avoir, /comptable/);
    assert.match(raison['de-l-entreprise'], /entreprise/);
    assert.match(raison['de-la-session'], /session/);
    assert.match(raison.partage, /autre dossier/);
    assert.match(raison['fichier-recu'], /reçu/);
});

/* ─── L'exécution : une transaction, et rien de signé ──────────────────────────────────────── */

function faussePool({ docs = [], reponsesDoc = {}, reste = [], panne = null } = {}) {
    const journal = [];
    const etat = { commit: false, rollback: false, release: false };
    const cx = {
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            journal.push({ q, params });
            if (panne && panne.test(q)) throw Object.assign(new Error('panne simulée'), { code: 'ER_PANNE' });
            if (/information_schema\.columns/i.test(q)) return [[{ present: 1 }]];
            if (/FROM generated_document gd/.test(q)) return [docs];
            if (/^SELECT COUNT\(\*\) AS n/.test(q)) return [[{ n: 0 }]];
            if (/^SELECT id FROM quiz_response WHERE document_id/.test(q)) return [reponsesDoc[params[0]] || []];
            if (/^SELECT id FROM quiz_response WHERE enrollment_id/.test(q)) return [reste];
            return [{ affectedRows: 1 }];
        },
        beginTransaction: async () => { journal.push({ q: 'BEGIN' }); },
        commit: async () => { journal.push({ q: 'COMMIT' }); etat.commit = true; },
        rollback: async () => { journal.push({ q: 'ROLLBACK' }); etat.rollback = true; },
        release: () => { etat.release = true; },
    };
    return { pool: { getConnection: async () => cx }, journal, etat };
}
const DOSSIER = { id: 'e1', session_id: 's1', learner_id: 'l1' };
const rang = (journal, motif) => journal.findIndex((x) => motif.test(x.q));
const docsSupprimes = (journal) => journal.filter((x) => /^DELETE FROM generated_document/.test(x.q)).map((x) => x.params[0]);

test('retirer ET effacer : les non signés et les réponses QCM partent, le signé reste — tout avant la validation', async () => {
    const { pool, journal, etat } = faussePool({
        docs: [
            doc('d-fiche'),
            doc('d-qcm', { type: 'QCM', quiz_id: 'q-mardi', status: 'SIGNE', signed_at: '2026-09-24 20:47' }),
            doc('d-droit-image', { type: 'DROIT_IMAGE', status: 'SIGNE', signed_at: '2026-09-24 19:18' }),
        ],
        reponsesDoc: { 'd-qcm': [{ id: 'rep-1' }] },
        reste: [{ id: 'rep-orpheline' }],
    });
    const effaces = await executerRetrait(pool, 'o1', DOSSIER, { effacer: true });
    assert.deepStrictEqual(docsSupprimes(journal), ['d-fiche', 'd-qcm'], 'le document signé n\'est jamais effacé');
    assert.deepStrictEqual(effaces, { documents: ['d-fiche', 'd-qcm'], reponses: ['rep-1', 'rep-orpheline'] });
    assert.ok(rang(journal, /^DELETE FROM generated_document/) < rang(journal, /^DELETE FROM enrollment/));
    assert.ok(rang(journal, /^DELETE FROM enrollment/) < rang(journal, /^COMMIT$/), 'une seule transaction, validée à la fin');
    assert.ok(etat.commit && etat.release && !etat.rollback);
});

test('retirer SEULEMENT : aucun document ni réponse touchés, comme avant', async () => {
    const { pool, journal, etat } = faussePool({ docs: [doc('d-fiche')], reste: [{ id: 'rep-1' }] });
    const effaces = await executerRetrait(pool, 'o1', DOSSIER, { effacer: false });
    assert.deepStrictEqual(effaces, { documents: [], reponses: [] });
    assert.strictEqual(rang(journal, /generated_document|quiz_response/), -1, 'ni plan, ni document, ni réponse');
    assert.ok(rang(journal, /^DELETE ar FROM attendance_record/) > -1, 'les présences de la session partent');
    assert.ok(rang(journal, /^DELETE FROM enrollment/) > -1 && etat.commit);
});

test('une panne en cours de route : tout est annulé, la connexion est rendue', async () => {
    const { pool, etat } = faussePool({ docs: [doc('d-fiche')], panne: /^DELETE FROM enrollment/ });
    await assert.rejects(() => executerRetrait(pool, 'o1', DOSSIER, { effacer: true }), /panne simulée/);
    assert.ok(etat.rollback && !etat.commit, 'annulé : le document déjà effacé revient avec le dossier');
    assert.ok(etat.release, 'la connexion retourne au pool, même en échec');
});

/* ─── Le contrôleur et l'écran ─────────────────────────────────────────────────────────────── */

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', f), 'utf8');

test('le retrait se journalise APRÈS la validation, et le geste vient de ?effacer=1', () => {
    const src = lire('controllers/enrollment.controller.js');
    const bloc = src.slice(src.indexOf('const deleteEnrollment'), src.indexOf('\n};\n', src.indexOf('const deleteEnrollment')));
    assert.match(bloc, /const effacer = req\.query\.effacer === '1';/);
    assert.ok(bloc.indexOf('executerRetrait(') < bloc.indexOf("logAudit(req, 'enrollment.delete'"),
        'le journal ne dit « retiré » que d\'un retrait validé');
});

test('la corbeille n\'efface plus d\'un clic : elle ouvre la fenêtre, qui propose les deux gestes', () => {
    const ui = lireUi('pages/SessionDetail.jsx');
    assert.doesNotMatch(ui, /onClick=\{\(\) => removeStagiaire\(e\.id\)\}/, 'plus de retrait direct depuis la corbeille');
    assert.match(ui, /title="Retirer de la session" onClick=\{\(\) => setRetraitDe\(/);
    assert.match(ui, /onConfirm=\{\(effacer\) => removeStagiaire\(retraitDe\.id, effacer\)\}/);
    const fenetre = lireUi('components/RetraitStagiaireModal.jsx');
    assert.match(fenetre, />Retirer seulement</);
    assert.match(fenetre, /disabled=\{!plan \|\| envoi \|\| rienAEffacer\}>Retirer et effacer</,
        '« effacer » est grisé quand il n\'y a rien à effacer');
    const textes = fenetre.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(textes, /[—–]/, 'pas de tiret long dans l\'interface');
});
