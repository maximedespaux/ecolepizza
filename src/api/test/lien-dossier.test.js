/**
 * D'UN DOSSIER À LA FICHE DU STAGIAIRE, OUVERTE SUR CE DOSSIER (2026-09-21).
 *
 * LA DEMANDE. Une ligne de « Derniers dossiers », sur le tableau de bord, ne s'ouvrait pas : pour
 * voir le dossier, il fallait passer par la liste des stagiaires et chercher le nom. Puis, le même
 * jour : le suivi Qualiopi, les inscrits d'une session, les cartes du pipeline et la notation, qui
 * ouvraient bien la fiche — sur le premier dossier.
 *
 * CE QUI SE CACHAIT DERRIÈRE. La fiche a un onglet par dossier — NIV1H, puis RS7404 : le parcours
 * ordinaire de l'école — et s'ouvrait toujours sur le PREMIER. Un simple lien vers la fiche aurait
 * donc, un jour, montré un autre parcours que celui qu'on venait de voir à 62 %, sans que rien ne
 * le signale. Le lien porte le dossier (`?dossier=`), et la fiche le sélectionne — à condition
 * qu'il soit bien à CE stagiaire.
 *
 * ET UN LIEN QUI NE MÈNE NULLE PART N'EN EST PAS UN. La liste des dossiers s'ouvre au SECRÉTARIAT
 * par son seul rôle (routes/enrollment.routes.js), la fiche seulement si le menu offre
 * « Stagiaires » (garde de route). Un secrétariat privé de cette rubrique voit donc les lignes :
 * un lien l'aurait renvoyé vers l'accueil, sans un mot.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const lien = () => import('../../app/ui/lib/lienDossier.js');

test('le lien désigne la fiche ET le dossier', async () => {
    const { lienDossier } = await lien();
    assert.strictEqual(lienDossier('l-7', 'e-42'), '/stagiaires/l-7?dossier=e-42');
    // Un identifiant ne casse pas l'adresse, quoi qu'il contienne.
    assert.strictEqual(lienDossier('x/y', 'a&b'), '/stagiaires/x%2Fy?dossier=a%26b');
});

test('la fiche ouvre le dossier demandé, s\'il est bien à ce stagiaire', async () => {
    const { dossierAffiche } = await lien();
    const dossiers = [{ id: 'niv1h' }, { id: 'rs7404' }];
    assert.strictEqual(dossierAffiche(dossiers, 'rs7404'), 'rs7404');
    /* Lien ancien, dossier supprimé, adresse retouchée : repris tel quel, l'identifiant ferait
       charger sur cette fiche le parcours d'un AUTRE dossier, et y préparer un document l'y
       rattacherait. */
    assert.strictEqual(dossierAffiche(dossiers, 'dossier-d-un-autre'), 'niv1h');
    assert.strictEqual(dossierAffiche(dossiers, null), 'niv1h', 'sans lien : le premier, comme avant');
    assert.strictEqual(dossierAffiche(dossiers, ''), 'niv1h');
    assert.strictEqual(dossierAffiche([], 'rs7404'), null,
        'fiche pas encore chargée : aucun dossier, et surtout pas celui du lien, non vérifié');
    assert.strictEqual(dossierAffiche([{ id: 12 }, { id: 13 }], '13'), 13,
        'l\'adresse rend une chaîne : un identifiant numérique doit s\'y reconnaître');
});

test('la fiche lit le lien, et l\'onglet qu\'on choisit ensuite garde la main', () => {
    const FICHE = lireUi('pages/StagiaireDetail.jsx');
    assert.match(FICHE, /const \[parametres\] = useSearchParams\(\);/);
    assert.match(FICHE, /const curEnrId = dossierAffiche\(enrollments, parcoursEnr \|\| parametres\.get\("dossier"\)\);/);
    /* Un hook ne se déclare jamais derrière le retour anticipé de la fiche : il ne serait appelé
       qu'une fois la fiche chargée, et React lèverait l'erreur #310 (la page se vide). */
    assert.ok(FICHE.indexOf('useSearchParams();') < FICHE.indexOf('  if (!l) {'),
        'useSearchParams doit précéder `if (!l)`');
});

