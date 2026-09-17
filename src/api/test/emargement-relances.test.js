/**
 * « ÉMARGEMENT À SIGNER » — LE JOUR MÊME, À CHAQUE DEMI-JOURNÉE, et plus à l'affectation.
 *
 * Relevé en production le 2026-09-17 : l'alerte partait quand on AJOUTAIT un formateur à une
 * session — une pour NIV2 S43 (octobre), une pour RS7404 S45 (novembre) — et rien n'arrivait le
 * matin ni l'après-midi du 17/09, quand deux sessions S38 tournaient et que les feuilles de
 * l'après-midi attendaient la signature du formateur. L'école : « ce matin j'aurais dû avoir une
 * alerte, et cet après-midi aussi ».
 *
 * Le scénario ci-dessous rejoue une journée de cours sur une base simulée : avant le cours, le
 * matin, un second passage, l'après-midi, un jour sans après-midi, une session future.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { relancerEmargements, maintenantA, ouverture, lienEmargement, OUVERTURE_DEFAUT } = require('../lib/relancesEmargement.js');

const API = path.join(__dirname, '..');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* Heure de Paris → instant UTC (septembre : UTC+2). */
const aParis = (jour, hhmm) => new Date(`${jour}T${hhmm}:00+02:00`);

// Les horaires réels de RS7404 : le premier jour commence à 8h45, les suivants à 8h, le
// cinquième finit à 14h.
const HORAIRES = 'Jour 1 : 8h45-12h00 & 13h00 à 17h15\n8h00-12h00 & 13h00-16h30\nJour 5 : 8h00-12h00';
const JOURS = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

/** Une base simulée : les feuilles d'une session S38 et d'une session d'octobre. */
function base({ signees = [] } = {}) {
    const feuilles = [];
    for (const d of JOURS) for (const slot of ['MATIN', 'APRES_MIDI']) {
        feuilles.push({ id: `S38-${d}-${slot}`, session_id: 'S38', date: d, slot, organization_id: 'org', week: 38, program_code: 'RS7404', horaires: HORAIRES });
    }
    feuilles.push({ id: 'S43-MATIN', session_id: 'S43', date: '2026-10-19', slot: 'MATIN', organization_id: 'org', week: 43, program_code: 'NIV2', horaires: null });
    const formateurs = [
        { session_id: 'S38', user_id: 'moi' }, { session_id: 'S38', user_id: 'jj' }, { session_id: 'S43', user_id: 'moi' },
    ];
    const notifications = [];
    const requetes = [];
    const conn = {
        query: async (sql, params) => {
            requetes.push(sql);
            if (/information_schema\.columns/.test(sql)) return [[{ 1: 1 }]];
            if (/FROM attendance_sheet sh\s+JOIN training_session/.test(sql)) {
                return [feuilles.filter((f) => f.date === params[0]).map(({ date, ...f }) => f)];
            }
            if (/SELECT DISTINCT session_id/.test(sql)) {
                return [feuilles.filter((f) => params[0].includes(f.session_id)).map((f) => ({ session_id: f.session_id, date: f.date }))
                    .filter((x, i, t) => t.findIndex((y) => y.session_id === x.session_id && y.date === x.date) === i)];
            }
            if (/FROM session_trainer st/.test(sql)) return [formateurs.filter((f) => params[0].includes(f.session_id))];
            if (/FROM attendance_trainer_sign/.test(sql)) {
                return [signees.filter((s) => params[0].includes(s.sheet_id))];
            }
            if (/FROM notification WHERE/.test(sql)) {
                return [notifications.filter((n) => params[1].includes(n.userId) && params[2].includes(n.link))
                    .map((n) => ({ user_id: n.userId, link: n.link }))];
            }
            throw new Error(`requête inattendue : ${sql}`);
        },
    };
    const notify = async (orgId, n) => { notifications.push({ orgId, ...n }); };
    const diffusions = [];
    const publish = (orgId, evt) => diffusions.push([orgId, evt]);
    return { conn, notify, publish, notifications, requetes, diffusions };
}

test('l\'heure et le jour sont ceux de PARIS, pas ceux du serveur (UTC)', () => {
    assert.deepStrictEqual(maintenantA('Europe/Paris', new Date('2026-09-17T06:50:00Z')), { jour: '2026-09-17', minutes: 8 * 60 + 50 }, 'été : UTC+2');
    assert.deepStrictEqual(maintenantA('Europe/Paris', new Date('2026-12-17T07:50:00Z')), { jour: '2026-12-17', minutes: 8 * 60 + 50 }, 'hiver : UTC+1');
    assert.deepStrictEqual(maintenantA('Europe/Paris', new Date('2026-09-16T22:30:00Z')), { jour: '2026-09-17', minutes: 30 },
        'à 0h30 à Paris, le serveur est encore la veille');
});

test('le début d\'une demi-journée vient des horaires de la formation', () => {
    assert.strictEqual(ouverture('MATIN', { matin: [525, 720], aprem: [780, 1035] }), 525, '8h45');
    assert.strictEqual(ouverture('APRES_MIDI', { matin: [480, 720], aprem: null }), null, 'pas d\'après-midi ce jour-là : pas d\'alerte');
    assert.strictEqual(ouverture('MATIN', null), OUVERTURE_DEFAUT.MATIN, 'sans horaires lisibles : repli');
    assert.strictEqual(ouverture('APRES_MIDI', null), OUVERTURE_DEFAUT.APRES_MIDI);
});

