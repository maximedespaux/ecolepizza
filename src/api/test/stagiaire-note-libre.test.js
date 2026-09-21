/**
 * LA NOTE LIBRE DE LA FICHE STAGIAIRE (migration 168).
 *
 * Demandé le 2026-09-21 : « dans la fiche stagiaire, en modification comme en création, une section
 * note sous “Votre projet”, en texte simple, limitée à 128 mots ».
 *
 * Ce fichier gèle ce qui rend la note FIABLE, pas seulement présente :
 *   · la limite est la même à l'écran et au serveur, et comptée pareil (la ponctuation française,
 *     précédée d'une espace, n'est pas un mot) — sinon « 128 / 128 » serait refusé ;
 *   · avant la migration, la fiche s'enregistre et DIT que la note n'a pas été prise, au lieu de la
 *     perdre en silence ; après, elle est écrite ;
 *   · seule l'école l'écrit : l'espace du stagiaire ne la connaît pas.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : scénario par test, requêtes capturées (même montage que compte-a-l-inscription) ──
let requetes = [];
let reponses = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            const r = reponses.find(([motif]) => motif.test(sql));
            return r ? (typeof r[1] === 'function' ? r[1](sql, params) : r[1]) : [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const vraiMailer = require('../lib/mailer.js');
const cheminMailer = require.resolve('../lib/mailer.js');
require.cache[cheminMailer] = {
    id: cheminMailer, filename: cheminMailer, loaded: true,
    exports: { ...vraiMailer, sendMail: async () => ({ sent: false }), envoiPossible: () => false },
};

const { createLearner, updateLearner } = require('../controllers/learner.controller.js');

async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'u0', role: 'SUPER_ADMIN' }, params: { id: 'l1' }, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const COLONNES = ['first_name', 'last_name', 'email', 'phone', 'financing'];
const scenario = ({ avecNote }) => {
    requetes = [];
    reponses = [
        [/information_schema\.columns/, [[...COLONNES, ...(avecNote ? ['note_libre'] : [])].map((c) => ({ c }))]],
        [/SELECT company_id, financing, user_id, email FROM learner/, [[{ company_id: null, financing: 'PARTICULIER', user_id: null, email: 'marie@exemple.fr' }]]],
    ];
};
const FICHE = { first_name: 'Marie', last_name: 'DUPONT', email: 'marie@exemple.fr', phone: '0612345678', financing: 'PARTICULIER' };
const ecriture = (motif) => requetes.find((q) => motif.test(q.sql));
const mots = (n, mot = 'pâte') => Array.from({ length: n }, () => mot).join(' ');

// ── Avant et après la migration ────────────────────────────────────────────────────────────
test('APRÈS LA MIGRATION, la note est écrite — bords retirés, retours à la ligne gardés', async () => {
    scenario({ avecNote: true });
    const { code, corps } = await appeler(updateLearner, { body: { ...FICHE, note_libre: '  Projet de camion.\nDisponible en juin.  ' } });
    assert.strictEqual(code, 200, JSON.stringify(corps));
    const maj = ecriture(/UPDATE learner SET/);
    const i = maj.sql.split(', ').findIndex((c) => /note_libre = \?/.test(c));
    assert.ok(i >= 0, 'la colonne est dans l\'UPDATE');
    assert.ok(maj.params.includes('Projet de camion.\nDisponible en juin.'), 'le texte tel que tapé, sans ses bords');
    assert.ok(!('ignores' in corps), 'rien n\'a été laissé de côté');
});

test('AVANT LA MIGRATION, la fiche s\'enregistre et DIT que la note n\'a pas été prise', async () => {
    /* Sans ce compte rendu : « Stagiaire mis à jour », et la note disparue à la réouverture. */
    scenario({ avecNote: false });
    const { code, corps } = await appeler(updateLearner, { body: { ...FICHE, note_libre: 'Projet de camion.' } });
    assert.strictEqual(code, 200, JSON.stringify(corps));
    assert.doesNotMatch(ecriture(/UPDATE learner SET/).sql, /note_libre/, 'aucune colonne inexistante nommée');
    assert.deepStrictEqual(corps.ignores, ['note_libre']);
    // Une note VIDE n'est pas une perte : rien à signaler.
    scenario({ avecNote: false });
    const vide = await appeler(updateLearner, { body: { ...FICHE, note_libre: '   ' } });
    assert.ok(!('ignores' in vide.corps));
});

