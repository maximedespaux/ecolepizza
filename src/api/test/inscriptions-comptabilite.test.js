/**
 * LES STAGIAIRES VENUS DANS LE MOIS COMPTENT EN « INSCRIPTIONS » — relevé par l'école le 2026-09-29 :
 * « les stagiaires venus ce mois-ci comptent 0 € en Inscriptions ».
 *
 * DEUX DÉFAUTS S'ADDITIONNAIENT :
 *   · la somme portait sur `enrollment.price`, que l'application n'écrit JAMAIS — ni l'inscription,
 *     ni l'inscription par une entreprise, ni aucun écran. Tout dossier créé ici valait 0 €, quand
 *     le devis et la convention retombent, eux, sur le tarif de la formation ;
 *   · le mois était celui de la SAISIE du dossier, pas celui où le stagiaire vient.
 *
 * LA RÈGLE DÉCIDÉE PAR L'ÉCOLE LE MÊME JOUR : un stagiaire compte le mois où commence sa session
 * (session annulée exclue), dès qu'une FACTURE ou un ACOMPTE ÉMIS le désigne — c'est en le choisissant
 * sur une facture que l'école dit qu'il est vendu —, au prix de son dossier, sinon au tarif de la
 * formation. Ceux qui n'ont pas encore de facture sont rendus à part, et nommés à l'écran.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ORG = '11111111-1111-4111-8111-111111111111';

// ── Fausse base ──────────────────────────────────────────────────────────────────────────────────
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();
let dossiers = [];
let requetes = [];
const reponses = [
    [/FROM enrollment e JOIN training_session s/, () => [dossiers]],
    [/SUM\(amount \* quantity\)/, [[{ ca: '0.00' }]]],
    [/COALESCE\(SUM\(amount\), 0\) AS ca FROM revenue_extra/, [[{ ca: '0.00' }]]],
    [/COUNT\(\*\) AS nb FROM training_session/, [[{ nb: 2 }]]],
];
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: async (sql, params) => {
        const q = plat(sql);
        requetes.push({ q, params });
        const r = reponses.find(([motif]) => motif.test(q));
        return r ? (typeof r[1] === 'function' ? r[1](q, params) : r[1]) : [[]];
    } }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };
const compta = require('../controllers/comptabilite.controller.js');

async function appeler(fn, query) {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    requetes = [];
    await fn({ user: { organization_id: ORG }, query }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    return res.corps.data;
}

/* Septembre 2026, session RS7404 du 14/09 : trois stagiaires. */
const SEPTEMBRE = [
    // Facturé, sans prix de dossier : le tarif de la formation.
    { id: 'e1', learner_id: 'l1', last_name: 'DUPONT', first_name: 'Jean', program_code: 'RS7404', debut: '2026-09-14',
        prix_dossier: null, tarif: '1500.00', factures: 'F-2026-012' },
    // Facturé par un acompte, avec un prix de dossier : c'est lui qui compte.
    { id: 'e2', learner_id: 'l2', last_name: 'MARTIN', first_name: 'Léa', program_code: 'RS7404', debut: '2026-09-14',
        prix_dossier: '1200.00', tarif: '1500.00', factures: 'A-2026-003' },
    // Venu, pas encore facturé : nommé, pas compté. Un prix de dossier à 0 retombe sur le tarif,
    // comme dans les documents (`enroll_price || price`).
    { id: 'e3', learner_id: 'l3', last_name: 'PETIT', first_name: 'Paul', program_code: 'RS7404', debut: '2026-09-14',
        prix_dossier: '0.00', tarif: '1500.00', factures: null },
];

test('UN STAGIAIRE FACTURÉ COMPTE : au prix de son dossier, sinon au tarif de la formation', async () => {
    dossiers = SEPTEMBRE;
    const d = await appeler(compta.getGestion, { annee: '2026', mois: '9' });
    assert.strictEqual(d.ca.inscriptions, 2700, '1 500 (tarif) + 1 200 (prix du dossier) : le 0 € de septembre');
    assert.deepStrictEqual(d.inscriptions.map((x) => [x.nom, x.montant, x.source, x.factures]),
        [['DUPONT', 1500, 'formation', 'F-2026-012'], ['MARTIN', 1200, 'dossier', 'A-2026-003']]);
    // Le troisième est nommé, avec ce qu'il comptera, et ne compte pas.
    assert.deepStrictEqual(d.aFacturer.map((x) => [x.nom, x.montant, x.facturee]), [['PETIT', 1500, false]]);
    assert.strictEqual(d.ca.total, 2700);
});

