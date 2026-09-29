/**
 * LES APPORTS DES PARTENAIRES REMONTENT EN COMPTABILITÉ — relevé par l'école le 2026-09-29 :
 * « dans Partenaires, j'ai saisi des apports, ils n'apparaissent pas dans Comptabilité ».
 *
 * DEUX CAUSES, silencieuses l'une comme l'autre :
 *  · UN APPORT EN NATURE (matériel, équipement, consommable) s'écrit dans `partner_contribution`,
 *    que la Comptabilité ne lisait JAMAIS. Le formulaire disait « suivi seul » : suivi nulle part
 *    ailleurs que sur la fiche du partenaire.
 *  · UN APPORT DATÉ D'UN AUTRE MOIS n'y paraît qu'à ce mois-là, et la page s'ouvre sur le mois
 *    courant. La liste disait « aucun produit divers » — vrai du mois, faux de l'année — sans dire
 *    où chercher. Et une année sans session n'était même pas dans le sélecteur.
 *
 * CE QUI NE CHANGE PAS, et que ces tests gardent autant que le reste : un apport en nature n'entre
 * NI dans le chiffre d'affaires NI dans le résultat. Rien n'a été encaissé ; compté, il gonflerait
 * les dividendes « possibles » d'un pétrin.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ORG = '11111111-1111-4111-8111-111111111111';
const PARTENAIRE = '22222222-2222-4222-8222-222222222222';
const ETRANGER = '33333333-3333-4333-8333-333333333333';

// ── Fausse base : une réponse par motif de requête, requêtes capturées ─────────────────────────
const plat = (sql) => String(sql).replace(/\s+/g, ' ').trim();
let reponses = [];
let requetes = [];
const sansTable = () => Object.assign(new Error("Table 'partner_contribution' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
const repondre = (sql, params) => {
    const q = plat(sql);
    requetes.push({ q, params });
    const r = reponses.find(([motif]) => motif.test(q));
    if (!r) return [[]];
    return typeof r[1] === 'function' ? r[1](q, params) : r[1];
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({ query: async (sql, params) => repondre(sql, params) }),
    // logAudit écrit en mode rappel.
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
} };

const compta = require('../controllers/comptabilite.controller.js');
const partenaires = require('../controllers/partner.controller.js');

const reponse = () => {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
};

/* Septembre 2026 : 1 000 € d'inscriptions, 200 € de matériel, 300 € de produits divers, 100 € de
   loyer — et deux apports en nature valant 2 500 €, qui ne doivent rien changer à ces chiffres. */
function baseDeSeptembre({ tableNature = true } = {}) {
    const nature = (fn) => (tableNature ? fn : () => { throw sansTable(); });
    return [
        [/UNION SELECT/, [[{ year: 2026 }, { year: 2024 }]]],
        [/SELECT DISTINCT YEAR\(date\) AS year FROM partner_contribution/, nature(() => [[{ year: 2023 }]])],
        [/MONTH\(date\) AS mois, COUNT\(\*\) AS nb FROM partner_contribution/, nature(() => [[{ mois: 8, nb: 1 }]])],
        [/MONTH\(date\) AS mois, COUNT\(\*\) AS nb FROM revenue_extra/, [[{ mois: 7, nb: 2 }, { mois: 8, nb: 1 }]]],
        [/MONTH\(date\) AS mois, COUNT\(\*\) AS nb FROM expense/, [[]]],
        [/FROM partner_contribution c/, nature(() => [[
            { id: 'pc1', date: '2026-09-12', type: 'MATERIEL', label: 'Pétrin 20 L', value: '2000.00', partner_name: 'Moulins Bourgeois' },
            { id: 'pc2', date: '2026-09-03', type: 'CONSOMMABLE', label: 'Farine T65, 50 kg', value: '500.00', partner_name: 'Moulins Bourgeois' },
        ]])],
        [/SUM\(e\.price\)/, [[{ ca: '1000.00', nb: 2, nb_stagiaires: 2 }]]],
        [/SUM\(amount \* quantity\)/, [[{ ca: '200.00' }]]],
        [/COALESCE\(SUM\(amount\), 0\) AS ca FROM revenue_extra/, [[{ ca: '300.00' }]]],
        [/COUNT\(\*\) AS nb FROM training_session/, [[{ nb: 1 }]]],
        [/GROUP BY category/, [[{ category: 'LOYER', total: '100.00' }]]],
        [/accounting_settings/, [[]]],
        [/SELECT DISTINCT year FROM training_session/, [[{ year: 2026 }, { year: 2025 }]]],
        [/FROM expense WHERE organization_id/, [[{ id: 'e1', date: '2026-09-01', label: 'Loyer', category: 'LOYER', amount_ht: '100.00' }]]],
        [/FROM revenue_extra WHERE organization_id/, [[{ id: 'r1', date: '2026-09-10', label: 'Commission', category: 'COMMISSION', amount: '300.00', partner_name: 'Moulins Bourgeois' }]]],
    ];
}

