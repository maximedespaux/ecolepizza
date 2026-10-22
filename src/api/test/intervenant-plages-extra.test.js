/**
 * UN INTERVENANT AVEC DES PAUSES, ET SES HEURES QUI COMPTENT DANS LE TOTAL (migration 213, demandé
 * le 2026-10-21 — feuille d'émargement NIV1H, hygiène PENE).
 *
 *   · plusieurs CRÉNEAUX par demi-journée (« 16h15 - 16h30, pause, 16h45 - 18h15 »), heures NETTES =
 *     somme des créneaux (pauses exclues) ;
 *   · un intervenant « EXTRA » enseigne un temps EN PLUS des demi-journées du stagiaire (l'hygiène) :
 *     ses heures nettes s'AJOUTENT au total de la feuille. Un intervenant non-extra n'ajoute rien.
 */
const test = require('node:test');
const assert = require('node:assert');

const { lirePlages, plagesFr, minutesPlages } = require('../lib/plageHoraire.js');
const E = require('../lib/emargement.js');

// ── Les règles pures (lib/plageHoraire.js) ────────────────────────────────────────────────────────
test('lirePlages : garde les créneaux valides, triés par début ; écarte l\'incomplet et l\'inversé', () => {
    assert.deepStrictEqual(
        lirePlages([{ debut: '16:45', fin: '18:15' }, { debut: '16:15', fin: '16:30' }]),
        [{ debut: '16:15:00', fin: '16:30:00' }, { debut: '16:45:00', fin: '18:15:00' }], 'triés par heure de début');
    assert.deepStrictEqual(lirePlages([{ debut: '09:00', fin: '' }, { debut: '14:00', fin: '09:00' }, { debut: '10:00', fin: '12:00' }]),
        [{ debut: '10:00:00', fin: '12:00:00' }], 'incomplet et inversé écartés');
    assert.deepStrictEqual(lirePlages(null), []);
    assert.deepStrictEqual(lirePlages([]), []);
});

test('plagesFr / minutesPlages : l\'affichage et les minutes NETTES (pauses exclues)', () => {
    const p = lirePlages([{ debut: '16:15', fin: '16:30' }, { debut: '16:45', fin: '18:15' }]);
    assert.deepStrictEqual(plagesFr(p), ['16h15 - 16h30', '16h45 - 18h15']);
    assert.strictEqual(minutesPlages(p), 15 + 90, '15 min + 1h30 = 1h45, la pause 16h30-16h45 ne compte pas');
    assert.strictEqual(minutesPlages([]), 0);
});

// ── La feuille : total « en plus » + créneaux empilés ─────────────────────────────────────────────
const DAYS = ['2026-10-12', '2026-10-13'];
const CLE_HYG = '2026-10-13|APRES_MIDI';
const rows = [];
for (const d of DAYS) for (const slot of ['MATIN', 'APRES_MIDI']) rows.push({ date: d, slot });
const cles = new Set(rows.map((l) => `${l.date}|${l.slot}`));
const e = {
    program_title: 'Pizzaïolo Niveau I + Hygiène', program_code: 'NIV1H',
    start_date: '2026-10-12', end_date: '2026-10-13', week: 42, year: 2026, program_days: 2, program_hours: 44,
    // 8h/jour (matin 4h + après-midi 4h) × 2 jours = 16h de « pizza » dans les demi-journées.
    program_horaires: '8h00 - 12h00 / 13h00 - 17h00',
};
const org = { legal_name: 'ECOLE PIZZA' };

