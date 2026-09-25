/**
 * L'ARCHIVE ZIP DU COFFRE, DE BOUT EN BOUT (2026-09-24) — le vrai contrôleur, la vraie écriture au fil
 * de l'eau, une base simulée.
 *
 * POURQUOI CE TEST À PART. Les pièces de l'export s'éprouvent chacune ailleurs (la place d'un
 * document, la portée, le sommaire, l'écrivain ZIP). Restait l'assemblage : les cinq sources du
 * coffre, la portée d'une session, les fichiers déchiffrés, l'archive écrite, relue, et son sommaire
 * honnête. C'est lui qu'un contrôleur recevra.
 *
 * LA BASE EST SIMULÉE AVANT TOUT CHARGEMENT : `db.promise()` rend une connexion qui répond selon la
 * requête, et `db.query()` (le journal d'audit) est capté. Rien ne peut atteindre une vraie base —
 * ce fichier tourne dans son propre processus (node --test), les contrôleurs y sont chargés APRÈS la
 * substitution. Les données reprennent la forme de production relevée le 2026-09-24.
 *
 * LA FORMATION RS7404 existe dans cette base (2026-09-25) : l'archive laisse dehors ce que son
 * parcours propose sans que l'arborescence le range — ici le livret d'accueil, un modèle du socle.
 * Sans formation, rien n'était « proposé », et cette règle n'aurait jamais été éprouvée de bout en bout.
 */
const test = require('node:test');
const assert = require('node:assert');
const { PassThrough } = require('stream');

const db = require('../config/database.js');
const auditees = [];
db.query = (sql, valeurs, rappel) => { auditees.push(valeurs); if (typeof rappel === 'function') rappel(null); };

const TREE = JSON.stringify({ folders: [{ name: '{Année}', items: [], children: [{ name: '{Semaine}', items: [], children: [{ name: '{Code}', items: [], children: [
    { name: '{Stagiaire}', per_learner: true, items: [{ type: 'model', ref: 'piece:72e9', label: "Pièce d'identité" }],
        children: [{ name: 'Évaluations', items: [{ type: 'quiz', titre: 'Évaluation Formative du Mardi', label: 'Mardi' }], children: [] }] }] }] }] }] });

const base = { year: 2026, week: 38, program_code: 'RS7404', program_title: 'Fabriquer des pizzas', debut: '2026-09-14', fin: '2026-09-18', dossier: null };
const GEN = [
    // Signé, désigné par le titre de son QCM : Évaluations.
    { ...base, doc_id: 'g1', title: 'Évaluation Formative du Mardi', type: 'QCM', status: 'SIGNE', quiz_id: 'q-rs', quiz_title: 'Évaluation Formative du Mardi',
        scope: 'LEARNER', source: 'gen', learner_id: 'l1', last_name: 'BEYNEY', first_name: 'David', enrollment_id: 'e1', session_id: 's1', signed_at: '2026-09-16 10:00' },
    // QCM envoyé, jamais rempli : NOMMÉ au sommaire, pas rendu en questionnaire vide.
    { ...base, doc_id: 'g2', title: 'Évaluation Formative du Jeudi', type: 'QCM', status: 'ENVOYE', quiz_id: 'q-jeu', quiz_title: 'Évaluation Formative du Jeudi',
        scope: 'LEARNER', source: 'gen', learner_id: 'l1', last_name: 'BEYNEY', first_name: 'David', enrollment_id: 'e1', session_id: 's1' },
    // Document envoyé sans version figée, et qui ne se rend plus : nommé, avec la raison.
    { ...base, doc_id: 'g3', title: "Livret d'accueil", type: 'LIVRET', status: 'ENVOYE', quiz_id: null, slug: 'livret-accueil',
        scope: 'LEARNER', source: 'gen', learner_id: 'l1', last_name: 'BEYNEY', first_name: 'David', enrollment_id: 'e1', session_id: 's1' },
    // Une AUTRE session : hors de l'archive.
    { ...base, doc_id: 'g4', title: 'Contrat', status: 'SIGNE', scope: 'LEARNER', source: 'gen', learner_id: 'l9', last_name: 'AUTRE', first_name: 'Session',
        enrollment_id: 'e9', session_id: 's2' },
    // Une session dont le seul document est un livret, que l'arborescence ne range pas.
    { ...base, week: 39, doc_id: 'g6', title: "Livret d'accueil", status: 'ENVOYE', slug: 'livret-accueil', scope: 'LEARNER', source: 'gen',
        learner_id: 'l8', last_name: 'SEUL', first_name: 'Livret', enrollment_id: 'e8', session_id: 's3' },
];
/* UN STAGIAIRE INSCRIT PAR UNE ENTREPRISE, et l'arborescence entreprise de production : elle ne range que
   les évaluations. Ne servent qu'au scénario qui les active. */
