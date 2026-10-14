/**
 * ESPACE INTERVENANT — ÉMARGEMENT PAR SEMAINE + PASTILLES DE LA BARRE (demandé le 2026-10-14).
 *
 * L'émargement montrait toute l'année scolaire d'un coup. On n'affiche plus qu'UNE semaine à la
 * fois — celle « concernée » par défaut (cf. semainesEmargement), avec un va-et-vient ‹ › —, et la
 * barre porte deux pastilles : les demi-journées à signer DE CETTE SEMAINE (le même compte que la
 * page) et les documents non signés. Ce fichier gèle les règles pures et le branchement des écrans.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');

const SHEETS = [
    { session_id: 'a', year: 2026, week: 38, slots: [{ signed: true }, { signed: false }, { signed: false }] },
    { session_id: 'b', year: 2026, week: 42, slots: [{ signed: false }] },
    { session_id: 'c', year: 2026, week: 38, slots: [{ signed: false }] }, // même semaine que a
];

test('semainesEmargement : une entrée par semaine, défaut = une semaine présente', async () => {
    const { semainesEmargement } = await import(pathToFileURL(path.join(UI, 'lib', 'intervenant.js')).href);
    const { groupes, defaut } = semainesEmargement(SHEETS);
    assert.deepStrictEqual(groupes.map((g) => g.cle).sort(), ['2026-38', '2026-42']);
    assert.strictEqual(groupes.find((g) => g.cle === '2026-38').sessions.length, 2, 'les deux sessions de la S38 regroupées');
    assert.ok(defaut === null || groupes.some((g) => g.cle === defaut), 'le défaut est une des semaines présentes');
    assert.strictEqual(semainesEmargement([]).defaut, null, 'aucune feuille : aucun défaut');
});

test('aSignerDansSemaine : compte les demi-journées NON signées de CETTE semaine', async () => {
    const { aSignerDansSemaine } = await import(pathToFileURL(path.join(UI, 'lib', 'intervenant.js')).href);
    assert.strictEqual(aSignerDansSemaine(SHEETS, '2026-38'), 3, '2 (session a) + 1 (session c)');
    assert.strictEqual(aSignerDansSemaine(SHEETS, '2026-42'), 1);
    assert.strictEqual(aSignerDansSemaine(SHEETS, '2026-01'), 0, 'semaine sans session');
    assert.strictEqual(aSignerDansSemaine(null, '2026-38'), 0);
});

test('LA BARRE porte les deux pastilles, sur la même semaine que la page', () => {
    const layout = lire('layouts/IntervenantLayout.jsx');
    assert.match(layout, /emargBadge > 0 && <span className="stu-count">\{emargBadge\}<\/span>/);
    assert.match(layout, /docsBadge > 0 && <span className="stu-count">\{docsBadge\}<\/span>/);
    assert.match(layout, /aSignerDansSemaine\(sheets\.data \|\| \[\], defaut\)/, 'la pastille d\'émargement compte la semaine à ouvrir');
    assert.match(layout, /\.filter\(\(d\) => !d\.signe_le\)\.length/, 'la pastille documents compte les non signés');
    assert.match(layout, /INTERVENANT_REFRESH/, 'elle se recompte à chaque signature');
});

test('L\'ÉMARGEMENT est rangé par semaine, et son en-tête compte la semaine affichée', () => {
    const espace = lire('pages/IntervenantEspace.jsx');
    assert.match(espace, /semainesEmargement\(data \|\| \[\]\)/);
    assert.match(espace, /const toSign = aSignerDansSemaine\(data, semaineSel\)/);
    assert.match(espace, /groupeSel \? groupeSel\.sessions : \[\]/, 'on ne rend qu\'une semaine à la fois');
    assert.match(espace, /rafraichirIntervenant\(\)/, 'après une signature, la barre est prévenue');
});
