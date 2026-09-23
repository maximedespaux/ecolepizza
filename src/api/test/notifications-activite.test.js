/**
 * L'ACTIVITÉ DANS LA CLOCHE — on est prévenu de ce qu'on a le droit de voir, et de rien d'autre.
 *
 * LE DÉFAUT D'ORIGINE : le carillon sonnait à chaque modification faite par quelqu'un d'autre,
 * sans jamais dire QUOI. On entendait, on ne savait pas. La cloche liste désormais les
 * changements — en relisant le journal d'audit, qui les contient déjà tous.
 *
 * MAIS le journal est réservé aux administrateurs, et pour une bonne raison : « Facture
 * supprimée », « Paiement enregistré », « Dépense créée ». Le donner à tout le personnel
 * transformerait un confort d'usage en fuite comptable. D'où le filtrage par rubrique de menu,
 * que ces tests gèlent — y compris son cas le plus dangereux, celui du SILENCE : une entité
 * journalisée qu'on oublierait de rattacher à une rubrique.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
    SECTION_PAR_ENTITE, sectionDeLEntite, sectionsVisibles, entitesVisibles, estLu, estEvenement } = require('../lib/activite.js');

const CTRL = path.join(__dirname, '..', 'controllers');
const NOTIF = fs.readFileSync(path.join(CTRL, 'notification.controller.js'), 'utf8');
const PAGE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/pages/Notifications.jsx'), 'utf8');

const nav = (o) => JSON.stringify(o);

test('un propriétaire est prévenu de tout', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN_ORGANISME']) {
        assert.strictEqual(sectionsVisibles({ role, navAccess: null }), null, `${role} : tout`);
        // Même avec un nav_access restreint : c'est lui qui distribue les accès.
        assert.strictEqual(sectionsVisibles({ role, navAccess: nav({ '/stagiaires': 'read' }) }), null);
    }
});

test('un formateur SANS accès réglé n\'a aucune activité — la position fermée', () => {
    /* On ne recalcule PAS le menu par défaut de son rôle : ce dictionnaire vit dans l'interface
       (nav.js). En tenir une copie serveur, c'est le défaut du tableau de bord — huit codes sur
       soixante-quatre, divergence silencieuse. Faute de règle explicite, on ne montre rien. */
    assert.deepStrictEqual(sectionsVisibles({ role: 'FORMATEUR', navAccess: null }), []);
    assert.deepStrictEqual(sectionsVisibles({ role: 'AUDITEUR', navAccess: '' }), []);
    // Le secrétariat, lui, garde la vue complète qu'il a déjà partout dans l'API.
    assert.strictEqual(sectionsVisibles({ role: 'SECRETARIAT', navAccess: null }), null);
});

test('un formateur n\'est prévenu que des rubriques qu\'on lui a accordées', () => {
    const vues = sectionsVisibles({
        role: 'FORMATEUR',
        navAccess: nav({ '/stagiaires': 'write', '/sessions': 'read', '/comptabilite': null }),
    });
    assert.deepStrictEqual(vues, ['/stagiaires', '/sessions']);

    const entites = entitesVisibles(vues);
    for (const attendu of ['Learner', 'PieceDepot', 'GeneratedDocument', 'TrainingSession', 'AttendanceSheet']) {
        assert.ok(entites.includes(attendu), `${attendu} devrait être visible`);
    }
    // LA FUITE QU'ON EMPÊCHE : la comptabilité n'a pas été accordée.
    for (const interdit of ['Invoice', 'Expense', 'RevenueExtra', 'MaterialSale', 'Partner']) {
        assert.ok(!entites.includes(interdit), `${interdit} ne doit PAS fuir`);
    }
});

