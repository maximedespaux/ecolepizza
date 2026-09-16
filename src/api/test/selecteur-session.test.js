/**
 * CHOISIR UNE SESSION : PAR SEMAINE, PUIS PAR FORMATION — et à un seul endroit.
 *
 * DEMANDÉ le 2026-09-16 : « je n'aime pas la façon dont je dois choisir la session dans
 * Notation, je voudrais les voir groupées par semaine, puis classées par formation, sur la même
 * page ». Le menu déroulant alignait soixante lignes fermées sur elles-mêmes : on n'y voyait ni
 * ce qu'il y avait à traiter cette semaine-là, ni combien de formations tournaient en parallèle.
 *
 * ET « CETTE MÉTHODE EST APPLIQUÉE AILLEURS, JE NE SAIS PLUS OÙ ». C'était le Pipeline. Cette
 * phrase est le symptôme exact d'une logique recopiée : personne ne sait plus combien
 * d'exemplaires existent. D'où UN composant, et ces règles dans une lib qu'on peut éprouver.
 *
 * ON A LAISSÉ `ResultatsQCM` TRANQUILLE, et c'est un choix : son `<select>` est un FILTRE, avec
 * « Toutes les sessions » comme valeur légitime. Un arbre de choix n'a pas de « toutes » — le
 * convertir aurait remplacé un bon filtre par un mauvais sélecteur.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const lire = (p) => sansCommentaires(fs.readFileSync(path.join(UI, p), 'utf8'));

/* Les deux formes réelles, telles que les deux API les rendent — c'est tout le sujet de la
   normalisation : elles ne nomment pas pareil. */
const NOTATION_API = [
    { id: 'a', code: 'RS7404', title: 'Fabriquer des pizzas', year: 2026, week: 38, inscrits: 4 },
    { id: 'b', code: 'NIV1H', title: 'Pizzaïolo Niveau I', year: 2026, week: 38, inscrits: 1 },
    { id: 'c', code: 'RS7404', title: 'Fabriquer des pizzas', year: 2026, week: 27, inscrits: 6 },
];
const PIPELINE_API = [
    { id: 'a', program_code: 'RS7404', year: 2026, week: 38, stagiaires: 4 },
];

test('LES DEUX ÉCRANS PARLENT LA MÊME LANGUE', async () => {
    const { normaliserSession } = await import('../../app/ui/lib/sessions.js');
    const n = normaliserSession(NOTATION_API[0]);
    const p = normaliserSession(PIPELINE_API[0]);
    assert.strictEqual(n.code, 'RS7404');
    assert.strictEqual(p.code, 'RS7404', 'program_code est lu comme code');
    assert.strictEqual(n.inscrits, 4);
    assert.strictEqual(p.inscrits, 4, 'stagiaires est lu comme inscrits');
    /* Une session sans effectif ne doit pas afficher « NaN inscrit(s) ». */
    assert.strictEqual(normaliserSession({ id: 'x' }).inscrits, 0);
    assert.strictEqual(normaliserSession({ id: 'x' }).code, null);
});

test('SEMAINE, PUIS FORMATION', async () => {
    const { grouperParSemaine } = await import('../../app/ui/lib/sessions.js');
    const g = grouperParSemaine(NOTATION_API);
    assert.strictEqual(g.length, 2, 'deux semaines');
    assert.deepStrictEqual(g.map((x) => x.semaine), [38, 27]);
    /* PAR CODE À L'INTÉRIEUR D'UNE SEMAINE : NIV1H avant RS7404, quel que soit l'ordre
       d'arrivée. Deux sessions parallèles se retrouvent au même endroit d'une semaine à
       l'autre — ce que l'ordre du serveur, par date à la minute près, ne garantit pas. */
    assert.deepStrictEqual(g[0].sessions.map((s) => s.code), ['NIV1H', 'RS7404']);
    assert.strictEqual(g[0].inscrits, 5, 'l\'effectif de la semaine additionne ses sessions');
});