const GEN_ENTREPRISE = [{ ...base, doc_id: 'g5', title: 'Évaluation Formative du Mardi', type: 'QCM', status: 'SIGNE', quiz_id: 'q-rs',
    quiz_title: 'Évaluation Formative du Mardi', scope: 'LEARNER', source: 'gen', learner_id: 'l2', last_name: 'MARTIN', first_name: 'Léa',
    enrollment_id: 'e2', session_id: 's1', enr_company_id: 'co1', enr_company_name: 'LES ARCADES', signed_at: '2026-09-16 10:05' }];
const TREE_ENTREPRISE = JSON.stringify({ folders: [{ name: '{Année}', items: [], children: [{ name: '{Semaine}', items: [], children: [{ name: '{Code}', items: [],
    children: [{ name: '{Entreprise}', items: [], children: [{ name: '{Stagiaire}', per_learner: true, items: [],
        children: [{ name: 'Évaluations', items: [{ type: 'quiz', titre: 'Évaluation Formative du Mardi', label: 'Mardi' }], children: [] }] }] }] }] }] }] });
const scenario = { entreprise: false };
// Les modèles de l'organisme sont ceux du socle (aucune ligne à elle) : le livret d'accueil en est.
const PROGRAMMES = [{ id: 'p1', code: 'RS7404', title: 'Fabriquer des pizzas', company_steps: null, sort_order: 1 }];
const COMP = [{ ...base, doc_id: 'c1', title: 'Convention de formation', status: 'SIGNE', scope: 'COMPANY', source: 'gen', company_id: 'co1',
    company_name: 'LES ARCADES', last_name: 'LES ARCADES', first_name: '', slug: 'convention', session_id: 's1', signed_at: '2026-09-15 09:00' }];
const ARCH = [
    // Un PDF importé à la main : pas de dossier, rattaché par sa semaine et sa formation.
    { ...base, doc_id: 'a1', title: 'Ancien contrat', status: 'ARCHIVE', scope: 'LEARNER', source: 'archive', learner_id: null,
        last_name: 'Dupont Jean', first_name: '', ref: null, session_id: null },
    // Un document de CLASSEUR (assurance) : à part, comme à l'écran.
    { ...base, year: null, week: null, program_code: null, doc_id: 'a2', title: 'Attestation assurance', status: 'ARCHIVE', scope: 'LEARNER',
        source: 'archive', learner_id: null, last_name: null, first_name: '', ref: null, session_id: null, dossier: 'Assurances' },
];
const PIECES = [{ ...base, doc_id: 'p1', fichier_nom: 'carte-recto.jpg', sort_order: 0, piece_label: "Pièce d'identité", depot_id: 'd1', statut: 'VALIDEE',
    depose_le: '2026-09-10 08:00', learner_id: 'l1', first_name: 'David', last_name: 'BEYNEY', piece_type_id: '72e9', enrollment_id: 'e1', session_id: 's1' }];

