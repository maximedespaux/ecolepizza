/**
 * À QUI UN DOCUMENT EST REMIS, ET CE QUI COMPTE DANS L'AVANCEMENT — migration 188, demandée le
 * 2026-09-28 : « dans Modèles de documents, pour les Documents remis, choisir qui les reçoit — le
 * stagiaire, ou l'entreprise dans son espace — et dans le parcours documentaire, une option
 * facultatif : facultative, l'étape ne compte pas dans la complétion ».
 *
 * DEUX RÈGLES, et chacune a un piège :
 *
 *   · LE DESTINATAIRE. Une remise adressée à l'entreprise va dans l'espace de l'entreprise, et c'est
 *     ce compte-là qui en accuse réception — plus le stagiaire. Mais un stagiaire inscrit SANS
 *     entreprise, ou dont l'entreprise n'a PAS D'ESPACE (aucun compte de représentant), la reçoit
 *     lui-même : sinon personne ne pourrait l'accuser, et l'étape resterait ouverte pour toujours —
 *     le bureau ne le peut pas à sa place, c'est tout le propos de la 160.
 *     Et le bureau se NOMME désormais : on testait « ni stagiaire ni intervenant », si bien qu'un
 *     compte ENTREPRISE passait pour du personnel et aurait lu les remises de n'importe quel dossier.
 *
 *   · LE FACULTATIF. Une étape facultative reste visible et faisable, mais n'entre dans AUCUN des
 *     deux côtés de la fraction — faite ou non —, n'est jamais « la prochaine étape », et ne ferme
 *     aucun point d'accès. L'exiger au point d'accès la rendrait obligatoire par la bande.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : colonnes présentes, réponses par motif, requêtes capturées ───────────────────
let colonnes = new Set();
let reponses = [];
let requetes = [];
const repondre = (sql, params) => {
    if (/information_schema\.columns/.test(sql)) return [colonnes.has(`${params[0]}.${params[1]}`) ? [{ 1: 1 }] : []];
    const r = reponses.find(([motif]) => motif.test(sql));
    return r ? (typeof r[1] === 'function' ? r[1](sql, params) : r[1]) : [[]];
};
const faux = {
    promise: () => ({ query: async (sql, params) => { requetes.push({ sql, params }); return repondre(sql, params); } }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const remise = require('../controllers/remise.controller.js');
const { saveFormationSteps } = require('../controllers/formationProgram.controller.js');
const { computeDocParcours } = require('../lib/parcours.js');
const { exigencesDossier, exigencesEntreprise } = require('../lib/pointDeRupture.js');
const { encryptBytes } = require('../lib/crypto.js');

const scenario = ({ cols = [], rep = [] } = {}) => { colonnes = new Set(cols); reponses = rep; requetes = []; };
const AVEC_188 = ['remise_type.destinataire', 'program_step.facultatif', 'company.user_id'];
const AVANT_188 = ['company.user_id'];

async function appeler(fn, { user, params = {}, body = {} }) {
    let code = 200; let corps = null; const entetes = {};
    const res = {
        status(c) { code = c; return this; },
        json(b) { corps = b; return this; },
        setHeader(k, v) { entetes[k] = v; },
        send(b) { corps = b; return this; },
    };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { organization_id: 'o1', ...user }, params, body, query: {}, headers: {}, ip: '127.0.0.1' }, res); }
    finally { console.error = erreurs; }
    return { code, corps, entetes };
}

const STAGIAIRE = { id: 'u-stag', role: 'STAGIAIRE' };
const REPRESENTANT = { id: 'u-rep', role: 'ENTREPRISE' };
const AUTRE_ENTREPRISE = { id: 'u-autre', role: 'ENTREPRISE' };
const BUREAU = { id: 'u-bureau', role: 'SECRETARIAT' };

/* La ligne telle que la base la rendrait À LA REQUÊTE POSÉE : sans la colonne, le SQL demande
   « 'STAGIAIRE' » ou « NULL », et c'est ce qui revient — la sonde est éprouvée avec le reste. */
const ligneSelon = (sql, { destinataire = 'STAGIAIRE', representant = null, ...reste }) => ({
    ...reste,
    destinataire: /rt\.destinataire AS destinataire/.test(sql) ? destinataire : 'STAGIAIRE',
    representant: /c\.user_id AS representant/.test(sql) ? representant : null,
});

