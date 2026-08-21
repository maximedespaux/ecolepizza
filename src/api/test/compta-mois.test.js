/**
 * LE MOIS, DANS LE TABLEAU DE GESTION.
 *
 * CE QUI A CHANGÉ, ET POURQUOI CES TESTS ONT ÉTÉ RÉÉCRITS. Ils gelaient l'architecture
 * précédente — une fonction `computeMonth` à part, dont le résultat n'alimentait qu'UNE tuile
 * pendant que le reste de la page restait annuel. Ils sont passés au rouge le jour où cette
 * séparation a disparu : c'est exactement leur travail, et la version qui suit gèle le nouveau
 * contrat plutôt que de rafistoler l'ancien.
 *
 * LE DÉFAUT CORRIGÉ, tel qu'il se voyait : un sélecteur de mois trônait en tête d'écran, à côté
 * du sélecteur d'année, et changer de mois ne modifiait qu'un chiffre sur une quinzaine. Le
 * résultat, les recettes, les dépenses, la marge, les camemberts et les listes restaient sur le
 * total de l'année. Un filtre qui ne filtre pas se lit, à juste titre, comme cassé.
 *
 * LA CAUSE ÉTAIT PROFONDE : DEUX RÈGLES D'ATTRIBUTION sur la même page. Le tableau annuel datait
 * le CA des inscriptions à l'ANNÉE DE LA SESSION (`training_session.year`) ; le gain du mois le
 * datait à l'ENCAISSEMENT (`enrollment.created_at`). Les douze mois ne s'additionnaient donc pas
 * en l'année, et rien ne pouvait relier les deux vues — d'où une seule tuile mensuelle.
 *
 * LA RÈGLE RETENUE, une seule pour tout l'écran : L'ENCAISSEMENT. Une inscription compte le mois
 * où elle a été ENREGISTRÉE. C'est la seule qui ait un sens à l'échelle du mois — un mois n'a pas
 * d'année de session — et c'est celle qui répond à la question posée à cet écran : combien est
 * entré, combien est sorti. Conséquence assumée : une inscription saisie en décembre pour une
 * session de l'an prochain compte en décembre.
 *
 * L'INVARIANT QUI COMPTE : les douze mois somment EXACTEMENT en l'année. Il ne tient qu'à une
 * chose — que ce soit la même fonction, avec la même règle, à qui l'on ajoute ou retire un filtre
 * de mois. Toute duplication de ce calcul le casse en silence. Vérifié en base sur l'année en
 * cours : 1 031,33 € en juillet + 198,30 € en août = 1 229,63 €, soit le total annuel au centime.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
const net = (f) => fs.readFileSync(path.join(DIR, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SRC = net('controllers/comptabilite.controller.js');
const PAGE = fs.readFileSync(path.join(DIR, '..', 'app', 'ui', 'pages', 'Comptabilite.jsx'), 'utf8');

const PERIODE = () => SRC.slice(SRC.indexOf('async function computePeriode'), SRC.indexOf('async function loadSettings'));

test('un seul calcul sert le mois ET l\'année', () => {
    /* `computeMonth` a disparu : deux fonctions, c'était deux règles, et deux règles c'était des
       mois qui ne somment pas en l'année. */
    assert.doesNotMatch(SRC, /async function computeMonth/,
        'Un second calcul mensuel rouvrirait la porte à deux règles divergentes.');
    assert.doesNotMatch(SRC, /async function computeYear/, 'idem pour un calcul annuel séparé');
    assert.match(SRC, /async function computePeriode\(conn, orgId, annee, mois = 0\)/,
        'Une seule fonction, paramétrée par le mois — 0 valant l\'année entière.');
});

test('le CA des inscriptions est daté à l\'encaissement, sur le mois comme sur l\'année', () => {
    const bloc = PERIODE();
    const inscr = bloc.slice(bloc.indexOf('FROM enrollment'), bloc.indexOf('FROM enrollment') + 220);
    assert.match(inscr, /YEAR\(e\.created_at\) = \?/,
        "L'encaissement est la seule règle qui ait un sens à l'échelle du mois.");
    assert.match(inscr, /parMois\('e\.created_at'\)/, 'et le filtre de mois porte sur la même colonne');
    /* LA JOINTURE SUR LA SESSION A DISPARU. Tant qu'elle était là, le CA annuel suivait l'année de
       session et ne pouvait pas se découper en mois. */
    assert.doesNotMatch(inscr, /training_session/,
        "La règle « année de session » ne doit pas revenir : elle est indécoupable en mois.");
});