const COLONNES = new Set(['archive_document.dossier', 'organization.archive_tree']);
const connexion = {
    async query(sql, p = []) {
        const S = String(sql);
        if (/information_schema\.columns/.test(S)) return [COLONNES.has(`${p[0]}.${p[1]}`) ? [{ 1: 1 }] : []];
        if (/FROM generated_document gd\s+JOIN learner l/.test(S)) return [scenario.entreprise ? [...GEN, ...GEN_ENTREPRISE] : GEN];
        if (/gd\.scope = 'COMPANY'/.test(S)) return [COMP];
        if (/gd\.scope = 'SESSION'/.test(S)) return [[]];
        if (/FROM archive_document ad/.test(S)) return [ARCH.map((a) => ({ ...a }))];
        if (/FROM piece_fichier pf\s+JOIN piece_depot d ON d\.id = pf\.depot_id\s+JOIN piece_type/.test(S)) return [PIECES];
        if (/FROM training_session s\s+LEFT JOIN training_program p/.test(S)) {
            return [p[0] === 's1' ? [{ id: 's1', year: 2026, week: 38, code: 'RS7404' }] : p[0] === 's3' ? [{ id: 's3', year: 2026, week: 39, code: 'RS7404' }] : []];
        }
        if (/SELECT archive_tree, company_archive_tree FROM organization/.test(S)) {
            return [[{ archive_tree: TREE, company_archive_tree: scenario.entreprise ? TREE_ENTREPRISE : null }]];
        }
        if (/SELECT \* FROM training_program WHERE organization_id = \?/.test(S)) return [PROGRAMMES];
        if (/FROM document_equivalence/.test(S)) return [[]];
        if (/SELECT mime, file FROM archive_document WHERE id = \?/.test(S)) return [[{ mime: 'application/pdf', file: Buffer.from('%PDF-1.4 importé') }]];
        if (/SELECT pf\.mime, pf\.bytes, pf\.nom FROM piece_fichier pf JOIN piece_depot d/.test(S)) {
            return [[{ mime: 'image/jpeg', bytes: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]), nom: 'carte-recto.jpg' }]];
        }
        if (/SELECT pdf FROM document_signed_pdf WHERE document_id = \?/.test(S)) {
            return [['g1', 'c1', 'g5'].includes(p[0]) ? [{ pdf: Buffer.from(`%PDF-1.4 signé ${p[0]}`).toString('base64') }] : []];
        }
        if (/SELECT \* FROM generated_document WHERE id = \?/.test(S)) return [[]]; // introuvable : ne se rend plus
        if (/SELECT id, learner_id FROM generated_document WHERE id = \? AND organization_id = \?/.test(S)) return [[{ id: p[0], learner_id: 'l1' }]];
        if (/SELECT id FROM learner WHERE id = \? AND user_id = \?/.test(S)) return [[]];
        if (/SELECT id FROM document_signature WHERE document_id = \? AND user_id = \?/.test(S)) return [[]];
        return [[]];
    },
};
db.promise = () => connexion;

const { exporterArchive } = require('../controllers/suivi.controller.js');

/** Une réponse HTTP minimale : un flux, des en-têtes, et de quoi répondre du JSON. */
function reponse() {
    const r = new PassThrough();
    const morceaux = [];
    r.on('data', (c) => morceaux.push(c));
    r.entetes = {};
    r.set = (k, v) => { r.entetes[k.toLowerCase()] = v; return r; };
    r.status = (code) => { r.code = code; return r; };
    r.json = (corps) => { r.corps = corps; r.end(); return r; };
    r.octets = () => Buffer.concat(morceaux);
    return r;
}
const requete = (query, role = 'SUPER_ADMIN') => ({ user: { id: 'u1', organization_id: 'org', role }, query, headers: {}, ip: '127.0.0.1' });