test('une journée de cours : rien avant, le matin au début du cours, l\'après-midi au sien — une fois chacun', async () => {
    const b = base({ signees: [{ sheet_id: 'S38-2026-09-17-MATIN', user_id: 'jj' }] });
    const passer = (hhmm) => relancerEmargements({ conn: b.conn, notifier: b.notify, publier: b.publish, instant: aParis('2026-09-17', hhmm), zone: 'Europe/Paris' });

    assert.strictEqual(await passer('07:55'), 0, 'le cours commence à 8h le quatrième jour : rien avant');

    assert.strictEqual(await passer('08:02'), 1, 'le matin : UNE alerte');
    assert.deepStrictEqual(b.notifications.map((n) => n.userId), ['moi'], 'JJ a déjà signé le matin, lui');
    const matin = b.notifications[0];
    assert.strictEqual(matin.title, 'Émargement à signer');
    assert.strictEqual(matin.link, lienEmargement('S38', 'S38-2026-09-17-MATIN'), 'le lien mène à la feuille');
    assert.match(matin.body, /^Matin du jeudi 17\/09 · RS7404 S38\./);
    assert.strictEqual(matin.email, false, 'dans l\'application seulement : pas quatre e-mails par jour');
    assert.deepStrictEqual(b.diffusions, [['org', 'refresh']], 'les onglets ouverts le voient sans attendre');

    assert.strictEqual(await passer('10:30'), 0, 'un second passage ne répète pas l\'alerte');
    assert.strictEqual(b.diffusions.length, 1, 'et ne diffuse rien pour rien');

    assert.strictEqual(await passer('13:05'), 2, 'l\'après-midi : une alerte pour chaque formateur');
    assert.deepStrictEqual(b.notifications.slice(1).map((n) => n.userId).sort(), ['jj', 'moi']);
    assert.match(b.notifications[1].body, /^Après-midi du jeudi 17\/09/);
    assert.strictEqual(await passer('16:00'), 0);
});

test('jamais pour une session FUTURE — la seule chose à signer est la journée en cours', async () => {
    const b = base();
    await relancerEmargements({ conn: b.conn, notifier: b.notify, instant: aParis('2026-09-17', '15:00'), zone: 'Europe/Paris' });
    assert.ok(b.notifications.length > 0);
    assert.ok(b.notifications.every((n) => n.link.startsWith('/sessions/S38?')), 'aucune alerte pour la session d\'octobre');
    // Et c'est la BASE qui filtre sur le jour, pas une boucle sur toutes les feuilles de l'année.
    assert.match(b.requetes.find((q) => /FROM attendance_sheet sh/.test(q)), /WHERE sh\.date = \? AND sh\.slot IN \('MATIN', 'APRES_MIDI'\)/);
});

test('un jour sans après-midi dans les horaires n\'a pas d\'alerte d\'après-midi', async () => {
    const b = base();
    const n = await relancerEmargements({ conn: b.conn, notifier: b.notify, instant: aParis('2026-09-18', '15:00'), zone: 'Europe/Paris' });
    assert.strictEqual(n, 2, 'le matin du cinquième jour, pour les deux formateurs');
    assert.ok(b.notifications.every((x) => x.link.endsWith('-MATIN')));
});

test('le premier jour suit SA ligne d\'horaires : 8h45, pas 8h', async () => {
    const b = base();
    assert.strictEqual(await relancerEmargements({ conn: b.conn, notifier: b.notify, instant: aParis('2026-09-14', '08:30'), zone: 'Europe/Paris' }), 0);
    assert.strictEqual(await relancerEmargements({ conn: b.conn, notifier: b.notify, instant: aParis('2026-09-14', '08:46'), zone: 'Europe/Paris' }), 2);
});

test('l\'affectation d\'un formateur ne crée plus d\'alerte', () => {
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/session.controller.js'), 'utf8'));
    const fn = src.slice(src.indexOf('const setSessionTrainers'), src.indexOf('module.exports'));
    assert.doesNotMatch(fn, /notify\(|Émargement à signer/, 'une alerte « signez » pour une session d\'octobre n\'a pas de sens');
});

test('signer éteint l\'alerte de sa demi-journée, AVANT de répondre', () => {
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/attendance.controller.js'), 'utf8'));
    const fn = src.slice(src.indexOf('const signSheet'), src.indexOf('const regenerateEmargement'));
    const extinction = fn.indexOf("UPDATE notification SET is_read = 1 WHERE organization_id = ? AND user_id = ? AND link = ?");
    assert.ok(extinction > -1, 'l\'alerte est marquée lue');
    assert.match(fn, /lienEmargement\(sheet\.session_id, req\.params\.id\)/, 'retrouvée par la MÊME clé que sa création');
    assert.ok(extinction < fn.indexOf('res.json('), 'avant la réponse : les postes rechargent en la lisant déjà lue');
});

test('le serveur passe toutes les cinq minutes, et seulement une fois lancé', () => {
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'server.js'), 'utf8'));
    const ecoute = src.slice(src.indexOf('app.listen('));
    assert.match(ecoute, /relancerEmargements\(\{ conn: require\('\.\/config\/database\.js'\)\.promise\(\), notifier: notify, publier: publish \}\)/);
    assert.match(ecoute, /setInterval\(relancer, 5 \* 60 \* 1000\)/);
    assert.doesNotMatch(src.slice(0, src.indexOf('app.listen(')), /relancerEmargements/, 'rien à l\'import : les tests ne lancent rien');
});

test('`notify` sait se passer du double par e-mail', () => {
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/notification.controller.js'), 'utf8'));
    assert.match(src, /function notify\(orgId, \{ userId = null, type = 'INFO', title, body = null, link = null, email = true \}\)/,
        'par défaut, rien ne change pour les autres notifications');
    assert.match(src, /if \(userId && email\) emailNotification\(/);
});
