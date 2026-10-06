/**
 * LE COFFRE RANGÉ COMME L'ARCHIVE, LES DOCUMENTS REMIS AU COFFRE, ET DES FICHIERS AJOUTÉS AU DOSSIER
 * D'UN STAGIAIRE — demandé le 2026-09-28 : « compare Suivi Qualiopi → Archives, le parcours et
 * l'arborescence d'archivage : certains dossiers ne sont pas créés, comme Justificatifs ; et ajoute la
 * possibilité d'ajouter des fichiers au dossier du stagiaire ».
 *
 * CE QUE LA COMPARAISON A MONTRÉ (production, lecture seule, le même jour) :
 *   · L'ARBORESCENCE place, sous chaque stagiaire, un sous-dossier « Justificatifs » (la pièce
 *     « Justificatifs » et l'attestation sur l'honneur), et « AGEFICE » dans le dossier de l'entreprise ;
 *   · L'ARCHIVE ZIP la suit — « Justificatifs » y existe dès qu'un fichier l'occupe ;
 *   · L'ÉCRAN DU COFFRE l'ignorait : année, semaine, formation, stagiaire, puis une liste à plat. Aucun
 *     « Justificatifs », et rien ne disait qu'un document restait hors de l'archive ;
 *   · LES DOCUMENTS REMIS (l'AGEFICE) n'entraient pas au coffre : ni à l'écran, ni dans l'archive.
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

const suivi = require('../controllers/suivi.controller.js');
const { placesDansLArchive, rangementPourLEcran } = require('../lib/arborescenceArchive.js');
const { decryptBytes } = require('../lib/crypto.js');

const lireApi = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');

// ── L'arborescence de production (2026-09-28), réduite à ce qui compte ici ─────────────────────
const STAGIAIRE = { folders: [{ name: '{Année}', items: [], children: [{ name: '{Semaine}',
    items: [{ type: 'model', ref: 'contrat-hygiene', label: 'Contrat Hygiène' }],
    children: [{ name: '{Code}', items: [], children: [{ name: '{Stagiaire}', per_learner: true,
        items: [{ type: 'model', ref: 'piece:identite', label: "Pièce d'identité" }, { type: 'model', ref: 'contrat', label: 'Contrat' }],
        children: [{ name: 'Justificatifs', items: [{ type: 'model', ref: 'piece:justif', label: 'Justificatifs' },
            { type: 'model', ref: 'attestation-honneur', label: "Attestation sur l'honneur" }], children: [] }] }] }] }] }] };
const ENTREPRISE = { folders: [{ name: '{Année}', items: [], children: [{ name: '{Semaine}', items: [], children: [{ name: '{Code}', items: [],
    children: [{ name: '{Entreprise}', items: [{ type: 'model', ref: 'convention', label: 'Convention' }, { type: 'model', ref: 'remise:agefice', label: 'AGEFICE' }],
        children: [] }] }] }] }] };
const ARBRES = { stagiaire: STAGIAIRE, entreprise: ENTREPRISE };
// Ce que la formation propose de ranger — le livret d'accueil l'est, sans être rangé : choix de l'école.
const OFFERTS = { stagiaire: new Set(['ref:piece:identite', 'ref:piece:justif', 'ref:contrat', 'ref:attestation-honneur', 'ref:livret-accueil', 'ref:remise:agefice', 'ref:contrat-hygiene']),
    entreprise: new Set(['ref:convention']) };
const base = { year: 2026, week: 38, program_code: 'RS7404', program_title: 'Pizza', last_name: 'BEYNEY', first_name: 'David',
    learner_id: 'l1', enrollment_id: 'e1', session_id: 's1', scope: 'LEARNER', title: 'Document' };
const ranger = (doc) => rangementPourLEcran(placesDansLArchive(ARBRES, doc, new Map(), OFFERTS), doc);

test('L\'ÉCRAN RANGE COMME L\'ARCHIVE : sous-dossiers, entreprise, plus haut, hors de l\'archive', () => {
    assert.deepStrictEqual(ranger({ ...base, source: 'piece', piece_type_id: 'justif', title: 'Justificatifs (1/3)' }),
        { hors_archive: false, sous_dossiers: ['Justificatifs'], ailleurs: null }, 'LE dossier qui manquait à l\'écran');
    assert.deepStrictEqual(ranger({ ...base, source: 'gen', slug: 'attestation-honneur' }).sous_dossiers, ['Justificatifs']);
    assert.deepStrictEqual(ranger({ ...base, source: 'piece', piece_type_id: 'identite' }),
        { hors_archive: false, sous_dossiers: [], ailleurs: null }, 'à la racine du dossier du stagiaire');

    // L'AGEFICE : l'école le range chez l'entreprise, pas chez le stagiaire — c'est sa seule place.
    assert.deepStrictEqual(ranger({ ...base, source: 'remise', remise_type_id: 'agefice', enr_company_id: 'c1', enr_company_name: 'LA CUISINE DE JULIEN' }),
        { hors_archive: false, sous_dossiers: [], ailleurs: 'entreprise' });
    // Proposé par le parcours, rangé nulle part : hors de l'archive — l'écran ne le montre pas.
    assert.deepStrictEqual(ranger({ ...base, source: 'gen', slug: 'livret-accueil' }), { hors_archive: true, sous_dossiers: [], ailleurs: null });
    // Un fichier ajouté au dossier : l'arborescence ne peut pas le nommer, il va à la racine du dossier.
    assert.deepStrictEqual(ranger({ ...base, source: 'archive', title: 'Scan diplôme' }).sous_dossiers, []);
    // Le contrat d'hygiène, document de session, rangé au niveau de la semaine : plus haut.
    assert.strictEqual(ranger({ ...base, scope: 'SESSION', learner_id: null, source: 'gen', slug: 'contrat-hygiene' }).ailleurs, 'au-dessus');
    // La convention de l'entreprise, dans SON dossier : à sa racine.
    assert.deepStrictEqual(ranger({ ...base, scope: 'COMPANY', source: 'gen', slug: 'convention', company_id: 'c1', company_name: 'LA CUISINE DE JULIEN' }),
        { hors_archive: false, sous_dossiers: [], ailleurs: null });
    assert.deepStrictEqual(rangementPourLEcran([], base), { hors_archive: true, sous_dossiers: [], ailleurs: null });
});

test('UNE REMISE SE DÉSIGNE PAR SON TYPE, comme une pièce', () => {
    const { itemDesigne, clesDuDocument } = require('../lib/arborescenceArchive.js');
    assert.ok(itemDesigne({ type: 'model', ref: 'remise:agefice' }, { remise_type_id: 'agefice' }));
    assert.ok(!itemDesigne({ type: 'model', ref: 'remise:agefice' }, { remise_type_id: 'autre' }));
    assert.ok(clesDuDocument({ remise_type_id: 'agefice' }).includes('ref:remise:agefice'));
});

test('L\'ÉCRAN : les documents d\'une feuille, groupés par ce rangement', async () => {
    const { rangerDansLeDossier, dossierDeLaFeuille, extensionDuCoffre, dansLArchive } = await import('../../app/ui/lib/rangementCoffre.js');
    const d = (id, rangement) => ({ doc_id: id, rangement });
    const r = rangerDansLeDossier([
        d('racine'), d('ident', { hors_archive: false, sous_dossiers: [], ailleurs: null }),
        d('j1', { hors_archive: false, sous_dossiers: ['Justificatifs'], ailleurs: null }),
        d('eval', { hors_archive: false, sous_dossiers: ['Autres', 'Évaluations'], ailleurs: null }),
        d('j2', { hors_archive: false, sous_dossiers: ['Justificatifs'], ailleurs: null }),
        d('agefice', { hors_archive: false, sous_dossiers: [], ailleurs: 'entreprise' }),
        d('hygiene', { hors_archive: false, sous_dossiers: [], ailleurs: 'au-dessus' }),
        d('livret', { hors_archive: true, sous_dossiers: [], ailleurs: null }),
    ]);
    assert.deepStrictEqual(r.racine.map((x) => x.doc_id), ['racine', 'ident'], 'sans rangement (serveur d\'avant) : à la racine, comme avant');
    assert.deepStrictEqual(r.dossiers.map((x) => [x.nom, x.docs.map((y) => y.doc_id)]),
        [['Autres / Évaluations', ['eval']], ['Justificatifs', ['j1', 'j2']]], 'un bloc par sous-dossier, triés par nom');
    assert.deepStrictEqual([r.entreprise, r.ailleurs].map((l) => l.map((x) => x.doc_id)), [['agefice'], ['hygiene']]);
    /* « HORS DE L'ARCHIVE » N'EST PLUS UN BLOC (retiré par l'école le 2026-09-28, « pas besoin ») : ce que
       l'arborescence ne range pas n'est pas archivé, et l'écran des archives ne le montre nulle part. */
    assert.ok(!('hors' in r));
    const montres = [...r.racine, ...r.dossiers.flatMap((x) => x.docs), ...r.entreprise, ...r.ailleurs].map((x) => x.doc_id);
    assert.ok(!montres.includes('livret'), 'ni à la racine, ni ailleurs');
    assert.strictEqual(dansLArchive({ rangement: { hors_archive: true } }), false);
    assert.strictEqual(dansLArchive({ rangement: { hors_archive: false, sous_dossiers: [] } }), true);
    assert.strictEqual(dansLArchive({ doc_id: 'serveur d\'avant' }), true, 'sans rangement, rien n\'est écarté');

    assert.strictEqual(dossierDeLaFeuille([{ doc_id: 'a' }, { doc_id: 'b', enrollment_id: 'e1' }]), 'e1');
    assert.strictEqual(dossierDeLaFeuille([{ doc_id: 'vieux PDF importé' }]), null, 'une feuille faite de PDF rattachés par un nom');
    assert.strictEqual(extensionDuCoffre('image/png'), '.png');
    assert.strictEqual(extensionDuCoffre(null), '.pdf');
});