test('la création suit la même règle', async () => {
    scenario({ avecNote: true });
    let r = await appeler(createLearner, { body: { ...FICHE, note_libre: 'Reprise d\'une pizzeria.' } });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    assert.match(ecriture(/INSERT INTO learner/).sql, /note_libre/);
    scenario({ avecNote: false });
    r = await appeler(createLearner, { body: { ...FICHE, note_libre: 'Reprise d\'une pizzeria.' } });
    assert.strictEqual(r.code, 201);
    assert.deepStrictEqual(r.corps.ignores, ['note_libre']);
});

test('vider la note l\'efface (NULL), elle ne reste pas en chaîne vide', async () => {
    scenario({ avecNote: true });
    await appeler(updateLearner, { body: { ...FICHE, note_libre: '' } });
    const maj = ecriture(/UPDATE learner SET/);
    const colonnes = maj.sql.slice(maj.sql.indexOf('SET') + 3, maj.sql.indexOf('WHERE')).split(',').map((c) => c.trim());
    assert.strictEqual(maj.params[colonnes.indexOf('note_libre = ?')], null);
});

// ── La limite : 128 mots ───────────────────────────────────────────────────────────────────
test('128 MOTS PASSENT, 129 SONT REFUSÉS — avant toute écriture', async () => {
    scenario({ avecNote: true });
    assert.strictEqual((await appeler(updateLearner, { body: { ...FICHE, note_libre: mots(128) } })).code, 200);
    scenario({ avecNote: true });
    const { code, corps } = await appeler(updateLearner, { body: { ...FICHE, note_libre: mots(129) } });
    assert.strictEqual(code, 422);
    assert.match(corps.error, /128 mots \(129\)/, 'le refus dit la limite ET le compte');
    assert.strictEqual(requetes.length, 0, 'refusé avant la base : rien n\'est écrit, même en partie');
    scenario({ avecNote: true });
    assert.strictEqual((await appeler(createLearner, { body: { ...FICHE, note_libre: mots(129) } })).code, 422, 'à la création aussi');
});

test('la ponctuation française ne compte pas comme des mots', async () => {
    /* « : », « ? », « ; » s'écrivent précédés d'une espace : compter les blocs entre espaces aurait
       refusé une note de 128 vrais mots correctement ponctuée. */
    const note = `${mots(64)} : ${mots(63)} ; fin ?`;
    scenario({ avecNote: true });
    assert.strictEqual((await appeler(updateLearner, { body: { ...FICHE, note_libre: note } })).code, 200);
});

test('un texte collé sans espace est borné en caractères', async () => {
    /* Un seul « mot » de dix mille caractères passerait la limite en mots. */
    scenario({ avecNote: true });
    const { code, corps } = await appeler(updateLearner, { body: { ...FICHE, note_libre: 'a'.repeat(5001) } });
    assert.strictEqual(code, 422);
    assert.match(corps.error, /5000 caractères/);
});

// ── L'écran, le compte, la base ────────────────────────────────────────────────────────────
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const MODALE = lire(UI, 'components', 'EditStagiaireModal.jsx');

test('LA MÊME LIMITE À L\'ÉCRAN ET AU SERVEUR', async () => {
    const { NOTE_STAGIAIRE_MOTS_MAX, compterMots } = await import('../../app/ui/lib/mots.js');
    const { compterMots: compteServeur } = require('../lib/reponseLibre.js');
    assert.strictEqual(NOTE_STAGIAIRE_MOTS_MAX, 128);
    assert.match(lire(__dirname, '..', 'controllers', 'learner.controller.js'), /const NOTE_MOTS_MAX = 128;/);
    for (const t of [mots(128), `${mots(3)} : ${mots(2)} !`, 'l\'école porte-pelle', '  \n ']) {
        assert.strictEqual(compterMots(t), compteServeur(t), `même compte pour « ${t.slice(0, 30)} »`);
    }
});

