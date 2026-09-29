/**
 * LA NOTE LIBRE DE LA FICHE ENTREPRISE (migration 189).
 *
 * Demandé le 2026-09-29 : une section « Note » sur la fiche entreprise, en texte simple, limitée à
 * 128 mots — le pendant de la note du stagiaire (168). Écrite et lue par LE BUREAU seul.
 *
 * Ce fichier gèle ce qui rend la note FIABLE, pas seulement présente :
 *   · la limite est la même à l'écran et au serveur, et comptée pareil (la ponctuation française,
 *     précédée d'une espace, n'est pas un mot) — sinon « 128 / 128 » serait refusé ;
 *   · avant la migration, la fiche s'enregistre et DIT que la note n'a pas été prise, au lieu de la
 *     perdre en silence ; après, elle est écrite ;
 *   · le refus arrive AVANT toute écriture, jamais une fiche à moitié enregistrée.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : scénario par test, requêtes capturées (même montage que stagiaire-note-libre) ──
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
    exports: { ...vraiMailer, sendMail: async () => ({ sent: false }), envoiPossible: () => false, appUrl: () => 'http://x' },
};

const { createCompany, updateCompany } = require('../controllers/company.controller.js');

async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'u0', role: 'SUPER_ADMIN' }, params: { id: 'c1' }, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}

/* `colonnesEntreprise` interroge information_schema UNE FOIS PAR colonne facultative : la réponse
   dépend donc du nom passé en paramètre. On rend la seule `note_libre` présente (quand avecNote),
   les autres absentes — le référent n'est pas en jeu ici. */
const scenario = (avecNote) => {
    requetes = [];
    reponses = [
        [/SELECT id FROM company WHERE/, [[{ id: 'c1' }]]],
        [/information_schema\.columns/, (sql, params) => ((avecNote && params && params[0] === 'note_libre') ? [[{ ok: 1 }]] : [[]])],
    ];
};
const ENT = { name: 'SARL LE FOUR', siret: '12345678901234', email: 'contact@exemple.fr', phone: '0612345678', representative_name: 'DUPONT' };
const ecriture = (motif) => requetes.find((q) => motif.test(q.sql));
const mots = (n, mot = 'four') => Array.from({ length: n }, () => mot).join(' ');

// ── Avant et après la migration ────────────────────────────────────────────────────────────
test('APRÈS LA MIGRATION, la note est écrite — bords retirés, retours à la ligne gardés', async () => {
    scenario(true);
    const { code, corps } = await appeler(updateCompany, { body: { ...ENT, note_libre: '  Prise en charge OPCO.\nDossier en cours.  ' } });
    assert.strictEqual(code, 200, JSON.stringify(corps));
    const maj = ecriture(/UPDATE company SET/);
    const i = maj.sql.split(', ').findIndex((c) => /note_libre = \?/.test(c));
    assert.ok(i >= 0, 'la colonne est dans l\'UPDATE');
    assert.ok(maj.params.includes('Prise en charge OPCO.\nDossier en cours.'), 'le texte tel que tapé, sans ses bords');
    assert.ok(!('ignores' in corps), 'rien n\'a été laissé de côté');
});

test('AVANT LA MIGRATION, la fiche s\'enregistre et DIT que la note n\'a pas été prise', async () => {
    scenario(false);
    const { code, corps } = await appeler(updateCompany, { body: { ...ENT, note_libre: 'Prise en charge OPCO.' } });
    assert.strictEqual(code, 200, JSON.stringify(corps));
    assert.doesNotMatch(ecriture(/UPDATE company SET/).sql, /note_libre/, 'aucune colonne inexistante nommée');
    assert.deepStrictEqual(corps.ignores, ['note_libre']);
    // Une note VIDE n'est pas une perte : rien à signaler.
    scenario(false);
    const vide = await appeler(updateCompany, { body: { ...ENT, note_libre: '   ' } });
    assert.ok(!('ignores' in vide.corps));
});

test('la création suit la même règle', async () => {
    scenario(true);
    let r = await appeler(createCompany, { body: { ...ENT, note_libre: 'Convention signée.' } });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    assert.match(ecriture(/INSERT INTO company/).sql, /note_libre/);
    scenario(false);
    r = await appeler(createCompany, { body: { ...ENT, note_libre: 'Convention signée.' } });
    assert.strictEqual(r.code, 201);
    assert.deepStrictEqual(r.corps.ignores, ['note_libre']);
});