// ── Ajouter des fichiers au dossier d'un stagiaire ───────────────────────────────────────────────
const DOSSIER = [/FROM enrollment e JOIN learner l ON l\.id = e\.learner_id\s+LEFT JOIN training_session s/,
    (sql, p) => [p[0] === 'e1' ? [{ id: 'e1', learner_id: 'l1', first_name: 'David', last_name: 'BEYNEY', year: 2026, week: 38, code: 'RS7404' }] : []]];
const fichier = (originalname, mimetype, contenu = 'contenu') => ({ originalname, mimetype, buffer: Buffer.from(contenu) });
async function appeler(fn, req) {
    let code = 200; let corps = null; const entetes = {};
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; },
        set(k, v) { entetes[k] = v; return this; }, send(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { id: 'u1', organization_id: 'o1', role: 'SECRETARIAT' }, params: {}, body: {}, query: {}, headers: {}, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps, entetes };
}

test('AJOUTER AU DOSSIER : PDF ou image, rattachés au dossier par leur référence, chiffrés', async () => {
    colonnes = new Set(['archive_document.empreinte']); requetes = [];
    reponses = [DOSSIER, [/ref LIKE \? AND title = \?/, (sql, p) => [p[2] === 'Déjà là' ? [{ oui: 1 }] : []]]];
    const r = await appeler(suivi.ajouterAuDossier, { params: { enrollmentId: 'e1' }, files: [
        fichier('Scan diplôme.pdf', 'application/pdf', '%PDF-1.4 diplôme'),
        fichier('photo contrat.jpg', 'image/jpeg'),
        fichier('page.html', 'text/html', '<script>alert(1)</script>'),
        fichier('vide.pdf', 'application/pdf', ''),
        fichier('Déjà là.pdf', 'application/pdf'),
    ] });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    assert.deepStrictEqual({ ...r.corps.data }, { imported: 2, skipped: 1, noms_refuses: ['page.html'], doublons: 1, noms_doublons: ['Déjà là'], vides: 1, noms_vides: ['vide'] });
    const ecrits = requetes.filter((q) => /INSERT INTO archive_document/.test(q.sql));
    assert.strictEqual(ecrits.length, 2);
    const [pdf, photo] = ecrits.map((q) => q.params);
    assert.match(pdf[1], /^fichier:e1:[0-9a-f]{12}$/, 'la référence désigne le DOSSIER, et tient dans 80 caractères');
    assert.notStrictEqual(pdf[1], photo[1], 'une référence par fichier : la clé unique (organisme, référence) le demande');
    assert.deepStrictEqual(pdf.slice(2, 8), [2026, 38, 'RS7404', 'BEYNEY David', 'Scan diplôme', 'application/pdf'],
        'année, semaine, formation et nom recopiés de la session ; le titre sans extension');
    assert.strictEqual(photo[7], 'image/jpeg', 'le type vient de la LISTE');
    assert.strictEqual(decryptBytes(pdf[8]).toString(), '%PDF-1.4 diplôme', 'chiffré au repos, et rouvrable');
    assert.ok(requetes.some((q) => /ref LIKE \?/.test(q.sql) && q.params[1] === 'fichier:e1:%'), 'le doublon se cherche DANS ce dossier');

    reponses = [DOSSIER]; requetes = [];
    const inconnu = await appeler(suivi.ajouterAuDossier, { params: { enrollmentId: 'e-autre' }, files: [fichier('a.pdf', 'application/pdf')] });
    assert.strictEqual(inconnu.code, 404, 'un dossier d\'un autre organisme est introuvable');
    assert.ok(!requetes.some((q) => /INSERT/.test(q.sql)));
    const rien = await appeler(suivi.ajouterAuDossier, { params: { enrollmentId: 'e1' }, files: [] });
    assert.strictEqual(rien.code, 422);
});

