/**
 * LA FEUILLE D'ÉMARGEMENT, REVUE LE 2026-09-26 — « regarde comment sont faites les feuilles
 * d'émargement, et améliore-les ».
 *
 * CE QUE LA REVUE A TROUVÉ, et que ces tests gèlent :
 *   · LA SIGNATURE HORS DE SA DEMI-JOURNÉE. Seules les dates futures étaient refusées. Relevé sur
 *     les deux sessions du 14/09 : les stagiaires signaient à leur arrivée, entre 8h35 et 9h57, le
 *     matin ET l'après-midi — sept après-midi signés avant d'avoir eu lieu —, et quinze signatures
 *     sur cinquante portaient sur la veille. Une seconde signature écrasait la première.
 *     Décidé par l'école : on signe PENDANT la demi-journée, de son début à minuit ; une
 *     demi-journée manquée se RATTRAPE par l'école, avec un motif imprimé sur la feuille ;
 *   · « 17h00 - 19h00 » (le cours du soir) rangé sous « Matin », et des colonnes à signer pour des
 *     demi-journées sans cours. Décidé par l'école : les demi-journées suivent les horaires ;
 *   · LA FEUILLE IMPRIMÉE : le « Lieu » était l'adresse de l'organisme et non celui de la session ;
 *     le « Fait à …, le … » portait la date du rendu ; une case vide d'un jour passé restait une case
 *     blanche à remplir au stylo ; aucun total d'heures ; les noms centrés sous un titre aligné à
 *     gauche ; le formateur sans son rôle ; les horaires imprimés deux fois ;
 *   · deux chemins (feuille archivée, document signé) qui relisaient tout en double.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* ── Une base simulée, commune à tout le fichier ─────────────────────────────────────────────────── */
let repondre = () => [[]];
let ecritures = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (/^(UPDATE|DELETE|INSERT)/.test(q)) ecritures.push([q, params]);
            return repondre(q, params);
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const E = require('../lib/emargement.js');
const { ouverture: ouvertureRelances } = require('../lib/relancesEmargement.js');

const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');
/* Heure de Paris → instant (septembre : UTC+2). */
const aParis = (jour, hhmm) => new Date(`${jour}T${hhmm}:00+02:00`);

// Les horaires réels de RS7404 (production, 2026-09-26).
const HORAIRES_RS7404 = 'Jour 1 : 8h45 - 12h00 / 13h00 - 17h15\n8h00 - 12h00 / 13h00 - 16h30\nJour 5 : 8h00 - 12h00 / 13h00 - 14h00';
const JOURS = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

/* ── Les demi-journées d'un jour ─────────────────────────────────────────────────────────────────── */
test('une plage se range par son HEURE DE DÉBUT : « 17h00 - 19h00 » est un après-midi', () => {
    const soir = E.parseDaySchedules('17h00 - 19h00', 1)[1];
    assert.deepStrictEqual(E.demiJourneesDuJour(soir), { APRES_MIDI: [17 * 60, 19 * 60] },
        'le cours d\'hygiène du soir s\'imprimait sous « Matin »');
    const jour1 = E.parseDaySchedules(HORAIRES_RS7404, 5)[1];
    assert.deepStrictEqual(E.demiJourneesDuJour(jour1), { MATIN: [8 * 60 + 45, 12 * 60], APRES_MIDI: [13 * 60, 17 * 60 + 15] });
    // Deux plages du même côté de midi n'en font qu'une.
    assert.deepStrictEqual(E.demiJourneesDuJour(E.parseDaySchedules('8h00 - 10h00 / 10h30 - 12h00', 1)[1]), { MATIN: [8 * 60, 12 * 60] });
    assert.strictEqual(E.demiJourneesDuJour(null), null, 'sans horaires lisibles : on ne sait pas');
});

test('l\'ouverture d\'une demi-journée : la MÊME règle pour les relances et la signature', () => {
    const soir = E.parseDaySchedules('17h00 - 19h00', 1)[1];
    assert.strictEqual(E.ouverture('APRES_MIDI', soir), 17 * 60);
    assert.strictEqual(E.ouverture('MATIN', soir), null, 'pas de matin ce jour-là');
    assert.strictEqual(E.ouverture('MATIN', null), 8 * 60 + 30, 'sans horaires : 8h30');
    assert.strictEqual(E.ouverture('APRES_MIDI', null), 13 * 60 + 30, 'sans horaires : 13h30');
    // Les relances n'ont plus leur propre lecture : c'est la même fonction.
    assert.strictEqual(ouvertureRelances, E.ouverture);
});

