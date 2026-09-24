/**
 * RÉSULTATS QCM : UNE VUE GLOBALE, ET L'HISTORIQUE D'UN QCM SEMAINE PAR SEMAINE (demandé le 2026-09-24).
 *
 * LE BESOIN. La page s'ouvre sur la semaine en cours ; voir un QCM « en global » obligeait à trouver
 * « Toutes les semaines » au fond du menu des semaines, et comparer deux promotions à passer d'une semaine
 * à l'autre. D'où un interrupteur visible « Par semaine / Globale » (retenu d'une visite à l'autre) et, en
 * vue globale, un onglet « Par semaine » dans le détail d'un QCM : toutes ses semaines côte à côte.
 *
 * CE QUI DOIT RESTER VRAI. Une ligne « S38 · 2026 » de cet onglet doit redonner EXACTEMENT ce qu'affiche la
 * semaine S38 quand on la choisit. Deux choses peuvent le casser, et ce fichier les gèle :
 *   · la SEMAINE : le filtre range une réponse dans la semaine de la SESSION de son dossier (clauseFiltre),
 *     pas à la date où elle a été remplie — un regroupement par date donnerait d'autres nombres ;
 *   · le CALCUL : le score moyen et la réussite s'écrivent une seule fois (SCORE_ET_REUSSITE), lus par le
 *     total ET par chaque semaine.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Base simulée : chaque requête est notée ; on ne répond qu'à celles que le détail pose.
const requetes = [];
const QUIZ = { id: 'q-mardi', title: 'Évaluation Formative du Mardi', kind: 'GRADED', pass_score: 60 };
const SEMAINES = [
    { annee: 2026, semaine: 38, formations: 'NIV1H', responses: 3, avg_pct: 72, pass_rate: 67 },
    { annee: null, semaine: null, formations: null, responses: 1, avg_pct: 5, pass_rate: 0 },
];
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            requetes.push({ q, params });
            if (/FROM quiz WHERE id = \?/.test(q)) return [[QUIZ]];
            if (/GROUP BY s\.year, s\.week/.test(q)) return [SEMAINES];
            if (/^SELECT COUNT\(\*\) AS responses/.test(q)) return [[{ responses: 4, avg_pct: 55, pass_rate: 50 }]];
            if (/information_schema/i.test(q)) return [[{ present: 1 }]];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
} };
const { resultatsDetail } = require('../controllers/quiz.controller.js');

const detail = async (query) => {
    requetes.length = 0;
    const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await resultatsDetail({ params: { id: QUIZ.id }, query, user: { organization_id: 'o1', id: 'u1' } }, res);
    return res;
};
const parSemaine = () => requetes.find((x) => /GROUP BY s\.year, s\.week/.test(x.q));
const total = () => requetes.find((x) => /^SELECT COUNT\(\*\) AS responses/.test(x.q));

/* ─── Le serveur ──────────────────────────────────────────────────────────────────────────── */

test('en vue globale, le détail rend l\'historique du QCM, semaine par semaine', async () => {
    const res = await detail({});
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.body.data.par_semaine, SEMAINES);
    assert.deepStrictEqual(parSemaine().params.slice(0, 3), [60, 60, 'q-mardi'], 'mêmes paramètres que le total');
});

test('la semaine est celle de la SESSION du dossier, comme le filtre — pas la date de réponse', async () => {
    await detail({});
    const q = parSemaine().q;
    assert.match(q, /LEFT JOIN enrollment e ON e\.id = r\.enrollment_id/);
    assert.match(q, /LEFT JOIN training_session s ON s\.id = e\.session_id/);
    assert.doesNotMatch(q, /GROUP BY[^)]*completed_at/, 'une réponse se range dans la semaine de sa session');
    assert.match(q, /ORDER BY s\.year IS NULL/, 'les réponses sans session viennent en dernier, et comptent');
});

test('chaque semaine se calcule EXACTEMENT comme le total', async () => {
    await detail({});
    const formule = (q) => q.slice(q.indexOf('ROUND(AVG('), q.indexOf(' AS pass_rate') + ' AS pass_rate'.length);
    assert.ok(formule(total().q).length > 60, 'formule du total introuvable');
    assert.strictEqual(formule(parSemaine().q), formule(total().q));
});

test('une semaine choisie : rien de plus à calculer', async () => {
    const res = await detail({ semaine: '2026-38' });
    assert.strictEqual(res.body.data.par_semaine, null);
    assert.strictEqual(parSemaine(), undefined, 'aucune requête par semaine hors de la vue globale');
});

/* ─── L'écran ─────────────────────────────────────────────────────────────────────────────── */

const ui = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'ResultatsQCM.jsx'), 'utf8');

test('l\'interrupteur EST « toutes les semaines » : un seul état, jamais deux qui se contredisent', () => {
    assert.match(ui, /const globale = semaine === "";/);
    assert.match(ui, />Par semaine<\/button>/);
    assert.match(ui, />Globale<\/button>/);
    assert.match(ui, /toutes="Toutes les semaines"/, 'le « toutes » du sélecteur reste exprimable');
});

test('la vue choisie est retenue, sans jamais casser la page si le stockage manque', () => {
    assert.match(ui, /const vueMemorisee = \(\) => \{ try \{ return localStorage\.getItem\(CLE_VUE\); \} catch/);
    assert.match(ui, /const memoriserVue = \(v\) => \{ try \{ localStorage\.setItem\(CLE_VUE, v\); \} catch/);
    assert.match(ui, /setSemaine\(vueMemorisee\(\) === "globale" \? "" : parDefaut\);/, 'rouverte telle qu\'on l\'a laissée');
});

test('l\'onglet « Par semaine » n\'existe qu\'en vue globale, et mène à la semaine par la clé du sélecteur', () => {
    assert.match(ui, /\{globale && detail\.par_semaine && \(/);
    assert.match(ui, /const vueEffective = !globale && vue === "semaines" \? "questions" : vue;/);
    // Même clé que lib/sessions.js : « 2026-38 ».
    const sessions = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'sessions.js'), 'utf8');
    assert.match(sessions, /`\$\{s\.annee\}-\$\{String\(s\.semaine\)\.padStart\(2, "0"\)\}`/);
    assert.match(ui, /`\$\{l\.annee\}-\$\{String\(l\.semaine\)\.padStart\(2, "0"\)\}`/, 'cliquer une semaine ouvre CETTE semaine');
    assert.match(ui, /<SemainesTable lignes=\{detail\.par_semaine \|\| \[\]\} quiz=\{detail\.quiz\} onOuvrir=\{choisirSemaine\} \/>/);
});
