/**
 * LE PIPELINE PAR SEMAINE — un tableau par session, tous d'un coup.
 *
 * Demandé le 2026-09-17, après les Résultats QCM : « le même choix par semaine ». Deux sessions
 * tournaient en S38 (NIV1H et RS7404) et il fallait ouvrir l'une puis l'autre.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
/* SANS LES COMMENTAIRES : les assertions d'ABSENCE ci-dessous (« plus de `r.data[0]` », « jamais
   `session.title` ») trouvaient la chaîne dans les commentaires qui expliquent justement pourquoi
   elle a disparu — le test échouait sur sa propre documentation. Même assistant que dans les
   autres fichiers de test qui lisent le source. */
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const lire = (p) => sansCommentaires(fs.readFileSync(path.join(UI, p), 'utf8'));
const PIPE = lire('pages/Pipeline.jsx');
const TABLEAU = PIPE.slice(PIPE.indexOf('function TableauSession'));
const PAGE = PIPE.slice(PIPE.indexOf('function Pipeline()'), PIPE.indexOf('function TableauSession'));

test('un tableau PAR SESSION, jamais un tableau fusionné', () => {
    /* Les colonnes sont les étapes du parcours de la FORMATION, et deux formations n'ont pas le
       même : NIV1H en compte dix-sept, RS7404 seize. Fusionner obligerait à inventer des colonnes
       communes qui n'existent dans aucun parcours. */
    assert.match(PAGE, /groupe\.sessions\.map\(\(s\) => <TableauSession key=\{s\.id\} session=\{s\}/);
    assert.match(TABLEAU, /getSessionBoard\(session\.id\)/, 'chaque tableau charge SA session');
});

test('le repli des étapes vides appartient à CHAQUE tableau', () => {
    /* LE PIÈGE DE L'EMPILEMENT. Les bandes d'étapes vides se repèrent par l'indice de leur première
       colonne (« v3 »). Avec un seul tableau, une clé par page suffisait. Empilés, deux tableaux ont
       chacun leur « v3 » : déplier l'un aurait déplié l'autre. L'état est donc DANS le tableau — la
       collision est impossible par construction, pas évitée par une clé composée qu'on oublierait. */
    assert.match(TABLEAU, /const \[deplies, setDeplies\] = useState\(\{\}\);/);
    assert.ok(!/deplies/.test(PAGE), 'la page ne porte plus aucun état de repli partagé');
});

test('changer de semaine REMONTE les tableaux', () => {
    /* `key` = l'identifiant de la session, pas sa position. Sans lui, passer de S38 à S42
       réutiliserait le composant du premier tableau pour une autre session : ses bandes dépliées et
       son tableau précédent resteraient affichés le temps du chargement. */
    assert.match(PAGE, /<TableauSession key=\{s\.id\}/);
    // Et une réponse tardive d'un tableau démonté ne doit rien écrire.
    assert.match(TABLEAU, /let vivant = true;[\s\S]{0,400}return \(\) => \{ vivant = false; \};/);
});

test('l\'écran n\'ouvre plus en décembre', () => {
    /* Il prenait `r.data[0]` — la PREMIÈRE session rendue. Or le serveur trie par date DÉCROISSANTE :
       c'était la plus lointaine, un NIV2 du 14 décembre, un 17 septembre. Même défaut que Notation,
       même remède. */
    assert.ok(!/r\.data\[0\]/.test(PIPE), 'plus de « première session rendue »');
    assert.match(PAGE, /setSemaine\(semaineParDefaut\(grouperParSemaine\(l\)\) \|\| ""\);/);
});

test('l\'en-tête d\'une session affiche le NOM de la formation, pas « Session »', () => {
    /* DÉFAUT MESURÉ EN PRODUCTION le 2026-09-17, dans Notation : « NIV1H Session 1 inscrit(s) ».
       Les cartes recevaient des sessions NORMALISÉES par `lib/sessions.js`, qui expose l'intitulé
       sous `titre` ; la carte lisait `session.title`, absent, et affichait son repli. Le défaut
       datait de la création de l'écran et ne se voyait pas parce que le repli avait l'air voulu —
       et le Pipeline allait recopier la même carte. */
    const tete = lire('components/EnTeteSession.jsx');
    assert.match(tete, /\{session\.titre \|\| "Session"\}/, 'lit la forme normalisée');
    assert.ok(!/session\.title/.test(tete), 'jamais le nom brut de l\'API');
    for (const f of ['pages/Notation.jsx', 'pages/Pipeline.jsx']) {
        assert.match(lire(f), /<EnTeteSession session=\{session\} \/>/, `${f} passe par l'en-tête partagé`);
        assert.ok(!/session\.title \|\| "Session"/.test(lire(f)), `${f} n'a plus de copie du balisage`);
    }
});

test('et ce que la lib expose EST ce que l\'en-tête lit', async () => {
    /* Le contrôle qui aurait attrapé le défaut : on éprouve la forme réelle rendue par la lib, pas
       ce qu'on croit qu'elle rend. */
    const { grouperParSemaine } = await import('../../app/ui/lib/sessions.js');
    const [g] = grouperParSemaine([{ id: 's1', program_code: 'NIV1H', program_title: 'Pizzaïolo Niveau I', year: 2026, week: 38, stagiaires: 1 }]);
    const s = g.sessions[0];
    assert.strictEqual(s.titre, 'Pizzaïolo Niveau I');
    assert.strictEqual(s.title, undefined, 'la lib ne rend PAS `title` — le lire donnait undefined');
});