test('tableau de bord : chaque ligne mène à la fiche, quand la fiche s\'ouvrira', () => {
    const TABLEAU = lireUi('pages/Dashboard.jsx');
    assert.match(TABLEAU, /\{ficheOuvrable \? \(\s*<Link to=\{lienDossier\(e\.learner_id, e\.id\)\} className="rowlink dossier-lien"/,
        'le lien porte le dossier, et n\'existe que si la fiche s\'ouvrira');
    assert.match(TABLEAU, /const ficheOuvrable = !!ENTREE_STAGIAIRES && canOpen\(user, ENTREE_STAGIAIRES\);/,
        'même décision que le menu, qui est celle de la garde de route');
});

test('un secrétariat sans « Stagiaires » au menu voit les lignes, sans lien', async () => {
    const { NAV, canOpen } = await import('../../app/ui/lib/nav.js');
    const entree = NAV.flatMap((g) => g.items).find((it) => it.to === '/stagiaires');
    assert.ok(entree, 'l\'entrée « Stagiaires » du menu existe');
    assert.ok(canOpen({ role: 'ADMIN_ORGANISME' }, entree));
    assert.ok(!canOpen({ role: 'SECRETARIAT', nav_access: JSON.stringify({ '/dashboard': 'read' }) }, entree));
    assert.ok(canOpen({ role: 'SECRETARIAT', nav_access: JSON.stringify({ '/dashboard': 'read', '/stagiaires': 'read' }) }, entree));
    // Et c'est bien le cas qui se présente : la liste des dossiers lui est ouverte par son rôle.
    const ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes/enrollment.routes.js'), 'utf8');
    assert.match(ROUTES, /router\.use\(authenticateToken, authorizeRoles\(\.\.\.ADMIN_ROLES\)\);/);
    const AUTH = fs.readFileSync(path.join(__dirname, '..', 'middlewares/auth.middleware.js'), 'utf8');
    assert.match(AUTH, /const ADMIN_ROLES = \[[^\]]*'SECRETARIAT'/);
});

test('suivi, session, pipeline et notation ouvrent la fiche sur LEUR dossier — chacun avec son nom de champ', () => {
    /* Les écrans ne nomment pas le dossier pareil : `enrollment_id` dans le suivi, le pipeline et
       la notation, `id` dans une session (et dans GET /enrollments). D'où deux arguments explicites
       plutôt qu'une ligne à deviner : `d.id` dans le suivi, ou `e.learner_id` passé deux fois,
       rendrait un lien que la fiche ignore — elle retomberait sans bruit sur le premier dossier. */
    const SUIVI = lireUi('pages/Suivi.jsx');
    const SESSION = lireUi('pages/SessionDetail.jsx');
    const PIPELINE = lireUi('pages/Pipeline.jsx');
    const NOTATION = lireUi('pages/Notation.jsx');
    assert.match(SUIVI, /<Link to=\{lienDossier\(d\.learner_id, d\.enrollment_id\)\}/);
    assert.match(SESSION, /navigate\(lienDossier\(e\.learner_id, e\.id\)\)/);
    assert.match(PIPELINE, /<Link to=\{lienDossier\(r\.learner_id, r\.enrollment_id\)\} className="pipe-name">/);
    assert.match(NOTATION, /<Link to=\{lienDossier\(s\.learner_id, s\.enrollment_id\)\}/);
    // Plus aucune fiche ouverte « sur le premier dossier » depuis ces cinq écrans.
    for (const [nom, SRC] of [['suivi', SUIVI], ['session', SESSION], ['pipeline', PIPELINE], ['notation', NOTATION],
        ['tableau de bord', lireUi('pages/Dashboard.jsx')]]) {
        assert.doesNotMatch(SRC, /`\/stagiaires\/\$\{/, `${nom} : une adresse de fiche écrite à la main, sans son dossier`);
    }
});
