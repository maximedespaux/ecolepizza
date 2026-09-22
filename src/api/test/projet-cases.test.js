/**
 * « VOTRE PROJET » : QUINZE CASES DE PLUS (demandé le 2026-09-22, migration 173).
 *
 * Proposées puis retenues toutes : le TYPE D'ACTIVITÉ (pizzeria sur place, à emporter / livraison,
 * pizza à la part, distributeur automatique, traiteur / événementiel, en complément d'un commerce),
 * l'ÉQUIPEMENT au-delà du four et du camion (pétrin, laminoir / façonneuse, saladette / vitrine
 * réfrigérée, et le four déjà acheté), l'AVANCEMENT (local trouvé, financement obtenu, ouverture
 * sous six mois, accompagnement souhaité) et l'intérêt pour une formation complémentaire.
 *
 * UNE CASE DOIT ÊTRE CONNUE PARTOUT où le projet est lu ou écrit : en oublier un endroit ne casse
 * rien de visible — la case se coche, ne s'enregistre pas, ne sert pas de condition, et on ne s'en
 * aperçoit que le jour où on la cherche (cf. projet-perfectionnement.test.js). Chaque côté a
 * désormais son catalogue — l'écran (src/app/ui/lib/projet.js), le serveur (src/api/lib/projet.js) —
 * et ce test les confronte l'un à l'autre, puis au reste : l'écriture, les conditions, la migration.
 *
 * CE QUI PART AUX PARTENAIRES, ET CE QUI N'Y PART PAS. Le stagiaire consent à transmettre « la
 * nature de mon projet ». Le type d'activité et l'équipement en sont ; l'avancement et la formation
 * complémentaire n'en sont pas — des signaux commerciaux qu'on ne lui a pas annoncés : ils restent à
 * l'école.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base (même montage que stagiaire-a-recontacter) ─────────────────────────────────
let requetes = [];
let colonnes = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            if (/information_schema\.columns[\s\S]*column_name = \?/.test(sql)) return [colonnes.includes(params[1]) ? [{ 1: 1 }] : []];
            if (/information_schema\.columns/.test(sql)) return [colonnes.map((c) => ({ c }))];
            if (/SELECT company_id, financing, user_id, email FROM learner/.test(sql)) return [[{ company_id: null, financing: 'PARTICULIER', user_id: null, email: 'marie@exemple.fr' }]];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const vraiMailer = require('../lib/mailer.js');
const cheminMailer = require.resolve('../lib/mailer.js');
require.cache[cheminMailer] = {
    id: cheminMailer, filename: cheminMailer, loaded: true,
    exports: { ...vraiMailer, sendMail: async () => ({ sent: false }), envoiPossible: () => false },
};

const { updateLearner, normaliserSaisie } = require('../controllers/learner.controller.js');
const serveur = require('../lib/projet.js');
const { CHAMPS_TRANSMISSIBLES } = require('../lib/consentements.js');
const ecran = () => import('../../app/ui/lib/projet.js');

const lire = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const lireRacine = (p) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const projets = (t) => new Set([...sansCommentaires(t).matchAll(/project_[a-z_]+/g)].map((m) => m[0]));
const bloc = (t, re) => { const m = t.match(re); assert.ok(m, `bloc introuvable : ${re}`); return m[0]; };

async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'u0', role: 'SUPER_ADMIN' }, params: { id: 'l1' }, query: {}, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const FICHE = { first_name: 'Marie', last_name: 'DUPONT', email: 'marie@exemple.fr', phone: '0612345678', financing: 'PARTICULIER' };
const maj = () => requetes.find((q) => /^\s*UPDATE learner SET/.test(q.sql));

test('chaque case de l\'écran est écrite, conditionnable et libellée côté serveur — et aucune autre', async () => {
    const { CASES_PROJET } = await ecran();
    const attendu = [...CASES_PROJET].sort();
    const LEARNER = lire('controllers/learner.controller.js');
    const CONDITIONS = lire('lib/conditions.js');
    assert.deepStrictEqual([...projets(bloc(LEARNER, /const LEARNER_FIELDS = \[[\s\S]*?\];/))].sort(), attendu,
        'LEARNER_FIELDS : la liste blanche d\'écriture');
    assert.deepStrictEqual([...projets(bloc(LEARNER, /const CASES = new Set\(\[[\s\S]*?\]\);/))].sort(), attendu,
        'CASES : une case décochée n\'est pas « perdue »');
    assert.deepStrictEqual([...projets(bloc(CONDITIONS, /const DEFAULT_ENABLED = new Set\(\[[\s\S]*?\]\);/))].sort(), attendu,
        'DEFAULT_ENABLED : proposée d\'emblée comme condition de document');
    const libelles = bloc(CONDITIONS, /const FR_LABELS = \{[\s\S]*?\n\};/);
    assert.deepStrictEqual([...projets(libelles)].sort(), attendu, 'FR_LABELS : un libellé chacune');
    for (const k of CASES_PROJET) assert.match(libelles, new RegExp(`\\b${k}: 'Projet : `), `${k} : « Projet : … »`);
});

test('l\'export envoie la nature, l\'activité et l\'équipement — jamais l\'avancement', async () => {
    const { GROUPES_PROJET, MIGRATION_DES_CASES } = await ecran();
    const cles = (g) => g.cases.flatMap((c) => [c.k, ...(c.precisions || []).map((p) => p.k)]);
    const avancement = cles(GROUPES_PROJET.find((g) => g.titre === 'Avancement'));
    const transmises = GROUPES_PROJET.filter((g) => g.titre !== 'Avancement').flatMap(cles);
    assert.deepStrictEqual([...serveur.COLONNES_PHRASE].sort(), [...transmises].sort(),
        'la phrase lit toutes les cases transmises, et elles seules');
    assert.ok(avancement.includes('project_funded') && avancement.includes('project_more_training'));
    assert.strictEqual(serveur.phraseProjet(Object.fromEntries(avancement.map((k) => [k, 1]))), '',
        'l\'avancement seul ne dit rien au partenaire');
    // L'export ne le LIT même pas : une donnée qu'on ne charge pas ne peut pas partir par erreur.
    const tout = { query: async () => [[...transmises, ...avancement].map((c) => ({ c }))] };
    const sql = await serveur.colonnesProjetSql(tout);
    for (const k of avancement) assert.ok(!sql.includes(k), `${k} : jamais lue par l'export`);
    // Ce que le stagiaire a accepté : « la nature de mon projet ».
    assert.strictEqual(CHAMPS_TRANSMISSIBLES.projet.annonce, 'la nature de mon projet');
    // Tout coché : la phrase entière, dans l'ordre.
    assert.strictEqual(serveur.phraseProjet(Object.fromEntries([...transmises, ...avancement].map((k) => [k, 1]))),
        'création, reprise, pizzeria sur place, à emporter / livraison, pizza à la part, distributeur automatique, '
        + 'traiteur / événementiel, pizza en complément d\'un commerce, four (bois, électrique, gaz, déjà acheté), '
        + 'camion, pétrin, laminoir / façonneuse, saladette / vitrine réfrigérée, recherche de poste, perfectionnement');
    // Les deux catalogues s'accordent sur la migration de chaque case (NULL avant elle).
    for (const x of [...serveur.PHRASE_PROJET, ...serveur.PRECISIONS_FOUR]) {
        assert.strictEqual(x.migration, MIGRATION_DES_CASES[x.c], `${x.c} : même migration des deux côtés`);
    }
});

test('la fiche : une ligne par question renseignée, l\'avancement compris', async () => {
    const { lignesProjet } = await ecran();
    assert.deepStrictEqual(lignesProjet({
        project_creation: 1, project_dine_in: 1, project_takeaway: 1, project_oven: 1, project_oven_owned: 1,
        project_kneader: 1, project_premises: 1, project_more_training: 1, project_truck: 0,
    }), [
        { label: 'Nature', value: 'Création' },
        { label: 'Activité', value: 'Pizzeria sur place · À emporter / livraison' },
        { label: 'Équipement', value: 'Four (déjà acheté) · Pétrin' },
        { label: 'Avancement', value: 'Local trouvé · Intéressé par une formation complémentaire' },
    ]);
    assert.deepStrictEqual(lignesProjet({}), [], 'rien de coché : « Aucun projet renseigné. »');
    assert.deepStrictEqual(lignesProjet(null), []);
    // Avant la 173, les nouvelles clés n'existent pas (SELECT *) : rien ne s'affiche à tort.
    assert.deepStrictEqual(lignesProjet({ project_job: 1, project_dine_in: undefined }), [{ label: 'Nature', value: 'Cherche poste pizzaïolo(la)' }]);
    const FICHE_UI = lireRacine('src/app/ui/pages/StagiaireDetail.jsx');
    assert.match(FICHE_UI, /\{projet\.length \? projet\.map\(\(r\) => <Row key=\{r\.label\} label=\{r\.label\} value=\{r\.value\} \/>\)/);
});

test('« Déjà acheté » coche « Four », comme un type de four', () => {
    for (const { c } of serveur.PRECISIONS_FOUR) {
        assert.strictEqual(normaliserSaisie({ project_oven: 0, [c]: true }).project_oven, 1, c);
    }
    assert.strictEqual(normaliserSaisie({ project_oven: 0, project_kneader: true }).project_oven, 0, 'un pétrin n\'est pas un four');
});

test('sans la migration 173, la fiche s\'enregistre et DIT les cases qui n\'ont pas été prises', async () => {
    const { MIGRATION_DES_CASES, CASES_PROJET } = await ecran();
    const avant173 = ['first_name', 'last_name', 'email', 'phone', 'financing',
        ...CASES_PROJET.filter((k) => MIGRATION_DES_CASES[k] !== 173)];
    requetes = []; colonnes = avant173;
    const { code, corps } = await appeler(updateLearner, { body: { ...FICHE, project_creation: true, project_dine_in: true, project_funded: false } });
    assert.strictEqual(code, 200);
    assert.match(maj().sql, /project_creation = \?/);
    assert.doesNotMatch(maj().sql, /project_dine_in|project_funded/, 'aucune colonne inexistante nommée');
    // Seule la case COCHÉE est perdue : décochée, elle ne disait rien que la base ignore.
    assert.deepStrictEqual(corps.ignores, ['project_dine_in']);
    // Après : écrites, rien à signaler.
    requetes = []; colonnes = [...avant173, ...CASES_PROJET];
    const apres = await appeler(updateLearner, { body: { ...FICHE, project_dine_in: true, project_funded: false } });
    assert.match(maj().sql, /project_dine_in = \?[\s\S]*project_funded = \?/);
    assert.ok(!('ignores' in apres.corps));
    // Et l'écran le dit en une mention, quelle que soit la case perdue.
    const MODALE = lireRacine('src/app/ui/components/EditStagiaireModal.jsx');
    assert.match(MODALE, /173: "les nouvelles cases du projet"/);
});

test('sans la migration 173, les lectures tiennent : NULL, et les colonnes d\'origine si on ne voit rien', async () => {
    const { MIGRATION_DES_CASES } = await ecran();
    const nouvelles = serveur.COLONNES_PHRASE.filter((c) => MIGRATION_DES_CASES[c] === 173);
    const anciennes = serveur.COLONNES_PHRASE.filter((c) => MIGRATION_DES_CASES[c] !== 173);
    const sans173 = { query: async () => [anciennes.map((c) => ({ c }))] };
    let sql = await serveur.colonnesProjetSql(sans173);
    for (const c of nouvelles) assert.match(sql, new RegExp(`NULL AS ${c}\\b`));
    for (const c of anciennes) assert.match(sql, new RegExp(`l\\.${c}\\b`));
    /* Une introspection qui échoue — ou qui ne VOIT rien — ne fait pas lire NULL partout : on s'en
       tient aux colonnes d'origine, les seules dont on soit sûr. */
    for (const conn of [{ query: async () => { throw new Error('refusé'); } }, { query: async () => [[]] }]) {
        sql = await serveur.colonnesProjetSql(conn);
        assert.match(sql, /l\.project_creation\b/);
        assert.match(sql, /NULL AS project_improvement\b/);
        assert.match(sql, /NULL AS project_dine_in\b/);
    }
});