test('LE FORMULAIRE : une section « Note » sous « Votre projet », et la frappe jamais coupée', () => {
    assert.match(MODALE, /note_libre: "",/, 'dans l\'état initial : sans elle, `toForm` ne la relirait pas');
    const projet = MODALE.indexOf('>Votre projet</h3>');
    const note = MODALE.indexOf('id="note-libre-titre"');
    const entreprise = MODALE.indexOf('{isPro && (', projet);
    assert.ok(projet > 0 && projet < note && note < entreprise, 'juste sous le projet, avant l\'entreprise');
    const zone = MODALE.slice(MODALE.indexOf('<textarea', note), MODALE.indexOf('/>', MODALE.indexOf('<textarea', note)));
    assert.doesNotMatch(zone, /maxLength/, 'un texte collé serait tronqué en silence, au milieu d\'une phrase');
    assert.match(zone, /aria-labelledby="note-libre-titre"/);
    assert.match(MODALE, /disabled=\{saving \|\| loading \|\| noteTropLongue\}/, 'l\'enregistrement attend qu\'elle soit raccourcie');
    assert.match(MODALE, /if \(noteTropLongue\) \{ onError\?\.\(/, 'et la touche Entrée aussi');
    assert.match(MODALE, /aria-live="polite"/, 'le compteur est annoncé');
    // Avant la migration : le message le dit, et n'est pas vert.
    assert.match(MODALE, /includes\("note_libre"\) \? ", sauf la note : la migration 168 n'est pas jouée\."/);
    assert.match(MODALE, /sauf\(r\) \? "info" : "success"/);
    for (const page of ['StagiaireDetail.jsx', 'Stagiaires.jsx']) {
        assert.match(lire(UI, 'pages', page), /onSaved=\{\(msg, type = "success"\) =>/, `${page} relaie le type du message`);
    }
});

test('LA FICHE MONTRE LA NOTE, dans la carte « Projet », avec ses retours à la ligne', () => {
    const fiche = lire(UI, 'pages', 'StagiaireDetail.jsx');
    const carte = fiche.slice(fiche.indexOf('T("target", "Projet")'), fiche.indexOf('</Card>', fiche.indexOf('T("target", "Projet")')));
    assert.match(carte, /\{l\.note_libre && \(/);
    assert.match(lire(UI, 'styles', 'app.css'), /\.sd-note p\{margin:0;white-space:pre-wrap;overflow-wrap:anywhere/);
});

test('SEULE L\'ÉCOLE L\'ÉCRIT : l\'espace du stagiaire ne la connaît pas', () => {
    const espace = lire(__dirname, '..', 'controllers', 'espace.controller.js');
    const infos = espace.slice(espace.indexOf('const INFO_FIELDS'), espace.indexOf(']', espace.indexOf('const INFO_FIELDS')));
    assert.ok(infos.length > 20, 'la liste des champs du stagiaire est trouvée');
    assert.doesNotMatch(infos, /note_libre/);
});

test('LA MIGRATION 168 et son revert', () => {
    const M = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const aller = lire(M, '168_stagiaire_note_libre.sql');
    const retour = lire(M, '168_revert_stagiaire_note_libre.sql');
    assert.match(aller, /ALTER TABLE learner\s+ADD COLUMN IF NOT EXISTS note_libre TEXT DEFAULT NULL;/);
    assert.match(retour, /ALTER TABLE learner\s+DROP COLUMN IF EXISTS note_libre;/);
    for (const f of [aller, retour]) {
        // Le client SQL de l'organisme découpe sur « ; » (cf. la 146) : un seul, en fin d'instruction.
        assert.strictEqual((f.match(/;/g) || []).length, 1);
        assert.ok(!f.includes('\\'), 'aucune barre oblique inverse');
    }
    assert.match(lire(__dirname, '..', 'lib', 'conditions.js'), /note_libre: 'Note libre'/, 'libellé dans « Champs documents »');
});