// ── L'ACCUSÉ DE RÉCEPTION : au destinataire EFFECTIF, et à lui seul ─────────────────────────────
const accuserAvec = (cols, remiseLigne) => scenario({ cols, rep: [
    [/FROM remise_document r\s+JOIN enrollment e/, (sql) => [[ligneSelon(sql, { id: 'rd1', statut: 'REMISE', user_id: 'u-stag', n: 1, ...remiseLigne })]]],
] });
const aEcritLAccuse = () => requetes.some((q) => /UPDATE remise_document SET statut = 'RECUE'/.test(q.sql));

test('ADRESSÉE À L\'ENTREPRISE : c\'est son compte qui accuse réception, plus le stagiaire', async () => {
    const ligne = { destinataire: 'ENTREPRISE', company_id: 'c1', representant: 'u-rep' };

    accuserAvec(AVEC_188, ligne);
    let r = await appeler(remise.accuser, { user: STAGIAIRE, params: { id: 'rd1' } });
    assert.strictEqual(r.code, 403, 'le stagiaire ne signe pas l\'accusé de son entreprise');
    assert.match(r.corps.message, /remis à l'entreprise/, 'et le refus dit où la chose se fait');
    assert.ok(!aEcritLAccuse());

    accuserAvec(AVEC_188, ligne);
    r = await appeler(remise.accuser, { user: REPRESENTANT, params: { id: 'rd1' } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.ok(aEcritLAccuse(), 'le représentant accuse réception');

    // Le bureau, lui, ne signe toujours à la place de personne (migration 160).
    accuserAvec(AVEC_188, ligne);
    r = await appeler(remise.accuser, { user: { id: 'u-admin', role: 'SUPER_ADMIN' }, params: { id: 'rd1' } });
    assert.strictEqual(r.code, 403);
    assert.ok(!aEcritLAccuse());
});

test('SANS ENTREPRISE, OU ENTREPRISE SANS ESPACE : le stagiaire la reçoit lui-même', async () => {
    /* Sans ce repli, personne ne pourrait accuser réception : l'étape resterait ouverte à vie, et le
       dossier incomplet sans qu'aucun geste puisse le compléter. */
    for (const [cas, ligne] of [
        ['inscrit sans entreprise', { destinataire: 'ENTREPRISE', company_id: null, representant: null }],
        ['entreprise sans compte de représentant', { destinataire: 'ENTREPRISE', company_id: 'c1', representant: null }],
    ]) {
        accuserAvec(AVEC_188, ligne);
        const r = await appeler(remise.accuser, { user: STAGIAIRE, params: { id: 'rd1' } });
        assert.strictEqual(r.code, 200, `${cas} : ${JSON.stringify(r.corps)}`);
        assert.ok(aEcritLAccuse(), cas);
    }
    // Adressée au STAGIAIRE : le représentant de son entreprise n'y peut rien.
    accuserAvec(AVEC_188, { destinataire: 'STAGIAIRE', company_id: 'c1', representant: 'u-rep' });
    const r = await appeler(remise.accuser, { user: REPRESENTANT, params: { id: 'rd1' } });
    assert.strictEqual(r.code, 403);
    assert.match(r.corps.message, /stagiaire lui-même/);
});

test('AVANT LA 188, tout va au stagiaire, comme avant', async () => {
    // La sonde écarte la colonne : le SQL demande « 'STAGIAIRE' », et c'est au stagiaire d'accuser.
    accuserAvec(AVANT_188, { destinataire: 'ENTREPRISE', company_id: 'c1', representant: 'u-rep' });
    const r = await appeler(remise.accuser, { user: STAGIAIRE, params: { id: 'rd1' } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.ok(requetes.some((q) => /'STAGIAIRE' AS destinataire/.test(q.sql)), 'la requête ne demande pas la colonne absente');
});

// ── LES FICHIERS : le bureau, ou le destinataire — et un compte ENTREPRISE n'est pas le bureau ────
const OCTETS = Buffer.from('%PDF-1.4 remise');
const fichierAvec = (cols, ligne) => scenario({ cols, rep: [
    [/FROM remise_fichier rf\s+JOIN remise_document r/, (sql) => [[ligneSelon(sql, {
        mime: 'application/pdf', bytes: encryptBytes(OCTETS), nom: 'attestation.pdf', organization_id: 'o1', user_id: 'u-stag', ...ligne,
    })]]],
] });

test('UN COMPTE ENTREPRISE N\'EST PAS LE BUREAU : il ne lit que ce qui lui est adressé', async () => {
    /* LE DÉFAUT, trouvé en écrivant la 188 : `staff = role !== 'STAGIAIRE' && role !== 'INTERVENANT'`.
       Un représentant d'entreprise passait pour du personnel, et ouvrait le fichier remis à n'importe
       quel stagiaire de l'organisme — un diplôme, une attestation nominative. */
    fichierAvec(AVEC_188, { destinataire: 'STAGIAIRE', company_id: 'c9', representant: 'u-autre' });
    let r = await appeler(remise.servirFichier, { user: { id: 'u-intrus', role: 'ENTREPRISE' }, params: { id: 'f1' } });
    assert.strictEqual(r.code, 403, 'un représentant quelconque n\'est pas du personnel');

    // Adressée à l'entreprise : SON représentant la lit, le stagiaire non, un autre représentant non.
    const ligne = { destinataire: 'ENTREPRISE', company_id: 'c1', representant: 'u-rep' };
    fichierAvec(AVEC_188, ligne);
    r = await appeler(remise.servirFichier, { user: REPRESENTANT, params: { id: 'f1' } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(Buffer.from(r.corps), OCTETS, 'les octets, déchiffrés');
    assert.strictEqual(r.entetes['Cache-Control'], 'no-store, private');
    fichierAvec(AVEC_188, ligne);
    assert.strictEqual((await appeler(remise.servirFichier, { user: STAGIAIRE, params: { id: 'f1' } })).code, 403);
    fichierAvec(AVEC_188, ligne);
    assert.strictEqual((await appeler(remise.servirFichier, { user: AUTRE_ENTREPRISE, params: { id: 'f1' } })).code, 403);

    // Le bureau lit tout ; et sans espace d'entreprise, le fichier revient au stagiaire.
    fichierAvec(AVEC_188, ligne);
    assert.strictEqual((await appeler(remise.servirFichier, { user: BUREAU, params: { id: 'f1' } })).code, 200);
    fichierAvec(AVEC_188, { ...ligne, representant: null });
    assert.strictEqual((await appeler(remise.servirFichier, { user: STAGIAIRE, params: { id: 'f1' } })).code, 200);
});

test('le bureau est une LISTE, pas « ni stagiaire ni intervenant »', () => {
    assert.deepStrictEqual(remise.ROLES_BUREAU, ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR']);
    assert.ok(!remise.ROLES_BUREAU.includes('ENTREPRISE'));
    const src = fs.readFileSync(path.join(__dirname, '../controllers/remise.controller.js'), 'utf8');
    assert.doesNotMatch(src, /role !== 'STAGIAIRE' && req\.user\.role !== 'INTERVENANT'/, 'la vieille garde ne revient pas');
});

// ── LA LISTE DU DOSSIER : le stagiaire ne voit pas ce qui va à son entreprise ────────────────────
const dossierAvec = (cols, types) => scenario({ cols, rep: [
    [/FROM enrollment e JOIN learner l ON l\.id = e\.learner_id\s+WHERE e\.id = \?/, [[{ id: 'e1', organization_id: 'o1', user_id: 'u-stag' }]]],
    [/JOIN remise_type rt ON rt\.id = ps\.remise_id/, (sql) => [types.map((t) => ligneSelon(sql, {
        remise_type_id: t.id, code: t.id, label: t.id, consigne: null, remise_id: null, statut: null, sans_objet: 0,
        company_id: 'c1', entreprise: 'Pizzeria Test', actif_parcours: 1, slug_etape: `remise:${t.id}`, program_id: 'p1', ...t,
    }))]],
] });
const TYPES = [
    { id: 'diplome', destinataire: 'STAGIAIRE', representant: 'u-rep' },
    { id: 'attestation-employeur', destinataire: 'ENTREPRISE', representant: 'u-rep' },
];

test('le stagiaire ne voit pas ce qui est remis à son entreprise ; le bureau voit tout, et à qui', async () => {
    dossierAvec(AVEC_188, TYPES);
    let r = await appeler(remise.listDossier, { user: STAGIAIRE, params: { enrollmentId: 'e1' } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.corps.data.map((x) => x.remise_type_id), ['diplome']);

    dossierAvec(AVEC_188, TYPES);
    r = await appeler(remise.listDossier, { user: BUREAU, params: { enrollmentId: 'e1' } });
    assert.deepStrictEqual(r.corps.data.map((x) => [x.remise_type_id, x.pour_entreprise]), [['diplome', false], ['attestation-employeur', true]]);
    assert.ok(r.corps.data.every((x) => !('representant' in x)), 'l\'identifiant du compte du représentant ne sort pas');

    // L'entreprise SANS espace : la remise revient au stagiaire, et le bureau le lit.
    dossierAvec(AVEC_188, TYPES.map((t) => ({ ...t, representant: null })));
    r = await appeler(remise.listDossier, { user: BUREAU, params: { enrollmentId: 'e1' } });
    const att = r.corps.data.find((x) => x.remise_type_id === 'attestation-employeur');
    assert.strictEqual(att.pour_entreprise, false);
    assert.strictEqual(att.entreprise_sans_espace, true);

    // Un compte ENTREPRISE n'ouvre pas le dossier d'un stagiaire : il n'est pas le bureau.
    dossierAvec(AVEC_188, TYPES);
    r = await appeler(remise.listDossier, { user: REPRESENTANT, params: { enrollmentId: 'e1' } });
    assert.strictEqual(r.code, 403);
});

// ── L'ESPACE ENTREPRISE : ses remises, et elles seules ───────────────────────────────────────────
test('l\'espace entreprise liste ce qui a été remis À SES entreprises, déposé et non écarté', async () => {
    scenario({ cols: AVEC_188, rep: [[/SELECT id FROM company WHERE user_id = \?/, [[]]]] });
    let r = await appeler(remise.remisesDeLEntreprise, { user: REPRESENTANT });
    assert.deepStrictEqual(r.corps, { data: [] });
    assert.ok(!requetes.some((q) => /FROM remise_document r/.test(q.sql)), 'sans entreprise, rien d\'autre n\'est lu');

    scenario({ cols: [...AVEC_188, 'remise_document.sans_objet'], rep: [
        [/SELECT id FROM company WHERE user_id = \?/, [[{ id: 'c1' }]]],
        [/FROM remise_document r\s+JOIN remise_type rt/, [[{ remise_id: 'rd1', statut: 'REMISE', label: 'Attestation', first_name: 'Marie', last_name: 'Dupont' }]]],
        [/FROM remise_fichier WHERE remise_id IN/, [[{ id: 'f1', remise_id: 'rd1', nom: 'a.pdf' }]]],
    ] });
    r = await appeler(remise.remisesDeLEntreprise, { user: REPRESENTANT });
    assert.strictEqual(r.corps.data.length, 1);
    assert.deepStrictEqual(r.corps.data[0].fichiers.map((f) => f.id), ['f1']);
    const q = requetes.find((x) => /FROM remise_document r\s+JOIN remise_type rt/.test(x.sql));
    assert.deepStrictEqual(q.params, ['o1', ['c1']], 'ses entreprises seulement');
    assert.match(q.sql, /rt\.destinataire = 'ENTREPRISE'/, 'seulement ce qui est adressé à l\'entreprise');
    assert.match(q.sql, /r\.statut IN \('REMISE', 'RECUE'\)/, 'rien à recevoir avant le dépôt');
    assert.match(q.sql, /COALESCE\(r\.sans_objet, 0\) = 0/, 'ni ce que l\'école a écarté');
    assert.match(q.sql, /JOIN company c ON c\.id = e\.company_id/);

    // Avant la 188, aucune remise n'est adressée à une entreprise : liste vide, sans rien lire.
    scenario({ cols: AVANT_188 });
    r = await appeler(remise.remisesDeLEntreprise, { user: REPRESENTANT });
    assert.deepStrictEqual(r.corps, { data: [] });
    assert.strictEqual(requetes.filter((x) => !/information_schema/.test(x.sql)).length, 0);
});

test('la route vit dans l\'espace entreprise, réservée par les données', () => {
    const routes = fs.readFileSync(path.join(__dirname, '../routes/rep.routes.js'), 'utf8');
    assert.match(routes, /router\.get\('\/remises', remisesDeLEntreprise\);/);
    const client = fs.readFileSync(path.join(__dirname, '../../app/ui/api/apiClient.js'), 'utf8');
    assert.match(client, /export function getRepRemises\(\) \{\s+return request\("\/rep\/remises"\);/);
});

// ── LE TYPE DE REMISE : le destinataire s'enregistre, et ne se perd jamais en silence ───────────
test('choisir l\'entreprise sans la 188 est REFUSÉ, pas ignoré', async () => {
    /* Ignoré, le choix enverrait le document au stagiaire alors qu'on a choisi l'entreprise : un
       enregistrement qui ment. « Stagiaire » passe, c'est ce que tout le monde reçoit déjà. */
    scenario({ cols: AVANT_188 });
    let r = await appeler(remise.createType, { user: BUREAU, body: { code: 'ATT', label: 'Attestation', destinataire: 'ENTREPRISE' } });
    assert.strictEqual(r.code, 503);
    assert.match(r.corps.message, /188/);
    assert.ok(!requetes.some((q) => /INSERT INTO remise_type/.test(q.sql)));

    scenario({ cols: AVANT_188 });
    r = await appeler(remise.createType, { user: BUREAU, body: { code: 'ATT', label: 'Attestation', destinataire: 'STAGIAIRE' } });
    assert.strictEqual(r.code, 201);
    assert.doesNotMatch(requetes.find((q) => /INSERT INTO remise_type/.test(q.sql)).sql, /destinataire/);

    scenario({ cols: AVEC_188 });
    r = await appeler(remise.createType, { user: BUREAU, body: { code: 'ATT', label: 'Attestation', destinataire: 'ENTREPRISE' } });
    assert.strictEqual(r.code, 201);
    const ins = requetes.find((q) => /INSERT INTO remise_type/.test(q.sql));
    assert.match(ins.sql, /, destinataire\)/);
    assert.strictEqual(ins.params[ins.params.length - 1], 'ENTREPRISE');

    // Une valeur inconnue retombe sur le stagiaire, jamais sur une chaîne libre en base.
    scenario({ cols: AVEC_188 });
    await appeler(remise.updateType, { user: BUREAU, params: { id: 't1' }, body: { code: 'ATT', label: 'Attestation', destinataire: 'VOISIN' } });
    const maj = requetes.find((q) => /UPDATE remise_type SET/.test(q.sql));
    assert.ok(maj.params.includes('STAGIAIRE') && !maj.params.includes('VOISIN'));
});

// ── LE PARCOURS : une étape facultative ne compte pas ────────────────────────────────────────────
// Chaque étape a SON type : `matchDoc` retombe sur le type quand le modèle ne correspond pas.
const etape = (slug, extra = {}) => ({ slug, label: slug, doc_type: slug.toUpperCase(), ...extra });
const envoye = (slug) => ({ id: `d-${slug}`, type: slug.toUpperCase(), status: 'ENVOYE', template_slug: slug });

test('FACULTATIVE : ni dans la fraction, ni « prochaine étape » — faite ou non', () => {
    // a faite · b facultative, pas faite · c à faire
    let p = computeDocParcours({ steps: [etape('a'), etape('b', { facultatif: true }), etape('c')], docs: [envoye('a')] });
    assert.deepStrictEqual([p.done, p.total, p.percent], [1, 2, 50]);
    assert.strictEqual(p.currentKey, 'c', 'la prochaine étape est la prochaine DUE');
    assert.strictEqual(p.rang, 1, 'rang parmi les dues : « Étape 2/2 » au pipeline, pas « 3/2 »');
    assert.strictEqual(p.steps[1].facultatif, true, 'l\'écran le sait');
    assert.strictEqual(p.steps[1].status, 'todo', 'passée sans être faite, elle n\'est pas « faite » pour autant');

    // Faite, elle ne gonfle rien non plus : 1/2, pas 2/3.
    p = computeDocParcours({ steps: [etape('a'), etape('b', { facultatif: true }), etape('c')], docs: [envoye('a'), envoye('b')] });
    assert.deepStrictEqual([p.done, p.total, p.percent], [1, 2, 50]);
    assert.strictEqual(p.steps[1].etat, 'VALIDE', 'et elle se montre faite');

    // Tout le dû fait, une facultative en attente : 100 %, parcours terminé.
    p = computeDocParcours({ steps: [etape('a'), etape('b', { facultatif: true })], docs: [envoye('a')] });
    assert.deepStrictEqual([p.percent, p.currentKey], [100, null]);
});

test('rien de dû : 100 % ; rien du tout : 0 %, comme avant', () => {
    const p = computeDocParcours({ steps: [etape('a', { facultatif: true })] });
    assert.deepStrictEqual([p.percent, p.total, p.currentKey], [100, 0, null]);
    assert.strictEqual(computeDocParcours({ steps: [] }).percent, 0, 'un parcours vide n\'est pas un dossier complet');
    // Sans étape facultative, rien ne change : le rang est l'index, le pourcentage celui d'avant.
    const q = computeDocParcours({ steps: [etape('a'), etape('b'), etape('c')], docs: [envoye('a')] });
    assert.deepStrictEqual([q.percent, q.currentKey, q.rang, q.currentIndex], [33, 'b', 1, 1]);
});

test('le parcours dit quand une remise va à l\'entreprise — seulement si le dossier en a une AVEC un espace', () => {
    const r = (destinataire, entreprise) => computeDocParcours({
        steps: [{ slug: 'remise:r1', label: 'Attestation', doc_type: 'REMISE', remise_id: 'r1', destinataire }],
        entreprise,
    }).steps[0].remiseEntreprise;
    assert.strictEqual(r('ENTREPRISE', true), true);
    assert.strictEqual(r('ENTREPRISE', false), false, 'sans entreprise dotée d\'un espace, au stagiaire');
    assert.strictEqual(r('STAGIAIRE', true), false);
    // Et la fiche le demande sur le compte du représentant, pas sur la seule présence d'une entreprise.
    const ctrl = fs.readFileSync(path.join(__dirname, '../controllers/enrollment.controller.js'), 'utf8');
    assert.match(ctrl, /SELECT user_id FROM company WHERE id = \? AND organization_id = \?/);
    assert.match(ctrl, /computeDocParcours\(\{ steps, docs, pieces, remises, entreprise: entrepriseAvecEspace \}\)/);
});

test('UNE ÉTAPE FACULTATIVE NE FERME AUCUN POINT D\'ACCÈS — dossier comme entreprise', () => {
    const conv = { slug: 'convention', doc_type: 'CONVENTION', stagiaire_sign: 1, sort_order: 10, active: 1 };
    const droit = { slug: 'droit-image', doc_type: 'DROIT_IMAGE', stagiaire_sign: 1, sort_order: 20, active: 1 };
    assert.deepStrictEqual(exigencesDossier([conv, { ...droit, facultatif: true }], 30).map((s) => s.slug), ['convention']);
    assert.deepStrictEqual(exigencesDossier([conv, droit], 30).map((s) => s.slug), ['convention', 'droit-image']);

    // Volet entreprise : le drapeau vient du parcours de la FORMATION, pas des modèles de l'organisme.
    const parSlug = new Map([['convention', conv], ['droit-image', droit]]);
    const liste = ['convention', 'droit-image'];
    assert.deepStrictEqual(exigencesEntreprise(liste, 'droit-image', parSlug, new Set(['droit-image'])).map((s) => s.slug), ['convention']);
    assert.deepStrictEqual(exigencesEntreprise(liste, 'droit-image', parSlug).map((s) => s.slug), ['convention', 'droit-image'],
        'sans ensemble fourni, rien ne change');
});

test('LE SUIVI : une étape facultative n\'est jamais un manque, et se montre faite quand elle l\'est', async () => {
    const { stepState, manquesParFormation, dossiersDuManque } = await import('../../app/ui/lib/etapes.js');
    assert.strictEqual(stepState({ facultatif: true, status: 'A_FAIRE' }), 'skip');
    assert.strictEqual(stepState({ facultatif: true, stagiaireSign: true, status: 'ENVOYE' }), 'skip', 'en cours non plus');
    assert.strictEqual(stepState({ facultatif: true, status: 'SIGNE' }), 'done');
    assert.strictEqual(stepState({ facultatif: true, piece: true, pieceStatus: 'VALIDEE' }), 'done');
    assert.strictEqual(stepState({ facultatif: true, remise: true, remiseStatus: 'REMISE' }), 'skip');

    const dossiers = [
        { program_code: 'RS', documents: [{ type: 'LIVRET', label: 'Livret', status: 'A_FAIRE', facultatif: true }, { type: 'CONV', label: 'Convention', status: 'A_FAIRE' }] },
        { program_code: 'RS', documents: [{ type: 'LIVRET', label: 'Livret', status: 'A_FAIRE' }] },
    ];
    const m = manquesParFormation(dossiers);
    assert.deepStrictEqual(m.map((x) => [x.type, x.n]).sort(), [['CONV', 1], ['LIVRET', 1]], 'le livret facultatif du premier ne compte pas');
    /* LE FILTRE D'UNE COLONNE ramène les mêmes dossiers que son compte : un dossier où le document
       est hors décompte n'y est pas. Il ne regardait que « fait », et ramenait aussi les remises
       sans objet que le compte, lui, écartait. */
    const livret = m.find((x) => x.type === 'LIVRET');
    assert.strictEqual(dossiersDuManque(dossiers, livret).length, 1);
    assert.strictEqual(dossiersDuManque([{ program_code: 'RS', documents: [{ type: 'R', label: 'R', remise: true, sansObjet: true }] }],
        { type: 'R', code: 'RS' }).length, 0, 'ni une remise sans objet');
});

// ── L'ENREGISTREMENT DU PARCOURS ─────────────────────────────────────────────────────────────────
const parcoursAvec = (cols) => scenario({ cols, rep: [[/SELECT id FROM training_program WHERE id = \?/, [[{ id: 'p1' }]]]] });
const ecrituresFacultatif = () => requetes.filter((q) => /UPDATE program_step SET facultatif/.test(q.sql)).map((q) => q.params);

test('le parcours enregistre « facultatif » étape par étape — et DIT quand il ne le peut pas', async () => {
    const corps = { steps: [{ slug: 'livret', active: true, facultatif: true }, { slug: 'convention', active: true }] };
    parcoursAvec(AVEC_188);
    let r = await appeler(saveFormationSteps, { user: BUREAU, params: { id: 'p1' }, body: corps });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.deepStrictEqual(ecrituresFacultatif(), [[1, 'p1', 'livret'], [0, 'p1', 'convention']],
        'décocher s\'écrit aussi : une étape redevenue due ne doit pas rester facultative');
    assert.ok(!r.corps.avertissement);

    // Sans la colonne : le reste s'enregistre, et l'écran apprend que la case n'a pas tenu.
    parcoursAvec(['program_step.or_group']);
    r = await appeler(saveFormationSteps, { user: BUREAU, params: { id: 'p1' }, body: corps });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(ecrituresFacultatif(), []);
    assert.match(r.corps.avertissement, /^1 étape\(s\) cochée\(s\) « facultative »[\s\S]*migration 188/);

    // Rien de coché : rien à dire.
    parcoursAvec(['program_step.or_group']);
    r = await appeler(saveFormationSteps, { user: BUREAU, params: { id: 'p1' }, body: { steps: [{ slug: 'convention', active: true }] } });
    assert.ok(!r.corps.avertissement);
});

test('toutes les natures d\'étape portent le drapeau, lu dans CHAQUE forme de la cascade', () => {
    const src = fs.readFileSync(path.join(__dirname, '../controllers/formationProgram.controller.js'), 'utf8');
    const corps = src.slice(src.indexOf('async function formationSteps'), src.indexOf('async function enrollmentSteps'));
    // Documents, pièces, remises, QCM, feuilles d'émargement : cinq natures, cinq drapeaux.
    assert.strictEqual((corps.match(/facultatif: facultatif\(/g) || []).length, 5);
    // Les trois lectures de `program_step` le demandent : une cascade qui l'oublie en retombant perdrait la case.
    assert.strictEqual((corps.match(/FROM program_step WHERE program_id = \?/g) || []).length, 3);
    assert.strictEqual((corps.match(/\$\{fac\} FROM program_step WHERE program_id = \?/g) || []).length, 3);
    assert.match(corps, /', 0 AS facultatif'/, 'sans la colonne, rien n\'est facultatif');
});

test('le volet entreprise du point d\'accès lit les facultatives de la FORMATION', () => {
    const espace = fs.readFileSync(path.join(__dirname, '../controllers/espace.controller.js'), 'utf8');
    assert.match(espace, /FROM program_step WHERE program_id = \? AND organization_id = \? AND facultatif = 1/);
    assert.match(espace, /exigencesEntreprise\(list, breakSlug, bySlug, facultatifs\)/);
    const av = fs.readFileSync(path.join(__dirname, '../lib/avancement.js'), 'utf8');
    assert.match(av, /exigencesEntreprise\(pt\.section, pt\.entreprise, etapesOrg, facultatifs\)/);
    assert.match(av, /const signable = parc\.steps\.filter\(\(s\) => !s\.facultatif && \(s\.signable \|\| s\.quiz\)\);/,
        'un document facultatif ne compte pas non plus dans « x/y signés »');
});

// ── LES ÉCRANS ───────────────────────────────────────────────────────────────────────────────────
const ui = (rel) => fs.readFileSync(path.join(__dirname, '../../app/ui', rel), 'utf8');

test('Formations : une case « Facultatif » par jalon, envoyée pour toutes les natures', () => {
    const src = ui('pages/Formations.jsx');
    assert.match(src, /\{ slug: s\.slug, active: s\.active, applies_when: s\.applies_when \|\| null, facultatif: !!s\.facultatif \}/, 'pièces');
    assert.match(src, /: \{ slug: s\.slug, active: s\.active, facultatif: !!s\.facultatif \}\)\)/, 'et tout le reste');
    // Une case par JALON : le dossier n'en suivra qu'une variante, cocher l'une sans l'autre n'aurait pas de sens.
    // Depuis le « + OU » dans la section entreprise (2026-10-08), elle GROUPE aussi ses variantes :
    // la case y porte sur `g.steps` comme dans le parcours du dossier, plus sur une seule étape `[s]`.
    assert.match(src, /<CaseFacultatif etapes=\{g\.steps\} onToggle=\{onToggleFacultatif\} \/>/);
    assert.doesNotMatch(src, /<CaseFacultatif etapes=\{\[s\]\}/, 'la section entreprise groupe désormais ses jalons « OU »');
    assert.match(src, /el\.indeterminate = mixte/, 'un jalon à moitié coché le montre');
});

test('le dossier : la barre ne porte que le dû, la remise dit à qui elle va', () => {
    const src = ui('components/EnrollmentParcours.jsx');
    assert.match(src, /const requises = data\.steps\.filter\(\(x\) => !x\.facultatif\);/);
    assert.match(src, /const n = repartition\(requises\);/);
    assert.match(src, /const a = s\.remiseEntreprise \? "à l'entreprise" : "au stagiaire";/);
    const bureau = ui('components/RemisesReview.jsx');
    assert.match(bureau, /r\.pour_entreprise \?/);
    assert.match(bureau, /r\.entreprise_sans_espace/, 'le repli au stagiaire se dit au bureau');
});

test('l\'espace entreprise : la carte, et la confirmation demandée avant d\'engager', () => {
    const src = ui('pages/RepresentantEspace.jsx');
    assert.match(src, /getRepRemises\(\)\.then\(\(r\) => setRemises\(r\.data \|\| \[\]\)\)\.catch\(\(\) => setRemises\(\[\]\)\)/);
    assert.match(src, /if \(!window\.confirm\(`Confirmer que votre entreprise a bien reçu/);
    assert.match(src, /await accuserRemise\(r\.remise_id\);/);
    assert.match(src, /\{r\.statut === "REMISE" && \(/, 'rien à confirmer avant le dépôt, ni deux fois');
    assert.match(src, /Documents remis à votre entreprise/);
});

test('Modèles → Documents remis : le destinataire se choisit, et part au serveur', () => {
    const src = ui('components/RemiseTypes.jsx');
    assert.match(src, /destinataire/);
    assert.match(src, /L'entreprise, dans son espace entreprise/);
});

test('la migration 188 respecte les règles du dépôt', () => {
    const dir = path.join(__dirname, '../../../database/migrations');
    const aller = fs.readFileSync(path.join(dir, '188_remise_destinataire_etape_facultative.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(dir, '188_revert_remise_destinataire_etape_facultative.sql'), 'utf8');
    for (const f of [aller, retour]) assert.doesNotMatch(f, /^\s*--/m, 'commentaires en blocs /* */ seulement');
    assert.match(aller, /ALTER TABLE remise_type\s+ADD COLUMN IF NOT EXISTS destinataire varchar\(12\) NOT NULL DEFAULT 'STAGIAIRE'/);
    assert.match(aller, /ALTER TABLE program_step\s+ADD COLUMN IF NOT EXISTS facultatif tinyint\(1\) NOT NULL DEFAULT 0/);
    assert.match(retour, /DROP COLUMN IF EXISTS facultatif/);
    assert.match(retour, /DROP COLUMN IF EXISTS destinataire/);
});
