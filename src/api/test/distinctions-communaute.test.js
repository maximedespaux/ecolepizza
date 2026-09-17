/**
 * LES CADRES EXCLUSIFS SE DÉCERNENT DANS LA COMMUNAUTÉ — plus sur la fiche stagiaire.
 *
 * Demandé le 2026-09-17 : la carte « Cadres exclusifs » (Champion, Podium, Jury, Fondateur…)
 * siégeait au milieu du dossier administratif, entre « Projet » et « Entreprise ». Ces cadres ne
 * servent qu'à la Communauté, où ils entourent l'avatar : ils se décernent désormais là, dans un
 * panneau réservé au bureau qui montre aussi, d'un coup, qui porte quoi.
 *
 * Ce que ces tests gardent, au-delà du déplacement lui-même : l'écriture REMPLACE une liste
 * (« champion,jury »). Calculée sur une liste périmée ou mal lue, elle effacerait des cadres
 * sans que rien ne le signale à l'écran.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* Base simulée, posée AVANT de charger le contrôleur : le vrai pool ne doit jamais être ouvert. */
const cheminDb = require.resolve('../config/database.js');
let lignes = [];
let derniereRequete = null;
let panne = null;
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            derniereRequete = { sql, params };
            if (panne) throw panne;
            return [lignes];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, []); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { getDistinctions } = require('../controllers/learner.controller.js');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

async function appeler() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    await getDistinctions({ user: { organization_id: 'org-1' } }, r);
    return r;
}

test('la fiche stagiaire ne porte plus la carte', () => {
    const fiche = sansCommentaires(lire('src/app/ui/pages/StagiaireDetail.jsx'));
    assert.doesNotMatch(fiche, /CadresExclusifs|cadres_exclusifs|Cadres exclusifs/);
    assert.doesNotMatch(fiche, /lib\/cadres\.js/, 'plus aucune raison d\'importer les cadres');
});

test('la Communauté affiche le panneau — au bureau seulement', () => {
    const page = sansCommentaires(lire('src/app/ui/pages/Communaute.jsx'));
    assert.match(page, /\{peutDecerner && <Distinctions \/>\}/);
    /* Les MÊMES rôles que l'écriture (PATCH /stagiaires/:id → ADMIN_ROLES). Plus large, le
       formateur verrait un panneau dont chaque clic répondrait 403 ; plus étroit, le secrétariat
       perdrait un geste qu'il avait sur la fiche. */
    const m = /const peutDecerner = \[([^\]]+)\]\.includes\(user\?\.role\)/.exec(page);
    assert.ok(m, 'peutDecerner est une liste de rôles explicite');
    const auth = lire('src/api/middlewares/auth.middleware.js');
    const admin = /const ADMIN_ROLES = \[([^\]]+)\]/.exec(auth);
    const roles = (s) => s.split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean).sort();
    assert.deepStrictEqual(roles(m[1]), roles(admin[1]));
});

test('la route est déclarée AVANT /:id, et réservée au bureau', () => {
    /* Déclarée après, « distinctions » serait lu comme l'identifiant d'un stagiaire : la liste
       répondrait « Stagiaire introuvable », et le panneau resterait vide sans dire pourquoi. */
    const routes = sansCommentaires(lire('src/api/routes/learner.routes.js'));
    const ligne = routes.indexOf("router.get('/distinctions', authorizeRoles(...ADMIN_ROLES), getDistinctions)");
    assert.ok(ligne > -1, 'route présente, ADMIN_ROLES');
    assert.ok(ligne < routes.indexOf("router.get('/:id'"), 'avant /:id');
});

test('la lecture ne rend que les porteurs, par leur nom, cadres en liste', async () => {
    lignes = [{ id: 'l1', first_name: 'Léa', last_name: 'DURAND', cadres_exclusifs: 'champion, jury' }];
    const r = await appeler();
    assert.deepStrictEqual(r.corps.data, [{ id: 'l1', first_name: 'Léa', last_name: 'DURAND', cadres_exclusifs: ['champion', 'jury'] }]);
    // Cadré sur l'organisme, et sans rien de plus que le nom : ni e-mail, ni téléphone.
    assert.deepStrictEqual(derniereRequete.params, ['org-1']);
    assert.match(derniereRequete.sql, /SELECT id, first_name, last_name, cadres_exclusifs FROM learner/);
    assert.match(derniereRequete.sql, /WHERE organization_id = \?/);
});

test('colonne absente : une liste vide, pas une panne', async () => {
    panne = Object.assign(new Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' });
    try {
        const r = await appeler();
        assert.strictEqual(r.code, 200);
        assert.deepStrictEqual(r.corps.data, []);
    } finally { panne = null; }
});

test('l\'écriture relit la liste JUSTE AVANT, et n\'écrit rien si elle n\'a pas pu la lire', () => {
    const src = sansCommentaires(lire('src/app/ui/components/Distinctions.jsx'));
    const fn = src.slice(src.indexOf('async function ecrire'));
    const relecture = fn.indexOf('const frais = await charger();');
    const ecriture = fn.indexOf('await updateStagiaire(');
    assert.ok(relecture > -1 && ecriture > -1 && relecture < ecriture,
        'la chaîne à écrire se calcule sur la liste fraîche, pas sur celle affichée');
    assert.match(fn, /frais\.find\(\(p\) => p\.id === personne\.id\)\?\.cadres_exclusifs/,
        'et sur l\'entrée de la personne dans CETTE liste');
    /* `charger` ne rattrape PAS son échec : il remonte au `try` d'`ecrire`, et l'écriture n'a pas
       lieu. Avec un `.catch(() => [])`, une panne réseau donnerait « aucun cadre », et en décerner
       un effacerait tous les autres. */
    assert.match(src, /const charger = \(\) => getDistinctions\(\)\s*\.then\(/);
    // La fin se cherche APRÈS le début : le premier « useEffect » du fichier est celui de l'import.
    const debut = src.indexOf('const charger');
    const corps = src.slice(debut, src.indexOf('useEffect(', debut));
    assert.ok(corps.length > 0, 'la définition de charger est bien délimitée');
    assert.doesNotMatch(corps, /\.catch\(/);
});

test('la pastille d\'aperçu garde son ancrage', () => {
    // Sans `position:relative`, l'anneau de cadre (un ::before absolu) s'accroche au panneau entier.
    const css = lire('src/app/ui/styles/app.css');
    assert.match(css, /\.cadre-attrib-rond\{position:relative;/);
    assert.match(css, /\.comm-distinctions\{/);
});
