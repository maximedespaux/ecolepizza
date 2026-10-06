/**
 * DÉPOSER UN DOCUMENT REMIS À L'ENTREPRISE — relevé le 2026-09-28 sur LA CUISINE DE JULIEN : « le
 * document facultatif AGEFICE, remis à l'entreprise dans son espace : l'option de joindre un
 * document n'est pas disponible ».
 *
 * TROIS DÉFAUTS, constatés en production le même jour (lecture seule) :
 *   · LE PANNEAU « Documents remis » DE LA FICHE STAGIAIRE ne listait que les remises ACTIVES du
 *     parcours du dossier. Or le stagiaire arrivé par une entreprise suit la section « À l'arrivée via
 *     une entreprise », qui REMPLACE ce parcours : l'AGEFICE, qui n'est que là, s'affichait dans son
 *     parcours (« Facultative · REMISE »), et le panneau n'apparaissait même pas. Nulle part où déposer ;
 *   · LA FICHE ENTREPRISE comptait une remise comme un document GÉNÉRÉ (il n'en existe jamais), et une
 *     étape « entreprise seulement » comme ne concernant personne : « Aucun stagiaire concerné · Sans
 *     objet », sans aucun geste ;
 *   · LE BOUTON DE L'ÉTAPE, sur la fiche stagiaire, cherchait un MODÈLE portant le slug « remise:… »
 *     et répondait « Modèle introuvable pour cette étape ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : colonnes présentes, réponses par motif, requêtes capturées ───────────────────
let colonnes = new Set();
let reponses = [];
let requetes = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            if (/information_schema\.columns/.test(sql)) return [colonnes.has(`${params[0]}.${params[1]}`) ? [{ 1: 1 }] : []];
            const r = reponses.find(([motif]) => motif.test(sql));
            return r ? (typeof r[1] === 'function' ? r[1](sql, params) : r[1]) : [[]];
        },
    }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const remise = require('../controllers/remise.controller.js');
const { compteRemiseGroupe } = require('../lib/parcours.js');

const AVEC = ['remise_type.destinataire', 'company.user_id', 'remise_document.sans_objet'];
const lireApi = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
/* Le corps d'une fonction, jusqu'à la suivante (indentation du composant ou du module). */
const fonction = (src, debut, fin = '\n  }\n') => { const i = src.indexOf(debut); assert.ok(i >= 0, `${debut} introuvable`); return src.slice(i, src.indexOf(fin, i) + fin.length); };

async function appeler(fn, { user, params = {}, body = {} }) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', ...user }, params, body, query: {} }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const BUREAU = { id: 'u-bureau', role: 'SECRETARIAT' };

// Deux types au programme : l'AGEFICE, « entreprise seulement » ; le diplôme, actif au parcours du dossier.
const TYPES = [
    { remise_type_id: 'agefice', label: 'AGEFICE', actif_parcours: 0, slug_etape: 'remise:agefice' },
    { remise_type_id: 'diplome', label: 'Diplôme', actif_parcours: 1, slug_etape: 'remise:diplome' },
];
const dossier = ({ entreprise = 'c1', section = '["convention","remise:agefice"]' } = {}) => {
    colonnes = new Set(AVEC); requetes = [];
    reponses = [
        [/JOIN remise_type rt ON rt\.id = ps\.remise_id/, () => [TYPES.map((t) => ({
            ...t, code: t.remise_type_id, consigne: null, destinataire: 'ENTREPRISE', company_id: entreprise, entreprise: 'LA CUISINE DE JULIEN',
            representant: 'u-rep', remise_id: null, statut: null, sans_objet: 0, program_id: 'p1',
        }))]],
        [/SELECT company_steps FROM training_program/, [[{ company_steps: section }]]],
    ];
};

test('LES REMISES D\'UN DOSSIER se lisent dans SON parcours : la section entreprise quand il en relève', async () => {
    const conn = faux.promise();
    // Arrivé par une entreprise, formation AVEC section : la section fait foi — l'AGEFICE y est, le diplôme non.
    dossier();
    let liste = await remise.remisesDuDossier(conn, 'o1', 'e1');
    assert.deepStrictEqual(liste.map((r) => r.remise_type_id), ['agefice'],
        'l\'AGEFICE « entreprise seulement » est due ; le diplôme, absent de sa section, ne l\'est pas');
    assert.ok(liste.every((r) => !('actif_parcours' in r) && !('slug_etape' in r) && !('program_id' in r)),
        'les colonnes de tri ne sortent pas');
    const q = requetes.find((r) => /JOIN remise_type rt ON rt\.id = ps\.remise_id/.test(r.sql));
    assert.doesNotMatch(q.sql, /ps\.active = 1/, 'on ne filtre plus sur le seul parcours du dossier');

    // Formation SANS section : le parcours du dossier, ses étapes actives — comme avant.
    dossier({ section: null });
    liste = await remise.remisesDuDossier(conn, 'o1', 'e1');
    assert.deepStrictEqual(liste.map((r) => r.remise_type_id), ['diplome']);

    // Stagiaire inscrit SEUL : son parcours est celui du dossier ; la section n'est même pas lue.
    dossier({ entreprise: null });
    liste = await remise.remisesDuDossier(conn, 'o1', 'e1');
    assert.deepStrictEqual(liste.map((r) => r.remise_type_id), ['diplome']);
    assert.ok(!requetes.some((r) => /company_steps/.test(r.sql)));
});