test('l\'archive d\'une session : rangée selon l\'arborescence, sans ce qu\'elle ne range pas, et un sommaire qui dit ce qui manque', async () => {
    const res = reponse();
    await exporterArchive(requete({ session: 's1' }), res);
    assert.strictEqual(res.entetes['content-type'], 'application/zip');
    assert.match(res.entetes['content-disposition'], /filename\*=UTF-8''archive%20RS7404%202026%20S38\.zip/);
    const PizZip = require('pizzip');
    const z = new PizZip(res.octets(), { checkCRC32: true });
    const noms = Object.keys(z.files).sort();
    assert.deepStrictEqual(noms, [
        "2026/S38/RS7404/BEYNEY David/Pièce d'identité.jpg",
        '2026/S38/RS7404/BEYNEY David/Évaluations/Évaluation Formative du Mardi.pdf',
        '2026/S38/RS7404/Dupont Jean/Ancien contrat.pdf',
        '2026/S38/RS7404/LES ARCADES/Convention de formation.pdf',
        '_sommaire.txt',
    ], 'la pièce garde son extension ; le QCM va dans Évaluations ; l\'import et l\'entreprise ont leur dossier ; ni l\'autre session ni le classeur');
    assert.strictEqual(z.file('2026/S38/RS7404/BEYNEY David/Évaluations/Évaluation Formative du Mardi.pdf').asText(), '%PDF-1.4 signé g1',
        'le PDF signé FIGÉ, pas un rendu du jour');
    const sommaire = z.file('_sommaire.txt').asText();
    assert.match(sommaire, /Archive Impastio — Session RS7404 — semaine 38 de 2026/);
    assert.match(sommaire, /4 document\(s\) inclus :/);
    /* LE LIVRET D'ACCUEIL est proposé par le parcours de RS7404 et l'arborescence ne le range pas : il
       reste DEHORS, par choix — nommé comme tel, et jamais rendu pour rien. Le QCM du jeudi, lui, n'est
       pas proposé (aucun QCM dans ce parcours) : il garde sa place par défaut, et manque parce qu'il
       n'est pas rempli. */
    assert.match(sommaire, /1 document\(s\) du coffre laissés hors de l'archive : l'arborescence d'archivage ne les range pas[^\r]*\r\n {2}Livret d'accueil\r\n/);
    assert.match(sommaire, /1 document\(s\) du coffre NON inclus :\r\n {2}Évaluation Formative du Jeudi — BEYNEY David : QCM envoyé, pas encore rempli/);
    assert.doesNotMatch(sommaire, /Document introuvable/, 'un document laissé dehors n\'est pas rendu');
    // L'import et la convention de l'entreprise, que l'école ne peut pas placer ici, gardent leur place par défaut, et c'est dit.
    assert.match(sommaire, /2 document\(s\) rangés par défaut[^\r]*\r\n {2}2026\/S38\/RS7404\/Dupont Jean\/Ancien contrat\.pdf\r\n {2}2026\/S38\/RS7404\/LES ARCADES\/Convention de formation\.pdf/);
    assert.match(sommaire, /Rangée selon l'arborescence commune/);
    // L'export est tracé — le vrai journal n'est pas touché, l'appel est capté.
    assert.ok(auditees.some((v) => Array.isArray(v) && v.includes('archive.export')), 'l\'export laisse sa trace au journal');
});

test('compter d\'abord : ce que l\'archive contiendrait, sans l\'écrire', async () => {
    const res = reponse();
    await exporterArchive(requete({ session: 's1', compter: '1' }), res);
    assert.deepStrictEqual(res.corps, { data: { documents: 5, nom: 'archive RS7404 2026 S38.zip', hors_arborescence: 1 } },
        'six documents du coffre concernent la session : cinq à écrire (dont un que le sommaire dira manquant), un laissé dehors');
    assert.strictEqual(res.entetes['content-type'], undefined, 'aucun octet de ZIP');
});

test('une sélection vide ou introuvable répond un message, pas une archive', async () => {
    const vide = reponse();
    await exporterArchive(requete({ annee: '1999' }), vide);
    assert.strictEqual(vide.code, 404);
    assert.match(vide.corps.message, /Aucun document dans le coffre/);
    const inconnue = reponse();
    await exporterArchive(requete({ session: 's-inconnue' }), inconnue);
    assert.strictEqual(inconnue.code, 404);
    assert.match(inconnue.corps.message, /Sélection introuvable/);
});

test('un AUDITEUR ne reçoit pas dans un ZIP ce qu\'on lui refuse un par un', async () => {
    /* La route de l'archive est celle du coffre, qui admet l'auditeur ; le téléchargement d'un
       document généré, lui, ne le sert qu'au personnel, au stagiaire ou au signataire. Relevé en
       relisant le code avant la mise en ligne : sans la garde, le ZIP lui aurait livré les PDF
       signés. Les pièces et les PDF importés, qu'il ouvre déjà dans le coffre, restent. */
    const res = reponse();
    await exporterArchive(requete({ session: 's1' }, 'AUDITEUR'), res);
    const PizZip = require('pizzip');
    const z = new PizZip(res.octets(), { checkCRC32: true });
    assert.deepStrictEqual(Object.keys(z.files).sort(), [
        "2026/S38/RS7404/BEYNEY David/Pièce d'identité.jpg",
        '2026/S38/RS7404/Dupont Jean/Ancien contrat.pdf',
        '_sommaire.txt',
    ]);
    const sommaire = z.file('_sommaire.txt').asText();
    assert.match(sommaire, /Évaluation Formative du Mardi — BEYNEY David : réservé au personnel de l'organisme/);
    assert.match(sommaire, /Convention de formation — LES ARCADES : réservé au personnel de l'organisme/);
});

test('un stagiaire inscrit par une entreprise : son dossier côté stagiaire, et la COPIE de ce que l\'arborescence entreprise range', async () => {
    /* L'arborescence entreprise de production ne range que les évaluations. Elle rangeait auparavant le
       dossier ENTIER de ce stagiaire : sous « non rangé, pas archivé », tout le reste en serait sorti.
       Son dossier est désormais côté stagiaire ; l'entreprise en reçoit une copie de ce qu'elle range. */
    scenario.entreprise = true;
    try {
        const res = reponse();
        await exporterArchive(requete({ session: 's1' }), res);
        const PizZip = require('pizzip');
        const z = new PizZip(res.octets(), { checkCRC32: true });
        const ici = '2026/S38/RS7404/MARTIN Léa/Évaluations/Évaluation Formative du Mardi.pdf';
        const copie = '2026/S38/RS7404/LES ARCADES/MARTIN Léa/Évaluations/Évaluation Formative du Mardi.pdf';
        assert.strictEqual(z.file(ici).asText(), '%PDF-1.4 signé g5');
        assert.strictEqual(z.file(copie).asText(), '%PDF-1.4 signé g5', 'la même pièce, rendue une fois, écrite deux fois');
        // Le document de l'entreprise elle-même : dans son dossier de l'arborescence entreprise.
        assert.ok(z.file('2026/S38/RS7404/LES ARCADES/Convention de formation.pdf'));
        assert.match(z.file('_sommaire.txt').asText(), /6 document\(s\) inclus, dont 1 copie\(s\) pour les entreprises :/);
    } finally {
        scenario.entreprise = false;
    }
});

test('une sélection dont tout est laissé dehors : un message qui dit pourquoi, pas une archive vide', async () => {
    for (const query of [{ session: 's3', compter: '1' }, { session: 's3' }]) {
        const res = reponse();
        await exporterArchive(requete(query), res);
        assert.strictEqual(res.code, 404);
        assert.strictEqual(res.corps.message, "Rien à archiver : le document de cette sélection n'est rangé nulle part dans l'arborescence d'archivage.");
        assert.strictEqual(res.entetes['content-type'], undefined, 'aucun octet de ZIP');
    }
});
