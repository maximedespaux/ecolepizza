const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const CTRL = readFileSync(path.join(__dirname, '../controllers/company.controller.js'), 'utf8');
const PAGE = readFileSync(path.join(__dirname, '../../app/ui/pages/Entreprises.jsx'), 'utf8');
const FICHE = readFileSync(path.join(__dirname, '../../app/ui/pages/EntrepriseDetail.jsx'), 'utf8');

test('la date de création est mise en forme PAR LA BASE, aux deux endroits', () => {
    /* LE DÉFAUT QU'ON ÉVITE : `created_at` brut arrive du pilote en objet `Date`. Or `dateHeure()`
       ne sait lire qu'une chaîne ISO — devant un `Date`, sa regex échoue et elle rend l'objet
       TEL QUEL : « Tue Sep 16 2026 17:50:09 GMT+0200 (heure d'été d'Europe centrale) » au milieu
       d'un tableau. Et la base est de toute façon la seule à connaître le fuseau de session
       (cf. config/database.js) : mettre en forme côté navigateur rendrait l'heure du visiteur.

       UN ALIAS DISTINCT, et non un second `created_at` dans le même SELECT : deux colonnes de
       même nom, c'est le pilote qui décide laquelle survit. */
    assert.strictEqual((CTRL.match(/DATE_FORMAT\(c\.created_at, '%Y-%m-%d %H:%i'\) AS cree_le/g) || []).length, 2,
        'la liste ET la fiche');
    /* Ciblé sur `getCompany` et non sur le fichier : `createRepresentativeAccount` lit la même
       table par `SELECT *` et n'a que faire de la date — une assertion qui interdisait le motif
       partout condamnait du code parfaitement juste, et se serait fait désarmer au lieu d'être
       corrigée. */
    const fiche = CTRL.slice(CTRL.indexOf('const getCompany'), CTRL.indexOf('const createCompany'));
    assert.ok(fiche.length > 200, 'getCompany localisée');
    assert.ok(!/SELECT \* FROM company/.test(fiche),
        'la fiche ne peut plus se contenter de SELECT * : il ne porte pas la date mise en forme');
    assert.match(fiche, /AS cree_le/);
});

test('le tri se fait AVANT la coupe, donc dans la page et non dans le tableau', () => {
    /* LE DÉFAUT QUE CE TEST EMPÊCHE, et qui ne se voit pas à l'œil : la liste est passée à
       `DataTable` DÉJÀ COUPÉE (`shown.slice(0, max)`) — quatre cent soixante et onze entreprises,
       on n'en montre qu'une tranche. Trier à l'intérieur du tableau ne trierait donc que cette
       tranche : « la plus récemment créée » serait la plus récente DES CINQUANTE AFFICHÉES.
       Le tableau aurait l'air trié, l'ordre serait faux, et rien ne le dirait.

       C'est aussi pourquoi `DataTable` — partagé par une trentaine de pages — n'a pas été
       touché : il ne peut pas trier ce qu'on lui a déjà amputé. */
    assert.match(PAGE, /rows=\{shown\.slice\(0, max\)\}/, 'le tableau reçoit une tranche');
    const memo = PAGE.slice(PAGE.indexOf('const shown = useMemo'), PAGE.indexOf('const enTete'));
    assert.match(memo, /\.sort\(/, '…donc le tri est fait avant, sur la liste entière');
    assert.match(memo, /\}, \[rows, query, tri\]\);/, 'et il se refait quand le tri change');
    /* Une fiche sans date passe en DERNIER : triée comme chaîne vide, elle se serait rangée
       avant 1970, en tête de l'ordre croissant. */
    assert.match(memo, /if \(!va !== !vb\) return !va \? 1 : -1;/);
});

test('« Créé le » est visible dans la liste ET sur la fiche', () => {
    // Les deux répondent à la même question — d'où sort cette entreprise, et depuis quand.
    assert.match(PAGE, /enTete\("cree_le", "Créé le"\)/);
    assert.match(PAGE, /dateHeure\(c\.cree_le\)/);
    assert.match(FICHE, /créée le \$\{dateHeure\(data\.cree_le\)\}/);
});