function rendu(extra) {
    const participants = [
        { role: 'stagiaire', name: 'BELDROEGA Mickaël', sigOf: () => 'data:image/png;base64,QUJD',
            appliesTo: (k) => cles.has(k), presentDe: (k) => cles.has(k) },
        { role: 'intervenant', name: 'PENE Maurice', specialty: 'Hygiène', extra,
            appliesTo: (k) => k === CLE_HYG, sigOf: () => null,
            // 16h15 - 16h30 (15 min) + 16h45 - 18h15 (1h30) = 1h45 net, avec une pause.
            heuresDe: (k) => (k === CLE_HYG ? '16h15 - 16h30\n16h45 - 18h15\n1h45' : ''),
            minutesTotales: () => 105,
            // La fin la PLUS TARDIVE de la demi-journée (18h15), comme la rend lignesIntervenants.
            finDe: (k) => (k === CLE_HYG ? 18 * 60 + 15 : null),
        },
    ];
    return E.renderEmargementHtml({ org, e, rows, participants,
        config: { slots: ['MATIN', 'APRES_MIDI'], show_intervenants: true, show_hours: true } });
}

test('EXTRA : les heures de l\'intervenant s\'AJOUTENT au total (16h + 1h45 = 17h45)', () => {
    const html = rendu(true);
    assert.match(html, /17h45 prévues/, 'le total prévu intègre les heures en plus');
    // Le stagiaire émargé partout : son total vaut aussi 17h45.
    assert.match(html, /class="tot"[^>]*>17h45</, 'le total du stagiaire intègre les heures en plus');
});

test('NON-EXTRA : les heures de l\'intervenant NE comptent PAS en plus (16h00)', () => {
    const html = rendu(false);
    assert.match(html, /16h00 prévues/, 'sans « extra », le total reste celui des demi-journées');
    assert.doesNotMatch(html, /17h45 prévues/);
});

test('CRÉNEAUX EMPILÉS : les plages et leur total net s\'impriment l\'un sous l\'autre', () => {
    const html = rendu(true);
    assert.match(html, /16h15 - 16h30<br\/>16h45 - 18h15<br\/>1h45/, 'les créneaux empilés, puis le total net');
});

// ── Fin GLOBALE en tête : la demi-journée va jusqu'à l'intervenant, la durée ne bouge pas ──────────
test('FIN GLOBALE : la fin EN TÊTE va jusqu\'à l\'intervenant, la DURÉE reste celle du stagiaire', () => {
    const html = rendu(true);
    /* L'après-midi du 13/10 : la formation finit à 17h00, l'hygiène du soir à 18h15 → la plage affichée
       va jusqu'à 18h15 (le temps réel d'activité), mais la DURÉE reste 4h00 (17h00 − 13h00), JAMAIS
       cumulée. Les heures « en plus » sont comptées à part dans le total (cf. test « EXTRA »). */
    assert.match(html, /13h00 - 18h15<\/div><div class="hs">4h00<\/div>/, 'fin étendue à 18h15, durée inchangée (4h00)');
    /* L'autre après-midi (12/10), sans intervenant tardif, garde la fin de la formation (17h00). */
    assert.match(html, /13h00 - 17h00<\/div><div class="hs">4h00<\/div>/);
    /* JAMAIS cumulée : la durée n'affiche pas 5h15 (18h15 − 13h00). */
    assert.doesNotMatch(html, /13h00 - 18h15<\/div><div class="hs">5h15<\/div>/);
});

test('SANS fin d\'intervenant tardive, la tête ne bouge pas (pas de finDe → fin de la formation)', () => {
    // Un intervenant SANS finDe (ancienne forme, ou sans plage) n'étend rien : la tête reste à 17h00.
    const html = E.renderEmargementHtml({ org, e, rows,
        participants: [
            { role: 'stagiaire', name: 'X', sigOf: () => null, appliesTo: (k) => cles.has(k), presentDe: (k) => cles.has(k) },
            { role: 'intervenant', name: 'Y', specialty: '', extra: false, appliesTo: (k) => k === CLE_HYG, sigOf: () => null, heuresDe: () => '' },
        ],
        config: { slots: ['MATIN', 'APRES_MIDI'], show_intervenants: true, show_hours: true } });
    assert.match(html, /13h00 - 17h00<\/div><div class="hs">4h00<\/div>/);
    assert.doesNotMatch(html, /18h15/);
});