test('le filtre de mois est factorisé, et couvre toutes les sources', () => {
    const bloc = PERIODE();
    assert.match(bloc, /const parMois = \(col\) => \(mois \? [^;]*: ''\)/,
        "À 0 le filtre disparaît, il ne devient pas une condition toujours vraie.");
    /* QUATRE SOURCES : inscriptions, matériel, produits divers, dépenses. Il en manque une et
       cette source-là reste annuelle au milieu de chiffres mensuels — l'erreur la plus dure à
       voir, parce que le total reste plausible. */
    const applique = (bloc.match(/\$\{parMois\(/g) || []).length;
    assert.ok(applique >= 4, `parMois n'est appliqué qu'à ${applique} sources sur 4`);
});

test('les sessions restent annuelles — elles ne sont pas un encaissement', () => {
    /* Une session a lieu à sa date. Rapporter le nombre de sessions au mois donnerait un
       « stagiaires par session » qui divise des inscriptions encaissées en mars par des sessions
       tenues en mars : deux populations sans rapport. */
    const bloc = PERIODE();
    const sess = bloc.slice(bloc.indexOf('FROM training_session'), bloc.indexOf('FROM training_session') + 140);
    assert.doesNotMatch(sess, /MONTH\(/, 'le comptage des sessions ne doit pas suivre le mois');
});

test('les listes suivent le mois, comme les totaux', () => {
    /* Elles restaient annuelles quand les totaux passaient au mois : on lisait « 2 300 € de
       dépenses en mars » au-dessus d'une liste couvrant toute l'année, sans moyen de retrouver
       les lignes qui font le chiffre. Une liste qui ne justifie pas son total est pire qu'absente. */
    assert.match(SRC, /FROM expense WHERE organization_id = \? AND YEAR\(date\) = \?\$\{parMois\('date'\)\}/);
    assert.match(SRC, /FROM revenue_extra WHERE organization_id = \? AND YEAR\(date\) = \?\$\{parMois\('date'\)\}/);
});

test('le mois réel reste borné, le défaut est le mois courant, 0 vaut l\'année', () => {
    assert.match(SRC, /Math\.min\(12, Math\.max\(1, Number\(rawMois\)\)\)/,
        "?mois=13 produirait une requête vide en silence.");
    assert.match(SRC, /rawMois === undefined\) mois = new Date\(\)\.getMonth\(\) \+ 1/);
    assert.match(SRC, /rawMois === '' \|\| Number\(rawMois\) === 0\) mois = 0/);
});

test("l'onglet Performance compare deux ANNÉES, pas deux mois", () => {
    /* Il met 2026 en face de 2025 : lui passer le mois transformerait la comparaison en
       « mars contre mars » sans que rien ne le dise à l'écran. L'appel omet donc le paramètre,
       et le défaut de `computePeriode` (0) vaut l'année entière. */
    const perf = SRC.slice(SRC.indexOf('computePeriode(conn, orgId, annee),'));
    assert.match(perf.slice(0, 140), /computePeriode\(conn, orgId, annee - 1\)/);
    assert.doesNotMatch(perf.slice(0, 140), /annee, mois/, 'la comparaison annuelle ne doit pas suivre le mois');
});

test("l'écran nomme la période au lieu d'annoncer l'année", () => {
    /* Chaque titre portait l'ANNÉE en dur (« Résultat 2026 », « Dépenses 2026 ») : au-dessus d'un
       total devenu mensuel, un intitulé qui annonce l'année est pire qu'un intitulé absent. */
    assert.match(PAGE, /const periode = mois === 0 \? String\(annee\) : `\$\{MOIS\[mois - 1\]\.toLowerCase\(\)\} \$\{annee\}`/);
    assert.match(PAGE, /Résultat \{periode\}/);
    assert.match(PAGE, /Dépenses \$\{periode\}/);
    // Et le sélecteur ne s'annonce plus comme ne pilotant qu'une tuile.
    assert.doesNotMatch(PAGE, /aria-label="Mois \(gain du mois\)"/);
    /* La ligne « X € encaissés en mars » a disparu : elle n'existait que parce qu'elle était le
       seul chiffre mensuel de la page. Elle répéterait maintenant le résultat juste au-dessus. */
    assert.doesNotMatch(PAGE, /data\.mois\.gain/);
});