test('les changements d\'administration ne se racontent jamais', () => {
    /* CE QUI COMPTE N'EST PAS LA RUBRIQUE MAIS L'ENTITÉ. « Équipe & accès » se délègue désormais,
       y compris en écriture : la borne ne peut donc plus venir d'une liste de rubriques
       interdites. Elle vient de `estEvenement` — `User` et `AccessProfile` sont des RÉGLAGES,
       et un réglage ne sonne pas. Savoir qu'un membre a changé de profil est une information
       d'administration, pas une nouvelle d'équipe. */
    assert.ok(!estEvenement('User'), 'un changement de membre ne doit pas sonner');
    assert.ok(!estEvenement('AccessProfile'), 'un changement de profil non plus');
    // « Rôles d'accès » reste hors des rubriques dont on tient quelqu'un au courant.
    const vues = sectionsVisibles({ role: 'FORMATEUR', navAccess: nav({ '/roles': 'write' }) });
    assert.deepStrictEqual(vues, []);
    assert.deepStrictEqual(entitesVisibles(vues), []);
});

test('l\'ancien format de nav_access (tableau = écriture) reste compris', () => {
    // Même lecture que la garde d'accès : `modeFor` est importé, pas réécrit à côté.
    assert.deepStrictEqual(sectionsVisibles({ role: 'AUDITEUR', navAccess: nav(['/comptabilite']) }), ['/comptabilite']);
});