test('LE GROUPE : une ligne par dossier de l\'entreprise dans la session, pour le bureau seulement', async () => {
    for (const intrus of [{ id: 'u-rep', role: 'ENTREPRISE' }, { id: 'u-stag', role: 'STAGIAIRE' }]) {
        dossier();
        const r = await appeler(remise.remisesDuGroupe, { user: intrus, params: { companyId: 'c1', sessionId: 's1' } });
        assert.strictEqual(r.code, 403, `${intrus.role} : on y lit les noms et les fichiers de chaque dossier`);
        assert.ok(!requetes.some((x) => /FROM enrollment e JOIN learner l/.test(x.sql)));
    }
    dossier();
    reponses.push([/FROM enrollment e JOIN learner l ON l\.id = e\.learner_id\s+WHERE e\.company_id = \?/,
        [[{ enrollment_id: 'e1', learner_id: 'l1', first_name: 'Julien', last_name: 'AZAIS' }]]]);
    const r = await appeler(remise.remisesDuGroupe, { user: BUREAU, params: { companyId: 'c1', sessionId: 's1' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.corps.data.length, 1);
    assert.deepStrictEqual(r.corps.data[0].remises.map((x) => x.remise_type_id), ['agefice'], 'les MÊMES remises que la fiche du stagiaire');
    const q = requetes.find((x) => /WHERE e\.company_id = \?/.test(x.sql));
    assert.deepStrictEqual(q.params, ['c1', 's1', 'o1'], 'bornée à l\'organisme');
    assert.match(lireApi('routes/remise.routes.js'), /router\.get\('\/groupe\/:companyId\/:sessionId', remisesDuGroupe\);/);
});

test('L\'ÉTAT D\'UNE REMISE POUR UN GROUPE vient des remises, pas de documents générés', () => {
    const lignes = [
        { enrollment_id: 'e1', statut: 'RECUE', sans_objet: 0 },
        { enrollment_id: 'e2', statut: 'REMISE', sans_objet: 0 },
        { enrollment_id: 'e4', statut: 'ATTENDUE', sans_objet: 0 },
    ];
    assert.deepStrictEqual(compteRemiseGroupe(['e1', 'e2', 'e3', 'e4'], lignes),
        { total: 4, gen: 2, signed: 1, done: false, sansObjet: false }, 'déposé ≠ reçu ; rien déposé ≠ déposé');
    assert.deepStrictEqual(compteRemiseGroupe(['e1', 'e2'], [{ enrollment_id: 'e1', statut: 'RECUE' }, { enrollment_id: 'e2', statut: 'REMISE', sans_objet: 1 }]),
        { total: 1, gen: 1, signed: 1, done: true, sansObjet: false }, 'un dossier « sans objet » sort des deux côtés');
    assert.deepStrictEqual(compteRemiseGroupe(['e1'], [{ enrollment_id: 'e1', statut: null, sans_objet: 1 }]),
        { total: 0, gen: 0, signed: 0, done: true, sansObjet: true }, 'tout écarté : rien n\'est dû, l\'étape est faite');
    assert.deepStrictEqual(compteRemiseGroupe([], []), { total: 0, gen: 0, signed: 0, done: false, sansObjet: false },
        'aucun dossier : rien de fait non plus');
});

test('LA FICHE ENTREPRISE compte la remise par ses dossiers, et une étape « entreprise seulement » vise tout le groupe', () => {
    const co = lireApi('controllers/company.controller.js');
    const fn = co.slice(co.indexOf('const getCompanyParcours'), co.indexOf('\nconst ', co.indexOf('const getCompanyParcours') + 10));
    /* LA RÈGLE DE `generateGroupDocuments`, reprise : sans elle, l'AGEFICE « ne concernait personne ». */
    assert.match(fn, /const dossiersConcernes = \(s\) => \(!s\.active && intakeSet\.has\(s\.slug\)\s+\? grp\.enrollments : grp\.enrollments\.filter\(\(e\) => e\.slugs\.has\(s\.slug\)\)\);/);
    assert.match(fn, /\} else if \(s\.remise_id\) \{/);
    assert.match(fn, /const ids = dossiersConcernes\(s\)\.map\(\(e\) => e\.id\);/);
    assert.match(fn, /FROM remise_document\s+WHERE organization_id = \? AND enrollment_id IN \(\?\) AND remise_type_id = \?/);
    assert.match(fn, /const c = compteRemiseGroupe\(ids, lignes\);/);
    assert.match(fn, /const applicable = dossiersConcernes\(s\);/, 'et les documents « stagiaire » suivent la même règle');
    // À QUI : l'entreprise seulement si elle a un espace — la règle de `pourEntreprise`.
    assert.match(fn, /colonneOuNull\(conn, 'company', 'user_id'\)/);
    assert.match(fn, /const remiseEntreprise = !!remise && s\.destinataire === 'ENTREPRISE' && !!company\.user_id;/);
    assert.match(fn, /remise: !!remise, remise_id: s\.remise_id \|\| null, remiseEntreprise,/);
});

test('LE PARCOURS propose « Déposer le document » sur une remise — fiche stagiaire comme fiche entreprise', () => {
    const p = lireUi('components/EnrollmentParcours.jsx');
    const possible = fonction(p, 'function importPossible', '\n}\n');
    assert.match(possible, /if \(s\.remise\) return etatDe\(s\) !== "SANS_OBJET";/,
        'une remise, même vue depuis l\'entreprise ; jamais une remise sans objet');
    assert.ok(possible.indexOf('if (s.remise)') < possible.indexOf('return !(isGroup(s) && !s.company_level);'),
        'la remise passe AVANT la règle des étapes « stagiaire » du groupe');
    assert.match(p, /if \(isGroup\(s\) && s\.remise\) return s\.total \? `\$\{s\.signed\}\/\$\{s\.total\} réception\(s\) confirmée\(s\)` : "Sans objet pour ce groupe";/);
    assert.match(p, /return `\$\{s\.gen\}\/\$\{s\.total\} déposé\(s\) · \$\{s\.signed\}\/\$\{s\.total\} réception\(s\) confirmée\(s\) \$\{qui\}\.`;/);
});

test('LA FICHE STAGIAIRE dépose la remise par sa route, AVANT de chercher un modèle', () => {
    const page = lireUi('pages/StagiaireDetail.jsx');
    const envoi = page.slice(page.indexOf('async function envoyerImport'), page.indexOf('function prepareStep'));
    const branche = envoi.indexOf('if (step.remise) {');
    assert.ok(branche > 0 && branche < envoi.indexOf('const tpl = templates.find('),
        'sans cela : « Modèle introuvable pour cette étape »');
    assert.match(envoi, /await deposerRemise\(curEnrId, step\.remise_id, await reduireSiImage\(file, PROFILS\.piece\)\);/);
    // Le panneau prévient le parcours : l'étape change d'état avec le dépôt, sans attendre.
    assert.match(page, /<RemisesReview enrollmentId=\{curEnrId\} refresh=\{parcoursRefresh\} onChange=\{\(\) => setParcoursRefresh\(\(n\) => n \+ 1\)\} \/>/);
    const revue = lireUi('components/RemisesReview.jsx');
    assert.strictEqual((revue.match(/load\(\); onChange\?\.\(\);/g) || []).length, 3, 'dépôt, retrait, sans objet');
});

test('LA FICHE ENTREPRISE : une ligne par stagiaire, et l\'étape ne dépose d\'un geste que s\'il n\'y en a qu\'un', () => {
    const page = lireUi('pages/EntrepriseDetail.jsx');
    /* Une remise → gestesRemise ; une étape « stagiaire » (ni groupe) mène à la fiche stagiaire
       (2026-10-06, gestesStagiaire) ; sinon les documents de groupe. */
    assert.match(fonction(page, 'function gestesEtapeGroupe'), /if \(s\.remise\) return gestesRemise\(s\);\s+if \(!s\.company_level\) return gestesStagiaire\(s\);/);
    const lignes = fonction(page, 'function gestesRemise');
    assert.match(lignes, /\{!r\.sans_objet && \(/, 'rien à déposer sur une remise écartée');
    assert.match(lignes, /onClick=\{\(\) => demanderDepotRemise\(d, r\)\}/);

    const demander = fonction(page, 'function demanderImportGroupe');
    assert.match(demander, /const dues = lignesRemise\(step\.remise_id\)\.filter\(\(\{ r \}\) => !r\.sans_objet\);/);
    assert.match(demander, /if \(dues\.length > 1\) \{/, 'plusieurs stagiaires : l\'étape ne devine pas pour qui');
    assert.match(demander, /demanderDepotRemise\(dues\[0\]\.d, dues\[0\]\.r\);/);

    // Un dépôt sur une remise déjà reçue annule l'accusé : on le dit AVANT.
    assert.match(fonction(page, 'function demanderDepotRemise'), /if \(r\.statut === "RECUE" && !window\.confirm\(/);

    const envoi = fonction(page, 'async function envoyerImportGroupe');
    assert.ok(envoi.indexOf('if (cible.remise) {') < envoi.indexOf('const refus = refusDocumentRecu(file);'),
        'une remise ne passe pas par la vérification des documents reçus (formats différents) ni par une préparation');
    assert.match(envoi, /await deposerRemise\(cible\.enrollmentId, cible\.remiseTypeId, await reduireSiImage\(file, PROFILS\.piece\)\);/);
    assert.match(page, /getRemisesGroupe\(id, viewSessionId\)\.then\(\(r\) => setRemisesGroupe\(r\.data \|\| \[\]\)\)/);
});