async function gestion(query) {
    const res = reponse();
    await compta.getGestion({ user: { organization_id: ORG }, query }, res);
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    return res.corps.data;
}

test('LES APPORTS EN NATURE DU MOIS sont listés, avec leur valeur et leur partenaire', async () => {
    reponses = baseDeSeptembre(); requetes = [];
    const d = await gestion({ annee: '2026', mois: '9' });
    assert.deepStrictEqual(d.enNature.map((c) => c.label), ['Pétrin 20 L', 'Farine T65, 50 kg']);
    assert.strictEqual(d.enNature[0].value, 2000, 'la valeur arrive en nombre, pas en chaîne décimale');
    assert.strictEqual(d.enNature[0].partner_name, 'Moulins Bourgeois');
    assert.strictEqual(d.totalEnNature, 2500);

    // La même période que tout le reste : le mois ET l'année.
    const lecture = requetes.find((r) => /FROM partner_contribution c/.test(r.q));
    assert.deepStrictEqual(lecture.params, [ORG, 2026, 9]);
    assert.match(lecture.q, /MONTH\(c\.date\) = \?/);
    /* Le nom du partenaire se joint DANS l'organisme : une ligne écrite avant le contrôle de
       `createContribution` pourrait désigner le partenaire d'un autre, et l'afficher ici. */
    assert.match(lecture.q, /LEFT JOIN partner p ON p\.id = c\.partner_id AND p\.organization_id = c\.organization_id/);
});

test('ILS N\'ENTRENT NI DANS LE CHIFFRE D\'AFFAIRES NI DANS LE RÉSULTAT', async () => {
    reponses = baseDeSeptembre(); requetes = [];
    const d = await gestion({ annee: '2026', mois: '9' });
    assert.strictEqual(d.ca.total, 1500, '1 000 + 200 + 300 : les 2 500 € en nature n\'y sont pas');
    assert.strictEqual(d.ca.extra, 300, 'les produits divers restent les seules sommes encaissées');
    assert.strictEqual(d.marge, 1400);
    assert.strictEqual(d.dividendePossible, 1400, 'un pétrin ne se distribue pas');
    // Et le calcul de la période ne les lit même pas : c'est là que la règle tient.
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'comptabilite.controller.js'), 'utf8');
    const periode = src.slice(src.indexOf('async function computePeriode'), src.indexOf('async function loadSettings'));
    assert.doesNotMatch(periode, /partner_contribution/);
});

test('LE MOIS AFFICHÉ DIT CE QU\'IL CACHE : les autres mois qui ont des lignes, par liste', async () => {
    reponses = baseDeSeptembre(); requetes = [];
    const d = await gestion({ annee: '2026', mois: '9' });
    assert.deepStrictEqual(d.autresMois.revenus, [{ mois: 7, nb: 2 }, { mois: 8, nb: 1 }]);
    assert.deepStrictEqual(d.autresMois.enNature, [{ mois: 8, nb: 1 }]);
    assert.deepStrictEqual(d.autresMois.depenses, []);
    const autres = requetes.filter((r) => /MONTH\(date\) <> \?/.test(r.q));
    assert.strictEqual(autres.length, 3, 'dépenses, produits divers, apports en nature');
    for (const r of autres) assert.deepStrictEqual(r.params, [ORG, 2026, 9]);

    // Sur l'année entière, rien n'est caché : aucune requête, trois listes vides.
    requetes = [];
    const annee = await gestion({ annee: '2026', mois: '0' });
    assert.deepStrictEqual(annee.autresMois, { depenses: [], revenus: [], enNature: [] });
    assert.ok(!requetes.some((r) => /MONTH\(date\) <> \?/.test(r.q)));
    const lecture = requetes.find((r) => /FROM partner_contribution c/.test(r.q));
    assert.deepStrictEqual(lecture.params, [ORG, 2026], 'l\'année entière ne filtre pas le mois');
});

