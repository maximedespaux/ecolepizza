/**
 * LA DATE ET LES HEURES D'UNE FORMATION SONT FIXES, PAS MULTIPLIÉES PAR LE NOMBRE DE STAGIAIRES —
 * relevé le 2026-10-07 : sur un document de GROUPE (plusieurs inscrits, une même session), {Heures}
 * et {Jours} sortaient × nombre de stagiaires, et les objectifs étaient répétés autant de fois.
 *
 * LA CAUSE. `document_formation` porte une ligne par INSCRIPTION ; `ctx.formations` et la liste de
 * faits en héritent. Les durées et les textes sont pourtant des propriétés de la SESSION, pas du
 * stagiaire. On les agrège donc désormais sur les SESSIONS DISTINCTES (`formsSession` /
 * `agregerChamps(..., sessionKeys)`). Seuls {Prix}/{Acompte}, qui sont des TOTAUX, s'additionnent
 * par stagiaire.
 *
 * On couvre les DEUX chemins : les jetons nommés ({Heures}, resolveTokens) et les Champs documents
 * (field:training_*, agregerChamps).
 */
const test = require('node:test');
const assert = require('node:assert');
const { resolveTokens, formationsParSession } = require('../lib/tokens.js');
const { agregerChamps: agreger } = require('../lib/agregationChamps.js');

const ORG = { legal_name: 'École Pizza' };
const esp = (s) => String(s).replace(/[  ]/g, ' '); // les montants portent une espace fine insécable

// Un stagiaire d'un GROUPE : même session (heures/jours/dates), acompte propre à chacun.
const inscrit = (acompte) => ({
    __sid: 'S1', title: 'Pizzaïolo Niveau I', code: 'NIV1', hours: 35, days: 5, week: 23, year: 2026,
    enroll_price: 1780, acompte, start_date: '2026-06-01', end_date: '2026-06-05',
});

test('JETONS NOMMÉS — un groupe de 3 stagiaires : {Heures}=35 (pas 105), {Jours}=5 (pas 15)', () => {
    const t = resolveTokens({ org: ORG, invoice: { number: 'D1' },
        formations: [inscrit(450), inscrit(450), inscrit(300)] });
    assert.strictEqual(t.Heures, '35', 'les heures de la SESSION, pas × stagiaires');
    assert.strictEqual(t.Jours, '5', 'les jours de la SESSION, pas × stagiaires');
    assert.match(t.Semaine, /^Semaine 23 — 2026$/, 'une seule semaine, pas répétée');
    assert.strictEqual(t.Jour1, '01/06/2026');
    assert.strictEqual(t.endDate, '05/06/2026');
    // Les TOTAUX, eux, s'additionnent bien par stagiaire.
    assert.strictEqual(esp(t.Prix), '5 340 €', '3 × 1780');
    assert.strictEqual(esp(t.Acompte), '1 200 €', '450 + 450 + 300');
});

test('JETONS NOMMÉS — deux formations distinctes : {Heures} les SOMME (35 + 21 = 56)', () => {
    const niv2 = { ...inscrit(0), __sid: 'S2', title: 'Pizzaïolo Niveau II', code: 'NIV2', hours: 21, days: 3, week: 24 };
    const t = resolveTokens({ org: ORG, invoice: { number: 'D2' }, formations: [inscrit(450), niv2] });
    assert.strictEqual(t.Heures, '56', 'deux sessions distinctes : les heures s\'additionnent');
    assert.strictEqual(t.Jours, '8', '5 + 3');
    assert.match(t.Semaine, /Semaines 23 et 24 — 2026/);
});

test('UNE SEULE formation, un seul inscrit : tout est inchangé', () => {
    const t = resolveTokens({ org: ORG, invoice: { number: 'D3' }, formations: [inscrit(450)] });
    assert.strictEqual(t.Heures, '35');
    assert.strictEqual(t.Jours, '5');
    assert.strictEqual(esp(t.Prix), '1 780 €');
});

test('formationsParSession : dédoublonne par __sid, et par signature à défaut', () => {
    // Trois inscriptions, une session (__sid) → une seule formation.
    assert.strictEqual(formationsParSession([inscrit(1), inscrit(2), inscrit(3)]).length, 1);
    // Sans __sid, la signature (code/title/semaine/dates) distingue les sessions.
    const a = { code: 'NIV1', title: 'N1', week: 23, year: 2026, start_date: '2026-06-01', end_date: '2026-06-05' };
    const b = { code: 'NIV2', title: 'N2', week: 24, year: 2026, start_date: '2026-06-08', end_date: '2026-06-10' };
    assert.strictEqual(formationsParSession([a, a, b]).length, 2);
});

test('CHAMPS DOCUMENTS — agregerChamps : la durée par SESSION, le prix par STAGIAIRE', () => {
    const catalog = [
        { key: 'training_program.hours', table: 'training_program', column: 'hours', type: 'number' },
        { key: 'enrollment.acompte', table: 'enrollment', column: 'acompte', type: 'number' },
    ];
    const faits = [
        { 'training_program.hours': 35, 'enrollment.acompte': 450 },
        { 'training_program.hours': 35, 'enrollment.acompte': 450 },
        { 'training_program.hours': 35, 'enrollment.acompte': 300 },
    ];
    const out = agreger(faits, catalog, ['S1', 'S1', 'S1']);
    assert.strictEqual(out['training_program.hours'], 35, 'une session : 35, pas 105');
    assert.strictEqual(out['enrollment.acompte'], 1200, 'trois stagiaires : 450 + 450 + 300');

    // Deux sessions distinctes : les heures s'additionnent (56).
    const out2 = agreger([{ 'training_program.hours': 35 }, { 'training_program.hours': 21 }],
        [catalog[0]], ['S1', 'S2']);
    assert.strictEqual(out2['training_program.hours'], 56);
});
