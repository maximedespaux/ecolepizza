/**
 * LE RÉFÉRENT D'UNE ENTREPRISE : UN STAGIAIRE, OU UNE PERSONNE EN NOM ET PRÉNOM (demandé le 2026-09-22,
 * migration 174).
 *
 * « Là où l'on saisit le nom du référent, pouvoir soit choisir un stagiaire, soit mettre le nom et le
 * prénom du référent, même si ce n'est pas un stagiaire. » Le référent tenait dans un seul champ : il
 * se retapait à la main même quand c'était un stagiaire de l'école, et rien n'y séparait le prénom du
 * nom — la création du compte du représentant coupait au premier mot.
 *
 * Ce fichier gèle :
 *   · le stagiaire choisi est un stagiaire de CET organisme, et ses noms font foi (le serveur les
 *     recopie, et les tient à jour quand sa fiche change) ;
 *   · avant la migration, rien ne se perd : le prénom rejoint le nom, et l'écran dit que le lien
 *     vers le stagiaire n'a pas été gardé ;
 *   · documents, liste, fiche et compte du représentant lisent « Prénom NOM » — et les fiches
 *     d'avant, au nom complet dans un seul champ, se lisent comme avant ;
 *   · le compte du représentant, quand le référent est un stagiaire qui a déjà le sien, c'est le sien.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base ─────────────────────────────────────────────────────────────────────────────
let base;
function nouvelleBase(o = {}) {
    return {
        colonnes: ['vat_number', 'date_creation', 'representative_first_name', 'representative_learner_id'],
        stagiaires: [
            { id: 'marco', organization_id: 'o1', civility: 'M.', first_name: 'Marco', last_name: 'ROSSI', email: 'marco@exemple.fr', user_id: 'u-marco' },
            { id: 'ailleurs', organization_id: 'o2', civility: 'Mme', first_name: 'Eva', last_name: 'AUTRE', email: 'eva@exemple.fr', user_id: null },
        ],
        comptes: [{ id: 'u-marco', organization_id: 'o1', role: 'STAGIAIRE', email: 'marco@exemple.fr' }],
        entreprise: null,
        ecrites: [],
        mails: [],
        ...o,
    };
}
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (/information_schema\.columns/.test(q)) {
                const col = params.length >= 2 ? params[1] : params[0];
                const table = params.length >= 2 ? params[0] : 'company';
                return [table === 'company' && base.colonnes.includes(col) ? [{ 1: 1 }] : []];
            }
            if (/^SELECT civility, first_name, last_name FROM learner WHERE id = \? AND organization_id = \?/.test(q)) {
                return [base.stagiaires.filter((s) => s.id === params[0] && s.organization_id === params[1])];
            }
            if (/^SELECT id, civility, first_name, last_name, email FROM learner WHERE id = \? AND organization_id = \?/.test(q)) {
                return [base.stagiaires.filter((s) => s.id === params[0] && s.organization_id === params[1])];
            }
            if (/^SELECT u\.id, u\.role, u\.email FROM learner l JOIN user u ON u\.id = l\.user_id/.test(q)) {
                const s = base.stagiaires.find((x) => x.id === params[0] && x.organization_id === params[1]);
                return [base.comptes.filter((u) => s && u.id === s.user_id && u.organization_id === params[2])];
            }
            if (/^SELECT \* FROM company WHERE id = \? AND organization_id = \?/.test(q)) return [base.entreprise ? [base.entreprise] : []];
            if (/^SELECT id FROM company WHERE id = \? AND organization_id = \?/.test(q)) return [base.entreprise ? [{ id: base.entreprise.id }] : []];
            if (/^SELECT id, role FROM user WHERE email = \? AND organization_id = \?/.test(q)) {
                return [base.comptes.filter((u) => u.email === params[0] && u.organization_id === params[1])];
            }
            if (/^SELECT COUNT\(\*\) AS n FROM learner WHERE user_id = \?/.test(q)) {
                return [[{ n: base.stagiaires.filter((s) => s.user_id === params[0]).length }]];
            }
            if (/^SELECT c\.id, c\.organization_id, c\.name/.test(q)) { base.liste = q; return [base.lignesListe || []]; }
            if (/^(INSERT|UPDATE)/.test(q)) { base.ecrites.push({ q, params }); return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, []); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const vraiMailer = require('../lib/mailer.js');
const cheminMailer = require.resolve('../lib/mailer.js');
require.cache[cheminMailer] = {
    id: cheminMailer, filename: cheminMailer, loaded: true,
    exports: { ...vraiMailer, sendMail: (m) => { base.mails.push(m); return Promise.resolve({ sent: false }); }, envoiPossible: () => false },
};

const { appliquerReferent, suivreStagiaire, nomReferent } = require('../lib/referentEntreprise.js');
const ctrl = require('../controllers/company.controller.js');
const { resolveTokens } = require('../lib/tokens.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const lireRacine = (f) => fs.readFileSync(path.join(__dirname, '..', '..', '..', f), 'utf8');
async function appeler(fn, req) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'admin', role: 'ADMIN_ORGANISME' }, params: { id: 'c1' }, query: {}, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const ENTREPRISE = { name: 'Pizzeria Rossi', siret: '11111111100011', email: 'contact@rossi.fr', phone: '05 62 00 00 00' };
const TOUTES = ['name', 'siret', 'naf_ape', 'legal_status', 'address', 'zip_code', 'town', 'email', 'phone', 'opco',
    'representative_civ', 'representative_name', 'representative_role', 'vat_number', 'date_creation', 'representative_first_name', 'representative_learner_id'];

// ── Les règles ───────────────────────────────────────────────────────────────────────────────

test('un stagiaire choisi : ses noms font foi — et il doit être de CET organisme', async () => {
    base = nouvelleBase();
    const b = { representative_learner_id: 'marco', representative_name: 'NOM TAPÉ', representative_first_name: 'x' };
    assert.deepStrictEqual(await appliquerReferent(faux.promise(), 'o1', b, TOUTES), { ignores: [] });
    assert.deepStrictEqual([b.representative_civ, b.representative_first_name, b.representative_name, b.representative_learner_id],
        ['M.', 'Marco', 'ROSSI', 'marco'], 'recopiés depuis la fiche, pas depuis l\'écran');
    // Un identifiant d'un autre organisme ferait imprimer le nom d'un inconnu sur les conventions.
    const r = await appliquerReferent(faux.promise(), 'o1', { representative_learner_id: 'ailleurs' }, TOUTES);
    assert.match(r.erreur, /Stagiaire introuvable/);
    // « Une autre personne » : le lien est défait, les noms saisis restent.
    const autre = { representative_learner_id: '', representative_first_name: ' Jean ', representative_name: 'DUPONT' };
    await appliquerReferent(faux.promise(), 'o1', autre, TOUTES);
    assert.deepStrictEqual([autre.representative_learner_id, autre.representative_first_name, autre.representative_name], [null, 'Jean', 'DUPONT']);
});

test('avant la migration 174, rien ne se perd — et l\'écran dit ce qui n\'a pas été gardé', async () => {
    base = nouvelleBase();
    const AVANT = TOUTES.filter((c) => !['representative_first_name', 'representative_learner_id'].includes(c));
    const saisi = { representative_learner_id: '', representative_first_name: 'Jean', representative_name: 'DUPONT' };
    assert.deepStrictEqual(await appliquerReferent(faux.promise(), 'o1', saisi, AVANT), { ignores: [] });
    assert.strictEqual(saisi.representative_name, 'JEAN DUPONT', 'le prénom rejoint le nom, dans la forme d\'avant');
    assert.ok(!('representative_first_name' in saisi) && !('representative_learner_id' in saisi), 'aucune colonne absente nommée');
    const choisi = { representative_learner_id: 'marco' };
    assert.deepStrictEqual(await appliquerReferent(faux.promise(), 'o1', choisi, AVANT), { ignores: ['representative_learner_id'] });
    assert.strictEqual(choisi.representative_name, 'MARCO ROSSI', 'les noms du stagiaire sont recopiés quand même');
});

test('créer une entreprise : le stagiaire choisi suffit comme référent', async () => {
    base = nouvelleBase();
    let { code, corps } = await appeler(ctrl.createCompany, { body: { ...ENTREPRISE, representative_learner_id: 'marco' } });
    assert.strictEqual(code, 201, JSON.stringify(corps));
    const ins = base.ecrites.find((w) => /^INSERT INTO company/.test(w.q));
    const cols = /\(id, organization_id, ([^)]+)\)/.exec(ins.q)[1].split(', ');
    const val = Object.fromEntries(cols.map((c, i) => [c, ins.params[i + 2]]));
    assert.deepStrictEqual([val.representative_learner_id, val.representative_first_name, val.representative_name, val.representative_civ],
        ['marco', 'Marco', 'ROSSI', 'M.']);
    // Sans nom ni stagiaire, le contrôle d'avant tient — et sans toucher la base.
    base = nouvelleBase();
    ({ code, corps } = await appeler(ctrl.createCompany, { body: { ...ENTREPRISE } }));
    assert.strictEqual(code, 422);
    assert.match(corps.error, /^Champ requis : Nom du référent\.$/);
    // Un stagiaire d'ailleurs : refusé, rien d'écrit.
    base = nouvelleBase();
    ({ code } = await appeler(ctrl.createCompany, { body: { ...ENTREPRISE, representative_learner_id: 'ailleurs' } }));
    assert.strictEqual(code, 422);
    assert.strictEqual(base.ecrites.length, 0);
});

test('modifier une entreprise avant la 174 : enregistrée, « sauf le lien »', async () => {
    base = nouvelleBase({ colonnes: ['vat_number', 'date_creation'], entreprise: { id: 'c1', organization_id: 'o1', name: 'X' } });
    const { code, corps } = await appeler(ctrl.updateCompany, { body: { representative_learner_id: 'marco' } });
    assert.strictEqual(code, 200);
    assert.deepStrictEqual(corps.ignores, ['representative_learner_id']);
    const maj = base.ecrites.find((w) => /^UPDATE company SET/.test(w.q));
    assert.doesNotMatch(maj.q, /representative_learner_id|representative_first_name/, 'aucune colonne absente nommée');
    assert.match(maj.q, /representative_name = \?/);
    const { messageReferentPerdu } = await import('../../app/ui/lib/referent.js');
    assert.strictEqual(messageReferentPerdu(corps.ignores), 'le lien vers le stagiaire référent : la migration 174 n\'est pas jouée.');
});

test('la fiche du stagiaire change : les entreprises dont il est le référent suivent', async () => {
    base = nouvelleBase();
    await suivreStagiaire(faux.promise(), 'marco');
    const w = base.ecrites.find((x) => /^UPDATE company c JOIN learner l ON l\.id = c\.representative_learner_id/.test(x.q));
    assert.ok(w, 'une recopie depuis la fiche');
    assert.match(w.q, /SET c\.representative_civ = l\.civility, c\.representative_first_name = l\.first_name, c\.representative_name = l\.last_name WHERE l\.id = \?/);
    base = nouvelleBase({ colonnes: [] });
    await suivreStagiaire(faux.promise(), 'marco');
    assert.strictEqual(base.ecrites.length, 0, 'sans la 174, rien à suivre');
    // Les deux chemins qui changent un nom de stagiaire : la fiche tenue par l'école, et l'espace du stagiaire.
    assert.match(lire('controllers/learner.controller.js'),
        /if \(\['civility', 'first_name', 'last_name'\]\.some\(\(k\) => body\[k\] !== undefined\)\) await suivreStagiaire\(conn, learnerId\);/);
    assert.match(lire('controllers/espace.controller.js'),
        /if \(\['civility', 'first_name', 'last_name'\]\.some\(\(k\) => vals\[k\] !== undefined\)\) await suivreStagiaire\(conn, learner\.id\);/);
});

test('documents : « Prénom NOM », et les fiches d\'avant comme avant', () => {
    const neuf = resolveTokens({ company: { representative_civ: 'M.', representative_first_name: 'Jean', representative_name: 'DUPONT' } });
    assert.strictEqual(neuf['Nom représentant'], 'Jean DUPONT');
    assert.strictEqual(neuf['Responsable entreprise'], 'Jean DUPONT');
    const ancien = resolveTokens({ company: { representative_name: 'JEAN DUPONT' } });
    assert.strictEqual(ancien['Nom représentant'], 'JEAN DUPONT');
    assert.strictEqual(nomReferent({}), '');
});

test('le compte du représentant : celui du stagiaire référent, s\'il en a un', async () => {
    base = nouvelleBase({ entreprise: { id: 'c1', organization_id: 'o1', name: 'Pizzeria Rossi', email: 'contact@rossi.fr',
        representative_first_name: 'Marco', representative_name: 'ROSSI', representative_learner_id: 'marco' } });
    const { code, corps } = await appeler(ctrl.createRepresentativeAccount, {});
    assert.strictEqual(code, 200);
    assert.deepStrictEqual(corps.data, { email: 'marco@exemple.fr', linked: true, existing_role: 'STAGIAIRE' });
    const lien = base.ecrites.find((w) => /^UPDATE company SET user_id = \?/.test(w.q));
    assert.strictEqual(lien.params[0], 'u-marco', 'son compte, pas un compte neuf sur l\'e-mail de l\'entreprise');
    assert.ok(!base.ecrites.some((w) => /^INSERT INTO user/.test(w.q)));
    assert.deepStrictEqual(base.mails.map((m) => m.to), ['marco@exemple.fr'], 'prévenu à SON adresse');
    // Le prénom saisi à part n'est plus deviné au premier mot du nom.
    const SRC = lire('controllers/company.controller.js');
    assert.match(SRC, /const \[first, \.\.\.rest\] = prenom\s*\? \[prenom, \.\.\.String\(company\.representative_name \|\| ''\)\.trim\(\)\.split\(\/\\s\+\/\)\]/);
});

test('la liste montre le stagiaire référent désigné avant la coïncidence d\'e-mail', async () => {
    base = nouvelleBase({ lignesListe: [{ id: 'c1', name: 'X', referent_id: 'marco', referent_name: 'Marco ROSSI', learner_id: 'autre', learner_name: 'Par e-mail' }] });
    let { corps } = await appeler(ctrl.getCompanies, {});
    assert.deepStrictEqual(corps.data[0], { id: 'c1', name: 'X', learner_id: 'marco', learner_name: 'Marco ROSSI', referent_stagiaire: true });
    assert.match(base.liste, /WHERE rl\.id = c\.representative_learner_id AND rl\.organization_id = c\.organization_id\) AS referent_id/);
    base = nouvelleBase({ colonnes: [], lignesListe: [{ id: 'c1', name: 'X', referent_id: null, referent_name: null, learner_id: 'autre', learner_name: 'Par e-mail' }] });
    ({ corps } = await appeler(ctrl.getCompanies, {}));
    assert.strictEqual(corps.data[0].learner_id, 'autre', 'sans la 174 : la déduction par l\'e-mail, comme avant');
    assert.match(base.liste, /NULL AS referent_id/);
});

test('la fiche entreprise dit quel stagiaire est le référent — de cet organisme seulement', async () => {
    base = nouvelleBase({ entreprise: { id: 'c1', organization_id: 'o1', name: 'X', representative_learner_id: 'marco' } });
    const { corps } = await appeler(ctrl.getCompany, {});
    assert.deepStrictEqual(corps.data.referent_stagiaire, base.stagiaires[0]);
});

// ── La migration ─────────────────────────────────────────────────────────────────────────────

test('la migration 174 : deux colonnes, un lien qui se défait seul, un revert qui garde le prénom', () => {
    const MIG = lireRacine('database/migrations/174_referent_entreprise.sql');
    const REV = lireRacine('database/migrations/174_revert_referent_entreprise.sql');
    const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(code(MIG), /ADD COLUMN IF NOT EXISTS representative_first_name varchar\(120\) DEFAULT NULL/);
    assert.match(code(MIG), /ADD COLUMN IF NOT EXISTS representative_learner_id uuid DEFAULT NULL/);
    assert.match(code(MIG), /ADD CONSTRAINT fk_company_referent_learner FOREIGN KEY IF NOT EXISTS \(representative_learner_id\)\s+REFERENCES learner \(id\) ON DELETE SET NULL/);
    // Le revert replie le prénom dans le nom AVANT de retirer sa colonne.
    const r = code(REV);
    assert.ok(r.indexOf('UPDATE company') >= 0 && r.indexOf('UPDATE company') < r.indexOf('DROP COLUMN IF EXISTS representative_first_name'));
    assert.match(r, /SET representative_name = UPPER\(TRIM\(CONCAT\(representative_first_name, ' ', COALESCE\(representative_name, ''\)\)\)\)/);
    assert.match(r, /DROP FOREIGN KEY IF EXISTS fk_company_referent_learner/);
    // Le client SQL de l'organisme découpe sur le point-virgule (cf. la 146).
    for (const f of [MIG, REV]) {
        const commentaires = (f.match(/\/\*[\s\S]*?\*\//g) || []).join('');
        const chaines = (code(f).match(/'[^']*'/g) || []).join('');
        assert.ok(!commentaires.includes(';') && !chaines.includes(';'), 'aucun point-virgule hors fin d\'instruction');
        assert.ok(!f.includes('\\'), 'aucune barre oblique inverse');
    }
});

// ── Les écrans ───────────────────────────────────────────────────────────────────────────────

test('le composant : un stagiaire choisi, ou une personne en nom et prénom', () => {
    const C = lireUi('components/ReferentEntreprise.jsx');
    assert.match(C, /onClick=\{\(\) => basculer\("stagiaire"\)\}>[\s\S]*Un stagiaire/);
    assert.match(C, /onClick=\{\(\) => basculer\("autre"\)\}>[\s\S]*Une autre personne/);
    // Choisir lie le stagiaire ; revenir à « une autre personne » défait le lien, sans effacer les noms.
    assert.match(C, /onChange\(\{\s*representative_learner_id: s\.id,/);
    assert.match(C, /if \(m === "autre"\) onChange\(\{ representative_learner_id: "" \}\);/);
    // La recherche est débattue, et une réponse tardive n'écrase pas la suivante.
    assert.match(C, /\.then\(\(r\) => \{ if \(vivant\) setResultats\(\(r\.data \|\| \[\]\)\.slice\(0, 8\)\); \}\)/);
    assert.match(C, /return \(\) => \{ vivant = false; clearTimeout\(h\); \};/);
    for (const champ of ['<label>Civilité</label>', '<label>Nom{requis && <Requis />}</label>', '<label>Prénom</label>']) assert.ok(C.includes(champ), champ);
});

test('les trois écrans où l\'on nomme un référent emploient le composant, et les lecteurs le nom complet', () => {
    const FICHE = lireUi('pages/EntrepriseDetail.jsx');
    assert.match(FICHE, /<ReferentEntreprise valeur=\{form\} onChange=\{\(m\) => setForm\(\(p\) => \(\{ \.\.\.p, \.\.\.m \}\)\)\} requis\s+suggestions=\{data\.learners \|\| \[\]\} stagiaire=\{data\.referent_stagiaire \|\| null\} fonctions=\{REP_ROLES\} \/>/);
    assert.doesNotMatch(FICHE, /k: "representative_name"/, 'plus de champ « Nom du référent » isolé');
    assert.match(FICHE, /const perdu = messageReferentPerdu\(r\?\.ignores\);/);
    const LISTE = lireUi('pages/Entreprises.jsx');
    assert.match(LISTE, /<ReferentEntreprise valeur=\{f\} onChange=\{\(m\) => setF\(\(p\) => \(\{ \.\.\.p, \.\.\.m \}\)\)\} requis \/>/);
    assert.match(LISTE, /\{ k: "ref", t: "Référent", cell: \(c\) => referentAvecCivilite\(c\) \|\| null \}/);
    assert.match(LISTE, /\.filter\(\(\[k\]\) => !\(k === "representative_name" && f\.representative_learner_id\)/);
    const MODALE = lireUi('components/EditStagiaireModal.jsx');
    assert.match(MODALE, /suggestions=\{id \? \[\{ id, civility: form\.civility, first_name: form\.first_name, last_name: form\.last_name, email: form\.email \}\] : \[\]\}/);
    assert.match(MODALE, /const perdu = messageReferentPerdu\(r\?\.ignores\);\s*if \(perdu\) onError\?\.\(`Entreprise créée, sauf \$\{perdu\}`\);/,
        'le sous-formulaire dit aussi ce qui n\'a pas été gardé');
    assert.match(lireUi('pages/StagiaireDetail.jsx'), /<Row label="Représentant" value=\{\[referentAvecCivilite\(c\),/);
});

test('le nom lu à l\'écran : le prénom, puis le NOM — ou le nom complet d\'avant', async () => {
    const { nomReferent: ui, referentAvecCivilite } = await import('../../app/ui/lib/referent.js');
    for (const c of [{ representative_first_name: 'Jean', representative_name: 'DUPONT' }, { representative_name: 'JEAN DUPONT' }, {}, null]) {
        assert.strictEqual(ui(c), nomReferent(c), 'même règle des deux côtés');
    }
    assert.strictEqual(referentAvecCivilite({ representative_civ: 'Mme', representative_first_name: 'Léa', representative_name: 'DURAND' }), 'Mme Léa DURAND');
});
