/**
 * UN DOSSIER SE QUITTE DES YEUX QUAND IL EST FINI, PAS QUAND SA SESSION L'EST (2026-09-21).
 *
 * LE DÉFAUT. « Derniers dossiers », sur le tableau de bord, ne gardait que les dossiers des
 * sessions en cours ou à venir : le jour où une session s'achevait, ses dossiers quittaient la
 * carte, complets ou non. Mesuré en production le jour même : 5 dossiers sur 10 appartenaient à
 * une session terminée, tous les cinq entre 50 et 99 % — et aucun n'était visible. Or c'est après
 * la session qu'on finit un dossier : satisfaction, certificat de réalisation.
 *
 * PAS TOUS POUR AUTANT. Un dossier resté AVANT le point de rupture du parcours (le « checkpoint »
 * de Formations → Parcours documentaire) est celui d'une personne qui n'est jamais venue : il ne se
 * complétera pas. La règle est celle qui ferme l'émargement ; elle vit désormais en un seul
 * exemplaire (lib/pointDeRupture.js), lu par la garde ET par l'avancement — deux copies finiraient
 * par dire « franchi » d'un dossier dont l'émargement est resté fermé.
 *
 * ET LE SUIVI QUALIOPI, à l'inverse, gardait sous les yeux les dossiers à 100 %. Ils quittent la
 * liste et font monter le compteur « complets », qui les réaffiche d'un clic.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PointDeRupture = require('../lib/pointDeRupture.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const regleUi = () => import('../../app/ui/lib/dossiersASuivre.js');

/* ─── La règle du point de rupture ─────────────────────────────────────────────────────────── */

test('deux versions d\'un même document : une seule signée suffit, dans quelque ordre que ce soit', () => {
    /* Régénéré après signature, ou refait : la garde des documents du DOSSIER gardait le statut
       de la DERNIÈRE ligne lue, et la requête ne fixait aucun ordre. Le même dossier pouvait donc
       être franchi ou non selon l'humeur de la base. */
    const signe = { template_slug: 'contrat', type: 'CONTRAT', status: 'SIGNE' };
    const refait = { template_slug: 'contrat', type: 'CONTRAT', status: 'ENVOYE' };
    for (const ordre of [[signe, refait], [refait, signe]]) {
        const st = PointDeRupture.statutsDocuments(ordre);
        assert.strictEqual(st.parSlug.contrat, 'SIGNE');
        assert.strictEqual(st.parType.CONTRAT, 'SIGNE');
    }
});

test('le point n\'exige que ce que le stagiaire signe, jusqu\'à lui, hors QCM et émargement', () => {
    const etapes = [
        { slug: 'convocation', doc_type: 'CONVOCATION', sort_order: 1, stagiaire_sign: 0 },
        { slug: 'contrat', doc_type: 'CONTRAT', sort_order: 2, stagiaire_sign: 1 },
        { slug: 'qcm', doc_type: 'QCM', sort_order: 2, stagiaire_sign: 1 },
        { slug: 'emargement', doc_type: 'EMARGEMENT', sort_order: 2, stagiaire_sign: 1 },
        { slug: 'satisfaction', doc_type: 'EVALUATION', sort_order: 5, stagiaire_sign: 1 },
    ];
    assert.deepStrictEqual(PointDeRupture.exigencesDossier(etapes, 2).map((s) => s.slug), ['contrat'],
        'le point INCLUT l\'étape qui le précède, et rien de ce qui vient après');
    // Signée par son modèle, ou à défaut par son type (documents antérieurs aux modèles).
    const [contrat] = PointDeRupture.exigencesDossier(etapes, 2);
    assert.ok(PointDeRupture.signeeDossier(contrat, PointDeRupture.statutsDocuments([{ type: 'CONTRAT', status: 'SIGNE' }])));
    assert.ok(!PointDeRupture.signeeDossier(contrat, PointDeRupture.statutsDocuments([{ template_slug: 'contrat', status: 'ENVOYE' }])));
});

