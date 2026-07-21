/**
 * Le gain du mois, dans le tableau de gestion.
 *
 * Un « gain du mois » n'est pas une marge annuelle rognée à un douzième : c'est ce qui est entré
 * moins ce qui est sorti SUR LE MOIS. Ces tests portent sur le code réel du contrôleur — ils
 * attrapent une requête mensuelle qui aurait perdu son filtre de mois, ou l'inscription rattachée
 * à la mauvaise date, deux erreurs qui produisent un chiffre plausible et faux.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
const net = (f) => fs.readFileSync(path.join(DIR, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const SRC = net('controllers/comptabilite.controller.js');

test('le gain du mois se calcule sur un vrai mois, pas sur l\'année entière', () => {
    // Chaque source du mois doit filtrer sur MONTH(...), sinon on additionne toute l'année et
    // on l'appelle « gain du mois » — le pire, un chiffre qui a l'air juste.
    const bloc = SRC.slice(SRC.indexOf('async function computeMonth'), SRC.indexOf('async function loadSettings'));
    const mois = (bloc.match(/MONTH\(/g) || []).length;
    assert.ok(mois >= 4, `seulement ${mois} filtres de mois : inscriptions, matériel, produits, dépenses attendus`);
    assert.match(bloc, /gain: ca - depenses/, 'le gain n\'est pas recettes − dépenses');
});

test('l\'inscription du mois est rattachée à sa date d\'enregistrement, pas à l\'année de session', () => {
    // LA DÉCISION À ASSUMER. Le tableau ANNUEL rattache le CA d'inscription à `session.year`. Un
    // mois n'a pas d'année de session ; on prend `enrollment.created_at`, quand l'argent est
    // entré. Rattacher au mois via une jointure sur session.year donnerait un gain mensuel qui
    // ne correspond à aucune entrée réelle.
    const bloc = SRC.slice(SRC.indexOf('async function computeMonth'), SRC.indexOf('async function loadSettings'));
    const inscr = bloc.slice(bloc.indexOf('FROM enrollment'), bloc.indexOf('FROM enrollment') + 200);
    assert.match(inscr, /YEAR\(created_at\) = \? AND MONTH\(created_at\) = \?/,
        'l\'inscription mensuelle doit filtrer sur created_at');
    assert.doesNotMatch(inscr, /training_session/, 'le mois ne doit pas dépendre de l\'année de session');
});

test('le mois demandé est borné à un mois réel', () => {
    // ?mois=0 ou ?mois=13 produiraient une requête qui ne ramène rien, silencieusement. On
    // ramène toute valeur hors [1,12] dans l'intervalle plutôt que de renvoyer un gain nul
    // trompeur.
    assert.match(SRC, /Math\.min\(12, Math\.max\(1, moisDemande\)\)/, 'le mois n\'est pas borné');
    assert.match(SRC, /new Date\(\)\.getMonth\(\) \+ 1/, 'le mois par défaut n\'est pas le mois courant');
});

test('la réponse expose le gain du mois et sa décomposition', () => {
    // Un gain sans son « d'où il vient » (recettes − dépenses) n'est pas vérifiable d'un coup
    // d'œil : on renvoie les deux.
    const bloc = SRC.slice(SRC.indexOf('mois: {'), SRC.indexOf('mois: {') + 260);
    for (const champ of ['numero', 'gain', 'ca', 'depenses']) {
        assert.match(bloc, new RegExp(`\\b${champ}:`), `le champ ${champ} manque à la réponse`);
    }
});

test('le mois ne contamine pas les chiffres annuels', () => {
    // computeYear (le CA annuel) ne doit PAS gagner de filtre de mois : la page reste annuelle
    // sauf le gain du mois. Une régression fréquente serait de filtrer computeYear par mois « en
    // passant ».
    const year = SRC.slice(SRC.indexOf('async function computeYear'), SRC.indexOf('async function computeMonth'));
    assert.doesNotMatch(year, /MONTH\(/, 'computeYear a été filtré par mois : la page annuelle serait faussée');
});