test('UNE ANNÉE SANS SESSION se choisit quand même si l\'on y a saisi quelque chose', async () => {
    reponses = baseDeSeptembre(); requetes = [];
    const d = await gestion({ annee: '2026', mois: '9' });
    // 2025 vient des sessions ; 2024 d'une saisie datée ; 2023 d'un apport en nature.
    assert.deepStrictEqual(d.annees, [2026, 2025, 2024, 2023]);
});

test('SANS LA TABLE DES APPORTS EN NATURE (migration 065), la page s\'affiche comme avant', async () => {
    reponses = baseDeSeptembre({ tableNature: false }); requetes = [];
    const d = await gestion({ annee: '2026', mois: '9' });
    assert.deepStrictEqual(d.enNature, []);
    assert.strictEqual(d.totalEnNature, 0);
    assert.deepStrictEqual(d.autresMois.enNature, []);
    assert.deepStrictEqual(d.autresMois.revenus, [{ mois: 7, nb: 2 }, { mois: 8, nb: 1 }], 'les autres listes restent servies');
    assert.deepStrictEqual(d.annees, [2026, 2025, 2024]);
    assert.strictEqual(d.ca.total, 1500);
});

test('UN APPORT EN NATURE NE SE RATTACHE QU\'À UN PARTENAIRE DE L\'ORGANISME', async () => {
    const creer = async (partner_id) => {
        const res = reponse();
        await partenaires.createContribution({
            user: { organization_id: ORG, id: 'u1' },
            body: { partner_id, type: 'MATERIEL', label: 'Pétrin 20 L', value: '2000', date: '2026-09-12' },
        }, res);
        return res;
    };
    reponses = [
        [/FROM partner WHERE id = \? AND organization_id = \?/, (q, params) => [params[0] === PARTENAIRE && params[1] === ORG ? [{ ok: 1 }] : []]],
        [/INSERT INTO partner_contribution/, [{ affectedRows: 1 }]],
    ];

    requetes = [];
    const refus = await creer(ETRANGER);
    assert.strictEqual(refus.code, 422);
    assert.ok(!requetes.some((r) => /INSERT INTO partner_contribution/.test(r.q)), 'rien ne doit être écrit');

    requetes = [];
    const ok = await creer(PARTENAIRE);
    assert.strictEqual(ok.code, 201);
    const insert = requetes.find((r) => /INSERT INTO partner_contribution/.test(r.q));
    assert.deepStrictEqual(insert.params.slice(0, 3).map((v, i) => (i === 0 ? typeof v : v)), ['string', ORG, PARTENAIRE]);
});

test('L\'ÉCRAN : la liste à part, les mois où chercher, et des montants de titre sous le masque', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Comptabilite.jsx'), 'utf8');
    assert.match(page, /data\.enNature\.map\(/, 'les apports en nature sont listés');
    assert.match(page, /Apports en nature \{periode\}/);
    assert.match(page, /<Ailleurs liste=\{data\.autresMois\?\.revenus\}/);
    assert.match(page, /<Ailleurs liste=\{data\.autresMois\?\.enNature\}/);
    assert.match(page, /onClick=\{\(\) => onMois\(0\)\}/, 'l\'année entière est à un clic');
    /* Le total d'une carte s'écrivait EN TEXTE dans son titre : seul montant de la page à rester
       lisible sous le masque (`.money-mask .tnum`). */
    assert.doesNotMatch(page, /`Produits divers \$\{periode\} · \$\{euro/);
    assert.match(page, /Produits divers \{periode\} · <span className="tnum"/);
    assert.match(page, /Apports en nature \{periode\} · <span className="tnum"/);
});

test('LE FORMULAIRE DIT OÙ L\'APPORT PARAÎT : au mois de SA date, lue sans fuseau', async () => {
    const { moisDeLApport } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'apports.js')).href);
    assert.strictEqual(moisDeLApport('2026-07-01'), 'juillet 2026', 'le 1er du mois reste dans son mois');
    assert.strictEqual(moisDeLApport('2026-12-31'), 'décembre 2026');
    assert.strictEqual(moisDeLApport(''), '');
    assert.strictEqual(moisDeLApport('2026-13-01'), '');
    const form = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'components', 'PartnerContributions.jsx'), 'utf8');
    assert.match(form, /moisDeLApport\(form\.date \|\| today\(\)\)/);
    assert.doesNotMatch(form, /Suivi seul/, '« suivi seul » ne disait pas où');
});