test('volet entreprise : la section jusqu\'au point, ses étapes actives qui ont un signataire', () => {
    const org = new Map([
        ['convention', { slug: 'convention', doc_type: 'CONVENTION', active: 1, company_level: 1, signable: 1, company_sign: 1 }],
        ['livret', { slug: 'livret', doc_type: 'LIVRET', active: 1 }], // aucun signataire
        ['ancien', { slug: 'ancien', doc_type: 'ANCIEN', active: 0, stagiaire_sign: 1 }], // désactivée
        ['contrat', { slug: 'contrat', doc_type: 'CONTRAT', active: 1, stagiaire_sign: 1 }],
        ['satisfaction', { slug: 'satisfaction', doc_type: 'EVALUATION', active: 1, stagiaire_sign: 1 }],
    ]);
    const section = ['convention', 'livret', 'ancien', 'contrat', 'satisfaction'];
    assert.deepStrictEqual(PointDeRupture.exigencesEntreprise(section, 'contrat', org).map((s) => s.slug),
        ['convention', 'contrat']);
    assert.strictEqual(PointDeRupture.exigencesEntreprise(section, 'disparue', org), null,
        'un point qui ne désigne aucune étape de la section n\'exige rien');

    /* UN DOCUMENT DE GROUPE COMPTE PAR SA SIGNATURE COLLECTIVE : un homonyme signé dans le dossier
       du stagiaire n'engage pas l'entreprise. */
    const convention = org.get('convention');
    const dossierSigne = PointDeRupture.statutsDocuments([{ template_slug: 'convention', status: 'SIGNE' }]);
    const groupeVide = PointDeRupture.statutsDocuments([]);
    assert.ok(!PointDeRupture.signeeEntreprise(convention, dossierSigne, groupeVide));
    assert.ok(PointDeRupture.signeeEntreprise(convention, groupeVide,
        PointDeRupture.statutsDocuments([{ template_slug: 'convention', status: 'SIGNE' }])));
});

test('rien d\'exigé, rien ne bloque', () => {
    for (const exigees of [null, []]) {
        assert.deepStrictEqual(PointDeRupture.bilan(exigees, () => false), { need: 0, done: 0, locked: false });
    }
});

