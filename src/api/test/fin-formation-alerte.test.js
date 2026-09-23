/**
 * « FORMATION À VALIDER » — l'alerte qui va chercher le bureau (demandée le 2026-09-23).
 *
 * LE BANDEAU DE LA FICHE NE SUFFIT PAS : il faut ouvrir la fiche pour le voir, et personne ne les
 * ouvre une par une pour vérifier si une formation attend d'être marquée terminée. L'alerte, elle,
 * arrive dans la cloche.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · les MÊMES trois conditions que le bandeau — session terminée, parcours complet, formation
 *     pas déjà marquée ;
 *   · UNE SEULE alerte par dossier : sans cela, le passage en poserait une toutes les six heures ;
 *   · la FENÊTRE de 45 jours : sans elle, le premier passage alerterait sur des années de
 *     dossiers d'un coup — une cloche à cent lignes que personne ne lit ;
 *   · une session terminée AUJOURD'HUI attend le lendemain ;
 *   · aucun e-mail : c'est un geste de bureau.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(API, p), 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── BASE FACTICE ────────────────────────────────────────────────────────────────────────────
   `avancementDossiers` est le vrai calcul : on le neutralise par le cache des modules, parce que
   ce test-ci porte sur la RÈGLE D'ALERTE, pas sur le parcours (éprouvé ailleurs). */
const cheminAvancement = require.resolve('../lib/avancement.js');
let parcours = new Map();
require.cache[cheminAvancement] = {
    id: cheminAvancement, filename: cheminAvancement, loaded: true,
    exports: { avancementDossiers: async () => parcours },
};
const { relancerFinFormation, FENETRE_JOURS, TITRE } = require('../lib/relancesFinFormation.js');

const DOSSIER = {
    enrollment_id: 'e1', organization_id: 'o1', learner_id: 'l1', enr_company_id: null,
    session_id: 's1', program_id: 'p1', program_code: 'NIV1H', program_title: 'Hygiène',
    fin: '2026-09-18',
};
function fausseBase({ dossiers = [DOSSIER], notifsExistantes = [] } = {}) {
    const requetes = [];
    return {
        requetes,
        query: async (sql, params) => {
            requetes.push({ sql, params });
            if (/FROM enrollment e/.test(sql)) return [dossiers];
            if (/FROM notification WHERE title/.test(sql)) return [notifsExistantes.map((link) => ({ link }))];
            return [[]];
        },
    };
}
const complet = () => new Map([['e1', { percent: 100, total: 16, done: 16, currentKey: null }]]);

test('une formation prête à valider déclenche UNE alerte, sans e-mail', async () => {
    parcours = complet();
    const posees = [];
    const conn = fausseBase();
    const n = await relancerFinFormation({
        conn, instant: new Date('2026-09-23T08:00:00Z'), zone: 'UTC',
        notifier: async (orgId, notif) => { posees.push({ orgId, ...notif }); },
    });
    assert.strictEqual(n, 1);
    assert.strictEqual(posees[0].title, TITRE);
    assert.match(posees[0].body, /NIV1H/);
    /* LE LIEN MÈNE AU BON DOSSIER, pas au premier de la personne : une fiche peut en porter
       plusieurs, et l'alerte ne dirait pas lequel attend. */
    assert.strictEqual(posees[0].link, '/stagiaires/l1?dossier=e1');
    /* Notification d'organisme : visible de tout le personnel, et donc SANS double par e-mail —
       l'envoyer écrirait à tout le monde pour un geste qui se fait dans l'application. */
    assert.strictEqual(posees[0].email, false);
});

test('elle ne se repose pas à chaque passage', async () => {
    /* Toutes les six heures, sans cette garde, la même formation reviendrait quatre fois par
       jour dans la cloche — et la cloche cesserait d'être lue. */
    parcours = complet();
    const conn = fausseBase({ notifsExistantes: ['/stagiaires/l1?dossier=e1'] });
    const n = await relancerFinFormation({
        conn, instant: new Date('2026-09-23T08:00:00Z'), zone: 'UTC',
        notifier: async () => { throw new Error('ne devrait pas alerter'); },
    });
    assert.strictEqual(n, 0);
});

test('un parcours incomplet, ou vide, n\'alerte pas', async () => {
    const instant = new Date('2026-09-23T08:00:00Z');
    /* Il reste une étape : le bandeau de la fiche ne s'affiche pas non plus, et pour la même
       raison — ce n'est pas fini. */
    parcours = new Map([['e1', { percent: 94, total: 16, done: 15, currentKey: 'attestation' }]]);
    assert.strictEqual(await relancerFinFormation({ conn: fausseBase(), instant, zone: 'UTC', notifier: async () => {} }), 0);

    /* AUCUNE ÉTAPE : « 100 % de rien » n'est pas un parcours terminé. Sans ce garde-fou, toute
       formation sans parcours documentaire alerterait dès la fin de sa session. */
    parcours = new Map([['e1', { percent: 100, total: 0, done: 0, currentKey: null }]]);
    assert.strictEqual(await relancerFinFormation({ conn: fausseBase(), instant, zone: 'UTC', notifier: async () => {} }), 0);
});

test('une session finie AUJOURD\'HUI attend le lendemain', async () => {
    /* Le dernier jour se termine le soir, et les documents de clôture partent souvent le
       lendemain : alerter le jour même ferait signaler un dossier qu'on est en train de finir. */
    parcours = complet();
    const n = await relancerFinFormation({
        conn: fausseBase({ dossiers: [{ ...DOSSIER, fin: '2026-09-23' }] }),
        instant: new Date('2026-09-23T18:00:00Z'), zone: 'UTC', notifier: async () => {},
    });
    assert.strictEqual(n, 0);
});

test('la fenêtre borne le premier passage, et la formation déjà marquée est écartée EN BASE', async () => {
    const conn = fausseBase();
    parcours = complet();
    await relancerFinFormation({ conn, instant: new Date('2026-09-23T08:00:00Z'), zone: 'UTC', notifier: async () => {} });
    const sel = conn.requetes.find((r) => /FROM enrollment e/.test(r.sql));
    /* 45 JOURS EN ARRIÈRE : sans cette borne, le premier passage poserait des années de dossiers
       d'un coup. Les plus anciens restent validables à la main, sur la fiche. */
    assert.deepStrictEqual(sel.params, ['2026-08-09', '2026-09-23']);
    assert.strictEqual(FENETRE_JOURS, 45);
    /* `FIND_IN_SET` ET NON `LIKE` : « NIV1 » attraperait « NIV1H », et une formation jamais
       validée passerait pour faite. */
    assert.match(sel.sql, /FIND_IN_SET\(p\.code, COALESCE\(REPLACE\(l\.completed_levels/);
    assert.ok(!/LIKE/.test(sel.sql));
});

test('le serveur repasse toutes les six heures', () => {
    const srv = sansCommentaires(lire('server.js'));
    assert.match(srv, /setInterval\(relancerFin, 6 \* 60 \* 60 \* 1000\)/);
    assert.match(srv, /setTimeout\(relancerFin, 90 \* 1000\)/, 'et une fois peu après le démarrage');
    /* LE MÊME `notify` QUE LE RESTE : une seconde façon d'écrire dans la cloche finirait par
       diverger de celle qui compte les non-lues. */
    assert.match(srv, /relancerFinFormation\(\{ conn: require\('\.\/config\/database\.js'\)\.promise\(\), notifier: notify \}\)/);
});