test('LA REQUÊTE : le mois où commence la session, les sessions annulées dehors, les factures ÉMISES seules', async () => {
    dossiers = SEPTEMBRE;
    await appeler(compta.getGestion, { annee: '2026', mois: '9' });
    const lecture = requetes.find((r) => /FROM enrollment e JOIN training_session s/.test(r.q));
    assert.deepStrictEqual(lecture.params, [ORG, 2026, 9]);
    assert.match(lecture.q, /s\.status <> 'ANNULEE'/);
    assert.match(lecture.q, /YEAR\(COALESCE\(s\.start_date, .*\)\) = \? AND MONTH\(COALESCE\(s\.start_date, /,
        'l\'année et le mois se lisent sur le premier jour de la session');
    assert.doesNotMatch(lecture.q, /created_at/, 'la date de saisie du dossier ne date plus rien');
    /* Ce qui fait compter : une facture ou un acompte ÉMIS de l'organisme, qui désigne le dossier
       sur la facture même ou sur une de ses lignes. Un brouillon, un devis, une facture annulée,
       non. */
    assert.match(lecture.q, /i\.organization_id = e\.organization_id/);
    assert.match(lecture.q, /i\.type IN \('FACTURE', 'ACOMPTE'\) AND i\.status IN \('EMISE', 'PAYEE', 'IMPAYEE'\)/);
    assert.match(lecture.q, /i\.enrollment_id = e\.id OR i\.id IN \(SELECT il\.invoice_id FROM invoice_line il WHERE il\.enrollment_id = e\.id\)/);
});

test('L\'ANNÉE ENTIÈRE : même règle, sans filtre de mois — les douze mois somment en l\'année', async () => {
    dossiers = SEPTEMBRE;
    await appeler(compta.getGestion, { annee: '2026', mois: '0' });
    const lecture = requetes.find((r) => /FROM enrollment e JOIN training_session s/.test(r.q));
    assert.deepStrictEqual(lecture.params, [ORG, 2026]);
    assert.doesNotMatch(lecture.q, /MONTH\(/);
});

test('UNE SESSION SANS DATE DE DÉBUT se date au lundi de sa semaine ISO', () => {
    /* La formule SQL, recopiée ici pour être éprouvée : la semaine 1 est celle du 4 janvier, et son
       lundi est le 4 janvier moins son rang dans la semaine (WEEKDAY : 0 = lundi). */
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'inscriptionsFacturees.js'), 'utf8');
    assert.match(src, /const DATE_SESSION = 'COALESCE\(s\.start_date, DATE_ADD\(MAKEDATE\(s\.year, 4\), INTERVAL \(\(s\.week - 1\) \* 7 - WEEKDAY\(MAKEDATE\(s\.year, 4\)\)\) DAY\)\)';/);
    const lundi = (annee, semaine) => {
        const quatre = new Date(Date.UTC(annee, 0, 4));
        const rang = (quatre.getUTCDay() + 6) % 7; // WEEKDAY de MariaDB
        return new Date(quatre.getTime() + ((semaine - 1) * 7 - rang) * 86400000).toISOString().slice(0, 10);
    };
    assert.strictEqual(lundi(2026, 38), '2026-09-14', 'les sessions du 14/09');
    assert.strictEqual(lundi(2026, 1), '2025-12-29', 'la semaine 1 peut commencer l\'année d\'avant');
    assert.strictEqual(lundi(2021, 1), '2021-01-04');
    assert.strictEqual(lundi(2020, 53), '2020-12-28');
});

test('L\'ONGLET PERFORMANCE compte pareil, mais ne reçoit AUCUN nom de stagiaire', async () => {
    dossiers = SEPTEMBRE;
    const d = await appeler(compta.getPerformance, { annee: '2026' });
    assert.strictEqual(d.current.caInscriptions, 2700);
    assert.strictEqual(d.current.nbInscriptions, 2, 'deux stagiaires facturés');
    assert.strictEqual(d.current.ticketMoyen, 1350);
    assert.ok(!('inscriptions' in d.current) && !('inscriptions' in d.previous), 'la liste porte des noms : elle reste au serveur');
    assert.ok(!JSON.stringify(d).includes('DUPONT'));
});

test('L\'ÉCRAN nomme les comptés et ceux qui attendent leur facture', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Comptabilite.jsx'), 'utf8');
    assert.match(page, /data\.inscriptions\.map\(/);
    assert.match(page, /data\.aFacturer\.map\(/);
    assert.match(page, /Inscriptions \{periode\} · <span className="tnum"/, 'le total du titre passe sous le masque des montants');
    assert.doesNotMatch(page, /Somme des prix des inscriptions \(tarif de la formation\)/, 'l\'ancienne explication ne décrivait pas le calcul');
    // Et la règle du prix est celle des documents.
    const tokens = fs.readFileSync(path.join(__dirname, '..', 'lib', 'tokens.js'), 'utf8');
    assert.match(tokens, /x\.enroll_price \|\| x\.price/);
});
