/**
 * OÙ S'OUVRE LE CALENDRIER DES SESSIONS — demandé le 2026-09-28 : « en ouvrant Sessions, aller à la date
 * de la prochaine session, sauf si la session précédente a encore un stagiaire sous 100 % ; aujourd'hui,
 * le 28/09/26, les stagiaires de la semaine sont à 100 % : ouvrir le calendrier sur octobre ».
 *
 * LE DÉFAUT. Le calendrier s'ouvrait toujours sur le mois du jour : il montrait un septembre fini, et il
 * fallait passer au mois suivant pour voir ce qui venait. Et rien ne rappelait qu'une session terminée
 * avait encore des dossiers à finir.
 *
 * « À FINIR » EST LA RÈGLE DU TABLEAU DE BORD (`resteAFinir`) : quelqu'un qui n'est jamais venu ne
 * retient pas le calendrier, pas plus qu'il ne reste sur la carte « Derniers dossiers ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const regle = () => import('../../app/ui/lib/ouvertureCalendrier.js');
const PAGE = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Sessions.jsx'), 'utf8');

// Le calendrier de production le 28/09/2026 (lecture seule) : S38 finie, les suivantes en octobre.
const AUJOURDHUI = '2026-09-28';
const S38_RS = { id: 's38-rs', program_code: 'RS7404', start_date: '2026-09-14', end_date: '2026-09-18', year: 2026, week: 38 };
const S38_H = { id: 's38-h', program_code: 'NIV1H', start_date: '2026-09-14', end_date: '2026-09-16', year: 2026, week: 38 };
const S42_RS = { id: 's42-rs', program_code: 'RS7404', start_date: '2026-10-12', end_date: '2026-10-16', year: 2026, week: 42 };
const S42_H = { id: 's42-h', program_code: 'NIV1H', start_date: '2026-10-12', end_date: '2026-10-14', year: 2026, week: 42 };
const S45 = { id: 's45', program_code: 'RS7404', start_date: '2026-11-02', end_date: '2026-11-06', year: 2026, week: 45 };
const SESSIONS = [S45, S42_H, S38_RS, S42_RS, S38_H]; // dans le désordre, comme une réponse quelconque
const fini = (session_id) => ({ session_id, percent: 100, total: 12, point_franchi: true });
const aFinir = (session_id, percent = 80) => ({ session_id, percent, total: 12, point_franchi: true });

test('LE CAS DU 28/09/2026 : la semaine écoulée est finie, le calendrier s\'ouvre sur octobre', async () => {
    const { ouvertureDuCalendrier } = await regle();
    const o = ouvertureDuCalendrier(SESSIONS, [fini('s38-rs'), fini('s38-rs'), fini('s38-h')], AUJOURDHUI);
    assert.strictEqual(o.raison, 'suivante');
    assert.strictEqual(o.date, '2026-10-12', 'la date de la PROCHAINE session, la première dans l\'ordre des dates');
    assert.ok(['s42-rs', 's42-h'].includes(o.session.id));
});

test('UN DOSSIER À FINIR dans la session précédente : le calendrier reste sur elle', async () => {
    const { ouvertureDuCalendrier } = await regle();
    const o = ouvertureDuCalendrier(SESSIONS, [fini('s38-rs'), aFinir('s38-h'), aFinir('s38-h', 50)], AUJOURDHUI);
    assert.deepStrictEqual([o.raison, o.date, o.session.id, o.aFinir], ['precedente', '2026-09-14', 's38-h', 2],
        'plusieurs formations finissent la même semaine : une seule retient le calendrier');
});

test('CE QUI NE RETIENT PAS : quelqu\'un qui n\'est jamais venu, un parcours vide, une session plus ancienne', async () => {
    const { ouvertureDuCalendrier } = await regle();
    // Jamais venu (point de rupture non franchi) : son dossier ne se complétera jamais — règle du tableau de bord.
    assert.strictEqual(ouvertureDuCalendrier(SESSIONS, [{ session_id: 's38-rs', percent: 20, total: 12, point_franchi: false }], AUJOURDHUI).raison, 'suivante');
    // Formation sans parcours : 0 % à jamais, rien à finir.
    assert.strictEqual(ouvertureDuCalendrier(SESSIONS, [{ session_id: 's38-rs', percent: 0, total: 0, point_franchi: true }], AUJOURDHUI).raison, 'suivante');
    // Une session plus ANCIENNE que la dernière terminée ne compte pas : « la session précédente », c'est la dernière.
    const S30 = { id: 's30', start_date: '2026-07-20', end_date: '2026-07-24', year: 2026, week: 30 };
    assert.strictEqual(ouvertureDuCalendrier([...SESSIONS, S30], [aFinir('s30')], AUJOURDHUI).raison, 'suivante');
    // Un drapeau absent (serveur d'avant) ne retient rien, comme sur le tableau de bord.
    assert.strictEqual(ouvertureDuCalendrier(SESSIONS, [{ session_id: 's38-rs', percent: 40, total: 12 }], AUJOURDHUI).raison, 'suivante');
});

test('UNE SESSION EN COURS, ou qui commence aujourd\'hui : on reste sur aujourd\'hui', async () => {
    const { ouvertureDuCalendrier } = await regle();
    const EN_COURS = { id: 'encours', start_date: '2026-09-24', end_date: '2026-09-30', year: 2026, week: 39 };
    assert.deepStrictEqual([ouvertureDuCalendrier([...SESSIONS, EN_COURS], [], AUJOURDHUI)].map((o) => [o.raison, o.date, o.session.id]),
        [['en-cours', AUJOURDHUI, 'encours']]);
    const AUJ = { id: 'auj', start_date: AUJOURDHUI, end_date: '2026-10-02', year: 2026, week: 40 };
    assert.strictEqual(ouvertureDuCalendrier([...SESSIONS, AUJ], [aFinir('s38-rs')], AUJOURDHUI).raison, 'en-cours',
        'elle passe avant la précédente : c\'est elle qu\'on travaille');
});

test('SANS SESSION À VENIR, ou sans aucune session : le mois du jour, comme avant', async () => {
    const { ouvertureDuCalendrier } = await regle();
    assert.deepStrictEqual(ouvertureDuCalendrier([S38_RS], [fini('s38-rs')], AUJOURDHUI), { date: AUJOURDHUI, raison: 'aujourdhui', session: null, aFinir: 0 });
    assert.strictEqual(ouvertureDuCalendrier([], [], AUJOURDHUI).raison, 'aujourdhui');
    assert.strictEqual(ouvertureDuCalendrier(null, null, AUJOURDHUI).raison, 'aujourdhui');
    // Une session sans semaine connue : la dernière terminée, seule.
    const SANS_SEMAINE = { id: 'x', start_date: '2026-09-21', end_date: '2026-09-22' };
    assert.strictEqual(ouvertureDuCalendrier([SANS_SEMAINE, S42_RS], [aFinir('x')], AUJOURDHUI).session.id, 'x');
});

test('LA RÈGLE « À FINIR » EST CELLE DU TABLEAU DE BORD, pas une copie', async () => {
    const { resteAFinir } = await import('../../app/ui/lib/dossiersASuivre.js');
    assert.strictEqual(resteAFinir(aFinir('s')), true);
    assert.strictEqual(resteAFinir(fini('s')), false);
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'dossiersASuivre.js'), 'utf8');
    assert.match(src, /const echu = \(x\) => !actives\.has\(x\.session_id\) && estPassee\(x\) && resteAFinir\(x\);/,
        'le tableau de bord lit la même règle');
    const cal = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'ouvertureCalendrier.js'), 'utf8');
    assert.match(cal, /import \{ resteAFinir \} from "\.\/dossiersASuivre\.js";/);
});

test('LA PAGE décide une fois, quand sessions ET dossiers sont là, et dit pourquoi', () => {
    assert.match(PAGE, /if \(ouverture \|\| !sessionsChargees \|\| !dossiersCharges\) return;/,
        'une seule fois : recharger après un ajout ne ramène pas l\'utilisateur en arrière');
    assert.match(PAGE, /const o = ouvertureDuCalendrier\(sessions, enrollments, ymd\(new Date\(\)\)\);/);
    assert.match(PAGE, /getEnrollments\(\)\.then\(\(r\) => \{ setEnrollments\(r\.data\); setDossiersCharges\(true\); \}\)\.catch\(\(\) => \{\}\);/,
        'sans les dossiers (refusés), on ne décide rien : le mois du jour');
    assert.match(PAGE, /Ouvert sur la prochaine session \(\{quoi\}\)/);
    assert.match(PAGE, /Ouvert sur la session précédente \(\{quoi\}\)/);
    // « Aujourd'hui » reste le chemin du retour.
    assert.match(PAGE, /onClick=\{\(\) => \{ setYear\(now\.getFullYear\(\)\); setMonth\(now\.getMonth\(\)\); \}\}/);
});
