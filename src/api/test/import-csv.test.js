/**
 * L'IMPORT CSV DE STAGIAIRES ET D'ENTREPRISES (demandé le 2026-09-22).
 *
 * Le fichier se lit dans le navigateur (ui/lib/csv.js, ui/lib/importFiches.js) ; le serveur décide
 * (lib/importFiches.js) et écrit (importLearners, importCompanies). Règles tranchées par l'utilisateur :
 * seul le nom est exigé ; une fiche déjà là est sautée, jamais modifiée ; un champ illisible est laissé
 * de côté, et dit.
 *
 * Ce fichier gèle ce qui, s'il cédait, fausserait la base sans bruit :
 *   · un CSV d'Excel se lit tel quel — point-virgule, Windows-1252, guillemets, retours dans une cellule ;
 *   · le modèle téléchargé se réimporte sans rien retoucher ;
 *   · une fiche existante n'est jamais doublée ni touchée ; un champ illisible n'entre pas en base ;
 *   · l'essai n'écrit rien, et une requête qui oublie le drapeau reste un essai ;
 *   · chaque fiche créée l'est comme à la main : mêmes normalisations, même trace au journal.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base ─────────────────────────────────────────────────────────────────────────────
let base;
function nouvelleBase(o = {}) {
    return {
        learners: [{ email: 'marie@exemple.fr', last_name: 'DURAND', first_name: 'Marie', birthday: '1990-03-25' },
            { email: null, last_name: 'MARTIN', first_name: 'Paul', birthday: '1985-01-02' }],
        companies: [{ id: 'c1', name: 'SARL Le Petit Four', siret: '879 955 136 00012', zip_code: '65300' },
            { id: 'c2', name: 'Chez Paulo', siret: null, zip_code: '31000' }, { id: 'c3', name: 'Chez Paulo', siret: null, zip_code: '32000' }],
        colonnesLearner: ['civility', 'first_name', 'last_name', 'email', 'phone', 'birthday', 'birth_place', 'address', 'zip_code', 'town',
            'professional_status', 'financing'],
        colonnesCompany: ['vat_number', 'date_creation', 'representative_first_name', 'representative_learner_id'],
        ecrites: [], journal: [],
        ...o,
    };
}
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (/^SELECT email, last_name, first_name, DATE_FORMAT\(birthday, '%Y-%m-%d'\) AS birthday FROM learner WHERE organization_id = \?/.test(q)) return [base.learners];
            if (/^SELECT id, name, siret, zip_code FROM company WHERE organization_id = \?/.test(q)) return [base.companies];
            if (/^SELECT name, siret, zip_code FROM company WHERE organization_id = \?/.test(q)) return [base.companies];
            if (/information_schema\.columns[\s\S]*table_name = 'learner'/.test(q)) return [base.colonnesLearner.map((c) => ({ c }))];
            if (/information_schema\.columns[\s\S]*column_name = \?/.test(q)) return [base.colonnesCompany.includes(params[params.length - 1]) ? [{ 1: 1 }] : []];
            if (/^INSERT INTO (learner|company)/.test(q)) { base.ecrites.push({ q, params }); return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (/INSERT INTO audit_log/.test(sql)) base.journal.push(params[3]); if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const imp = require('../lib/importFiches.js');
const { importLearners, normaliserSaisie, RE_EMAIL } = require('../controllers/learner.controller.js');
const { importCompanies, normaliserEntreprise, RE_EMAIL_ENT } = require('../controllers/company.controller.js');
const csv = () => import('../../app/ui/lib/csv.js');
const catalogue = () => import('../../app/ui/lib/importFiches.js');
const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

async function appeler(fn, body) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', id: 'admin', role: 'ADMIN_ORGANISME' }, body }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const stagiaires = (lignes, o = {}) => imp.analyserStagiaires(lignes, { existants: base.learners, entreprises: base.companies,
    normaliser: normaliserSaisie, reEmail: RE_EMAIL, ...o });

// ── Lire le fichier ──────────────────────────────────────────────────────────────────────────

test('un CSV d\'Excel se lit tel quel : point-virgule, guillemets, retours dans une cellule', async () => {
    const { lireCsv, separateur } = await csv();
    assert.strictEqual(separateur('Nom;Prénom;Ville\r\n'), ';');
    assert.strictEqual(separateur('Nom,Prénom,Ville\n'), ',');
    assert.strictEqual(separateur('"Nom; complet; officiel",Prénom\n'), ',', 'un point-virgule entre guillemets ne compte pas');
    const texte = 'Nom;Adresse;Note\r\n\r\nDURAND;"12 rue ""du"" Four; bât. B";"deux\r\nlignes"\r\nMARTIN;;x\r\n';
    const { entetes, lignes } = lireCsv(texte);
    assert.deepStrictEqual(entetes, ['Nom', 'Adresse', 'Note']);
    assert.deepStrictEqual(lignes.map((l) => l.cellules), [['DURAND', '12 rue "du" Four; bât. B', 'deux\r\nlignes'], ['MARTIN', '', 'x']]);
    assert.deepStrictEqual(lignes.map((l) => l.numero), [3, 5], 'le numéro de ligne du FICHIER : la ligne vide et la cellule sur deux lignes comptent');
});

test('Windows-1252 comme UTF-8 : les accents arrivent entiers', async () => {
    const { decoderCsv } = await csv();
    // « Pâtisserie;Étoile » tel qu'Excel l'écrit en « CSV (séparateur : point-virgule) » : â = E2, É = C9.
    const ansi = Uint8Array.from([0x50, 0xe2, 0x74, 0x69, 0x73, 0x73, 0x65, 0x72, 0x69, 0x65, 0x3b, 0xc9, 0x74, 0x6f, 0x69, 0x6c, 0x65]);
    assert.strictEqual(decoderCsv(ansi), 'Pâtisserie;Étoile');
    const utf8 = new TextEncoder().encode('\uFEFFPâtisserie;Étoile');
    assert.strictEqual(decoderCsv(utf8), 'Pâtisserie;Étoile', 'le BOM retiré');
});

test('les colonnes se reconnaissent sous leurs noms courants — et le modèle se réimporte tel quel', async () => {
    const { CHAMPS_IMPORT, associerColonnes, modeleCsv, lignesPourServeur } = await catalogue();
    const { lireCsv, decoderCsv } = await csv();
    const S = CHAMPS_IMPORT.stagiaires;
    assert.deepStrictEqual(associerColonnes(['NOM', 'Prénom', 'Mail', 'Tél', 'CP', 'Date de naissance', 'Société', 'Couleur préférée', 'E-mail'], S),
        ['last_name', 'first_name', 'email', 'phone', 'zip_code', 'birthday', 'entreprise_nom', '', ''],
        'une colonne inconnue, et un second « e-mail », restent ignorés');
    for (const type of ['stagiaires', 'entreprises']) {
        const texte = modeleCsv(type);
        assert.ok(texte.startsWith('\uFEFF') && texte.includes(';') && texte.endsWith('\r\n'), `${type} : au format qu'Excel ouvre`);
        const { entetes } = lireCsv(decoderCsv(new TextEncoder().encode(texte)));
        assert.deepStrictEqual(associerColonnes(entetes, CHAMPS_IMPORT[type]), CHAMPS_IMPORT[type].map((c) => c.k),
            `${type} : chaque colonne du modèle retrouve son champ`);
    }
    assert.deepStrictEqual(lignesPourServeur([{ numero: 7, cellules: [' DURAND ', '', 'x'] }], ['last_name', 'first_name', '']),
        [{ _ligne: 7, last_name: 'DURAND' }], 'cellules vides et colonnes ignorées ne partent pas');
});

test('l\'écran et le serveur connaissent les mêmes champs, et les mêmes situations', async () => {
    const { CHAMPS_IMPORT } = await catalogue();
    assert.deepStrictEqual(CHAMPS_IMPORT.stagiaires.map((c) => c.k).sort(), [...imp.CHAMPS_STAGIAIRE].sort());
    assert.deepStrictEqual(CHAMPS_IMPORT.entreprises.map((c) => c.k).sort(), [...imp.CHAMPS_ENTREPRISE].sort());
    const statuts = /const STATUTS = (\[[^\]]*\]);/.exec(lireUi('components/EditStagiaireModal.jsx'))[1];
    assert.deepStrictEqual(JSON.parse(statuts), imp.STATUTS_PRO);
    // Rien de sensible : ni sécurité sociale, ni France Travail, ni CPF.
    for (const k of ['social_security', 'france_travail_id', 'cpf_amount']) assert.ok(!imp.CHAMPS_STAGIAIRE.includes(k), k);
});

// ── Les règles ───────────────────────────────────────────────────────────────────────────────

test('stagiaires : seul le nom est exigé ; un champ illisible est laissé de côté, et dit', () => {
    base = nouvelleBase();
    const [ok, sansPrenom, illisibles] = stagiaires([
        { _ligne: 2, last_name: 'dupont', first_name: ' Jean ', email: 'Jean.Dupont@Exemple.FR', town: 'tarbes', civility: 'Madame',
            professional_status: 'salarié', birthday: '25/03/1990 00:00' },
        { _ligne: 3, last_name: 'SEUL' },
        { _ligne: 4, last_name: 'Petit', first_name: 'Léa', email: 'pas-un-mail', civility: 'Dr', professional_status: 'astronaute', birthday: '31/02/1990' },
    ]);
    assert.strictEqual(ok.statut, 'a_creer');
    assert.deepStrictEqual(ok.valeurs, { last_name: 'DUPONT', first_name: 'Jean', email: 'jean.dupont@exemple.fr', town: 'TARBES', civility: 'Mme',
        professional_status: 'En activité', birthday: '1990-03-25' }, 'les conventions du formulaire');
    assert.deepStrictEqual([sansPrenom.statut, sansPrenom.motif], ['erreur', 'nom et prénom requis']);
    assert.strictEqual(illisibles.statut, 'a_creer', 'importée quand même');
    assert.deepStrictEqual(Object.keys(illisibles.valeurs).sort(), ['first_name', 'last_name']);
    assert.strictEqual(illisibles.avertissements.length, 4);
    const long = stagiaires([{ last_name: 'X'.repeat(121), first_name: 'A' }])[0];
    assert.strictEqual(long.statut, 'erreur', 'un nom trop long pour sa colonne ne passe pas en silence');
});

test('stagiaires : une fiche déjà là est sautée — par l\'e-mail, ou sans e-mail par le nom et la naissance', () => {
    base = nouvelleBase();
    const r = stagiaires([
        { last_name: 'Autre', first_name: 'Nom', email: 'MARIE@exemple.fr' },
        { last_name: 'Neuf', first_name: 'Un', email: 'un@exemple.fr' },
        { last_name: 'Neuf', first_name: 'Deux', email: 'un@exemple.fr' },
        { last_name: 'martin', first_name: 'paul' },
        { last_name: 'Martin', first_name: 'Paul', birthday: '02/01/1985' },
        { last_name: 'Martin', first_name: 'Paul', birthday: '03/03/1999' },
        { last_name: 'Sans', first_name: 'Mail' }, { last_name: 'SANS', first_name: 'MAIL' },
    ]);
    assert.deepStrictEqual(r.map((x) => x.statut), ['doublon', 'a_creer', 'doublon', 'doublon', 'doublon', 'a_creer', 'a_creer', 'doublon']);
    assert.match(r[2].motif, /même e-mail que la ligne 3/);
    assert.ok(r.every((x) => x.statut !== 'doublon' || !x.valeurs), 'rien à écrire pour une ligne sautée');
});

test('stagiaires : rattachés à leur entreprise par le SIRET ou le nom — et donc « professionnels »', () => {
    base = nouvelleBase();
    const [parSiret, parNom, homonymes, inconnue] = stagiaires([
        { last_name: 'A', first_name: 'A', entreprise_siret: '87995513600012' },
        { last_name: 'B', first_name: 'B', entreprise_nom: 'le petit four' },
        { last_name: 'C', first_name: 'C', entreprise_nom: 'Chez Paulo' },
        { last_name: 'D', first_name: 'D', entreprise_nom: 'Nulle Part' },
    ]);
    assert.deepStrictEqual([parSiret.company_id, parSiret.valeurs.financing], ['c1', 'PROFESSIONNEL']);
    assert.strictEqual(parNom.company_id, 'c1');
    assert.strictEqual(homonymes.company_id, null);
    assert.match(homonymes.avertissements[0], /plusieurs entreprises/);
    assert.match(inconnue.avertissements[0], /introuvable : non rattaché/);
    assert.ok(!('financing' in inconnue.valeurs) && !('entreprise_nom' in inconnue.valeurs));
});

test('entreprises : le nom seul suffit ; déjà là par le SIRET, ou par le nom au même code postal', () => {
    base = nouvelleBase();
    const r = imp.analyserEntreprises([
        { name: 'Le Petit Four SARL', siret: '879 955 136 00012' },
        { name: 'Le petit four', zip_code: '65300' },
        { name: 'Le Petit Four', zip_code: '64000' },
        { name: 'Nouvelle', siret: 'abc', vat_number: 'FR12', email: 'x', naf_ape: '56.10C', date_creation: '01/02/2015', town: 'pau', representative_civ: 'monsieur' },
        { name: 'Nouvelle', zip_code: '64000' },
        { siret: '12345678900011' },
    ], { existantes: base.companies, normaliser: normaliserEntreprise, reEmail: RE_EMAIL_ENT, erreurTva: (v) => (/^(FR[0-9]{11}|[0-9]{13})$/.test(v) ? null : 'x') });
    assert.deepStrictEqual(r.map((x) => x.statut), ['doublon', 'doublon', 'a_creer', 'a_creer', 'doublon', 'erreur']);
    assert.deepStrictEqual(r[3].valeurs, { name: 'Nouvelle', naf_ape: '5610C', date_creation: '2015-02-01', town: 'PAU', representative_civ: 'M.' });
    assert.strictEqual(r[3].avertissements.length, 3, 'SIRET, TVA et e-mail illisibles : laissés de côté');
    assert.match(r[4].motif, /même entreprise que la ligne/);
});

// ── Les routes ───────────────────────────────────────────────────────────────────────────────

test('l\'essai n\'écrit rien — et une requête qui oublie le drapeau reste un essai', async () => {
    base = nouvelleBase();
    const { code, corps } = await appeler(importLearners, { lignes: [{ _ligne: 2, last_name: 'Neuf', first_name: 'Jean' }] });
    assert.strictEqual(code, 200);
    assert.strictEqual(corps.data.essai, true);
    assert.deepStrictEqual(corps.data.bilan, { a_creer: 1, crees: 0, doublons: 0, erreurs: 0, avertissements: 0 });
    assert.strictEqual(base.ecrites.length, 0);
    assert.ok(!('valeurs' in corps.data.resultats[0]), 'la réponse ne renvoie pas les fiches');
    assert.strictEqual((await appeler(importLearners, { lignes: Array(imp.MAX_LIGNES + 1).fill({}) })).code, 422, 'un plafond par import');
    assert.strictEqual((await appeler(importLearners, {})).code, 422);
});

test('l\'import crée comme la main : colonnes présentes, entreprise, trace au journal', async () => {
    base = nouvelleBase();
    const { corps } = await appeler(importLearners, { essai: false, lignes: [
        { _ligne: 2, last_name: 'neuf', first_name: 'Jean', town: 'tarbes', entreprise_siret: '87995513600012' },
        { _ligne: 3, last_name: 'Durand', first_name: 'Marie', email: 'marie@exemple.fr' },
    ] });
    assert.deepStrictEqual(corps.data.resultats.map((r) => r.statut), ['cree', 'doublon']);
    const [ins] = base.ecrites;
    const cols = /\(id, organization_id, company_id, user_id, ([^)]+)\)/.exec(ins.q)[1].split(', ');
    const val = Object.fromEntries(cols.map((c, i) => [c, ins.params[i + 4]]));
    assert.deepStrictEqual(val, { first_name: 'Jean', last_name: 'NEUF', town: 'TARBES', financing: 'PROFESSIONNEL' });
    assert.strictEqual(ins.params[2], 'c1', 'rattaché à son entreprise');
    assert.strictEqual(ins.params[3], null, 'pas de compte de connexion');
    assert.deepStrictEqual(base.journal, ['learner.create']);
    // Une colonne que la base n'a pas n'est pas nommée (champsEcrivables).
    base = nouvelleBase({ colonnesLearner: ['first_name', 'last_name', 'financing'] });
    await appeler(importLearners, { essai: false, lignes: [{ last_name: 'A', first_name: 'B', town: 'PAU' }] });
    assert.doesNotMatch(base.ecrites[0].q, /town/);
});

test('entreprises : l\'import crée, et le prénom du référent tient même avant la migration 174', async () => {
    base = nouvelleBase({ colonnesCompany: ['vat_number', 'date_creation'] });
    const { corps } = await appeler(importCompanies, { essai: false, lignes: [
        { _ligne: 2, name: 'Pizzeria Rossi', representative_first_name: 'Marco', representative_name: 'rossi', town: 'pau' },
    ] });
    assert.deepStrictEqual(corps.data.bilan.crees, 1);
    const ins = base.ecrites[0];
    const cols = /\(id, organization_id, ([^)]+)\)/.exec(ins.q)[1].split(', ');
    const val = Object.fromEntries(cols.map((c, i) => [c, ins.params[i + 2]]));
    assert.deepStrictEqual(val, { name: 'Pizzeria Rossi', town: 'PAU', representative_name: 'MARCO ROSSI' });
    assert.deepStrictEqual(base.journal, ['company.create']);
});

test('les routes : réservées à qui peut créer une fiche', () => {
    assert.match(lire('routes/learner.routes.js'), /router\.post\('\/import', authorizeRoles\(\.\.\.ADMIN_ROLES\), importLearners\);/);
    assert.match(lire('routes/company.routes.js'), /router\.post\('\/import', authorizeRoles\(\.\.\.ADMIN_ROLES\), importCompanies\);/);
});

// ── L'écran ──────────────────────────────────────────────────────────────────────────────────

test('l\'écran : le modèle d\'emblée, la vérification avant l\'import, aucun tiret long', () => {
    const C = lireUi('components/ImportCsv.jsx');
    const rendu = C.slice(C.indexOf('return ('));
    const avantFichier = rendu.slice(0, rendu.indexOf('{fichier && !fait && ('));
    assert.match(avantFichier, /onClick=\{telechargerModele\}>[\s\S]*Télécharger le modèle/, 'le modèle se télécharge avant même d\'avoir un fichier');
    assert.match(rendu, /\{verif && !fait && \(\s*<button[^>]*onClick=\{\(\) => envoyer\(false\)\}/, 'importer ne se propose qu\'après la vérification');
    assert.match(rendu, /onClick=\{\(\) => envoyer\(true\)\}/);
    assert.match(C, /setVerif\(null\);\s*\}/, 'changer une colonne oblige à revérifier');
    const texte = rendu.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    assert.doesNotMatch(texte, /—/, 'pas de tiret cadratin dans l\'interface (commit 5bc392e4)');
    for (const [page, type] of [['pages/Stagiaires.jsx', 'stagiaires'], ['pages/Entreprises.jsx', 'entreprises']]) {
        const P = lireUi(page);
        assert.match(P, /onClick=\{\(\) => setImporter\(true\)\}><Icon name="upload" size=\{15\} \/> Importer<\/button>/, page);
        assert.match(P, new RegExp(`<ImportCsv type="${type}" onClose=\\{\\(\\) => setImporter\\(false\\)\\}`), page);
    }
});
