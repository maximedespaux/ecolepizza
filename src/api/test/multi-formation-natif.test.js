/**
 * UN DEVIS QUI COUVRE PLUSIEURS FORMATIONS, NATIVEMENT (demandé le 2026-10-03).
 *
 * LE DÉFAUT. L'entreprise Gervais Christelle est inscrite à NIV1 + NIV2 ; le devis professionnel,
 * fait des jetons `field:training_program.*` (intitulé, objectifs, prérequis, prix, déroulé…) et
 * des jetons nommés {Semaine}, {Jour1}/{endDate}, ne montrait que la PREMIÈRE formation : les
 * `field:*` se chargeaient depuis `document_formation … LIMIT 1` (document.controller), et la
 * semaine comme les dates ne lisaient que `formations[0]`. « du 18 au 22 mai » tout seul, NIV1
 * seul, semaine 6 seule — NIV2 disparaissait sans un mot.
 *
 * LA CORRECTION, native (sans bloc à écrire dans le modèle). L'école a décrit le rendu voulu :
 *   · semaine « 6 et 12 » ; formation « niveau 1 et niveau 2 » ;
 *   · dates « du 18/05 au 22/05/2026 et du 01/06 au 03/06/2026 » (appariées par formation).
 * On agrège donc TOUTES les inscriptions : montants/durées sommés, textes longs en blocs par
 * formation, le reste joint « et » (lib/agregationChamps). {Semaine} devient « Semaines 6 et 12 »,
 * et un nouveau jeton {Périodes} apparie les dates. Une seule formation : tout est INCHANGÉ.
 *
 * Réintroduire le défaut : revenir au `LIMIT 1` / à `formations[0]` fait rougir les cas « multi ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { agregerChamps, joindreFr } = require('../lib/agregationChamps.js');
const { resolveTokens } = require('../lib/tokens.js');

const eur = (s) => String(s).replace(/\s/g, ' ');

const CATALOG = [
    { key: 'training_program.title', table: 'training_program', column: 'title', type: 'string' },
    { key: 'training_program.price', table: 'training_program', column: 'price', type: 'number' },
    { key: 'training_program.objectives', table: 'training_program', column: 'objectives', type: 'string' },
    { key: 'training_program.audience', table: 'training_program', column: 'audience', type: 'string' },
    { key: 'training_program.hygiene', table: 'training_program', column: 'hygiene', type: 'bool' },
    { key: 'training_session.week', table: 'training_session', column: 'week', type: 'number' },
    { key: 'enrollment.acompte', table: 'enrollment', column: 'acompte', type: 'number' },
    { key: 'company.name', table: 'company', column: 'name', type: 'string' },
];
const F = [
    { 'training_program.title': 'Pizzaïolo niveau 1', 'training_program.price': 850, 'training_program.objectives': '- Pâte\n- Cuisson', 'training_program.audience': 'Tout public', 'training_program.hygiene': true, 'training_session.week': 6, 'enrollment.acompte': 255, 'company.name': 'SARL Gervais' },
    { 'training_program.title': 'Pizzaïolo niveau 2', 'training_program.price': 1180, 'training_program.objectives': '- Garnitures\n- Four', 'training_program.audience': 'Tout public', 'training_program.hygiene': false, 'training_session.week': 12, 'enrollment.acompte': 354, 'company.name': 'SARL Gervais' },
];

test('joindreFr : « a », « a et b », « a, b et c »', () => {
    assert.strictEqual(joindreFr(['a']), 'a');
    assert.strictEqual(joindreFr(['a', 'b']), 'a et b');
    assert.strictEqual(joindreFr(['a', 'b', 'c']), 'a, b et c');
    assert.strictEqual(joindreFr(['a', '', null, 'b']), 'a et b', 'les vides sont ignorés');
    assert.strictEqual(joindreFr([]), '');
});

test('agregerChamps (plusieurs formations) : somme, « et », blocs par formation, dédoublonnage', () => {
    const a = agregerChamps(F, CATALOG);
    assert.strictEqual(a['training_program.title'], 'Pizzaïolo niveau 1 et Pizzaïolo niveau 2');
    assert.strictEqual(a['training_program.price'], 2030, 'le PRIX s\'additionne (total du devis)');
    assert.strictEqual(a['enrollment.acompte'], 609, 'l\'acompte s\'additionne aussi');
    assert.strictEqual(a['training_session.week'], '6 et 12', 'une semaine ne s\'additionne pas — elle se joint');
    assert.strictEqual(a['training_program.audience'], 'Tout public', 'une valeur commune n\'est pas répétée');
    assert.strictEqual(a['training_program.objectives'],
        'Pizzaïolo niveau 1 :\n- Pâte\n- Cuisson\n\nPizzaïolo niveau 2 :\n- Garnitures\n- Four',
        'un texte long devient un bloc par formation, précédé de son intitulé');
    assert.strictEqual(a['training_program.hygiene'], 'Oui et Non', 'deux cases qui diffèrent');
    assert.strictEqual(a['company.name'], 'SARL Gervais', 'l\'entreprise ne s\'agrège pas (une par document)');
});

test('agregerChamps (une seule formation) : TOUT est inchangé', () => {
    const a = agregerChamps([F[0]], CATALOG);
    assert.strictEqual(a['training_program.title'], 'Pizzaïolo niveau 1');
    assert.strictEqual(a['training_program.price'], 850);
    assert.strictEqual(a['training_program.objectives'], '- Pâte\n- Cuisson', 'pas de bloc, pas d\'intitulé ajouté');
    assert.strictEqual(a['training_session.week'], '6');
    assert.strictEqual(a['training_program.hygiene'], true, 'reste un booléen → « Oui » au rendu');
});

const ctxDe = (forms) => ({ org: {}, learner: {}, formations: forms });
const NIV1 = { title: 'Pizzaïolo niveau 1', code: 'NIV1PRO', hours: 35, days: 5, enroll_price: 850, start_date: '2026-05-18', end_date: '2026-05-22', week: 6, year: 2026 };
const NIV2 = { title: 'Pizzaïolo niveau 2', code: 'NIV2', hours: 21, days: 3, enroll_price: 1180, start_date: '2026-06-01', end_date: '2026-06-03', week: 12, year: 2026 };

test('resolveTokens (plusieurs formations) : la semaine, l\'intitulé et les dates agrégés', () => {
    const v = resolveTokens(ctxDe([NIV1, NIV2]));
    assert.strictEqual(v.Formation, 'Pizzaïolo niveau 1 et Pizzaïolo niveau 2');
    assert.strictEqual(v.Semaine, 'Semaines 6 et 12 — 2026');
    assert.strictEqual(v['Périodes'], 'du 18/05/2026 au 22/05/2026 et du 01/06/2026 au 03/06/2026');
    assert.strictEqual(eur(v.Prix), '2 030 €');
    assert.strictEqual(v.Heures, '56');
    // {Jour1}/{endDate} restent une PÉRIODE GLOBALE (premier début, dernière fin).
    assert.strictEqual(v.Jour1, '18/05/2026');
    assert.strictEqual(v.endDate, '03/06/2026');
});

test('resolveTokens (une seule formation) : le format d\'avant, à l\'identique', () => {
    const v = resolveTokens(ctxDe([NIV1]));
    assert.strictEqual(v.Formation, 'Pizzaïolo niveau 1');
    assert.strictEqual(v.Semaine, 'Semaine 6 — 2026', 'singulier, format inchangé');
    assert.strictEqual(v['Périodes'], 'du 18/05/2026 au 22/05/2026');
    assert.strictEqual(v.Jour1, '18/05/2026');
    assert.strictEqual(v.endDate, '22/05/2026');
});

test('{Périodes} tient une date à moitié connue, et vaut vide sans formation', () => {
    assert.strictEqual(resolveTokens(ctxDe([{ title: 'X', start_date: '2026-05-18' }]))['Périodes'], 'à partir du 18/05/2026');
    assert.strictEqual(resolveTokens(ctxDe([]))['Périodes'], '');
});

/* ── Le câblage, lu au source ────────────────────────────────────────────────────────────────── */
test('le contrôleur agrège TOUTES les inscriptions du document (plus de LIMIT 1)', () => {
    const c = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    assert.match(c, /const enrIdsDoc = avecInscription\.map\(\(f\) => f\.__eid\);/);
    /* Depuis le 2026-10-07 : la SESSION de chaque inscription est passée à agregerChamps, pour
       n'additionner les durées qu'une fois par session (sinon ×nombre de stagiaires). */
    assert.match(c, /const sessionKeys = avecInscription\.map\(\(f\) => f\.__sid\);/);
    assert.match(c, /agregerChamps\(listeFaits, catalog, sessionKeys\)/);
    assert.match(c, /df\.enrollment_id AS __eid, e\.session_id AS __sid/, 'inscription ET session chargées');
    // Les Champs documents partent de TOUTES les inscriptions (enrIdsDoc), et décryptent chaque fait.
    assert.match(c, /loadDossierFactsMap\(conn, organizationId, enrIdsDoc, catalog\)/);
});

test('{Périodes} est dans la palette (groupe Session) et reconnu', () => {
    const { TOKEN_CATALOG } = require('../lib/tokens.js');
    const session = TOKEN_CATALOG.find((g) => g.group === 'Session');
    assert.ok(session.tokens.some((t) => t.key === 'Périodes'), 'le jeton {Périodes} est proposé');
});
