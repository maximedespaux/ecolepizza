/**
 * L'ARBORESCENCE D'ARCHIVAGE COMMUNE ET L'ARCHIVE ZIP DU COFFRE (demandées le 2026-09-24).
 *
 * LE CONSTAT. L'arborescence d'archivage se réglait formation par formation — à la main, dix fois —
 * et NE SERVAIT À RIEN : l'export ZIP qu'elle devait ranger (« étape 2 », prévue le 2026-07-10)
 * n'avait jamais été écrit. Aucune ligne de code ne la lisait, hors l'éditeur qui l'enregistrait.
 *
 * CE QUI EST FIGÉ ICI :
 *   · une arborescence pour toutes les formations ; un document qu'une formation n'a pas est
 *     simplement sauté ; un QCM s'y désigne par son TITRE (chaque formation a le sien) ;
 *   · la proposition de départ = les arborescences déjà réglées, FUSIONNÉES, conflits nommés ;
 *   · l'archive ZIP : la liste même du coffre, rangée selon l'arborescence, rien de perdu.
 *
 * Les jeux d'essai reprennent les arborescences RÉELLES de production relevées le 2026-09-24
 * (RS7404, NIV1, NIV1H) — y compris leurs défauts : un « OU » enregistré avec des membres qui ont
 * changé depuis, des QCM au libellé périmé (« … - NIVEAU I »), une étape qui n'existe plus
 * (« sys:emargement »).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const Arbo = require('../lib/arborescenceArchive.js');
const { ecrivainZip } = require('../lib/zip.js');

const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');

/* ─── Les arborescences de production (2026-09-24), réduites à ce qui compte ────────────────── */
const d = (name, items = [], children = [], per = false) => ({ name, per_learner: per, items, children });
const ref = (r, label = r) => ({ type: 'model', ref: r, label });
const qcm = (id, label) => ({ type: 'quiz', ref: `quiz:${id}`, label });
const ou = (group, members, label) => ({ type: 'model', group, members, label });
const squelette = (stagiaire) => ({ folders: [d('{Année}', [], [d('{Semaine}', [], [d('{Code}', [], [stagiaire])])])] });
const DEVIS = 'org-6498819d'; const CONTRAT = 'org-7a8d54bc';

const RS7404 = squelette(d('{Stagiaire}', [ref('piece:72e9', "Pièce d'identité"), ref('contrat', 'Contrat de formation'), ref('invitation'),
    ref('devis-rs7404', 'Devis RS7404'), ref('droit-image', "Droit à l'image"), qcm('94be', 'Test de positionnement'), ref('esheet-nouvelle-feuillehjb', "Feuille d'émargement")],
[d('Évaluations', [qcm('b85d', 'Évaluation Formative du Mardi'), qcm('7af3', 'Évaluation de satisfaction')])], true));
const NIV1H = squelette(d('{Stagiaire}', [ou(DEVIS, ['devis-particulier', 'devis-professionnel'], 'Devis particulier / Devis professionnel'),
    ou(CONTRAT, ['contrat', 'convention'], 'Contrat / Convention de formation'), ref('invitation'), qcm('5c35', 'Test de positionnement'),
    ref('attestation-hygiene', 'Attestation Hygiène')],
[d('Évaluations', [qcm('b804', 'Évaluation Formative du Mardi'), qcm('8e66', 'Évaluation formative Hygiène')])], true));
const NIV1 = squelette(d('{Stagiaire}', [ou(CONTRAT, ['contrat', 'convention'], 'Contrat de formation / Convention de formation'),
    ref('sys:emargement', "Feuille d'émargement (stagiaire + formateur(s) + intervenant(s))"), ou(DEVIS, ['devis-particulier', 'devis-entreprise'], 'Devis particulier / Devis entreprise')],
[d('Évaluations', [qcm('f214', 'Évaluation Formative du Mardi - NIVEAU I')])], true));

const TITRES = new Map([['94be', 'Test de positionnement'], ['b85d', 'Évaluation Formative du Mardi'], ['7af3', 'Évaluation de satisfaction'],
    ['5c35', 'Test de positionnement'], ['b804', 'Évaluation Formative du Mardi'], ['8e66', 'Évaluation formative Hygiène'],
    ['f214', 'Évaluation Formative du Mardi']]); // renommé depuis : le « - NIVEAU I » a disparu
const GROUPES = new Map([[DEVIS, { members: ['devis-particulier', 'devis-professionnel-copie'], label: 'Devis particulier / Devis professionnel entreprise' }],
    [CONTRAT, { members: ['contrat', 'convention'], label: 'Contrat / Convention' }]]);
const SLUGS = new Set(['piece:72e9', 'contrat', 'convention', 'invitation', 'devis-rs7404', 'droit-image', 'esheet-nouvelle-feuillehjb',
    'attestation-hygiene', 'devis-particulier', 'devis-professionnel-copie']);
const OPTS = {
    titreDuQcm: (id) => TITRES.get(id) || null,
    existe: (it) => (it.type === 'quiz' && it.titre ? true : it.group ? Arbo.slugsDe(it, GROUPES).some((s) => SLUGS.has(s)) : SLUGS.has(it.ref)),
    groupes: GROUPES,
};
const dossierNomme = (tree, ...noms) => noms.reduce((n, nom) => n && (n.children || n.folders).find((x) => x.name === nom), tree);

/* ─── La proposition : les arborescences des formations, fusionnées ──────────────────────────── */

test('la proposition fusionne les trois arborescences en UNE, au même squelette', () => {
    const { tree, conflits, retires } = Arbo.fusionnerArbres(
        [{ code: 'RS7404', tree: RS7404 }, { code: 'NIV1H', tree: NIV1H }, { code: 'NIV1', tree: NIV1 }], OPTS);
    assert.strictEqual(tree.folders.length, 1, 'un seul {Année} : deux dossiers de même nom n\'en font qu\'un');
    const stag = dossierNomme(tree, '{Année}', '{Semaine}', '{Code}', '{Stagiaire}');
    assert.ok(stag && stag.per_learner, '« un par stagiaire » gardé');
    const cles = (n) => n.items.map(Arbo.cleItem);
    /* UN QCM PAR SON TITRE — une seule entrée pour les trois « Test de positionnement », et pour les
       trois « Mardi », dont celui de NIV1 sous son titre d'AUJOURD'HUI, pas son libellé périmé. */
    assert.strictEqual(cles(stag).filter((c) => c === 'qcm:test de positionnement').length, 1);
    const evals = dossierNomme(stag, 'Évaluations');
    assert.deepStrictEqual(evals.items.map((i) => i.titre),
        ['Évaluation Formative du Mardi', 'Évaluation de satisfaction', 'Évaluation formative Hygiène']);
    assert.ok(!JSON.stringify(tree).includes('NIVEAU I'), 'plus de libellé périmé');
    /* LE « OU » ABSORBE LE MODÈLE SEUL QU'IL CONTIENT, au même endroit : RS7404 plaçait « contrat »,
       NIV1H « Contrat / Convention » — il n'en reste qu'un, le « OU ». */
    assert.ok(!cles(stag).includes('ref:contrat'));
    assert.ok(cles(stag).includes(`ou:${CONTRAT}`));
    // Un « OU » porte ses membres et son libellé d'AUJOURD'HUI.
    const devis = stag.items.find((i) => i.group === DEVIS);
    assert.deepStrictEqual(devis.members, ['devis-particulier', 'devis-professionnel-copie']);
    assert.strictEqual(devis.label, 'Devis particulier / Devis professionnel entreprise');
    // Ce qui ne désigne plus rien est RETIRÉ, et nommé.
    assert.deepStrictEqual(retires.map((r) => `${r.code}:${r.label}`), ["NIV1:Feuille d'émargement (stagiaire + formateur(s) + intervenant(s))"]);
    assert.deepStrictEqual(conflits, [], 'les trois formations rangeaient leurs documents aux mêmes places');
});