test('TOUTE entité journalisée est rattachée à une rubrique', () => {
    /* LE TEST QUI COMPTE. Une entité absente de la table n'est montrée qu'aux propriétaires :
       ça ne fuit pas, mais ça DISPARAÎT — le formateur n'apprend jamais qu'un stagiaire a été
       créé, sans qu'aucune erreur ne soit levée. Un `logAudit` ajouté demain avec une entité
       neuve doit donc faire virer ce test au rouge, pour forcer à la classer. */
    const entites = new Set();
    for (const f of fs.readdirSync(CTRL).filter((f) => f.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(CTRL, f), 'utf8');
        for (const m of src.matchAll(/logAudit\(\s*req\s*,\s*'[^']+'\s*,\s*'([^']+)'/g)) entites.add(m[1]);
    }
    assert.ok(entites.size > 30, `on attend une trentaine d'entités, trouvé ${entites.size}`);
    const orphelines = [...entites].filter((e) => !sectionDeLEntite(e));
    assert.deepStrictEqual(orphelines, [], `entités sans rubrique : ${orphelines.join(', ')}`);
});

test('la lecture d\'un flux est une DATE, pas un état par ligne', () => {
    const quand = '2026-09-09 10:00:00';
    assert.strictEqual(estLu({ quand, vue: '2026-09-09 11:00:00', dormant: false }), true, 'lu après → lu');
    assert.strictEqual(estLu({ quand, vue: '2026-09-09 09:00:00', dormant: false }), false, 'lu avant → neuf');
    assert.strictEqual(estLu({ quand, vue: null, dormant: false }), false, 'jamais lu → neuf');
    /* AVANT la migration 142, la colonne n'existe pas : tout est réputé lu. Sans ce repli, le
       déploiement ferait sauter la pastille à trente sur chaque poste, pour une lecture qu'on
       est incapable de mémoriser — un compteur inventé, qui ne redescendrait jamais. */
    assert.strictEqual(estLu({ quand, vue: null, dormant: true }), true);
});

test('le serveur ne renvoie JAMAIS mes propres actions, et filtre avant la coupe', () => {
    assert.match(NOTIF, /a\.user_id <> \?/, 'mes propres actions sont exclues en SQL');
    const req = NOTIF.slice(NOTIF.indexOf('FROM audit_log'), NOTIF.indexOf('LIMIT 30'));
    assert.ok(req.includes('${filtre}'), 'le filtre par entité est DANS la requête…');
    assert.ok(NOTIF.indexOf('a.entity IN') < NOTIF.indexOf('LIMIT 30'), '…donc appliqué avant le LIMIT');
});

test('aucun libellé français côté serveur — la traduction reste dans l\'interface', () => {
    /* Le tableau de bord tenait SA table d'actions en double : huit entrées quand auditLabels en
       comptait soixante-quatre, et il divergeait du journal en silence. On ne recommence pas. */
    assert.ok(!/'(Stagiaire|Facture|Document) (créé|supprimé|signé)/.test(NOTIF),
        'le contrôleur ne doit contenir aucun libellé d\'action');
    assert.match(NOTIF, /action: r\.action/, 'le code brut part tel quel…');
    assert.match(PAGE, /auditLabel\(n\.action, n\.entity\)/, '…et c\'est l\'écran qui le traduit');
    /* L'étiquette dit OÙ, pas QUOI : avec l'entité, la ligne affichait « Dépense » puis
       « Dépense supprimée » — la même information deux fois, et rien sur la rubrique visée. */
    /* DEPUIS QUE LE LIEN N'EST PLUS LA RUBRIQUE, l'étiquette la lit dans `section`. La chercher
       dans `link` la faisait disparaître dès que le lien devenait précis (« /stagiaires/<id> »
       n'est pas une clé de PAGE_TITLES) ou nul. */
    assert.match(PAGE, /PAGE_TITLES\[n\.section\]/, 'l\'étiquette porte la rubrique');
    assert.match(NOTIF, /section: sectionDeLEntite\(r\.entity\)/, '…que le serveur envoie à part');
});

test('une ligne d\'activité ne se marque pas comme lue individuellement', () => {
    // Son identifiant n'existe pas dans `notification` : l'appel ne ferait rien et la ligne
    // resterait neuve après le clic — un bouton qui ment.
    assert.match(PAGE, /if \(!n\.is_read && n\.type !== "ACTIVITE"\)/);
    assert.match(NOTIF, /activite:\$\{r\.id\}/, 'le préfixe qui rend ces identifiants reconnaissables');
});

/* ---------------------------------------------------------------------------------------------
 * SUPPRIMER UNE NOTIFICATION — un droit accordé par l'organisme, et qui s'arrête au journal.
 * ------------------------------------------------------------------------------------------- */

const NAV = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/lib/nav.js'), 'utf8');

test('une ligne d\'activité ne se supprime JAMAIS — le journal ne s\'efface pas', async () => {
    /* Le vrai risque de cette fonctionnalité. Un droit de ménage dans la cloche ne doit pas
       devenir, par un simple préfixe d'identifiant, un droit d'effacer l'historique de qui a
       fait quoi. Le refus est EXPLICITE : un DELETE qui ne trouve rien et répond « c'est fait »
       laisserait croire que la ligne est partie, et elle reviendrait au rechargement. */
    const { deleteNotification } = require('../controllers/notification.controller.js');
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    await deleteNotification(
        { params: { id: 'activite:6f2b' }, user: { id: 'u1', role: 'SUPER_ADMIN', organization_id: 'o1' } },
        res);
    assert.strictEqual(code, 422, 'même un super administrateur ne peut pas effacer le journal');
    assert.match(corps.message, /journal/i, 'et on lui dit pourquoi');
});

test('le droit de supprimer se lit dans la capacité, pas dans le rôle', () => {
    const { CAP_SUPPRIMER_NOTIF, ROLES_SUPPRESSION_DOFFICE } = require('../controllers/notification.controller.js');
    // Le serveur relit la capacité EN BASE : un rôle porté par le jeton resterait valable
    // jusqu'à sept jours après le retrait du droit.
    assert.match(NOTIF, /aLaCapaciteEnBase\(req\.user, CAP_SUPPRIMER_NOTIF, ROLES_SUPPRESSION_DOFFICE\)/);
    assert.doesNotMatch(
        fs.readFileSync(path.join(__dirname, '..', 'routes/notification.routes.js'), 'utf8'),
        /authorizeRoles\(/, 'la route ne doit pas être gardée par un rôle');

    // L'écran et le serveur doivent nommer LA MÊME capacité : une faute de frappe donnerait une
    // case à cocher sans effet, et rien ne le signalerait.
    assert.ok(NAV.includes(`to: "${CAP_SUPPRIMER_NOTIF}"`), 'la capacité doit exister dans EXTRA_ACCESS');
    /* Et les rôles qui l'ont D'OFFICE doivent être exactement ceux annoncés à l'écran, sinon la
       fenêtre affiche « non » à quelqu'un que le serveur autorise quand même. */
    const bloc = new RegExp(`to: "${CAP_SUPPRIMER_NOTIF}"[\\s\\S]*?defaultRoles: \\[([^\\]]+)\\]`).exec(NAV);
    assert.ok(bloc, 'defaultRoles introuvable pour cette capacité');
    const affiches = [...bloc[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(affiches, ROLES_SUPPRESSION_DOFFICE);
});

test('la corbeille n\'apparaît pas sur une ligne d\'activité, ni sans le droit', () => {
    assert.match(PAGE, /peutSupprimer && n\.type !== "ACTIVITE"/,
        'le bouton est doublement conditionné : le droit ET la nature de la ligne');
    // Un bouton visible qui répond 403 fait croire à une panne là où il n'y a qu'un droit absent.
    assert.match(PAGE, /aLaCapacite\(user, "cap:delete-notifications"\)/);
    assert.match(PAGE, /window\.confirm\(/, 'une suppression d\'organisme se confirme avant, pas après');
});

test('un lot de créations tient sur UNE ligne, sans mentir sur l\'ordre', () => {
    const { regrouperConsecutives } = require('../lib/activite.js');
    const l = (action, auteur, is_read = 0) => ({ action, entity: 'Learner', auteur, is_read });
    /* L'inscription d'un groupe crée douze fiches d'un coup. Recopiées telles quelles, elles
       chassent tout le reste de la cloche — la facture envoyée juste avant devient invisible. */
    const r = regrouperConsecutives([
        l('learner.create', 'Marie'), l('learner.create', 'Marie'), l('learner.create', 'Marie'),
        l('invoice.create', 'Jean'),
        l('learner.create', 'Marie'),
    ]);
    assert.deepStrictEqual(r.map((x) => `${x.action}×${x.nombre}`),
        ['learner.create×3', 'invoice.create×1', 'learner.create×1'],
        'CONSÉCUTIVES seulement : fusionner à distance remonterait un événement ancien au rang du récent');

    // Auteurs différents : deux lignes, sinon on attribuerait à l'un le geste de l'autre.
    assert.strictEqual(regrouperConsecutives([l('learner.create', 'Marie'), l('learner.create', 'Sophie')]).length, 2);
    // Un groupe est NEUF dès qu'une seule de ses lignes l'est.
    assert.strictEqual(regrouperConsecutives([l('learner.create', 'Marie', 1), l('learner.create', 'Marie', 0)])[0].is_read, 0);
    assert.match(PAGE, /×\$\{n\.nombre\}/, 'et l\'écran dit le nombre');
});

test('un lien de notification ne mène qu\'à l\'enregistrement, ou nulle part', async () => {
    /* DÉFAUT MESURÉ EN PRODUCTION le 2026-09-16 : sur les CENT dernières lignes du journal,
       QUATRE-VINGT-ONZE menaient à une liste. Le lien traduisait le TYPE d'entité en rubrique de
       menu — « Émargement signé » déposait sur le calendrier des sessions, « Note d'évaluation
       saisie » aussi, « Document signé » sur l'annuaire complet des stagiaires. On savait ce qui
       s'était passé et il fallait le rechercher à la main, en ayant perdu sa place.

       La justification écrite était « un lien qui marche toujours ». Elle était exacte et
       répondait à côté : elle garantissait de ne jamais tomber sur une 404, pas d'emmener
       quelque part. */
    const { lienDeLEntite } = await import('../lib/activite.js');

    // Les trois entités dont l'identifiant du journal EST la clé d'une route de détail.
    assert.strictEqual(lienDeLEntite('Learner', 'abc'), '/stagiaires/abc');
    assert.strictEqual(lienDeLEntite('Company', 'abc'), '/entreprises/abc');
    assert.strictEqual(lienDeLEntite('TrainingSession', 'abc'), '/sessions/abc');

    /* LE PIÈGE QU'ON REFUSE. `AttendanceSheet` est rangée sous `/sessions`, mais son `entity_id`
       est celui de la FEUILLE, pas de la session : « /sessions/<id-de-feuille> » serait une page
       qui n'existe pas. Un lien cassé est strictement pire qu'un lien absent. */
    for (const e of ['AttendanceSheet', 'GeneratedDocument', 'PieceDepot', 'EvaluationNote', 'Quiz']) {
        assert.strictEqual(lienDeLEntite(e, 'abc'), null, `${e} n'a pas de page à elle`);
    }
    // Sans identifiant, pas de lien — 10 appels de logAudit sur 128 n'en écrivent pas.
    assert.strictEqual(lienDeLEntite('Learner', null), null);
});

test('une ligne groupée « ×12 » perd son lien : elle ne nomme plus un enregistrement', async () => {
    /* Douze fiches créées d'un coup se regroupent en une ligne. Garder le lien de la première
       ferait ouvrir l'une des douze au hasard, sans rien dire du choix. */
    const { regrouperConsecutives } = await import('../lib/activite.js');
    const l = (link) => ({ action: 'learner.create', entity: 'Learner', auteur: 'X', is_read: 1, link });
    const seule = regrouperConsecutives([l('/stagiaires/a')]);
    assert.strictEqual(seule[0].link, '/stagiaires/a', 'une ligne seule garde son lien');
    const groupe = regrouperConsecutives([l('/stagiaires/a'), l('/stagiaires/b'), l('/stagiaires/c')]);
    assert.strictEqual(groupe.length, 1);
    assert.strictEqual(groupe[0].nombre, 3);
    assert.strictEqual(groupe[0].link, null, 'un groupe ne nomme plus un enregistrement');
});

test('la cloche sépare ce qui appelle un geste de ce qui s\'est passé', () => {
    /* DÉFAUT MESURÉ EN PRODUCTION le 2026-09-16 : l'utilisateur ne voyait plus ses relances
       « Émargement à signer » et les croyait supprimées. Elles étaient là — au ONZIÈME rang.
       Les deux sources étaient mêlées par date puis coupées à quarante lignes, et l'activité,
       plus récente par nature (trente lignes de journal peuvent toutes dater du jour), occupait
       tout le haut. Seize notifications adressées tombaient déjà hors de la coupe.

       Les deux listes voyagent donc séparément, chacune avec sa limite. */
    assert.match(NOTIF, /res\.json\(\{\s*data: notifs[\s\S]{0,120}activite: activite/,
        'le serveur renvoie deux listes, pas une liste mêlée');
    assert.ok(!/tout\.slice\(0, 40\)/.test(NOTIF), 'plus de coupe commune aux deux natures');
    /* LE COMPTE NE SE PREND PLUS DANS LES LISTES, ET C'EST LE DÉFAUT SUIVANT (2026-09-23) :
       elles sont coupées à 40 et 30, donc la pastille plafonnait là sans jamais le dire — un
       chiffre précis, donc crédible, et faux dès qu'on avait plus à lire que la page n'en
       montre. Deux comptes pris EN BASE, un par nature, puisque les écrans les distinguent
       désormais par la couleur ; `unread` reste leur somme. */
    assert.match(NOTIF, /SELECT COUNT\(\*\) AS n FROM notification/, 'les alertes se comptent en base');
    assert.match(NOTIF, /SELECT COUNT\(\*\) AS n FROM audit_log a/, 'l\'activité aussi');
    assert.match(NOTIF, /unread: nonLuesAlertes \+ nonLuesActivite/);
    assert.match(NOTIF, /non_lues: \{ alertes: nonLuesAlertes, activite: nonLuesActivite \}/);
    /* LE MÊME FILTRE POUR LA LISTE ET POUR LE COMPTE : deux copies finiraient par diverger, et
       la pastille annoncerait des lignes introuvables. */
    assert.match(NOTIF, /function entitesDeLActivite\(/);
    assert.strictEqual((NOTIF.match(/= entitesDeLActivite\(\{ role, navAccess \}\)/g) || []).length, 2,
        'la liste et le compte posent le MÊME filtre d\'entités');
    assert.match(PAGE, /rows\.alertes/, 'l\'écran a un bloc pour les alertes…');
    assert.match(PAGE, /rows\.activite/, '…et un pour l\'activité');
});

test('la ligne de notification n\'est écrite qu\'UNE fois, et ne lit rien hors de sa portée', () => {
    /* DEUX DÉFAUTS EN UN, tous deux rencontrés en écrivant ce correctif.

       1. Rendre la même ligne dans deux blocs invitait à copier son balisage. Deux copies d'une
          règle finissent toujours par diverger — ce projet l'a payé six fois (docState/stepState,
          le sélecteur de session, sept copies de la regex d'accents…). Un seul composant.

       2. En EXTRAYANT ce composant, `rows.map` est resté tel quel alors que `rows` n'existe plus
          dans sa portée : au clic, `ReferenceError`. **esbuild n'a rien dit** — il ne détecte pas
          les références non définies (CLAUDE.md § 2.4). Le défaut n'a été vu qu'en relisant. */
    const bloc = PAGE.slice(PAGE.indexOf('function Liste({'), PAGE.indexOf('\nfunction Notifications()'));
    assert.ok(bloc.length > 200, 'le composant de ligne existe au niveau du module');
    assert.ok(!/\brows\b/.test(bloc), '`rows` n\'est pas dans la portée de Liste');
    assert.match(bloc, /lignes\.map\(\(n\)/, 'il itère sur sa propre prop');
    /* Compté sur `"notif-ligne"` et NON sur `className="notif-ligne"` : le balisage écrit
       `className={"notif-ligne" + …}`, donc la seconde forme n'apparaît jamais et l'assertion
       aurait été vraie quoi qu'on fasse — verte, et sans rien vérifier. */
    assert.strictEqual((PAGE.match(/"notif-ligne"/g) || []).length, 1,
        'le balisage de la ligne n\'existe qu\'à un seul endroit');
    /* UN SEUL `<Liste>` depuis que les deux natures sont des ONGLETS et non deux blocs empilés :
       l'onglet fermé n'est pas rendu du tout. C'est encore mieux pour ce que ce test protège —
       il ne reste plus qu'un endroit où la ligne s'écrit. */
    assert.strictEqual((PAGE.match(/<Liste /g) || []).length, 1, 'un seul point de rendu');
});

test('les onglets réutilisent le motif de l\'application, pas un troisième style', () => {
    /* Sept pages emploient déjà `.tabs` / `role="tablist"` (Ventes, Résultats QCM, Comptabilité,
       Formations, Modèles, Partenaires, Session). En écrire un huitième à la main aurait donné
       deux styles d'onglet qui divergent — le défaut que ce projet paie à chaque fois. */
    assert.match(PAGE, /className="tabs" role="tablist"/);
    assert.strictEqual((PAGE.match(/role="tab" aria-selected=/g) || []).length, 2,
        'deux onglets, tous deux annoncés à la navigation vocale');
    assert.match(PAGE, /useState\("alertes"\)/, '« Alertes » ouvert par défaut : c\'est ce qui appelle un geste');
});