test('la garde de l\'émargement et l\'avancement lisent la même règle', () => {
    const ESPACE = lire('controllers/espace.controller.js');
    const AVANCEMENT = lire('lib/avancement.js');
    for (const [nom, SRC] of [['garde de l\'émargement', ESPACE], ['avancement', AVANCEMENT]]) {
        assert.match(SRC, /require\('(\.\.\/lib|\.)\/pointDeRupture\.js'\)/, `${nom} : la règle partagée`);
        assert.match(SRC, /PointDeRupture\.exigencesDossier\(etapesDuDossier, /, `${nom} : volet dossier`);
        assert.match(SRC, /PointDeRupture\.exigencesEntreprise\(/, `${nom} : volet entreprise`);
    }
    // Plus de copie locale : le filtre des étapes exigées ne s'écrit plus dans la garde.
    assert.doesNotMatch(ESPACE, /\.filter\(\(s\) => s\.stagiaire_sign && /);
});

/* ─── L'avancement dit si le point est franchi ─────────────────────────────────────────────── */

/* Les dépendances qui chargent parcours, conditions et modèles sont remplacées AVANT de charger
   le calcul : on éprouve ce que fait `avancementDossiers` des étapes et des documents, pas la
   résolution des conditions (qui a ses propres tests). Le reste — parcours, règle du point —
   est le vrai code. */
const ETAPES = {
    1: [ // point du dossier posé après le contrat
        { slug: 'convocation', doc_type: 'CONVOCATION', label: 'Convocation', sort_order: 1, stagiaire_sign: 0 },
        { slug: 'contrat', doc_type: 'CONTRAT', label: 'Contrat', sort_order: 2, stagiaire_sign: 1 },
        { slug: 'emargement', doc_type: 'EMARGEMENT', label: 'Émargement', sort_order: 3, stagiaire_sign: 1 },
        { slug: 'satisfaction', doc_type: 'EVALUATION', label: 'Satisfaction', sort_order: 4, stagiaire_sign: 1 },
    ],
    2: [ // aucun point
        { slug: 'contrat', doc_type: 'CONTRAT', label: 'Contrat', sort_order: 1, stagiaire_sign: 1 },
    ],
    3: [ // section entreprise, point posé après la convention (document de groupe)
        { slug: 'convention', doc_type: 'CONVENTION', label: 'Convention', sort_order: 1, company_level: 1, signable: 1, company_sign: 1 },
        { slug: 'contrat', doc_type: 'CONTRAT', label: 'Contrat', sort_order: 2, stagiaire_sign: 1 },
        { slug: 'satisfaction', doc_type: 'EVALUATION', label: 'Satisfaction', sort_order: 3, stagiaire_sign: 1 },
    ],
    4: [ // point du DOSSIER après une convention que signe le stagiaire, du même TYPE qu'une convention de groupe
        { slug: 'convention-groupe', doc_type: 'CONVENTION', label: 'Convention (entreprise)', sort_order: 1, company_level: 1, signable: 1, company_sign: 1 },
        { slug: 'convention-stagiaire', doc_type: 'CONVENTION', label: 'Convention', sort_order: 2, stagiaire_sign: 1 },
    ],
};
const PROGRAMMES = [
    { id: 1, bs: 'contrat', cs: null, cbs: null },
    { id: 2, bs: null, cs: null, cbs: null },
    { id: 3, bs: null, cs: JSON.stringify(['convention', 'contrat', 'satisfaction']), cbs: 'convention' },
    { id: 4, bs: 'convention-stagiaire', cs: JSON.stringify(['convention-groupe', 'convention-stagiaire']), cbs: null },
];
const doc = (slug, status, extra = {}) => ({ id: Math.random(), type: slug.toUpperCase(), template_slug: slug, status, quiz_id: null, ...extra });
const DOCS = {
    11: [doc('convocation', 'ENVOYE'), doc('contrat', 'SIGNE')],
    12: [doc('convocation', 'ENVOYE'), doc('contrat', 'ENVOYE')],
    13: [doc('contrat', 'ENVOYE'), doc('contrat', 'SIGNE')], // refait après signature
    16: [doc('contrat', 'SIGNE', { template_slug: null })], // antérieur aux modèles : par son type
    23: [doc('convention', 'SIGNE')], // homonyme dans le DOSSIER : n'engage pas l'entreprise
};
const GROUPE = [
    { id: 90, type: 'CONVENTION', template_slug: 'convention', status: 'SIGNE', quiz_id: null, company_id: 7, session_id: 5 },
    { id: 91, type: 'CONVENTION', template_slug: 'convention', status: 'ENVOYE', quiz_id: null, company_id: 7, session_id: 6 },
    { id: 92, type: 'CONVENTION', template_slug: 'convention-groupe', status: 'SIGNE', quiz_id: null, company_id: 8, session_id: 9 },
];
const conn = {
    async query(sql, params) {
        if (/FROM piece_depot/.test(sql) || /FROM remise_document/.test(sql)) return [[]];
        if (/emargement_break_slug AS bs/.test(sql)) return [PROGRAMMES];
        if (/SELECT company_steps FROM training_program/.test(sql)) {
            const p = PROGRAMMES.find((x) => x.id === params[0]);
            return [[{ company_steps: p ? p.cs : null }]];
        }
        if (/JOIN document_formation df/.test(sql)) return [DOCS[params[0]] || []];
        if (/scope = 'COMPANY'/.test(sql)) return [GROUPE.filter((g) => g.company_id === params[1] && g.session_id === params[2])];
        throw new Error(`requête inattendue : ${sql}`);
    },
};
const remplacer = (rel, exports) => {
    const p = require.resolve(rel);
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
remplacer('../lib/conditions.js', {
    getEnabledFields: async () => [], loadDossierFactsMap: async () => new Map(), loadConditionMap: async () => new Map(),
});
remplacer('../lib/equivalence.js', { loadEquivalences: async () => [], equivalenceMap: () => new Map() });
remplacer('../controllers/formationProgram.controller.js', {
    enrollmentSteps: async (c, org, program) => ETAPES[program.id],
    formationSteps: async (c, org, program) => ETAPES[program.id],
});
remplacer('../controllers/template.controller.js', {
    loadOrgSteps: async () => ETAPES[3].map((s) => ({ ...s, active: 1 })),
});
const { avancementDossiers } = require('../lib/avancement.js');

const dossier = (enrollment_id, program_id, extra = {}) => ({ enrollment_id, program_id, session_id: 1, enr_company_id: null, ...extra });

test('l\'avancement dit si le point est franchi — la règle même de l\'émargement', async () => {
    const res = await avancementDossiers(conn, 1, [
        dossier(11, 1), dossier(12, 1), dossier(13, 1), dossier(14, 2), dossier(15, null), dossier(16, 1),
    ]);
    const franchi = (id) => res.get(id).point_franchi;
    assert.strictEqual(franchi(11), true, 'contrat signé : franchi');
    assert.ok(res.get(11).percent < 100, '… et pourtant incomplet : c\'est le dossier qu\'il faut finir');
    assert.strictEqual(franchi(12), false, 'contrat seulement envoyé : resté avant le point');
    assert.strictEqual(franchi(13), true, 'une version signée suffit, même refaite depuis');
    assert.strictEqual(franchi(14), true, 'une formation sans point ne bloque rien');
    assert.strictEqual(franchi(15), true, 'sans formation, rien à exiger');
    assert.strictEqual(franchi(16), true, 'document antérieur aux modèles : reconnu par son type');
});

test('volet entreprise : seulement pour un dossier arrivé par une entreprise, et la signature du GROUPE', async () => {
    const res = await avancementDossiers(conn, 1, [
        dossier(21, 3, { enr_company_id: 7, session_id: 5 }),
        dossier(22, 3, { enr_company_id: 7, session_id: 6 }),
        dossier(23, 3, { enr_company_id: 7, session_id: 6 }),
        dossier(24, 3, { enr_company_id: null, session_id: 6 }),
        dossier(25, 4, { enr_company_id: 8, session_id: 9 }),
    ]);
    assert.strictEqual(res.get(21).point_franchi, true, 'convention signée par le groupe, pour CETTE session');
    assert.strictEqual(res.get(22).point_franchi, false, 'la convention de cette session n\'est qu\'envoyée');
    assert.strictEqual(res.get(23).point_franchi, false, 'un homonyme signé dans le dossier n\'engage pas l\'entreprise');
    assert.strictEqual(res.get(24).point_franchi, true, 'venu seul : le volet entreprise ne s\'applique pas');
    /* Le volet DOSSIER ne lit que les documents du dossier, comme la garde : fusionnés avant d'être
       jugés, la convention de GROUPE signée par l'entreprise — même type — signait pour le stagiaire. */
    assert.strictEqual(res.get(25).point_franchi, false,
        'un document de groupe du même type ne signe pas à la place du stagiaire');
});

test('la liste des dossiers transmet le drapeau, sans l\'affirmer quand il manque', () => {
    const INSCRIPTIONS = lire('controllers/enrollment.controller.js');
    assert.match(INSCRIPTIONS, /e\.point_franchi = !!\(a && a\.point_franchi\);/);
});

/* ─── Tableau de bord ──────────────────────────────────────────────────────────────────────── */

const AUJOURDHUI = '2026-09-21';
const passee = (x) => (x.end_date || x.start_date || '9999') < AUJOURDHUI;
const ligne = (id, session_id, percent, extra = {}) => ({
    id, session_id, percent, total: 10, point_franchi: true, start_date: '2026-09-01', end_date: '2026-09-05', ...extra,
});

test('tableau de bord : le dossier incomplet d\'une session terminée reste, s\'il a franchi le point', async () => {
    const { dossiersASuivre } = await regleUi();
    const actives = new Set([2]);
    const enr = [
        ligne(1, 2, 40, { start_date: '2026-10-01', end_date: '2026-10-03' }), // session à venir
        ligne(2, 1, 60),                                                      // terminée, à finir
        ligne(3, 1, 100),                                                     // terminée, complète
        ligne(4, 1, 20, { point_franchi: false }),                            // jamais venu
        ligne(5, 1, 60, { point_franchi: undefined }),                        // serveur d'avant
        ligne(6, 1, 0, { total: 0 }),                                         // parcours vide
    ];
    const { aSuivre, derniers } = dossiersASuivre(enr, actives, passee);
    assert.deepStrictEqual(aSuivre.map((x) => x.id), [1, 2]);
    assert.deepStrictEqual(derniers.map((x) => [x.id, x.echu]), [[2, true], [1, false]],
        'le dossier en retard passe devant, et se signale comme tel');
});

test('tableau de bord : trier AVANT de couper — sinon le dossier en retard sortait de la carte', async () => {
    /* Six dossiers d'une session qui démarre, plus récents, et un dossier à finir, plus ancien :
       coupée d'abord, la carte gardait les six premiers et perdait justement celui-là. */
    const { dossiersASuivre, DERNIERS_DOSSIERS } = await regleUi();
    const actives = new Set([2]);
    const nouveaux = Array.from({ length: 6 }, (_, i) =>
        ligne(10 + i, 2, i % 2 ? 100 : 30, { start_date: '2026-10-01', end_date: '2026-10-03' }));
    const enr = [...nouveaux, ligne(99, 1, 70)];
    const { derniers } = dossiersASuivre(enr, actives, passee);
    assert.strictEqual(derniers.length, DERNIERS_DOSSIERS);
    assert.strictEqual(derniers[0].id, 99, 'l\'incomplet d\'une session terminée d\'abord');
    assert.deepStrictEqual(derniers.slice(1).map((x) => x.percent), [30, 30, 30, 100, 100],
        'puis les incomplets en cours, puis les complets — chacun dans l\'ordre reçu');
});

test('tableau de bord : la page lit la règle, et « à compléter » compte aussi les dossiers en retard', () => {
    const TABLEAU = lireUi('pages/Dashboard.jsx');
    assert.match(TABLEAU, /const \{ aSuivre, derniers \} = dossiersASuivre\(enr, activeIds, isPast\);/);
    assert.match(TABLEAU, /setRecent\(derniers\);/, 'la carte reçoit la liste triée PUIS coupée');
    assert.match(TABLEAU, /const incomplets = aSuivre\.filter\(/);
    assert.match(TABLEAU, /e\.echu && .*Session terminée le \{dateFr\(/, 'la ligne dit pourquoi elle est encore là');
});

/* ─── Suivi Qualiopi ───────────────────────────────────────────────────────────────────────── */

test('suivi : les dossiers complets quittent la liste, et reviennent à la demande', async () => {
    const { sansLesComplets } = await regleUi();
    const d = (id, score) => ({ enrollment_id: id, score });
    const groupes = [
        { type: 'solo', d: d(1, 'VERT') },
        { type: 'solo', d: d(2, 'ORANGE') },
        { type: 'company', company_id: 7, percent: 83, members: [d(3, 'VERT'), d(4, 'ORANGE'), d(5, 'VERT')] },
        { type: 'company', company_id: 8, percent: 100, members: [d(6, 'VERT')] },
    ];
    const vus = sansLesComplets(groupes, false);
    assert.deepStrictEqual(vus.map((g) => (g.type === 'solo' ? g.d.enrollment_id : `c${g.company_id}`)), [2, 'c7'],
        'le dossier complet et l\'entreprise toute complète s\'effacent');
    const c7 = vus[1];
    assert.deepStrictEqual(c7.membresVus.map((m) => m.enrollment_id), [4]);
    assert.strictEqual(c7.complets, 2, '« dont 2 complets »');
    assert.strictEqual(c7.percent, 83, 'l\'agrégat reste celui de TOUT le groupe');
    assert.strictEqual(sansLesComplets(groupes, true).length, 4, 'le compteur les réaffiche tous');
});

test('suivi : le compteur compte TOUS les complets et sert d\'interrupteur', () => {
    const SUIVI = lireUi('pages/Suivi.jsx');
    assert.match(SUIVI, /const count = \(score\) => dossiers\.filter\(/,
        'le compteur porte sur tous les dossiers, pas sur la liste affichée');
    assert.match(SUIVI, /aria-pressed=\{voirComplets\}/);
    assert.match(SUIVI, /onClick=\{\(\) => setVoirComplets\(/);
    /* Les agrégats d'entreprise se calculent sur la liste ENTIÈRE, et le masquage vient après :
       masquer d'abord ferait baisser le pourcentage d'une entreprise à chaque dossier terminé. */
    assert.match(SUIVI, /grouperParEntreprise\(dossiersVus\)/);
    assert.match(SUIVI, /useMemo\(\(\) => sansLesComplets\(groups, voirComplets\)/);
    assert.match(SUIVI, /\{affiches\.map\(\(g\) =>/);
});

test('suivi : le libellé « En cours » d\'une feuille de route ne prend pas la forme de la barre .progress', () => {
    /* La classe d'état porte le même nom que la barre d'avancement (9 px, fond gris, débordement
       masqué) : sans correctif, le libellé était coupé à mi-hauteur sous une barre grise. */
    const CSS = lireUi('styles/app.css');
    assert.match(CSS, /\.progress\{height:9px;/, 'la barre existe toujours sous ce nom');
    assert.match(CSS, /\.rm-tag\.progress\{height:auto;background:none;border-radius:0;overflow:visible\}/);
});

/* ─── Les stagiaires d'une entreprise, rangés sous elle (2026-09-23) ───────────────────────── */

test('tableau de bord : les stagiaires d\'une entreprise se rangent sous elle, et elle est cliquable', async () => {
    /* LE BESOIN, posé depuis le tableau de bord : « Baptiste vient d'une entreprise, et
       l'entreprise a elle aussi des documents à signer. » Éparpillés dans « Derniers dossiers »,
       rien ne disait qu'ils venaient du même employeur — et la convention de formation, elle,
       n'est sur la fiche d'AUCUN d'entre eux : elle est sur celle de l'entreprise. */
    const { grouperParEntreprise } = await regleUi();
    const g = grouperParEntreprise([
        { id: '1', company_id: 'c1', company_name: 'PIZZERIA DEL SOL' },
        { id: '2', company_id: null },
        { id: '3', company_id: 'c1', company_name: 'PIZZERIA DEL SOL' },
        { id: '4', company_id: 'c2', company_name: 'LES BRAISES' },
    ]);
    assert.deepStrictEqual(g.map((x) => x.type), ['company', 'solo', 'company']);
    /* L'ORDRE REÇU EST CONSERVÉ, et un groupe prend la place de son PREMIER membre : la carte
       reste triée comme elle l'était (le plus pressé devant). Rassemblés en fin de liste, les
       dossiers d'une entreprise arrivée ce matin passeraient sous ceux de la semaine dernière. */
    assert.deepStrictEqual(g[0].members.map((m) => m.id), ['1', '3']);
    assert.strictEqual(g[0].company_name, 'PIZZERIA DEL SOL');
    assert.strictEqual(g[1].d.id, '2');

    /* SANS NOM, UN LIBELLÉ PLUTÔT QU'UN VIDE : l'identifiant ne s'affiche pas, et une ligne sans
       titre se lirait comme un bogue. */
    const [anonyme] = grouperParEntreprise([{ id: '5', company_id: 'c9' }]);
    assert.strictEqual(anonyme.company_name, 'Entreprise');

    /* LA MÊME RÈGLE DES DEUX CÔTÉS : le suivi la lisait déjà, écrite chez lui. Deux boucles
       côte à côte auraient rangé les mêmes dossiers autrement, sans que rien ne le signale. */
    assert.match(lireUi('pages/Suivi.jsx'), /grouperParEntreprise\(dossiersVus\)/);
    const TB = lireUi('pages/Dashboard.jsx');
    assert.match(TB, /grouperParEntreprise\(recent\)/);
    /* LE NOM MÈNE À LA FICHE DE L'ENTREPRISE — c'est tout l'objet de la demande —, et seulement
       si le rôle peut l'ouvrir : sa page est réservée à l'administration, et un lien offert au
       formateur l'aurait renvoyé à l'accueil sans un mot (même garde que `ficheOuvrable`). */
    assert.match(TB, /const entrepriseOuvrable = !!ENTREE_ENTREPRISES && canOpen\(user, ENTREE_ENTREPRISES\)/);
    assert.match(TB, /entrepriseOuvrable \? \(\s*<Link to=\{`\/entreprises\/\$\{g\.company_id\}`\}/);

    /* ET LE NOM DE L'ENTREPRISE DOIT ARRIVER : le dossier ne portait que `company_id`, qui ne
       s'affiche pas. Jointure À GAUCHE — la fermer ferait disparaître tous les dossiers sans
       entreprise, c'est-à-dire la plupart. */
    const CTRL = lire('controllers/enrollment.controller.js');
    assert.match(CTRL, /c\.name AS company_name,/);
    assert.match(CTRL, /LEFT JOIN company c ON c\.id = e\.company_id/);
});

test('suivi : l\'en-tête d\'une entreprise mène AUSSI à sa fiche, sans casser le dépli', () => {
    /* MÊME DEMANDE QU'AU TABLEAU DE BORD, un cran plus loin (2026-09-23) : ici l'en-tête n'était
       QU'une bascule. On dépliait le groupe, on lisait ses stagiaires, et l'entreprise — dont la
       convention et l'accord de prise en charge se signent sur SA fiche — restait hors d'atteinte
       depuis l'écran qui, justement, dit qu'il lui manque des documents. */
    const SUIVI = lireUi('pages/Suivi.jsx');
    const tete = SUIVI.slice(SUIVI.indexOf('<div className="suivi-groupe-tete">'),
        SUIVI.indexOf('suivi-groupe-membres'));
    assert.match(tete, /<Link to=\{`\/entreprises\/\$\{g\.company_id\}`\}/);
    /* LE LIEN EST LE FRÈRE DU BOUTON, PAS SON ENFANT. Un `<a>` dans un `<button>` n'est pas du
       HTML valide — le navigateur défait l'imbrication à l'analyse — et le clic déclencherait les
       deux gestes : on partirait sur la fiche en ayant déplié le groupe qu'on quitte. */
    assert.ok(tete.indexOf('</button>') < tete.indexOf('suivi-groupe-fiche'),
        'le bouton doit être refermé AVANT le lien');
    assert.match(tete, /aria-label=\{`Ouvrir la fiche de \$\{g\.company_name\}`\}/,
        'sur téléphone le libellé disparaît : sans aria-label, il ne resterait qu’un chevron muet');
    /* LA MÊME GARDE DE RÔLE QU'AU TABLEAU DE BORD : la fiche d'une entreprise est réservée à
       l'administration, et un auditeur suivi d'un lien serait renvoyé à l'accueil sans un mot. */
    assert.match(SUIVI, /const entrepriseOuvrable = !!ENTREE_ENTREPRISES && canOpen\(user, ENTREE_ENTREPRISES\)/);
    assert.match(SUIVI, /\{entrepriseOuvrable && \(/);
    /* 44 PX AU POUCE. Sans libellé, le lien tombait à 30 px de côté : on le manquait, et on
       dépliait le groupe à la place — l'inverse de ce qu'on voulait faire. */
    assert.match(lireUi('styles/app.css'),
        /\.suivi-groupe-fiche\{font-size:0;padding:0;min-width:44px;min-height:44px;justify-content:center\}/);
});