test('vider la note l\'efface (NULL), elle ne reste pas en chaîne vide', async () => {
    scenario(true);
    await appeler(updateCompany, { body: { ...ENT, note_libre: '' } });
    const maj = ecriture(/UPDATE company SET/);
    const colonnes = maj.sql.slice(maj.sql.indexOf('SET') + 3, maj.sql.indexOf('WHERE')).split(',').map((c) => c.trim());
    assert.strictEqual(maj.params[colonnes.indexOf('note_libre = ?')], null);
});

// ── La limite : 128 mots ───────────────────────────────────────────────────────────────────
test('128 MOTS PASSENT, 129 SONT REFUSÉS — avant toute écriture', async () => {
    scenario(true);
    assert.strictEqual((await appeler(updateCompany, { body: { ...ENT, note_libre: mots(128) } })).code, 200);
    scenario(true);
    const { code, corps } = await appeler(updateCompany, { body: { ...ENT, note_libre: mots(129) } });
    assert.strictEqual(code, 422);
    assert.match(corps.error, /128 mots \(129\)/, 'le refus dit la limite ET le compte');
    assert.strictEqual(requetes.length, 0, 'refusé avant la base : rien n\'est écrit, même en partie');
    scenario(true);
    assert.strictEqual((await appeler(createCompany, { body: { ...ENT, note_libre: mots(129) } })).code, 422, 'à la création aussi');
});

test('la ponctuation française ne compte pas comme des mots', async () => {
    const note = `${mots(64)} : ${mots(63)} ; fin ?`;
    scenario(true);
    assert.strictEqual((await appeler(updateCompany, { body: { ...ENT, note_libre: note } })).code, 200);
});

test('un texte collé sans espace est borné en caractères', async () => {
    scenario(true);
    const { code, corps } = await appeler(updateCompany, { body: { ...ENT, note_libre: 'a'.repeat(5001) } });
    assert.strictEqual(code, 422);
    assert.match(corps.error, /5000 caractères/);
});

// ── L'écran, le compte, la base ────────────────────────────────────────────────────────────
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const FICHE = lire(UI, 'pages', 'EntrepriseDetail.jsx');

test('LA MÊME LIMITE À L\'ÉCRAN ET AU SERVEUR', async () => {
    const { NOTE_ENTREPRISE_MOTS_MAX, compterMots } = await import('../../app/ui/lib/mots.js');
    const { compterMots: compteServeur } = require('../lib/reponseLibre.js');
    assert.strictEqual(NOTE_ENTREPRISE_MOTS_MAX, 128);
    assert.match(lire(__dirname, '..', 'controllers', 'company.controller.js'), /const NOTE_MOTS_MAX = 128;/);
    for (const t of [mots(128), `${mots(3)} : ${mots(2)} !`, 'l\'école porte-pelle', '  \n ']) {
        assert.strictEqual(compterMots(t), compteServeur(t), `même compte pour « ${t.slice(0, 30)} »`);
    }
});

test('LE FORMULAIRE : une section « Note », et la frappe jamais coupée', () => {
    const note = FICHE.indexOf('id="note-entreprise-titre"');
    assert.ok(note > 0, 'la section note existe');
    const zone = FICHE.slice(FICHE.indexOf('<textarea', note), FICHE.indexOf('/>', FICHE.indexOf('<textarea', note)));
    assert.doesNotMatch(zone, /maxLength/, 'un texte collé serait tronqué en silence, au milieu d\'une phrase');
    assert.match(zone, /aria-labelledby="note-entreprise-titre"/);
    assert.match(FICHE, /if \(noteTropLongue\) \{ setStatus\(/, 'l\'enregistrement attend qu\'elle soit raccourcie');
    assert.match(FICHE, /aria-live="polite"/, 'le compteur est annoncé');
    // Le message d'« enregistré, sauf… » : on garde la ligne du référent (174) ET on nomme la note (189).
    assert.match(FICHE, /const perdu = messageReferentPerdu\(r\?\.ignores\);/, 'la ligne du référent reste (contrat)');
    assert.match(FICHE, /la note : la migration 189 n'est pas jouée\./);
});

test('LA MIGRATION 189 et son revert', () => {
    const M = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const aller = lire(M, '189_entreprise_note_libre.sql');
    const retour = lire(M, '189_revert_entreprise_note_libre.sql');
    assert.match(aller, /ALTER TABLE company\s+ADD COLUMN IF NOT EXISTS note_libre TEXT DEFAULT NULL;/);
    assert.match(retour, /ALTER TABLE company\s+DROP COLUMN IF EXISTS note_libre;/);
    for (const f of [aller, retour]) {
        // Le client SQL de l'organisme découpe sur « ; » (cf. la 146) : un seul, en fin d'instruction.
        assert.strictEqual((f.match(/;/g) || []).length, 1);
        assert.ok(!f.includes('\\'), 'aucune barre oblique inverse');
    }
});