test('un document placé à deux endroits par deux formations est un CONFLIT, nommé — la première l\'emporte', () => {
    const A = squelette(d('{Stagiaire}', [ref('droit-image')], [], true));
    const B = { folders: [d('{Année}', [], [d('{Semaine}', [], [d('{Code}', [], [d('{Stagiaire}', [], [d('Autorisations', [ref('droit-image')])], true)])])])] };
    const { tree, conflits } = Arbo.fusionnerArbres([{ code: 'A', tree: A }, { code: 'B', tree: B }], OPTS);
    assert.deepStrictEqual(conflits.map((c) => [c.code, c.garde, c.ecarte]),
        [['B', '{Année} / {Semaine} / {Code} / {Stagiaire}', '{Année} / {Semaine} / {Code} / {Stagiaire} / Autorisations']]);
    const stag = dossierNomme(tree, '{Année}', '{Semaine}', '{Code}', '{Stagiaire}');
    assert.deepStrictEqual(stag.items.map(Arbo.cleItem), ['ref:droit-image']);
    assert.deepStrictEqual(dossierNomme(stag, 'Autorisations').items, [], 'le dossier reste, vide : c\'est à l\'école de trancher');
});

/* ─── La place d'un document dans l'archive ─────────────────────────────────────────────────── */

const COMMUNE = { stagiaire: Arbo.fusionnerArbres([{ code: 'RS7404', tree: RS7404 }, { code: 'NIV1H', tree: NIV1H }], OPTS).tree };
const doc = (extra) => ({ scope: 'LEARNER', year: 2026, week: 38, program_code: 'RS7404', program_title: 'Fabriquer des pizzas',
    last_name: 'BEYNEY', first_name: 'David', title: 'Document', ...extra });
/* Les places d'un document : aucune (hors de l'archive), une, ou deux (la copie de son entreprise). */
const chemins = (arbres, x, groupes = GROUPES, offerts = null) => Arbo.placesDansLArchive(arbres, x, groupes, offerts)
    .map((p) => [...p.dossiers, p.fichier].join('/'));
const chemin = (arbres, x, groupes = GROUPES, offerts = null) => {
    const c = chemins(arbres, x, groupes, offerts);
    assert.strictEqual(c.length, 1, `une place et une seule : ${JSON.stringify(c)}`);
    return c[0];
};
const place = (arbres, x, groupes = GROUPES, offerts = null) => Arbo.placesDansLArchive(arbres, x, groupes, offerts)[0].place;

test('chaque formation range SON QCM à la place de son titre', () => {
    const mardi = doc({ quiz_id: 'autre-id', quiz_title: 'Évaluation Formative du Mardi', title: 'Évaluation Formative du Mardi' });
    assert.strictEqual(chemin(COMMUNE, mardi), '2026/S38/RS7404/BEYNEY David/Évaluations/Évaluation Formative du Mardi');
    const niv1 = doc({ program_code: 'NIV1', quiz_id: 'f214', quiz_title: 'Évaluation Formative du Mardi', title: 'Mardi' });
    assert.strictEqual(chemin(COMMUNE, niv1), '2026/S38/NIV1/BEYNEY David/Évaluations/Mardi', 'NIV1 prend la même place avec SON QCM');
});

test('ce que l\'arborescence ne range pas n\'est PAS archivé — mais seulement ce que l\'école a pu placer', () => {
    /* DÉCIDÉ PAR L'ÉCOLE LE 2026-09-25, devant l'aperçu « 13 documents de RS7404 ne sont nommés nulle
       part : ils iront dans le dossier du stagiaire » : un document qu'elle ne place pas, c'est qu'elle
       n'en veut pas de copie. Jusque-là, il partait dans le dossier du stagiaire. */
    const livret = doc({ slug: 'livret-accueil', title: "Livret d'accueil" });
    const rs7404 = { stagiaire: new Set(['ref:livret-accueil', 'ref:contrat']), entreprise: new Set() };
    assert.deepStrictEqual(chemins(COMMUNE, livret, GROUPES, rs7404), [], 'proposé pour RS7404, non rangé : hors de l\'archive');
    // Ce que l'école N'A PAS PU placer n'est pas un choix : il garde sa place par défaut.
    const horsParcours = { stagiaire: new Set(['ref:contrat']), entreprise: new Set() };
    assert.strictEqual(chemin(COMMUNE, livret, GROUPES, horsParcours), "2026/S38/RS7404/BEYNEY David/Livret d'accueil", 'généré hors du parcours');
    assert.strictEqual(place(COMMUNE, livret, GROUPES, horsParcours), 'defaut');
    assert.strictEqual(chemin(COMMUNE, doc({ source: 'archive', title: 'Ancien contrat' }), GROUPES, rs7404), '2026/S38/RS7404/BEYNEY David/Ancien contrat',
        'un PDF importé n\'a ni modèle ni QCM : aucune arborescence ne peut le nommer');
    assert.strictEqual(chemins(COMMUNE, livret, GROUPES, null).length, 1, 'une formation inconnue n\'a pas de liste : rien n\'est exclu');
    // Une arborescence que l'école n'a pas réglée n'exclut rien : la structure standard.
    assert.strictEqual(chemin({}, livret, GROUPES, rs7404), "2026/S38/RS7404/BEYNEY David/Livret d'accueil");
    // Une pièce déposée, désignée par son type, et rangée.
    assert.strictEqual(place(COMMUNE, doc({ piece_type_id: '72e9', title: "Pièce d'identité" }), GROUPES, { stagiaire: new Set(['ref:piece:72e9']) }), 'arbre');
});

test('un « OU » se lit dans ses membres D\'AUJOURD\'HUI, pas dans l\'instantané enregistré', () => {
    /* Le devis des dossiers d'entreprise est « devis-professionnel-copie » : absent de tous les
       instantanés de production, présent dans le groupe actuel. */
    const devis = doc({ slug: 'devis-professionnel-copie', title: 'Devis professionnel entreprise' });
    assert.strictEqual(place(COMMUNE, devis, GROUPES), 'arbre');
    const instantane = squelette(d('{Stagiaire}', [ou(DEVIS, ['devis-particulier', 'devis-professionnel'], 'Devis')], [], true));
    assert.strictEqual(place({ stagiaire: instantane }, devis, GROUPES), 'arbre');
    assert.strictEqual(place({ stagiaire: instantane }, devis, null), 'defaut', 'sans les groupes actuels, il ne trouvait pas sa place');
});