test('la migration 173 ajoute exactement les cases qui l\'attendent — et chaque migration, les siennes', async () => {
    const { MIGRATION_DES_CASES } = await ecran();
    const dossier = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const fichiers = fs.readdirSync(dossier);
    const fichier = (n, revert) => fichiers.find((f) => f.startsWith(`${n}_`) && f.includes('_revert_') === revert);
    for (const n of new Set(Object.values(MIGRATION_DES_CASES))) {
        const siennes = Object.keys(MIGRATION_DES_CASES).filter((k) => MIGRATION_DES_CASES[k] === n).sort();
        const MIG = sansCommentaires(fs.readFileSync(path.join(dossier, fichier(n, false)), 'utf8'));
        const REV = sansCommentaires(fs.readFileSync(path.join(dossier, fichier(n, true)), 'utf8'));
        const ajoutees = [...MIG.matchAll(/ADD COLUMN IF NOT EXISTS (project_[a-z_]+) TINYINT\(1\) NOT NULL DEFAULT 0/g)].map((m) => m[1]).sort();
        const retirees = [...REV.matchAll(/DROP COLUMN IF EXISTS (project_[a-z_]+)/g)].map((m) => m[1]).sort();
        assert.deepStrictEqual(ajoutees, siennes, `${n} : les cases que le catalogue lui attribue`);
        assert.deepStrictEqual(retirees, siennes, `${n} : son revert les retire`);
    }
    // Le client SQL de l'organisme découpe sur le point-virgule (cf. la 146).
    for (const f of [fichier(173, false), fichier(173, true)]) {
        const brut = fs.readFileSync(path.join(dossier, f), 'utf8');
        const commentaires = (brut.match(/\/\*[\s\S]*?\*\//g) || []).join('');
        const chaines = (sansCommentaires(brut).match(/'[^']*'/g) || []).join('');
        assert.ok(!commentaires.includes(';') && !chaines.includes(';'), `${f} : aucun point-virgule hors fin d'instruction`);
        assert.strictEqual((sansCommentaires(brut).match(/;/g) || []).length, 1, `${f} : une seule instruction`);
        assert.ok(!brut.includes('\\'), `${f} : aucune barre oblique inverse`);
    }
});