test('L\'ORDRE DES SEMAINES VIENT DU SERVEUR, ON NE LE REFAIT PAS', async () => {
    /* LE DÉFAUT QU'ON ÉVITE : retrier sur `annee`/`semaine` casserait sur une session sans
       semaine — un `null` comparé à un nombre remonterait en tête, et l'écran s'ouvrirait sur
       une session orpheline au lieu de celle qu'on vient traiter. */
    const { grouperParSemaine } = await import('../../app/ui/lib/sessions.js');
    const avecOrpheline = [{ id: 'z', code: 'X', year: null, week: null, inscrits: 0 }, ...NOTATION_API];
    const g = grouperParSemaine(avecOrpheline);
    assert.strictEqual(g[0].sessions[0].id, 'z',
        'la ligne sans semaine garde la place que le serveur lui a donnée');
    assert.deepStrictEqual(g.slice(1).map((x) => x.semaine), [38, 27],
        'et les autres gardent l\'ordre du serveur');
});

test('DEUX PRÉSENTATIONS, UN SEUL RANGEMENT', () => {
    /* CE QUI A CHANGÉ, et pourquoi ce test ne dit plus « un seul sélecteur ». Notation est passé
       au choix par SEMAINE — on y installe les épreuves une fois et on note tout le monde,
       formations mêlées ; le Pipeline, lui, suit UNE session étape par étape : choisir la
       session EST son sujet. Deux questions différentes, donc deux présentations.

       CE QUI NE DOIT PAS DIVERGER, en revanche, ce sont les RÈGLES de rangement — normalisation
       des champs, regroupement par semaine, tri par formation. Elles vivent dans `lib/sessions.js`
       et les deux composants les importent. C'était ça, le défaut d'origine : pas deux écrans,
       deux copies de la même logique. */
    for (const [f, composant] of [['pages/Notation.jsx', 'SelecteurSemaine'], ['pages/Pipeline.jsx', 'SelecteurSession']]) {
        const src = lire(f);
        assert.match(src, new RegExp(`import ${composant} from ["']\\.\\./components/${composant}\\.jsx["']`),
            `${f} doit employer ${composant}`);
        assert.match(src, new RegExp(`<${composant} `), `${f} doit le rendre`);
        /* L'ANCIEN MENU EST SUPPRIMÉ, pas laissé à côté : deux chemins vers la même chose, c'est
           reprendre la dette qu'on vient de payer. */
        assert.ok(!/<select[^>]*>[\s\S]{0,400}sessions\.map/.test(src),
            `${f} ne doit plus lister les sessions dans un <select>`);
    }
    assert.ok(!/const sessLabel/.test(lire('pages/Pipeline.jsx')),
        'le libellé du menu supprimé ne doit pas rester orphelin — esbuild ne le signale pas');

    /* ET LE COMPOSANT TIRE DE LA LIB, il ne réécrit pas les règles. C'est l'invariant central :
       sans lui, on aurait DEUX rangements — celui qu'on teste, et celui qui s'affiche. Le test
       est né d'une réintroduction restée verte : retirer cet import casse l'écran au runtime et
       rien ne le signalait, `esbuild` ne voyant pas une référence non définie (CLAUDE.md § 2.4). */
    for (const c of ['components/SelecteurSession.jsx', 'components/SelecteurSemaine.jsx']) {
        const comp = lire(c);
        assert.match(comp, /from ["']\.\.\/lib\/sessions\.js["']/, `${c} doit tirer les règles de la lib`);
        assert.ok(!/function normaliser|\.sort\(\(a, b\) => \(a\.code/.test(comp),
            `${c} : aucune copie du rangement dans le composant`);
    }
});

test('LE FILTRE DE RÉSULTATS QCM N\'EST PAS TOUCHÉ', () => {
    /* Il porte « Toutes les sessions », une valeur qu'un arbre de choix ne sait pas exprimer.
       Le laisser tel quel est une décision, pas un oubli. */
    const src = lire('pages/ResultatsQCM.jsx');
    assert.match(src, /Toutes les sessions/);
    assert.ok(!/SelecteurSession/.test(src));
});