test('dossier d\'entreprise : son dossier côté stagiaire, et une COPIE pour l\'entreprise de ce qu\'on y range', () => {
    const entreprise = { folders: [d('{Année}', [], [d('{Semaine}', [], [d('{Code}', [], [d('{Entreprise}', [ref('droit-image'), ref('convention')],
        [d('{Stagiaire}', [], [d('Évaluations', [{ type: 'quiz', titre: 'Évaluation Formative du Mardi', label: 'Mardi' }])], true)])])])])] };
    const arbres = { stagiaire: COMMUNE.stagiaire, entreprise };
    const membre = { enr_company_id: 'c1', enr_company_name: 'BOULANGERIE LES ARCADES', program_code: 'NIV1H' };
    const niv1h = { stagiaire: new Set(['ref:droit-image', 'ref:contrat', 'qcm:evaluation formative du mardi']), entreprise: new Set(['ref:convention']) };
    assert.deepStrictEqual(chemins(arbres, doc({ ...membre, slug: 'droit-image', title: "Droit à l'image" }), GROUPES, niv1h), [
        "2026/S38/NIV1H/BEYNEY David/Droit à l'image",
        "2026/S38/NIV1H/BOULANGERIE LES ARCADES/Droit à l'image — BEYNEY David",
    ], 'la copie porte le nom du stagiaire : sinon les droits à l\'image de toute l\'entreprise s\'écraseraient');
    assert.deepStrictEqual(chemins(arbres, doc({ ...membre, quiz_title: 'Évaluation Formative du Mardi', title: 'Mardi' }), GROUPES, niv1h), [
        '2026/S38/NIV1H/BEYNEY David/Évaluations/Mardi',
        '2026/S38/NIV1H/BOULANGERIE LES ARCADES/BEYNEY David/Évaluations/Mardi',
    ]);
    /* LE CAS DE PRODUCTION (2026-09-25) : l'arborescence entreprise ne range que des évaluations. Elle
       rangeait auparavant le dossier ENTIER de ce stagiaire, à la place de l'arborescence stagiaire :
       sous « non rangé, pas archivé », son contrat serait sorti de l'archive. Il reste côté stagiaire,
       sans copie pour l'entreprise. */
    const contrat = doc({ ...membre, slug: 'contrat', title: 'Contrat de formation' });
    assert.deepStrictEqual(chemins(arbres, contrat, GROUPES, niv1h), ['2026/S38/NIV1H/BEYNEY David/Contrat de formation']);
    assert.deepStrictEqual(chemins({ stagiaire: COMMUNE.stagiaire, entreprise }, doc({ ...membre, slug: 'contrat', title: 'Contrat de formation' }), GROUPES, null),
        ['2026/S38/NIV1H/BEYNEY David/Contrat de formation'], 'une copie ne se fait jamais par défaut');
    // Le document de l'ENTREPRISE elle-même (convention de groupe) : dans son dossier, sans nom de stagiaire.
    const convention = { scope: 'COMPANY', year: 2026, week: 38, program_code: 'NIV1H', company_name: 'BOULANGERIE LES ARCADES',
        last_name: 'BOULANGERIE LES ARCADES', slug: 'convention', title: 'Convention de formation' };
    assert.strictEqual(chemin(arbres, convention, GROUPES, niv1h), '2026/S38/NIV1H/BOULANGERIE LES ARCADES/Convention de formation');
    // Proposée et non rangée : hors de l'archive — l'arborescence entreprise est sa seule place.
    const sansConvention = { folders: [d('{Année}', [], [d('{Semaine}', [], [d('{Code}', [], [d('{Entreprise}')])])])] };
    assert.deepStrictEqual(chemins({ stagiaire: COMMUNE.stagiaire, entreprise: sansConvention }, convention, GROUPES, niv1h), []);
    // Sans arborescence entreprise : celle des stagiaires, et l'entreprise à côté de ses stagiaires.
    assert.strictEqual(chemin({ stagiaire: COMMUNE.stagiaire }, { scope: 'COMPANY', year: 2026, week: 38, program_code: 'NIV1H',
        company_name: 'LES ARCADES', title: 'Convention' }), '2026/S38/NIV1H/LES ARCADES/Convention');
});

test('un document de session se range au niveau de la formation, jamais dans un dossier de stagiaire', () => {
    const sess = { scope: 'SESSION', year: 2026, week: 38, program_code: 'NIV1H', slug: 'droit-image', title: "Contrat d'hygiène" };
    // Même quand l'arborescence place son modèle dans le dossier du stagiaire : il n'a pas de stagiaire.
    assert.strictEqual(chemin(COMMUNE, sess), "2026/S38/NIV1H/Contrat d'hygiène");
    /* Et cette place-là COMPTE : l'école l'a rangé. Remonté d'un cran, il reste dans l'archive — il
       partait autrefois au dossier par défaut, ce qui, sous « non rangé, pas archivé », l'aurait perdu. */
    assert.strictEqual(chemin(COMMUNE, sess, GROUPES, { stagiaire: new Set(['ref:droit-image']), entreprise: new Set() }), "2026/S38/NIV1H/Contrat d'hygiène");
    assert.strictEqual(place(COMMUNE, sess, GROUPES, { stagiaire: new Set(['ref:droit-image']) }), 'arbre');
});

test('les champs se remplissent en noms de dossier que tous les systèmes acceptent', () => {
    const t = { folders: [d('{Année} {Formation}', [], [d('{Semaine} ({Dates})', [], [d('Stagiaires', [], [], true)])])] };
    const x = doc({ week: 2, program_title: 'Pizza / Four : bases', debut: '2026-01-05', fin: '2026-01-09', title: 'A/B: "c"' });
    assert.strictEqual(chemin({ stagiaire: t }, x), '2026 Pizza - Four - bases/S02 (05-01→09-01)/Stagiaires BEYNEY David/A-B- -c-',
        '« / » ferait un sous-dossier ; un dossier « un par stagiaire » sans {Stagiaire} reçoit le nom, pour que chacun garde le sien');
    assert.strictEqual(chemin({}, doc({ year: null, week: null, program_code: null, title: 'X' })), 'Sans année/Sans semaine/Sans formation/BEYNEY David/X',
        'sans rien de réglé : la structure standard');
});

/* ─── Ce qu'on accepte d'enregistrer ───────────────────────────────────────────────────────── */

test('l\'arborescence enregistrée est nettoyée, et refusée si un dossier n\'a pas de nom', () => {
    const propre = Arbo.validerArbre({ folders: [{ name: ' {Année} ', intrus: 1, items: [{ type: 'quiz', titre: 'Mardi', label: 'Mardi', x: 2 }], children: [] }] });
    assert.deepStrictEqual(Object.keys(propre.folders[0]).sort(), ['children', 'id', 'items', 'name', 'per_learner']);
    assert.strictEqual(propre.folders[0].name, '{Année}');
    assert.deepStrictEqual(propre.folders[0].items, [{ type: 'quiz', titre: 'Mardi', label: 'Mardi' }]);
    assert.throws(() => Arbo.validerArbre({ folders: [{ name: '  ', items: [], children: [] }] }), /Nommez tous les dossiers/);
    assert.throws(() => Arbo.validerArbre({ folders: [{ name: 'A', items: [{ label: 'rien' }] }] }), /ne désigne rien/);
    assert.throws(() => Arbo.validerArbre({ dossiers: [] }), /illisible/);
});

/* ─── L'archive ZIP ────────────────────────────────────────────────────────────────────────── */

test('le ZIP écrit au fil de l\'eau se relit — noms accentués, contenus et CRC', async () => {
    const PizZip = require('pizzip');
    const flux = new PassThrough(); const morceaux = []; flux.on('data', (c) => morceaux.push(c));
    const zip = ecrivainZip(flux);
    await zip.ajouter('2026/S38/RS7404/BEYNEY David/Évaluations/Mardi.pdf', Buffer.from('%PDF-1.4 a'));
    await zip.ajouter("2026/S38/RS7404/BEYNEY David/Droit à l'image.pdf", Buffer.alloc(70000, 3));
    await zip.terminer(); flux.end();
    const z = new PizZip(Buffer.concat(morceaux), { checkCRC32: true });
    assert.deepStrictEqual(Object.keys(z.files), ['2026/S38/RS7404/BEYNEY David/Évaluations/Mardi.pdf', "2026/S38/RS7404/BEYNEY David/Droit à l'image.pdf"]);
    assert.strictEqual(z.file('2026/S38/RS7404/BEYNEY David/Évaluations/Mardi.pdf').asText(), '%PDF-1.4 a');
    assert.strictEqual(zip.nombre, 2);
});

test('un téléchargement interrompu arrête l\'écriture au lieu de la poursuivre dans le vide', { timeout: 2000 }, async () => {
    /* LE CAS QUI COMPTE : la connexion est DÉJÀ fermée (« close » est passé) quand on écrit. Sans la
       garde, l'écrivain attendrait un « drain » ou un « close » qui ne viendront plus — la requête
       resterait pendue sur le serveur. Le délai de deux secondes fait échouer ce test au lieu de
       bloquer toute la suite. */
    const flux = new PassThrough();
    const zip = ecrivainZip(flux);
    const ferme = new Promise((ok) => flux.once('close', ok));
    flux.destroy();
    await ferme;
    await assert.rejects(() => zip.ajouter('a.pdf', Buffer.alloc(70000)), (e) => e.code === 'ZIP_ABANDON');
});