/* ── La fenêtre de signature ─────────────────────────────────────────────────────────────────────── */
test('LA FENÊTRE : l\'après-midi ne se signe plus le matin, la veille ne se signe plus le lendemain', () => {
    const f = (date, slot, jour, hhmm) => E.fenetreSignature({
        date, slot, horaire: E.horaireDuJour(HORAIRES_RS7404, JOURS, date), instant: aParis(jour, hhmm), zone: 'Europe/Paris',
    });
    // Ce que faisaient les stagiaires le 17/09 à 8h40 : l'après-midi du jour, et celui de la veille.
    assert.deepStrictEqual(f('2026-09-17', 'APRES_MIDI', '2026-09-17', '08:40'), { etat: 'pas_encore', ouvreA: 13 * 60 });
    assert.strictEqual(f('2026-09-16', 'APRES_MIDI', '2026-09-17', '08:40').etat, 'close');
    // Le matin du jour, à l'heure : ouvert. Le premier jour commence à 8h45, pas à 8h.
    assert.strictEqual(f('2026-09-17', 'MATIN', '2026-09-17', '08:40').etat, 'ouverte');
    assert.strictEqual(f('2026-09-14', 'MATIN', '2026-09-14', '08:40').etat, 'pas_encore');
    assert.strictEqual(f('2026-09-14', 'MATIN', '2026-09-14', '08:45').etat, 'ouverte');
    // L'après-midi, jusqu'à minuit — à l'heure de PARIS, pas d'UTC.
    assert.strictEqual(f('2026-09-17', 'APRES_MIDI', '2026-09-17', '23:50').etat, 'ouverte');
    assert.strictEqual(f('2026-09-17', 'APRES_MIDI', '2026-09-18', '00:10').etat, 'close',
        'à 0h10 à Paris, il est 22h10 la veille en UTC : la journée est pourtant finie');
    assert.strictEqual(f('2026-09-18', 'MATIN', '2026-09-17', '20:00').etat, 'a_venir');
});

/* ── La signature du stagiaire (espace.controller) ───────────────────────────────────────────────── */
const { signMyEmargement } = require('../controllers/espace.controller.js');
function baseStagiaire({ date, slot, signee = 0, rattrapee = 0 }) {
    repondre = (q) => {
        if (q.startsWith('SELECT * FROM learner WHERE user_id')) return [[{ id: 'l1', first_name: 'Camille', last_name: 'BERGER', organization_id: 'org1' }]];
        if (q.includes('FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id WHERE ar.id = ?')) {
            return [[{ id: 'r1', signee, session_id: 's1', date, slot, rattrapee }]];
        }
        if (q.includes('information_schema.columns')) return [[{ 1: 1 }]];
        if (q.includes('FROM training_session ts LEFT JOIN training_program p')) return [[{ horaires: HORAIRES_RS7404 }]];
        if (q.startsWith('SELECT DISTINCT DATE_FORMAT(date')) return [JOURS.map((d) => ({ date: d }))];
        if (q.startsWith('UPDATE attendance_record SET present = 1')) return [{ affectedRows: 1 }];
        return [[]];
    };
}
async function signer(t, { date, slot, jour, hhmm, signee, rattrapee }) {
    t.mock.timers.enable({ apis: ['Date'], now: aParis(jour, hhmm).getTime() });
    baseStagiaire({ date, slot, signee, rattrapee });
    ecritures = [];
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    await signMyEmargement({ user: { id: 'u1' }, params: { recordId: 'r1' }, body: { signature_data: 'data:image/png;base64,QUJD' },
        headers: {}, ip: '127.0.0.1', socket: {} }, res);
    t.mock.timers.reset();
    return { code, corps };
}

test('SIGNER : l\'après-midi, le matin même, est REFUSÉ — et le stagiaire sait à partir de quand', async (t) => {
    const r = await signer(t, { date: '2026-09-17', slot: 'APRES_MIDI', jour: '2026-09-17', hhmm: '08:40' });
    assert.strictEqual(r.code, 409);
    assert.match(r.corps.message, /13h00/);
    assert.deepStrictEqual(ecritures, [], 'rien n\'est écrit');
});

