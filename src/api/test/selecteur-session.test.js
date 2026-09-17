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
 * `ResultatsQCM` A D'ABORD ÉTÉ LAISSÉ TRANQUILLE, et c'était un choix : son `<select>` est un
 * FILTRE, avec « Toutes les sessions » comme valeur légitime, et le sélecteur de semaine n'avait
 * pas de « toutes ». Le convertir aurait remplacé un bon filtre par un mauvais sélecteur.
 *
 * LA DÉCISION A CHANGÉ LE 2026-09-17, sur demande — et parce que l'objection a été LEVÉE, pas
 * contournée. Le sélecteur a gagné une entrée « toutes » (prop `toutes`), que Notation ne passe pas
 * et que les Résultats QCM passent. Le test ci-dessous ne vérifie donc plus « on n'y touche pas »,
 * mais ce que cette règle protégeait vraiment : que le « toutes » reste EXPRIMABLE.
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

test('UNE SEULE PRÉSENTATION, UN SEUL RANGEMENT — pour les trois écrans', () => {
    /* L'HISTOIRE DE CE TEST, parce qu'elle explique ce qu'il protège. Il disait d'abord « un seul
       sélecteur » ; puis « deux présentations, un seul rangement », quand Notation est passé à la
       semaine et que le Pipeline est resté à la session — « il suit UNE session, choisir la
       session EST son sujet ». Cette raison visait le TABLEAU, pas le sélecteur. Le 2026-09-17 le
       Pipeline est passé à la semaine à son tour, chaque session gardant son propre tableau : il
       n'y a plus qu'UNE présentation, employée par trois écrans.

       Ce qui n'a jamais changé, c'est l'invariant : les RÈGLES de rangement vivent dans
       `lib/sessions.js`, et aucun écran ne les réécrit. */
    for (const f of ['pages/Notation.jsx', 'pages/Pipeline.jsx', 'pages/ResultatsQCM.jsx']) {
        const src = lire(f);
        assert.match(src, /import SelecteurSemaine from ["']\.\.\/components\/SelecteurSemaine\.jsx["']/, `${f} doit employer SelecteurSemaine`);
        assert.match(src, /<SelecteurSemaine /, `${f} doit le rendre`);
        // Ouvrir sur la semaine en cours, par la MÊME règle : pas une copie par écran.
        assert.match(src, /semaineParDefaut\(grouperParSemaine\(/, `${f} doit ouvrir sur la semaine en cours`);
        /* L'ANCIEN MENU EST SUPPRIMÉ, pas laissé à côté : deux chemins vers la même chose, c'est
           reprendre la dette qu'on vient de payer. */
        assert.ok(!/<select[^>]*>[\s\S]{0,400}sessions\.map/.test(src), `${f} ne doit plus lister les sessions dans un <select>`);
    }

    /* L'ANCIEN SÉLECTEUR N'EXISTE PLUS. Resté sans utilisateur, il aurait invité le prochain écran à
       reprendre le choix par session — c'est-à-dire à rouvrir exactement la question qu'on vient de
       trancher trois fois. */
    assert.ok(!fs.existsSync(path.join(UI, 'components/SelecteurSession.jsx')), 'SelecteurSession.jsx est supprimé');
    for (const f of ['pages/Notation.jsx', 'pages/Pipeline.jsx', 'pages/ResultatsQCM.jsx']) {
        assert.ok(!/SelecteurSession/.test(lire(f)), `${f} ne le mentionne plus`);
    }

    /* ET LE COMPOSANT TIRE DE LA LIB, il ne réécrit pas les règles. C'est l'invariant central :
       sans lui, on aurait DEUX rangements — celui qu'on teste, et celui qui s'affiche. */
    const comp = lire('components/SelecteurSemaine.jsx');
    assert.match(comp, /from ["']\.\.\/lib\/sessions\.js["']/, 'SelecteurSemaine doit tirer les règles de la lib');
    assert.ok(!/function normaliser|\.sort\(\(a, b\) => \(a\.code/.test(comp), 'aucune copie du rangement dans le composant');
});

test('RÉSULTATS QCM : la semaine, SANS perdre le « toutes » du filtre', () => {
    /* CE QUI A DÉCLENCHÉ LE CHANGEMENT, mesuré en production le 2026-09-17 : NIV1H et RS7404
       avaient toutes deux des réponses, toutes deux en S38. Le filtre par session obligeait à lire
       l'une, puis à re-choisir l'autre, pour une question que la semaine tranche déjà. */
    const src = lire('pages/ResultatsQCM.jsx');
    assert.match(src, /import SelecteurSemaine from ["']\.\.\/components\/SelecteurSemaine\.jsx["']/);
    // Le même rangement que Notation, importé — pas recopié.
    assert.match(src, /import \{ grouperParSemaine, semaineParDefaut \} from ["']\.\.\/lib\/sessions\.js["']/);
    assert.ok(!/selSession|Toutes les sessions/.test(src), 'l\'ancien menu de sessions est retiré, pas laissé à côté');

    /* L'OBJECTION D'ORIGINE, TOUJOURS TENUE : un filtre doit pouvoir dire « tout ». Le bilan annuel et
       l'export Qualiopi portent sur l'ensemble ; les perdre en gagnant la semaine aurait été une
       régression déguisée en amélioration. */
    assert.match(src, /toutes="Toutes les semaines"/, 'le « toutes » reste exprimable');
    const sel = lire('components/SelecteurSemaine.jsx');
    assert.match(sel, /toutes = null/, 'optionnel : Notation note UNE semaine, jamais toutes');
    assert.match(sel, /onClick=\{\(\) => \{ onChoisir\(""\); setOuvert\(false\); \}\}/, 'et il rend la valeur vide');
    assert.ok(!/<SelecteurSemaine [^>]*toutes=/.test(lire('pages/Notation.jsx')), 'Notation ne le passe pas');
});

test('le sélecteur de semaine ne parle plus la langue d\'un seul écran', () => {
    /* Son texte vide était « Aucune session à noter » — juste dans Notation, faux dans les
       Résultats QCM, où l'on ne note rien. Chaque écran passe le sien. */
    const sel = lire('components/SelecteurSemaine.jsx');
    assert.ok(!/Aucune session à noter/.test(sel), 'plus de texte propre à Notation dans le composant partagé');
    assert.match(lire('pages/Notation.jsx'), /vide="Aucune session à noter\."/, 'Notation garde le sien, explicitement');
});