/* ─── La route, la portée, le sommaire ─────────────────────────────────────────────────────── */

const SUIVI = lire('controllers/suivi.controller.js');
const ROUTES_SUIVI = lire('routes/suivi.routes.js');

test('l\'archive a UNE route, sous la garde du coffre, et la liste même de l\'écran', () => {
    assert.match(ROUTES_SUIVI, /router\.use\(authenticateToken, authorizeRoles\(\.\.\.AUDIT_ROLES\)\);[\s\S]*router\.get\('\/archives\/zip', exporterArchive\);/,
        'qui ne peut pas ouvrir le coffre n\'en reçoit pas une copie — pièces d\'identité comprises');
    assert.match(SUIVI, /const \{ gen, comp, sess, arch, pieces \} = await lignesDuCoffre\(conn, req\.user\.organization_id\);/, 'l\'écran');
    assert.match(SUIVI, /const c = await lignesDuCoffre\(conn, orgId\);/, 'l\'archive');
    assert.match(SUIVI, /\.filter\(\(l\) => !l\.dossier && portee\.garde\(l\)\)/, 'les classeurs restent à part, comme à l\'écran');
    // Au fil de l'eau, et une panne en route coupe la connexion plutôt que de livrer un ZIP tronqué.
    assert.match(SUIVI, /const zip = ecrivainZip\(res\);/);
    assert.match(SUIVI, /res\.destroy\(err\);/);
    assert.match(SUIVI, /logAudit\(req, 'archive\.export', 'Archive', null\);/);
    // Un QCM envoyé mais pas rempli n'est pas rendu en questionnaire vide.
    assert.match(SUIVI, /if \(l\.quiz_id && l\.status !== 'SIGNE'\) \{ const e = new Error\('QCM envoyé, pas encore rempli'\)/);
});

test('le fichier d\'un document : le reçu, sinon le signé figé, sinon le rendu du jour — comme au téléchargement', () => {
    const DOC = lire('controllers/document.controller.js');
    const f = DOC.slice(DOC.indexOf('async function fichierPourArchive'), DOC.indexOf('/**', DOC.indexOf('async function fichierPourArchive')));
    const iRecu = f.indexOf('FROM document_fichier'); const iSigne = f.indexOf('loadSignedPdf(conn, docId)'); const iRendu = f.indexOf('fillForRequest(');
    assert.ok(iRecu > 0 && iSigne > iRecu && iRendu > iSigne, 'ce qui fait foi ne se régénère pas');
    assert.match(f, /fillForRequest\(\{ params: \{ id: docId \}, user, query: \{\} \}/, 'avec les droits du VRAI utilisateur');
    assert.match(f, /e\.code = 'NON_RENDU';/);
});

test('la portée : les clés mêmes du coffre, et le dossier reconnu jusque dans les PDF importés', async () => {
    const { porteeDeLArchive } = require('../controllers/suivi.controller.js');
    const conn = (row) => ({ query: async () => [[row]] });
    const session = await porteeDeLArchive(conn({ id: 's1', year: 2026, week: 38, code: 'RS7404' }), 'org', { session: 's1' });
    assert.ok(session.garde({ session_id: 's1' }));
    assert.ok(!session.garde({ session_id: 's2' }));
    assert.ok(session.garde({ source: 'archive', year: 2026, week: 38, program_code: 'RS7404' }), 'un PDF importé, par sa semaine et sa formation');
    assert.ok(!session.garde({ source: 'archive', year: 2026, week: 37, program_code: 'RS7404' }));

    const dossier = await porteeDeLArchive(conn({ id: 'e1', company_id: 'c1', session_id: 's1', first_name: 'Jean', last_name: 'DUPONT',
        year: 2025, week: 12, code: 'NIV1' }), 'org', { dossier: 'e1' });
    assert.ok(dossier.garde({ enrollment_id: 'e1' }));
    assert.ok(!dossier.garde({ enrollment_id: 'e2' }));
    assert.ok(dossier.garde({ scope: 'COMPANY', company_id: 'c1', session_id: 's1' }), 'la convention de son entreprise, pour sa session');
    assert.ok(!dossier.garde({ scope: 'COMPANY', company_id: 'c1', session_id: 's9' }));
    assert.ok(dossier.garde({ source: 'archive', learner_id: null, year: 2025, week: 12, program_code: 'NIV1', last_name: 'Dupont Jean', first_name: '' }),
        'un PDF importé dont le chemin disait « Dupont Jean »');
    assert.ok(!dossier.garde({ source: 'archive', learner_id: null, year: 2025, week: 12, program_code: 'NIV1', last_name: 'Durand Jean', first_name: '' }));

    const semaine = await porteeDeLArchive(conn(null), 'org', { annee: '2026', semaine: '38' });
    assert.ok(semaine.garde({ year: 2026, week: 38, program_code: 'X' }));
    assert.ok(!semaine.garde({ year: 2026, week: 39 }));
    const sansAnnee = await porteeDeLArchive(conn(null), 'org', { annee: '-' });
    assert.ok(sansAnnee.garde({ year: null }), '« - » : la branche « Sans session » du coffre');
    assert.strictEqual(await porteeDeLArchive(conn(null), 'org', {}), null);
    assert.strictEqual(await porteeDeLArchive(conn(undefined), 'org', { session: 'inconnue' }), null);
});

test('le sommaire nomme ce qui est rangé par défaut, ce qui est laissé dehors PAR CHOIX, et ce qui manque', () => {
    const { sommaireDeLArchive } = require('../controllers/suivi.controller.js');
    const txt = sommaireDeLArchive({ libelle: 'Session RS7404' }, "l'arborescence commune",
        [{ chemin: 'b/Mardi.pdf', statut: 'SIGNE', place: 'arbre', copie: true }, { chemin: 'a/Contrat.pdf', statut: 'SIGNE', place: 'arbre' },
            { chemin: 'a/Ancien.pdf', statut: 'ARCHIVE', place: 'defaut' }],
        [{ titre: 'Évaluation Formative du Jeudi', qui: 'BEYNEY David', raison: 'QCM envoyé, pas encore rempli' }], new Date(2026, 8, 25, 10, 0),
        [{ titre: "Livret d'accueil" }, { titre: 'Invitation' }, { titre: "Livret d'accueil" }]);
    assert.match(txt, /3 document\(s\) inclus, dont 1 copie\(s\) pour les entreprises :\r\n {2}a\/Ancien\.pdf/, 'trié par chemin');
    assert.match(txt, /a\/Contrat\.pdf {2}\[signé\]/);
    assert.match(txt, /a\/Ancien\.pdf {2}\[importé\]/, 'le statut dit ce qui n\'est pas signé');
    assert.match(txt, /1 document\(s\) rangés par défaut[^\r]*PDF importé[\s\S]*a\/Ancien\.pdf/);
    // CE QUI EST LAISSÉ DEHORS PAR CHOIX se dit, par intitulé, avec où ce choix se change.
    assert.match(txt, /3 document\(s\) du coffre laissés hors de l'archive : l'arborescence d'archivage ne les range pas \(Formations → Arborescence d'archivage\) :\r\n {2}Invitation\r\n {2}Livret d'accueil \(2\)/);
    assert.match(txt, /1 document\(s\) du coffre NON inclus :\r\n {2}Évaluation Formative du Jeudi — BEYNEY David : QCM envoyé, pas encore rempli/);
    assert.doesNotMatch(sommaireDeLArchive({ libelle: 'x' }, 'y', [], [], new Date()), /hors de l'archive|dont/, 'rien à dire, rien de dit');
});

/* ─── L'arborescence commune : l'API, et la migration ──────────────────────────────────────── */

test('l\'arborescence commune se lit avant `/:id`, s\'écrit par le bureau, et attend la migration 182 sans casser', () => {
    const R = lire('routes/formationProgram.routes.js');
    assert.ok(R.indexOf("router.get('/arborescence', getArborescence)") < R.indexOf("router.get('/:id', getProgram)"),
        'sinon « arborescence » serait pris pour l\'identifiant d\'une formation');
    assert.match(R, /router\.put\('\/arborescence', authorizeRoles\(\.\.\.ADMIN_ROLES\), saveArborescence\);/);
    const C = lire('controllers/formationProgram.controller.js');
    assert.match(C, /tree = Arbo\.validerArbre\(\(req\.body \|\| \{\}\)\.tree\)/);
    assert.match(C, /return res\.status\(503\)\.json\(\{ error: "Migration 182 non jouée/);
    // Tant que rien n'est enregistré : la proposition, pas une page vide.
    assert.match(C, /const st = Arbo\.fusionnerArbres\(entrees\('archive_tree'\), opts\);/);
    assert.match(C, /const opts = \{ titreDuQcm: \(id\) => titres\.get\(id\) \|\| null, existe, groupes, libelleDe, homonymeDe \};/);
    // L'archive suit la commune dès qu'elle existe, sinon celles des formations : elle marche avant la 182.
    assert.match(SUIVI, /SELECT archive_tree, company_archive_tree FROM organization WHERE id = \?/);
    assert.match(SUIVI, /SELECT code, archive_tree, company_archive_tree FROM training_program WHERE organization_id = \?/);
});

test('la migration 182 et son revert se rejouent sans risque, et ne touchent pas les arborescences des formations', () => {
    const M = path.join(API, '..', '..', 'database', 'migrations');
    const aller = fs.readFileSync(path.join(M, '182_arborescence_commune.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(M, '182_revert_arborescence_commune.sql'), 'utf8');
    assert.match(aller, /ALTER TABLE organization\s+ADD COLUMN IF NOT EXISTS archive_tree\s+longtext DEFAULT NULL,\s+ADD COLUMN IF NOT EXISTS company_archive_tree longtext DEFAULT NULL;/);
    assert.match(retour, /ALTER TABLE organization\s+DROP COLUMN IF EXISTS archive_tree,\s+DROP COLUMN IF EXISTS company_archive_tree;/);
    for (const sql of [aller, retour]) {
        assert.doesNotMatch(sql, /^\s*--/m, 'commentaires en blocs, jamais --');
        assert.ok(!/training_program/i.test(sql.replace(/\/\*[\s\S]*?\*\//g, '')),
            'hors commentaires, la 182 ne touche pas aux arborescences des formations');
    }
});

/* ─── L'écran ───────────────────────────────────────────────────────────────────────────────── */

const UI = path.join(API, '..', 'app', 'ui');
const lireUi = (f) => fs.readFileSync(path.join(UI, f), 'utf8');

test('l\'écran et le serveur désignent un document de la MÊME façon', async () => {
    /* Deux copies d'une règle d'identité finissent par diverger ; ici, elles sont confrontées sur
       les mêmes cas. Si l'écran grisait « sauté » un document que l'archive range, ou l'inverse,
       l'aperçu mentirait sur l'archive qu'on remettra à un contrôleur. */
    const ecran = await import('../../app/ui/lib/arborescence.js');
    const cas = [
        { type: 'quiz', titre: '  Évaluation   Formative du MARDI ' }, { type: 'quiz', ref: 'quiz:94be', label: 'x' },
        { type: 'model', ref: 'droit-image' }, { type: 'model', ref: 'piece:72e9' }, ou(DEVIS, ['a', 'b'], 'Devis'), {}, null,
    ];
    for (const it of cas) assert.strictEqual(ecran.cleItem(it), Arbo.cleItem(it), JSON.stringify(it));
    assert.strictEqual(ecran.normaliserTitre('Évaluation formative Hygiène'), Arbo.normaliserTitre('Évaluation formative Hygiène'));
    // Un « OU » couvre les membres D'AUJOURD'HUI, des deux côtés.
    const groupes = new Map([[DEVIS, ['devis-particulier', 'devis-professionnel-copie']]]);
    assert.deepStrictEqual(ecran.clesCouvertes(ou(DEVIS, ['devis-professionnel'], 'Devis'), groupes),
        ['ref:devis-particulier', 'ref:devis-professionnel-copie']);
    // L'aperçu d'une formation : ce qu'elle saute, ce que l'arborescence ne nomme pas.
    const t = squelette(d('{Stagiaire}', [ref('devis-rs7404'), { type: 'quiz', titre: 'Évaluation Formative du Mardi', label: 'Mardi' }], [], true));
    const ap = ecran.apercuFormation(t, ['qcm:evaluation formative du mardi', 'ref:livret-accueil'], groupes);
    assert.strictEqual(ap.concerne(ref('devis-rs7404')), false, 'NIV1H n\'a pas de devis RS7404 : sauté');
    assert.strictEqual(ap.concerne({ type: 'quiz', titre: 'Évaluation Formative du Mardi' }), true);
    assert.deepStrictEqual(ap.nonPlaces, ['ref:livret-accueil']);
});

test('l\'arborescence se règle UNE fois, depuis la liste des formations — plus dans chaque formation', () => {
    const PAGE = lireUi('pages/Formations.jsx');
    assert.match(PAGE, /<button className="btn ghost" onClick=\{\(\) => setArborescence\(true\)\}>Arborescence d'archivage<\/button>/);
    assert.match(PAGE, /<ArborescenceCommune onClose=\{\(\) => setArborescence\(false\)\}/);
    // La formation ne l'enregistre plus : ni état propre, ni appel à l'ancienne route.
    assert.doesNotMatch(PAGE, /saveArchiveTree|archiveTree|treeHasEmptyName/);
    // Son onglet la LIT pour elle, et mène à l'éditeur commun.
    assert.match(PAGE, /<ApercuArborescence program=\{program\}/);
    assert.match(PAGE, /onOuvrirArborescence=\{\(\) => \{ setEditing\(null\); setArborescence\(true\); \}\}/);
    const EDITEUR = lireUi('components/ArborescenceCommune.jsx');
    assert.match(EDITEUR, /await saveArborescenceCommune\(tree, companyTree\)/);
    assert.match(EDITEUR, /disabled=\{saving \|\| !etat \|\| !etat\.disponible\}/, 'sans la 182, on ne fait pas semblant d\'enregistrer');
    const OUTIL = lireUi('components/ArchiveTreeEditor.jsx');
    assert.match(OUTIL, /: o\.type === "quiz" \? \{ type: "quiz", titre: o\.titre, label: o\.label \}/, 'un QCM se place par son TITRE');
});

test('les trois boutons d\'archive : même garde que le coffre, et un comptage avant de télécharger', () => {
    const CLIENT = lireUi('api/apiClient.js');
    const f = CLIENT.slice(CLIENT.indexOf('export async function telechargerArchive'));
    assert.match(f, /await request\(`\/suivi\/archives\/zip\?\$\{qs\}&compter=1`\)/,
        'une sélection vide répond un message, pas un fichier d\'erreur au nom de .zip');
    assert.match(f, /a\.href = `\$\{API_BASE_URL\}\/suivi\/archives\/zip\?\$\{qs\}`;/, 'puis le navigateur télécharge, au fil de l\'eau');
    assert.match(SUIVI, /if \(req\.query && req\.query\.compter\) return res\.json\(\{ data: \{ documents: fichiers, nom, hors_arborescence: nonRanges\.length \} \}\);/);
    for (const [page, appel] of [['pages/SessionDetail.jsx', /telechargerArchive\(\{ session: id \}\)/],
        ['pages/StagiaireDetail.jsx', /telechargerArchive\(\{ dossier: curEnrId \}\)/]]) {
        const src = lireUi(page);
        assert.match(src, appel);
        assert.match(src, /const ENTREE_SUIVI = NAV\.flatMap\(\(g\) => g\.items\)\.find\(\(it\) => it\.to === "\/suivi"\);/);
        assert.match(src, /const archiveOuvrable = !!ENTREE_SUIVI && canOpen\(user, ENTREE_SUIVI\);/,
            `${page} : le bouton ne s'offre qu'à qui peut ouvrir le coffre`);
    }
    const COFFRE = lireUi('pages/Suivi.jsx');
    assert.match(COFFRE, /<ZipBtn params=\{\{ annee: Y\.label \}\}/);
    assert.match(COFFRE, /<ZipBtn params=\{\{ annee: Y\.label, semaine: W\.week \? String\(W\.week\) : "-" \}\}/, 'les clés mêmes de l\'arbre du coffre');
    assert.match(COFFRE, /<ZipBtn params=\{\{ annee: Y\.label, semaine: W\.week \? String\(W\.week\) : "-", formation: F\.code \}\}/);
});

/* ─── L'éditeur dessiné comme l'arbre (2026-09-25) ────────────────────────────────────────────── */

test('placer un document le DÉPLACE : une place par document, et un « OU » emporte ses membres', async () => {
    /* L'archive range un document au PREMIER dossier qui le nomme. Placé à deux endroits, il semblait
       y avoir deux copies — et c'était l'ordre de l'arbre, invisible, qui décidait laquelle comptait. */
    const ecran = await import('../../app/ui/lib/arborescence.js');
    const arbre = [{ id: 'stag', name: '{Stagiaire}', per_learner: true, items: [ref('droit-image'), ref('contrat'), ref('convention')],
        children: [{ id: 'eval', name: 'Évaluations', items: [], children: [] }] }];
    const gele = JSON.stringify(arbre);
    const t1 = ecran.placerDocument(arbre, 'eval', ref('droit-image'), new Map());
    assert.deepStrictEqual(t1[0].items.map(Arbo.cleItem), ['ref:contrat', 'ref:convention'], 'il a quitté sa place d\'avant');
    assert.deepStrictEqual(t1[0].children[0].items.map(Arbo.cleItem), ['ref:droit-image']);
    assert.strictEqual(JSON.stringify(arbre), gele, 'l\'arbre reçu n\'est pas modifié : l\'écran compare les références');
    // Le « OU » emporte les modèles seuls qu'il contient, là où ils étaient.
    const groupes = new Map([[CONTRAT, ['contrat', 'convention']]]);
    const t2 = ecran.placerDocument(t1, 'eval', ou(CONTRAT, ['contrat', 'convention'], 'Contrat / Convention'), groupes);
    assert.deepStrictEqual(t2[0].items, []);
    assert.deepStrictEqual(t2[0].children[0].items.map(Arbo.cleItem), ['ref:droit-image', `ou:${CONTRAT}`]);
    // Replacé au même endroit : pas de doublon.
    const t3 = ecran.placerDocument(t2, 'eval', ref('droit-image'), groupes);
    assert.strictEqual(t3[0].children[0].items.filter((it) => Arbo.cleItem(it) === 'ref:droit-image').length, 1);
});

test('l\'éditeur est l\'arbre : une bulle au-dessus de la fenêtre, et la même vue en lecture', () => {
    const EDITEUR = lireUi('components/ArchiveTreeEditor.jsx');
    const CSSU = lireUi('styles/app.css');
    /* LA BULLE (liste des documents, menu d'un dossier) vit dans un PORTAIL — un `position:fixed` dans la
       fenêtre animée se placerait par rapport à elle — et AU-DESSUS d'elle : la fenêtre est à 100, et le
       menu des lignes du reste de l'application (60) y serait caché. */
    assert.match(EDITEUR, /return createPortal\(<div ref=\{ref\} className=\{`arbo-bulle \$\{className\}`\} style=\{pos\}>/);
    const zBulle = Number(/\.arbo-bulle\{position:fixed;z-index:(\d+)/.exec(CSSU)[1]);
    const zFenetre = Number(/\.overlay\{[^}]*z-index:(\d+)/.exec(CSSU)[1]);
    assert.ok(zBulle > zFenetre, `bulle (${zBulle}) au-dessus de la fenêtre (${zFenetre})`);
    // Défiler DANS la bulle (une longue liste) ne la ferme pas.
    assert.match(EDITEUR, /const defile = \(e\) => \{ if \(!ref\.current\?\.contains\(e\.target\)\) onClose\(\); \};/);
    // Placer passe par la règle « une place par document ».
    assert.match(EDITEUR, /placer: \(id, o\) => set\(placerDocument\(folders, id, itemDe\(o\), groupes\)\)/);
    // L'onglet d'une formation montre LE MÊME dessin, sans rien à modifier.
    assert.match(EDITEUR, /return <ArchiveTreeEditor \{\.\.\.props\} lectureSeule onChange=\{\(\) => \{\}\} \/>;/);
    assert.match(EDITEUR, /\{!lectureSeule && \(\s*<span className="arbo-actions">/);
    // Plus de formulaire par dossier : ni liste déroulante des champs, ni liste des documents pleine largeur.
    assert.doesNotMatch(EDITEUR, /＋ champ…|＋ Attribuer un document…/);
});

/* ─── Un « OU » supprimé dans Modèles → Équivalences (2026-09-25) ─────────────────────────────── */

test('un « OU » supprimé se DÉPLIE à sa place : ses documents, un par un — le cas relevé en production', () => {
    /* L'école avait supprimé TOUTES ses équivalences ; l'arborescence enregistrée affichait encore
       « Devis particulier / Devis professionnel (OU) » et « Contrat / Convention de formation (OU) ».
       Forme exacte de la production, le 2026-09-25 : deux « OU » dans le dossier du stagiaire. */
    const enregistree = squelette(d('{Stagiaire}', [
        ref('invitation', 'Invitation'),
        ou(DEVIS, ['devis-particulier', 'devis-professionnel'], 'Devis particulier / Devis professionnel'),
        ou(CONTRAT, ['contrat', 'convention'], 'Contrat / Convention de formation'),
    ], [d('Évaluations', [ref('convention', 'Convention de formation')])], true));
    const libelles = new Map([['devis-particulier', 'Devis particulier'], ['contrat', 'Contrat'], ['convention', 'Convention de formation']]);
    const { tree, ajustements } = Arbo.actualiserLesOu(enregistree, new Map(), (s) => libelles.get(s) || null);
    const stag = dossierNomme(tree, '{Année}', '{Semaine}', '{Code}', '{Stagiaire}');
    assert.deepStrictEqual(stag.items.map(Arbo.cleItem), ['ref:invitation', 'ref:devis-particulier', 'ref:contrat'],
        'plus aucun « OU » ; chaque document à la place du choix qui le rangeait');
    assert.deepStrictEqual(dossierNomme(stag, 'Évaluations').items.map(Arbo.cleItem), ['ref:convention'],
        'un document déjà rangé seul ailleurs y reste : une place par document');
    assert.deepStrictEqual(ajustements.map((a) => [a.label, a.documents, a.perdus]), [
        ['Devis particulier / Devis professionnel', ['Devis particulier'], ['Devis professionnel']],
        ['Contrat / Convention de formation', ['Contrat'], []],
    ], 'nommé : ce qu\'il est devenu, et le modèle qui n\'existe plus — sous son NOM, pas son slug');

    /* L'HOMONYME : en production, « devis-professionnel » n'existait plus — le devis professionnel
       d'aujourd'hui est « devis-professionnel-copie », MÊME NOM à l'écran. Dire qu'il « n'existe plus »
       aurait été faux pour qui le voit dans ses modèles : le modèle actuel de ce nom prend sa place. */
    const avecCopie = new Map([...libelles, ['devis-professionnel-copie', 'Devis professionnel']]);
    const parNom = new Map([...avecCopie].map(([s, l]) => [Arbo.normaliserTitre(l), { slug: s, label: l }]));
    const r = Arbo.actualiserLesOu(enregistree, new Map(), (s) => avecCopie.get(s) || null, (n) => parNom.get(Arbo.normaliserTitre(n)) || null);
    assert.deepStrictEqual(dossierNomme(r.tree, '{Année}', '{Semaine}', '{Code}', '{Stagiaire}').items.map(Arbo.cleItem),
        ['ref:invitation', 'ref:devis-particulier', 'ref:devis-professionnel-copie', 'ref:contrat']);
    assert.deepStrictEqual(r.ajustements[0].remplaces, [{ nom: 'Devis professionnel', ancien: 'devis-professionnel', nouveau: 'devis-professionnel-copie' }]);
    assert.deepStrictEqual(r.ajustements[0].perdus, []);
    assert.ok(!JSON.stringify(tree).includes('"group"'));
    // Un « OU » qui existe toujours prend ses membres et son libellé d'AUJOURD'HUI.
    const vivant = Arbo.actualiserLesOu(enregistree, GROUPES, (s) => libelles.get(s) || null);
    const devis = dossierNomme(vivant.tree, '{Année}', '{Semaine}', '{Code}', '{Stagiaire}').items.find((i) => i.group === DEVIS);
    assert.deepStrictEqual(devis.members, ['devis-particulier', 'devis-professionnel-copie']);
    assert.strictEqual(vivant.ajustements.length, 0);
});

test('la proposition aussi déplie un « OU » supprimé, au lieu de perdre ses documents', () => {
    const A = squelette(d('{Stagiaire}', [ou(CONTRAT, ['contrat', 'convention'], 'Contrat / Convention')], [], true));
    const { tree, retires } = Arbo.fusionnerArbres([{ code: 'NIV1H', tree: A }], {
        ...OPTS, groupes: new Map(), libelleDe: (s) => ({ contrat: 'Contrat', convention: 'Convention de formation' })[s] || null,
    });
    const stag = dossierNomme(tree, '{Année}', '{Semaine}', '{Code}', '{Stagiaire}');
    assert.deepStrictEqual(stag.items.map((i) => i.label), ['Contrat', 'Convention de formation']);
    assert.deepStrictEqual(retires, []);
});

test('l\'arborescence enregistrée se lit avec les « OU » d\'aujourd\'hui, et l\'écran le dit', () => {
    const C = lire('controllers/formationProgram.controller.js');
    assert.match(C, /const st = Arbo\.actualiserLesOu\(enregistree\.tree, groupes, libelleDe, homonymeDe\);/);
    assert.match(C, /const en = Arbo\.actualiserLesOu\(enregistree\.company_tree, groupes, libelleDe, homonymeDe\);/);
    assert.match(C, /const opts = \{ titreDuQcm: \(id\) => titres\.get\(id\) \|\| null, existe, groupes, libelleDe, homonymeDe \};/);
    // Deux modèles du même nom : on ne devine pas.
    assert.match(C, /parNom\.set\(k, parNom\.has\(k\) \? null : \{ slug, label \}\);/);
    // Le libellé d'un modèle déplié vient de TOUS les modèles, pas des seuls parcours.
    assert.match(C, /for \(const s of await loadOrgSteps\(orgId\)\) if \(s && s\.slug\) libelles\.set\(s\.slug, s\.label\);/);
    const EDITEUR = lireUi('components/ArborescenceCommune.jsx');
    assert.match(EDITEUR, /\{etat\.ajustements\?\.length > 0 && \(/);
    assert.match(EDITEUR, /<b>Enregistrez<\/b> pour garder ce rangement\./, 'rien n\'est gardé sans enregistrer');
    assert.match(EDITEUR, /conflits: \[\], retires: \[\], ajustements: \[\] \}\)\);/, 'enregistré, l\'avis s\'efface');
    assert.match(lireUi('pages/Formations.jsx'), /etat\.ajustements\?\.length > 0 \? " Des choix « OU » supprimés y sont dépliés/);
});

test('l\'archive rangeait déjà juste : un « OU » disparu retombe sur les membres enregistrés avec lui', () => {
    /* Pourquoi seul l'écran était faux : en attendant l'enregistrement, le « OU » périmé range encore
       ses documents à SA place — la même que celle que le dépliage leur donne. */
    const perime = squelette(d('{Stagiaire}', [ou(CONTRAT, ['contrat', 'convention'], 'Contrat / Convention')], [d('Autres')], true));
    const convention = doc({ slug: 'convention', title: 'Convention' });
    assert.strictEqual(place({ stagiaire: perime }, convention, new Map()), 'arbre');
    assert.strictEqual(chemin({ stagiaire: perime }, convention, new Map()), '2026/S38/RS7404/BEYNEY David/Convention');
});

/* ─── Le volet entreprise, et ce que l'archive laisse dehors (2026-09-25) ──────────────────────── */

/* LES PARCOURS DE PRODUCTION relevés le 2026-09-25, réduits à ce qui compte : le devis professionnel
   — un document de GROUPE, comme la convention — est inactif dans le parcours de chaque formation et
   choisi dans le volet entreprise de NIV1H ; NIV1 ne cite plus dans le sien que « devis-entreprise »,
   un modèle supprimé ; RS7404 n'a pas de volet. Seul ajout, pour éprouver l'autre cas : un document de
   STAGIAIRE réservé aux entreprises (« accord de prise en charge »), que la production n'a pas encore. */
const etape = (slug, label, active, extra = {}) => ({ slug, label, active, quiz_id: null, company_level: false, doc_type: null, ...extra });
const QCM_MARDI = (id) => etape(`quiz:${id}`, 'Évaluation Formative du Mardi', true, { quiz_id: id, doc_type: 'QCM' });
const GROUPE = { company_level: true };
const PARCOURS = [
    { id: 'p-rs', code: 'RS7404', title: 'Certification', volet: null, etapes: [
        etape('devis-rs7404', 'Devis RS7404', true), etape('devis-particulier', 'Devis particulier', false),
        etape('devis-professionnel-copie', 'Devis professionnel', false, GROUPE), etape('convention', 'Convention de formation', false, GROUPE),
        QCM_MARDI('b85d')] },
    { id: 'p-n1', code: 'NIV1', title: 'Niveau 1', volet: '["devis-entreprise"]', etapes: [
        etape('devis-particulier', 'Devis particulier', true), etape('devis-professionnel-copie', 'Devis professionnel', false, GROUPE),
        etape('convention', 'Convention de formation', true, GROUPE), QCM_MARDI('f214')] },
    { id: 'p-n1h', code: 'NIV1H', title: 'Niveau 1 hygiène', volet: ['devis-professionnel-copie', 'convention', 'accord-prise-en-charge', 'quiz:b804'], etapes: [
        etape('devis-particulier', 'Devis particulier', true), etape('devis-professionnel-copie', 'Devis professionnel', false, GROUPE),
        etape('convention', 'Convention de formation', false, GROUPE), etape('accord-prise-en-charge', 'Accord de prise en charge', false),
        QCM_MARDI('b804')] },
];

test('la palette lit AUSSI le volet entreprise : le devis professionnel se range enfin — le cas relevé en production', () => {
    /* « Je n'ai pas accès au devis particulier / entreprise pour les répartir » : l'école avait supprimé
       le choix « OU » qui les rangeait ensemble. Le devis particulier restait proposé ; le devis
       professionnel, choisi dans le seul volet entreprise, ne l'était nulle part — la palette ne lisait
       que les étapes ACTIVES du parcours du dossier. */
    const { documents, formations } = Arbo.paletteDesFormations(PARCOURS);
    const entree = (cle) => documents.find((x) => x.cle === cle);
    const pro = entree('ref:devis-professionnel-copie');
    assert.ok(pro, 'le devis professionnel est proposé');
    assert.deepStrictEqual([pro.formations, pro.formations_entreprise], [[], ['NIV1H']], 'le parcours du dossier ne l\'a nulle part ; le volet de NIV1H, si');
    /* NIV1 NE CITE QU'UN MODÈLE SUPPRIMÉ : son arrivée par entreprise retombe sur le parcours du dossier,
       exactement comme companyParcours. RS7404 n'a pas de volet : même chose. */
    const par = (code) => formations.find((f) => f.code === code);
    assert.deepStrictEqual(par('NIV1').documents_entreprise, par('NIV1').documents);
    assert.deepStrictEqual(par('RS7404').documents_entreprise, ['ref:devis-rs7404', 'qcm:evaluation formative du mardi']);
    assert.deepStrictEqual(par('NIV1H').documents_entreprise,
        ['ref:devis-professionnel-copie', 'ref:convention', 'ref:accord-prise-en-charge', 'qcm:evaluation formative du mardi'],
        'le volet, dans son ordre, actif ou non dans le parcours du dossier');
    assert.deepStrictEqual(entree('ref:devis-particulier').formations_entreprise, ['NIV1'], 'NIV1H l\'a remplacé dans son volet');
    // Un QCM reste UNE entrée, par son titre, et chaque formation n'y figure qu'une fois.
    assert.deepStrictEqual(entree('qcm:evaluation formative du mardi').formations, ['RS7404', 'NIV1', 'NIV1H']);
    assert.strictEqual(documents.filter((x) => x.cle.startsWith('qcm:')).length, 1);
    // Le volet se lit tel que la base le rend : chaîne JSON, liste, ou rien.
    assert.deepStrictEqual([Arbo.lireVolet('["a","b"]'), Arbo.lireVolet(['a']), Arbo.lireVolet(null), Arbo.lireVolet('{illisible')], [['a', 'b'], ['a'], [], []]);
    // Le contrôleur la calcule UNE fois, pour l'éditeur et pour l'archive.
    const C = lire('controllers/formationProgram.controller.js');
    assert.match(C, /entrees\.push\(\{ id: p\.id, code: p\.code, title: p\.title, etapes, volet: p\.company_steps \}\);/);
    assert.match(C, /const \{ programmes, tousLesSlugs, libelles, documents, formations \} = await paletteDeLOrganisme\(conn, orgId\);/);
    assert.match(SUIVI, /const offerts = offertsDesFormations\(await paletteDeLOrganisme\(conn, orgId\)\);/);
});

test('l\'archive laisse dehors EXACTEMENT ce que l\'aperçu annonce, arbre par arbre', async () => {
    /* Deux calculs de la même règle — l'écran dit « ne sera pas dans l'archive », le serveur exclut —
       finissent par diverger. Ils sont confrontés ici sur les parcours de production. */
    const ecran = await import('../../app/ui/lib/arborescence.js');
    const palette = Arbo.paletteDesFormations(PARCOURS);
    const offerts = Arbo.offertsDesFormations(palette);
    const vide = { folders: [] };
    for (const f of palette.formations) {
        for (const kind of ['stagiaire', 'entreprise']) {
            const vue = ecran.formationDansLArbre(f, kind, palette.documents);
            assert.deepStrictEqual(ecran.apercuFormation(vide, vue.documents, new Map(), vue.aRanger).nonPlaces.sort(), [...offerts.get(f.code)[kind]].sort(),
                `${f.code}, arbre ${kind}`);
        }
    }
    // Côté stagiaire, le dossier d'un stagiaire inscrit par une entreprise en fait partie ; le groupe, jamais.
    assert.ok(offerts.get('NIV1H').stagiaire.has('ref:accord-prise-en-charge'));
    assert.ok(!offerts.get('NIV1H').stagiaire.has('ref:devis-professionnel-copie'));
    assert.ok(!offerts.get('NIV1H').stagiaire.has('ref:convention'));
    /* Côté entreprise, seuls les documents de groupe — les deux que l'écran de production réclamait
       après la correction : ceux des stagiaires n'y sont que des copies, facultatives. */
    assert.deepStrictEqual([...offerts.get('NIV1H').entreprise], ['ref:devis-professionnel-copie', 'ref:convention']);
    // Ce que le coffre sait d'un document suffit à le reconnaître dans ces listes.
    assert.deepStrictEqual(Arbo.clesDuDocument({ slug: 'contrat', quiz_title: null }), ['ref:contrat']);
    assert.deepStrictEqual(Arbo.clesDuDocument({ quiz_title: '  Évaluation Formative du MARDI', quiz_id: 'x' }), ['qcm:evaluation formative du mardi']);
    assert.deepStrictEqual(Arbo.clesDuDocument({ piece_type_id: '72e9' }), ['ref:piece:72e9']);
    assert.deepStrictEqual(Arbo.clesDuDocument({ source: 'archive', title: 'Ancien contrat' }), [], 'un PDF importé : rien pour le nommer');
});

test('chaque arbre propose ce qu\'il range : le dossier de chaque stagiaire d\'un côté, les copies et le groupe de l\'autre', async () => {
    const ecran = await import('../../app/ui/lib/arborescence.js');
    const { documents } = Arbo.paletteDesFormations(PARCOURS);
    const stag = ecran.paletteDeLArbre(documents, 'stagiaire');
    const ent = ecran.paletteDeLArbre(documents, 'entreprise');
    const cles = (l) => l.map((x) => x.cle).sort();
    assert.deepStrictEqual(cles(stag), ['qcm:evaluation formative du mardi', 'ref:accord-prise-en-charge', 'ref:devis-particulier', 'ref:devis-rs7404'],
        'un document de stagiaire réservé aux entreprises, côté stagiaire : c\'est le dossier de ceux qu\'une entreprise inscrit');
    assert.deepStrictEqual(cles(ent), [...cles(stag), 'ref:convention', 'ref:devis-professionnel-copie'].sort(),
        'tout, côté entreprise — dont le devis professionnel, document de groupe, qui n\'était proposé nulle part');
    // « Qui l'a » : le parcours du dossier ET le volet entreprise.
    assert.deepStrictEqual(stag.find((x) => x.cle === 'ref:accord-prise-en-charge').formations, ['NIV1H']);
    assert.deepStrictEqual(ent.find((x) => x.cle === 'ref:devis-professionnel-copie').formations, ['NIV1H']);
    assert.deepStrictEqual(ent.find((x) => x.cle === 'ref:devis-particulier').formations, ['NIV1', 'NIV1H']);
    /* Ce que l'arbre stagiaire ne propose pas se DIT dans sa liste, avec où aller : chercher « devis »
       côté stagiaire ne trouvait pas le devis professionnel, et rien ne disait pourquoi. */
    assert.deepStrictEqual(ecran.horsArbreStagiaire(documents).map((x) => x.cle), ['ref:convention', 'ref:devis-professionnel-copie']);
    const EDITEUR = lireUi('components/ArborescenceCommune.jsx');
    assert.match(EDITEUR, /const docs = useMemo\(\(\) => paletteDeLArbre\(documents, kind\), \[documents, kind\]\);/);
    assert.match(EDITEUR, /const formationVue = formationDansLArbre\(formation, kind, documents\);/);
    assert.match(EDITEUR, /arbre=\{kind\} ailleurs=\{isEnt \? null : ailleurs\}/);
    assert.match(EDITEUR, /<b>Ce qui n'est rangé nulle part n'est pas archivé\.<\/b>/);
    const OUTIL = lireUi('components/ArchiveTreeEditor.jsx');
    assert.match(OUTIL, /const ap = formation \? apercuFormation\(tree, formation\.documents, groupes, formation\.aRanger\) : null;/);
    assert.match(OUTIL, /\{ap\.nonPlaces\.length > 1 \? "ils ne seront" : "il ne sera"\} pas dans l'archive\./);
    assert.doesNotMatch(OUTIL, /ils iront|il ira/, 'plus de promesse d\'un rangement par défaut');
    // L'onglet de la formation lit la même règle.
    const PAGE = lireUi('pages/Formations.jsx');
    assert.match(PAGE, /const formation = f && formationDansLArbre\(\{ \.\.\.f, code: form\.code \|\| f\.code, title: form\.title \|\| f\.title \}, kind, documents\);/);
    assert.match(PAGE, /docs=\{paletteDeLArbre\(documents, kind\)\}/);
});