test('SERVIR : une image ajoutée garde son type — tout le reste repart en PDF', async () => {
    const { aRanger } = require('../lib/coffre.js');
    for (const [mime, attendu] of [['image/png', 'image/png'], ['text/html', 'application/pdf'], [null, 'application/pdf']]) {
        reponses = [[/SELECT title, mime, file FROM archive_document/, [[{ title: 'Scan', mime, file: aRanger(Buffer.from('octets')).file }]]]];
        const r = await appeler(suivi.getArchiveFile, { params: { id: 'a1' } });
        assert.strictEqual(r.entetes['Content-Type'], attendu, `${mime} : le type servi vient d'une liste, jamais de la base`);
        assert.strictEqual(r.entetes['X-Content-Type-Options'], 'nosniff');
    }
});

test('LE COFFRE : les documents remis entrent, et un fichier ajouté retrouve son dossier', async () => {
    const src = lireApi('controllers/suivi.controller.js');
    // Un fichier ajouté au dossier se joint à SON dossier par sa référence, comme une feuille d'émargement.
    assert.match(src, /LEFT JOIN enrollment e ON \(ad\.ref LIKE 'emarg:%' OR ad\.ref LIKE 'fichier:%'\)\s+AND e\.id = SUBSTRING_INDEX\(SUBSTRING_INDEX\(ad\.ref, ':', 2\), ':', -1\)/);
    // Les documents remis : une ligne par fichier, le type de remise pour les ranger.
    colonnes = new Set(); requetes = [];
    reponses = [[/FROM remise_fichier rf\s+JOIN remise_document r/, [[
        { doc_id: 'rf1', fichier_nom: 'agefice.pdf', remise_id: 'r1', remise_label: 'AGEFICE', statut: 'RECUE', remise_type_id: 'agefice',
            remis_le: '2026-09-20 10:00', accuse_le: '2026-09-21 09:00', learner_id: 'l1', enrollment_id: 'e1', session_id: 's1' },
        { doc_id: 'rf2', remise_id: 'r2', remise_label: 'Diplôme', statut: 'REMISE', remise_type_id: 'diplome' },
        { doc_id: 'rf3', remise_id: 'r2', remise_label: 'Diplôme', statut: 'REMISE', remise_type_id: 'diplome' },
    ]]]];
    const c = await suivi.lignesDuCoffre(faux.promise(), 'o1');
    assert.deepStrictEqual(c.remises.map((x) => [x.doc_id, x.title, x.source, x.remise_type_id]),
        [['rf1', 'AGEFICE', 'remise', 'agefice'], ['rf2', 'Diplôme (1/2)', 'remise', 'diplome'], ['rf3', 'Diplôme (2/2)', 'remise', 'diplome']]);
    assert.deepStrictEqual([c.remises[0].sent_at, c.remises[0].signed_at], ['2026-09-20 10:00', '2026-09-21 09:00'], 'remis, puis reçu');
    // Sans la 160 : le coffre reste lisible, sans les remises.
    reponses = [[/FROM remise_fichier rf/, () => { const e = new Error('absente'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }]];
    assert.deepStrictEqual((await suivi.lignesDuCoffre(faux.promise(), 'o1')).remises, []);
});

test('LA ROUTE, et l\'écran qui l\'appelle', () => {
    assert.match(lireApi('routes/suivi.routes.js'),
        /router\.post\('\/archives\/dossier\/:enrollmentId', authorizeRoles\(\.\.\.ADMIN_ROLES\), limiteDuLot, upload\.array\('files', 50\), ajouterAuDossier\);/,
        'mêmes droits et même plafond par fichier que l\'import');
    const page = lireUi('pages/Suivi.jsx');
    assert.match(page, /<DocsDuDossier docs=\{L\.docs\} \/>/, 'chaque feuille range ses documents comme l\'archive');
    // Seulement ce qui est archivé : l'arbre, ses comptes et le total du titre partent des MÊMES lignes.
    assert.match(page, /const visibles = useMemo\(\(\) => \(rows \|\| \[\]\)\.filter\(dansLArchive\), \[rows\]\);/);
    assert.match(page, /\? visibles\.filter\(\(r\) =>[^\n]*\n\s+: visibles;/);
    assert.match(page, /<Card title=\{`Archives documentaires \(\$\{visibles\.length\}\)`\}>/);
    assert.doesNotMatch(page, /Hors de l'archive/, 'le bloc est retiré');
    assert.match(page, /\{peutModifier && !L\.company && !L\.session && \(\(\) => \{/, 'le bouton est sur le dossier d\'un STAGIAIRE');
    assert.match(page, /ajouterDans\(\{ enrollmentId, chemin, nom: L\.name \}\)/);
    assert.match(page, /await ajouterAuDossierArchives\(cible\.enrollmentId, prets\);/);
    assert.match(page, /nom: f\.name \}\)\)\);/, 'le nom d\'origine part avec une photo réduite');
    // Une pièce ou un document remis s'ouvre d'ici, mais ne s'efface que depuis le dossier.
    assert.match(page, /const duDossier = \(d\) => d\.source === "piece" \|\| d\.source === "remise";/);
    assert.match(page, /d\.source === "remise" \? window\.open\(remiseFichierUrl\(d\.doc_id\), "_blank", "noopener"\)/);
    // La suppression saute AUSSI un QCM : son résultat importé se montre, mais ne s'efface pas d'ici.
    assert.match(page, /\{peutModifier && !duDossier\(d\) && !d\.quiz_id && \(/);
    const client = lireUi('api/apiClient.js');
    assert.match(client, /for \(const \{ fichier, nom \} of fichiers\) fd\.append\("files", fichier, nom\);/);
    assert.match(client, /\/suivi\/archives\/dossier\/\$\{enrollmentId\}/);
});