test('SIGNER : la veille est close — seule l\'école la rattrape', async (t) => {
    const r = await signer(t, { date: '2026-09-16', slot: 'APRES_MIDI', jour: '2026-09-17', hhmm: '08:40' });
    assert.strictEqual(r.code, 409);
    assert.match(r.corps.message, /seule l'école/);
    assert.deepStrictEqual(ecritures, []);
});

test('SIGNER : pendant la demi-journée, ça passe — une fois, et jamais par-dessus une autre', async (t) => {
    let r = await signer(t, { date: '2026-09-17', slot: 'MATIN', jour: '2026-09-17', hhmm: '08:40' });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(ecritures.length, 1);
    assert.match(ecritures[0][0], /WHERE id = \? AND signature_data IS NULL$/, 'deux envois simultanés : le second n\'écrase rien');
    r = await signer(t, { date: '2026-09-17', slot: 'MATIN', jour: '2026-09-17', hhmm: '09:00', signee: 1 });
    assert.strictEqual(r.code, 409, 'une signature ne se remplace pas');
    r = await signer(t, { date: '2026-09-17', slot: 'MATIN', jour: '2026-09-17', hhmm: '09:00', rattrapee: 1 });
    assert.strictEqual(r.code, 409, 'une présence déjà enregistrée par l\'école non plus');
    assert.deepStrictEqual(ecritures, []);
});

/* ── Le rattrapage par l'école (attendance.controller) ───────────────────────────────────────────── */
const { rattraperPresence, demiJourneesVoulues, generateSheets } = require('../controllers/attendance.controller.js');
async function rattraper(t, { corps = { motif: 'Oubli de signature' }, date = '2026-09-16', slot = 'APRES_MIDI', jour = '2026-09-17', hhmm = '08:40', signee = 0, sansColonne = false } = {}) {
    t.mock.timers.enable({ apis: ['Date'], now: aParis(jour, hhmm).getTime() });
    repondre = (q) => {
        if (q.includes('FROM attendance_record r JOIN attendance_sheet s ON s.id = r.sheet_id JOIN training_session ts')) {
            return [[{ id: 'r1', learner_id: 'l1', signee, session_id: 's1', date, slot, first_name: 'Camille', last_name: 'BERGER' }]];
        }
        if (q.includes('information_schema.columns')) return [[{ 1: 1 }]];
        if (q.includes('FROM training_session ts LEFT JOIN training_program p')) return [[{ horaires: HORAIRES_RS7404 }]];
        if (q.startsWith('SELECT DISTINCT DATE_FORMAT(date')) return [JOURS.map((d) => ({ date: d }))];
        if (q.startsWith('UPDATE attendance_record SET present = 1')) {
            if (sansColonne) { const e = new Error('champ inconnu'); e.code = 'ER_BAD_FIELD_ERROR'; throw e; }
            return [{ affectedRows: 1 }];
        }
        return [[]];
    };
    ecritures = [];
    let code = 200; let json = null;
    const res = { status(c) { code = c; return this; }, json(b) { json = b; return this; } };
    await rattraperPresence({ user: { id: 'u9', organization_id: 'org1', first_name: 'Jean-Jacques', last_name: 'DESPAUX' }, params: { id: 'r1' }, body: corps, headers: {}, ip: '127.0.0.1' }, res);
    t.mock.timers.reset();
    return { code, json };
}

test('RATTRAPER : le motif est obligatoire — il s\'imprime sur la feuille', async (t) => {
    const r = await rattraper(t, { corps: { motif: '   ' } });
    assert.strictEqual(r.code, 422);
    assert.deepStrictEqual(ecritures, []);
});

test('RATTRAPER : écrit le motif et le nom de qui l\'enregistre, jamais par-dessus une signature', async (t) => {
    const r = await rattraper(t);
    assert.strictEqual(r.code, 200);
    const maj = ecritures.find(([q]) => q.startsWith('UPDATE attendance_record'));
    assert.ok(maj);
    assert.match(maj[0], /WHERE id = \? AND signature_data IS NULL AND rattrapage_motif IS NULL$/);
    assert.ok(maj[1].includes('Oubli de signature') && maj[1].includes('Jean-Jacques DESPAUX'));
    assert.strictEqual((await rattraper(t, { signee: 1 })).code, 409, 'déjà signée par le stagiaire');
});

test('RATTRAPER : pas une demi-journée qui n\'a pas commencé — le stagiaire la signera lui-même', async (t) => {
    const r = await rattraper(t, { date: '2026-09-17', slot: 'APRES_MIDI', jour: '2026-09-17', hhmm: '08:40' });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(ecritures.filter(([q]) => q.startsWith('UPDATE')).length, 0);
});

test('RATTRAPER sans la migration 184 : 503, et on le DIT', async (t) => {
    const r = await rattraper(t, { sansColonne: true });
    assert.strictEqual(r.code, 503);
    assert.match(r.json.message, /Migration 184/);
});

test('le « marquer présent » sans signature ni motif n\'existe plus', () => {
    const routes = lire('routes/attendance.routes.js');
    assert.doesNotMatch(routes, /setPresence|router\.patch\('\/record\/:id'/);
    assert.match(routes, /router\.post\('\/record\/:id\/rattrapage', authenticateToken, rattraperPresence\);/);
});

/* ── Les demi-journées créées suivent les horaires ───────────────────────────────────────────────── */
test('CRÉER LES FEUILLES : les demi-journées que les horaires définissent, pas deux par jour ouvré', () => {
    const jours = ['2026-10-12', '2026-10-13'];
    assert.deepStrictEqual([...demiJourneesVoulues(jours, '17h00 - 19h00')], ['2026-10-12|APRES_MIDI', '2026-10-13|APRES_MIDI']);
    assert.deepStrictEqual([...demiJourneesVoulues(jours, 'Jour 1 : 8h - 12h / 13h - 17h\nJour 2 : 8h - 12h')],
        ['2026-10-12|MATIN', '2026-10-12|APRES_MIDI', '2026-10-13|MATIN'], 'le dernier jour n\'a pas d\'après-midi');
    assert.strictEqual(demiJourneesVoulues(jours, null).size, 4, 'sans horaires lisibles : matin et après-midi, comme avant');
});

test('METTRE À JOUR : une demi-journée en trop est retirée — JAMAIS si elle porte une signature ou un intervenant', async () => {
    repondre = (q) => {
        if (q.includes('FROM training_session WHERE id = ? AND organization_id = ?')) return [[{ start_date: '2026-10-12', end_date: '2026-10-12' }]];
        if (q.includes('information_schema.columns')) return [[{ 1: 1 }]];
        if (q.includes('FROM training_session ts LEFT JOIN training_program p')) return [[{ horaires: '17h00 - 19h00' }]];
        if (q.startsWith('SELECT DISTINCT DATE_FORMAT(date')) return [[{ date: '2026-10-12' }]];
        if (q.startsWith('SELECT learner_id FROM enrollment')) return [[]];
        if (q.includes('FROM attendance_sheet s WHERE s.session_id = ? AND s.slot IN')) {
            return [[
                { id: 'vide', date: '2026-10-12', slot: 'MATIN', stagiaire: 0, formateur: 0 },     // en trop, vierge : retirée
                { id: 'signee', date: '2026-10-13', slot: 'MATIN', stagiaire: 0, formateur: 1 },   // hors dates, signée : gardée
                { id: 'affectee', date: '2026-10-14', slot: 'MATIN', stagiaire: 0, formateur: 0 }, // intervenant affecté : gardée
            ]];
        }
        if (q.includes('FROM session_intervenant si JOIN session_intervenant_slot sis')) return [[{ date: '2026-10-14', slot: 'MATIN' }]];
        if (q.startsWith('SELECT id FROM attendance_sheet WHERE session_id = ? AND date = ? AND slot = ?')) return [[]];
        return [[]];
    };
    ecritures = [];
    let code = 0; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    await generateSheets({ user: { id: 'u9', organization_id: 'org1' }, params: { sessionId: 's1' }, headers: {}, ip: '127.0.0.1' }, res);
    assert.strictEqual(code, 201);
    const retraits = ecritures.filter(([q]) => q.startsWith('DELETE FROM attendance_sheet WHERE id = ?')).map(([, p]) => p[0]);
    assert.deepStrictEqual(retraits, ['vide']);
    const creations = ecritures.filter(([q]) => q.startsWith('INSERT INTO attendance_sheet')).map(([, p]) => p[3]);
    assert.deepStrictEqual(creations, ['APRES_MIDI'], 'le cours du soir : un après-midi');
    assert.deepStrictEqual([corps.creees, corps.retirees, corps.gardees], [1, 1, 2]);
    assert.match(corps.message, /gardée/);
});

/* ── La feuille imprimée ─────────────────────────────────────────────────────────────────────────── */
function feuille(options = {}) {
    const lignes = [];
    for (const d of JOURS) for (const slot of ['MATIN', 'APRES_MIDI']) lignes.push({ date: d, slot });
    const signees = new Set(options.signees || lignes.map((l) => `${l.date}|${l.slot}`));
    const rattrapage = options.rattrapage || {};
    const e = { program_title: 'Fabriquer des pizzas artisanales', program_code: 'RS7404', start_date: '2026-09-14', end_date: '2026-09-18',
        week: 38, year: 2026, program_days: 5, program_hours: 35, program_horaires: options.horaires === undefined ? HORAIRES_RS7404 : options.horaires };
    const org = { legal_name: 'ECOLE PIZZA JEAN-JACQUES DESPAUX', nda: '76 65 00989 65', address: '101 rue Alsace Lorraine', zip_code: '65300', town: 'LANNEMEZAN' };
    const cles = new Set(lignes.map((l) => `${l.date}|${l.slot}`));
    const participants = [
        { role: 'stagiaire', name: 'BERGER Camille', sigOf: (k) => (signees.has(k) ? 'data:image/png;base64,QUJD' : null), appliesTo: (k) => cles.has(k),
            noteDe: (k) => rattrapage[k] || '', presentDe: (k) => signees.has(k) || !!rattrapage[k] },
        { role: 'formateur', name: 'DESPAUX Jean-Jacques', sigOf: () => null, appliesTo: (k) => cles.has(k) },
    ];
    return E.renderEmargementHtml({ org, e, rows: lignes, participants, config: options.config || { slots: ['MATIN', 'APRES_MIDI'] },
        lieu: options.lieu === undefined ? 'Centre de Bordeaux, 12 rue des Fours, 33000 BORDEAUX' : options.lieu,
        entreprise: options.entreprise || null, dateFeuille: options.dateFeuille || '2026-09-18', aujourdHui: options.aujourdHui || '2026-09-26' });
}

test('LA FEUILLE : le lieu de la SESSION, la déclaration d\'activité, l\'employeur', () => {
    const html = feuille({ entreprise: 'Le Four à Bois SAS' });
    const info = (l, v) => new RegExp(`<div class="lbl">${l}</div><div class="val">${v}</div>`);
    assert.match(html, info('Lieu', 'Centre de Bordeaux, 12 rue des Fours, 33000 BORDEAUX'), 'et plus l\'adresse de l\'organisme');
    assert.match(html, /Déclaration d'activité n° 76 65 00989 65/);
    assert.match(html, info('Durée', '5\u00a0jours · 35\u00a0h'), '« 35 h » ne se coupe pas en fin de ligne');
    assert.match(html, info('Entreprise', 'Le Four à Bois SAS'));
    assert.match(feuille({ lieu: null }), info('Lieu', '101 rue Alsace Lorraine, 65300 LANNEMEZAN'), 'sans lieu de session : l\'adresse de l\'organisme');
});

test('LA FEUILLE : « Fait à …, le » porte la date de la feuille, pas celle du rendu', () => {
    assert.match(feuille({ dateFeuille: '2026-09-18' }), /Fait à LANNEMEZAN, le 18\/09\/2026/);
});

test('LA FEUILLE : une case vide d\'un jour CLOS dit « Non signé » ; celle d\'aujourd\'hui reste à signer', () => {
    const html = feuille({ signees: [], aujourdHui: '2026-09-17' });
    // Du 14 au 16 : trois jours clos, deux lignes (stagiaire, formateur), deux demi-journées.
    assert.strictEqual((html.match(/Non signé/g) || []).length, 12);
    assert.strictEqual((feuille({ signees: [], aujourdHui: '2026-09-14' }).match(/Non signé/g) || []).length, 0, 'le premier jour, rien n\'est clos');
});

test('LA FEUILLE : le rattrapage imprime son motif, et la présence compte dans le total', () => {
    const toutes = JOURS.flatMap((d) => [`${d}|MATIN`, `${d}|APRES_MIDI`]);
    const html = feuille({ signees: toutes.filter((k) => k !== '2026-09-17|APRES_MIDI' && k !== '2026-09-18|APRES_MIDI'),
        rattrapage: { '2026-09-18|APRES_MIDI': 'Rattrapage : Oubli de signature (Jean-Jacques DESPAUX)' } });
    assert.match(html, /<div class="nt">Rattrapage : Oubli de signature \(Jean-Jacques DESPAUX\)<\/div>/);
    // 35 h prévues ; le jeudi après-midi (3h30) manque, le vendredi après-midi est rattrapé.
    assert.match(html, /<td class="tot"[^>]*>31h30<\/td>/);
    assert.match(html, /<b>Total<\/b><div class="hs">35h00 prévues<\/div>/, 'le volume prévu coiffe la colonne');
});

test('LA FEUILLE : sans horaires lisibles, le total compte les demi-journées', () => {
    const html = feuille({ horaires: null, signees: [`${JOURS[0]}|MATIN`, `${JOURS[0]}|APRES_MIDI`] });
    assert.match(html, /<td class="tot"[^>]*>2\/10<\/td>/);
});

test('LA FEUILLE : les horaires EN TÊTE DES COLONNES, une seule fois ; le soir sous « Après-midi »', () => {
    const html = feuille();
    // Chaque demi-journée porte sa plage et sa durée sous son nom.
    assert.match(html, /<b>Matin<\/b><div class="hs">8h45 - 12h00<\/div><div class="hs">3h15<\/div>/);
    assert.match(html, /<b>Après-midi<\/b><div class="hs">13h00 - 14h00<\/div><div class="hs">1h00<\/div>/, 'le vendredi finit à 14h');
    // Les deux lignes récap qui s'intercalaient entre les signatures ont disparu.
    assert.doesNotMatch(html, />Horaires<\/td>|>Volume horaire<\/td>/);
    assert.doesNotMatch(html, /Horaires :<\/b> Jour 1/, 'les colonnes les montrent déjà');
    assert.match(feuille({ config: { slots: ['MATIN', 'APRES_MIDI'], show_hours: false } }), /<b>Horaires :<\/b> Jour 1/, 'sans elles, le bandeau les garde');
    // Le cours du soir : sa plage sous l'après-midi, rien sous le matin.
    const soir = feuille({ horaires: '17h00 - 19h00' });
    assert.match(soir, /<b>Après-midi<\/b><div class="hs">17h00 - 19h00<\/div>/);
    assert.doesNotMatch(soir, /<b>Matin<\/b><div class="hs">/);
});

test('LA FEUILLE : les jours se lisent — un filet marqué ouvre chaque jour, un jour sur deux est teinté', () => {
    const html = feuille();
    // Cinq jours : cinq en-têtes de jour ouverts par le filet, et chaque ligne en porte cinq aussi.
    assert.strictEqual((html.match(/colspan="2" align="center" bgcolor="#[0-9a-f]{6}" style="border:0\.5pt solid #c9ccd3;border-left:1\.2pt solid #7b8496"/g) || []).length, 5);
    const debut = html.indexOf('<b>BERGER Camille</b>'); // la ligne de la grille, pas le bandeau
    const ligne = html.slice(debut, html.indexOf('</tr>', debut));
    assert.strictEqual((ligne.match(/border-left:1\.2pt solid #7b8496/g) || []).length, 5);
    // Mardi et jeudi teintés, lundi, mercredi et vendredi non.
    assert.strictEqual((ligne.match(/bgcolor="#f6f8fb"/g) || []).length, 4, 'deux jours teintés × deux demi-journées');
});

test('LA FEUILLE : en-tête en deux colonnes, bandeau d\'informations, intertitre de l\'équipe', () => {
    const html = feuille({ config: { slots: ['MATIN', 'APRES_MIDI'], accent: '#548dd4' } });
    assert.match(html, /<div class="titre" style="color:#548dd4">FEUILLE D'ÉMARGEMENT<\/div>/, 'le titre en capitales — LibreOffice ignore text-transform');
    assert.match(html, /<div class="formation">Fabriquer des pizzas artisanales <span class="code">RS7404<\/span><\/div>/);
    assert.match(html, /style="border-bottom:1\.5pt solid #548dd4"/, 'le filet d\'accent : la bordure basse de l\'en-tête, pas un <hr>');
    assert.doesNotMatch(html, /<hr\b/);
    assert.match(html, /<div class="lbl">Stagiaire<\/div><div class="val">BERGER Camille<\/div>/);
    assert.match(html, /<div class="lbl">Dates<\/div><div class="val">du 14\/09\/2026 au 18\/09\/2026<\/div><div class="petit">Semaine 38<\/div>/);
    assert.match(html, /<div class="sec">Équipe pédagogique<\/div>/);
    assert.ok(html.indexOf('BERGER Camille</b>') < html.indexOf('Équipe pédagogique') && html.indexOf('Équipe pédagogique') < html.indexOf('DESPAUX Jean-Jacques</b>'),
        'le stagiaire, puis l\'équipe');
});

test('LIBREOFFICE : ce qui a été éprouvé sur la feuille, et qui ne se voit qu\'au rendu', () => {
    const src = lire('lib/emargement.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const rendu = src.slice(src.indexOf('function renderEmargementHtml'), src.indexOf('function initiales'));
    // Un <th> met TOUT son contenu en gras : les plages et durées sortaient aussi grasses que « Matin ».
    assert.doesNotMatch(rendu, /<th\b/);
    // Un paragraphe d'espacement avant le pied faisait passer le pied ENTIER en page 2.
    assert.doesNotMatch(rendu, /<p style="margin:0;font-size:5px">&nbsp;<\/p>\s*<table width="\$\{px\(tableW\)\}" cellspacing="\$\{px\(1\.2\)\}"/);
    // Dans un tableau imbriqué, LibreOffice perdait l'image du cachet : une seule cellule bordée.
    const pied = rendu.slice(rendu.indexOf('<div class="fait">'));
    assert.strictEqual((pied.match(/<table\b/g) || []).length, 0, 'aucun tableau dans le pied');
    assert.ok(pied.indexOf('<img src="${attr(orgSig)}"') < pied.indexOf('<div class="cap">'), 'l\'image avant la légende');
});

test('LA FEUILLE : les noms à gauche et en gras (l\'attribut et la balise, que LibreOffice lit), le formateur avec son rôle', () => {
    const html = feuille();
    assert.match(html, /<td class="nm" align="left"[^>]*><b>BERGER Camille<\/b><div class="sub">Stagiaire<\/div><\/td>/);
    assert.match(html, /<td class="nm" align="left"[^>]*><b>DESPAUX Jean-Jacques<\/b><div class="sub">Formateur<\/div><\/td>/);
});

test('LE RATTRAPAGE crédite en initiales : « J.-J. DESPAUX » tient dans la case', () => {
    assert.strictEqual(E.initiales('Jean-Jacques DESPAUX'), 'J.-J. DESPAUX');
    assert.strictEqual(E.initiales('Marie DE LA TOUR'), 'M. DE LA TOUR', 'le nom en capitales reste entier');
    assert.strictEqual(E.initiales('Paul Martin'), 'P. Martin', 'sans capitales, le dernier mot est le nom');
    assert.strictEqual(E.initiales('secretariat@ecole-pizza.com'), 'secretariat@ecole-pizza.com');
    assert.strictEqual(E.initiales('DESPAUX'), 'DESPAUX');
});

test('L\'APERÇU DU MODÈLE est la feuille elle-même, sur un exemple — plus une imitation', () => {
    const ex = E.feuilleExemple({ org: { legal_name: 'ECOLE PIZZA', nda: '76 65 00989 65', town: 'LANNEMEZAN' }, config: { slots: ['MATIN', 'APRES_MIDI'] }, aujourdHui: '2026-09-26' });
    assert.deepStrictEqual([ex.e.start_date, ex.aujourdHui], ['2026-09-21', '2026-09-24'], 'la semaine du jour, vue le jeudi');
    const html = E.renderEmargementHtml(ex);
    assert.match(html, /ECOLE PIZZA/, 'l\'organisme est le vrai');
    assert.match(html, /LEFEBVRE Camille/, 'le stagiaire est fictif');
    // Chaque état de case se voit : signé, « Non signé », rattrapé, à venir, intervenant avec ses heures.
    assert.match(html, /Non signé/);
    assert.match(html, /Rattrapage<br\/>Oubli de signature/);
    assert.match(html, /<div class="hr">14h00 - 16h00<\/div>/);
    assert.match(html, /<td class="tot"[^>]*>21h00<\/td>/);
    const ctrl = lire('controllers/emargementTemplate.controller.js');
    assert.match(ctrl, /renderEmargementHtml\(feuilleExemple\(\{ org: organisme, config: mergeEmargConfig\(req\.body && req\.body\.config\) \}\)\)/);
    assert.match(lire('routes/emargementTemplate.routes.js'), /router\.post\('\/preview-pdf', previewPdf\);/);
    const ecran = lireUi('pages/EmargementEditor.jsx');
    assert.match(ecran, /emargementPreviewPdfUrl\(JSON\.parse\(cle\)\)/);
    assert.doesNotMatch(ecran, /function EmargementPreview/, 'l\'imitation en React est partie');
});

/* Le chargeur, sur une base simulée : ce que la feuille lit VRAIMENT (et pas des participants
   fabriqués à la main). `sans184` : la base n'a pas encore les colonnes du rattrapage. */
function baseFeuille({ sans184 = false } = {}) {
    const lignes = JOURS.flatMap((d) => ['MATIN', 'APRES_MIDI'].map((slot) => ({ sheet_id: `${d}${slot}`, date: d, slot,
        signature_data: `${d}|${slot}` === '2026-09-18|APRES_MIDI' ? null : 'data:image/png;base64,QUJD', signed_on: d })));
    lignes[9].rattrapage_motif = 'Oubli de signature'; lignes[9].rattrapage_par = 'Jean-Jacques DESPAUX';
    return { query: async (sql) => {
        const q = sql.replace(/\s+/g, ' ');
        if (/FROM enrollment e JOIN training_session/.test(q)) return [[{ id: 'e1', learner_id: 'l1', session_id: 's1', company_id: 'c1', first_name: 'Camille', last_name: 'BERGER',
            year: 2026, week: 38, start_date: '2026-09-14', end_date: '2026-09-18', program_code: 'RS7404', program_title: 'Fabriquer des pizzas artisanales', program_days: 5, program_hours: 35, program_id: 'p1' }]];
        if (/SELECT horaires FROM training_program/.test(q)) return [[{ horaires: HORAIRES_RS7404 }]];
        if (/FROM organization WHERE id/.test(q)) return [[{ legal_name: 'ECOLE PIZZA', nda: '76 65 00989 65', town: 'LANNEMEZAN', logo_image: null }]];
        if (/training_location/.test(q)) return [[{ name: 'Centre de Bordeaux', address: '12 rue des Fours', zip_code: '33000', town: 'BORDEAUX' }]];
        if (/SELECT name FROM company/.test(q)) return [[{ name: 'Le Four à Bois SAS' }]];
        if (/FROM attendance_sheet s LEFT JOIN attendance_record ar/.test(q)) {
            if (sans184 && /rattrapage_motif/.test(q)) { const e = new Error('champ inconnu'); e.code = 'ER_BAD_FIELD_ERROR'; throw e; }
            return [lignes.map((l) => (sans184 ? { ...l, rattrapage_motif: undefined, rattrapage_par: undefined } : { ...l }))];
        }
        if (/FROM attendance_trainer_sign ats/.test(q)) return [[]];
        if (/FROM session_trainer st JOIN user u/.test(q)) return [[]];
        if (/FROM session_intervenant si/.test(q)) return [[]];
        throw new Error('requête inattendue : ' + q.slice(0, 100));
    } };
}

test('LE CHARGEUR : une présence RATTRAPÉE sans signature compte, et son motif s\'imprime', async () => {
    const f = await E.chargerFeuille(baseFeuille(), 'org1', 'e1', { instant: aParis('2026-09-26', '10:00'), zone: 'Europe/Paris' });
    assert.strictEqual(f.lieu, 'Centre de Bordeaux, 12 rue des Fours, 33000 BORDEAUX');
    assert.strictEqual(f.entreprise, 'Le Four à Bois SAS');
    assert.strictEqual(f.dateFeuille, '2026-09-18', 'la dernière signature, pas le jour du rendu');
    const html = E.renderEmargementHtml({ ...f, config: { slots: ['MATIN', 'APRES_MIDI'] } });
    assert.match(html, /<div class="nt">Rattrapage<br\/>Oubli de signature \(J\.-J\. DESPAUX\)<\/div>/, 'crédité en initiales, « Rattrapage » sur sa ligne');
    assert.match(html, /<td class="tot"[^>]*>35h00<\/td>/, 'dix demi-journées : neuf signées, une rattrapée');
});

test('LE CHARGEUR sans la migration 184 : la feuille sort, sans rattrapage', async () => {
    const f = await E.chargerFeuille(baseFeuille({ sans184: true }), 'org1', 'e1', { instant: aParis('2026-09-26', '10:00'), zone: 'Europe/Paris' });
    const html = E.renderEmargementHtml({ ...f, config: { slots: ['MATIN', 'APRES_MIDI'] } });
    assert.doesNotMatch(html, /Rattrapage/);
    assert.match(html, /<td class="tot"[^>]*>34h00<\/td>/, 'le vendredi après-midi (1h) n\'est ni signé ni rattrapé');
    assert.match(html, /Non signé/);
});

test('UN SEUL CHARGEMENT pour la feuille archivée et le document signé', () => {
    const src = lire('lib/emargement.js');
    assert.strictEqual((src.match(/await chargerFeuille\(conn, orgId, enrollmentId\)/g) || []).length, 2);
    assert.strictEqual((src.match(/FROM attendance_sheet s\s+LEFT JOIN attendance_record ar/g) || []).length, 1, 'la requête des demi-journées n\'existe qu\'une fois');
    assert.match(src, /renderEmargementHtml\(\{ \.\.\.f, config \}\)/);
    assert.match(src, /return renderEmargementHtml\(\{ \.\.\.f, config: opts\.config \}\);/);
});

/* ── La veille se clôt ───────────────────────────────────────────────────────────────────────────── */
test('LA VEILLE SE CLÔT : chaque dossier de la veille est refait une fois, et une seule', async () => {
    const refaits = [];
    const conn = { query: async (sql, params) => {
        assert.match(sql, /WHERE s\.date = \?/);
        assert.deepStrictEqual(params, ['2026-09-18']);
        return [[{ id: 'e1', organization_id: 'org1' }, { id: 'e2', organization_id: 'org1' }]];
    } };
    const regenerer = async (c, org, id) => { refaits.push(id); };
    const instant = aParis('2026-09-19', '00:20'); // 22h20 UTC le 18 : c'est pourtant le 19 à Paris
    assert.strictEqual(await E.cloreLaVeille({ conn, instant, zone: 'Europe/Paris', regenerer }), 2);
    assert.strictEqual(await E.cloreLaVeille({ conn, instant, zone: 'Europe/Paris', regenerer }), 0, 'une seule fois par veille');
    assert.deepStrictEqual(refaits, ['e1', 'e2']);
    assert.match(lire('server.js'), /setInterval\(clore, 60 \* 60 \* 1000\)/);
});

/* ── La migration 184, et les écrans ─────────────────────────────────────────────────────────────── */
test('LA MIGRATION 184 : trois colonnes rejouables, un revert qui dit ce qu\'il perd', () => {
    const MIG = path.join(API, '..', '..', 'database', 'migrations');
    const aller = fs.readFileSync(path.join(MIG, '184_emargement_rattrapage.sql'), 'utf8');
    const sql = aller.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(aller, /^\s*--/m, 'commentaires en blocs');
    for (const c of ['rattrapage_motif', 'rattrapage_par', 'rattrapage_le']) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`));
    const retour = fs.readFileSync(path.join(MIG, '184_revert_emargement_rattrapage.sql'), 'utf8');
    for (const c of ['rattrapage_motif', 'rattrapage_par', 'rattrapage_le']) assert.match(retour, new RegExp(`DROP COLUMN IF EXISTS ${c}\\b`));
    assert.match(retour, /CE QUI SE PERD/);
});

test('LES ÉCRANS DU STAGIAIRE suivent la fenêtre du serveur, et plus « date passée = Signer »', () => {
    for (const f of ['pages/EmargementStagiaire.jsx', 'pages/StudentFormationDetail.jsx']) {
        const src = lireUi(f);
        assert.match(src, /etatEmargement\(r, /, `${f} lit l'état calculé par le serveur`);
        assert.doesNotMatch(src, /!r\.signed && r\.date <= /, `${f} : l'ancienne règle offrait « Signer » sur toute date passée`);
    }
    const etat = lireUi('lib/emargementEtat.js');
    assert.match(etat, /if \(etat === "ouverte"\) return \{ cle: "ouverte" \};/);
});

test('LA GRILLE DE L\'ÉCOLE : « Rattraper » sur une demi-journée close, jamais sur une à venir', () => {
    const src = lireUi('components/Emargement.jsx');
    assert.match(src, /\) : s\.etat === "close" \? \(/);
    assert.match(src, /onClick=\{\(\) => setRattrapage\(\{ rec, sheet: s, learner: l \}\)\}>Rattraper<\/button>/);
    assert.match(lireUi('components/RattrapageModal.jsx'), /rattraperEmargement\(record\.id, \{ motif: texte, signature_data \}\)/);
});
