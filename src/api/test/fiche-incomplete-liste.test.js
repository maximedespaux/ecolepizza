/**
 * LA LISTE DES STAGIAIRES REPÈRE LES FICHES INCOMPLÈTES (demandé le 2026-09-21).
 *
 * Le bandeau de la fiche nomme ce qui lui manque (fiche-incomplete.test.js). Mais on n'ouvre pas mille
 * fiches pour les trouver : la liste porte un repère « Fiche incomplète » sur chaque ligne concernée,
 * calculé par la MÊME règle (lib/ficheIncomplete.js), sur la même décision « quelqu'un reçoit-il
 * quelque chose ? ».
 *
 * TROIS PIÈGES, éprouvés ici sur le vrai contrôleur et une fausse base :
 *   · la civilité et les six cases du projet sont LUES pour le calcul, mais ne partent pas avec la
 *     liste — elle compte plus de mille lignes, et n'en avait pas besoin jusqu'ici ;
 *   · la case « perfectionnement » arrive avec la migration 158 : sans elle, la liste ne doit pas
 *     tomber (NULL, comme dans l'export des partenaires) ;
 *   · un registre des partenaires illisible prive la liste du repère, jamais de ses lignes.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

let colonnes = ['project_improvement'];
let partenaires = () => [{ name: 'Moulins du Sud' }];
let champsEcole = 'nom,prenom,email,telephone,adresse,code_postal,ville';
let requeteListe = '';
const LIGNES = [
    { id: 'l1', organization_id: 'o1', first_name: 'Marie', last_name: 'DURAND', email: 'marie@exemple.fr', phone: '06 11 22 33 44',
      birthday: null, zip_code: '65300', town: 'LANNEMEZAN', address: '1 rue Haute', professional_status: 'Salariée', levels: '',
      financing: 'PARTICULIER', opco: null, created_at: '2026-09-01', civility: 'Mme', project_creation: 1, project_takeover: 0,
      project_oven: 0, project_truck: 0, project_job: 0, project_improvement: 0, company_id: null, company_name: null, account_email: null },
    { id: 'l2', organization_id: 'o1', first_name: 'Paul', last_name: 'MARTIN', email: 'paul@exemple.fr', phone: '06 55 66 77 88',
      birthday: null, zip_code: '', town: null, address: '   ', professional_status: null, levels: '',
      financing: 'PARTICULIER', opco: null, created_at: '2026-09-02', civility: null, project_creation: 0, project_takeover: 0,
      project_oven: 0, project_truck: 0, project_job: 0, project_improvement: 0, company_id: null, company_name: null, account_email: null },
];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema\.columns[\s\S]*column_name = \?/.test(sql)) return [colonnes.includes(params[1]) ? [{ 1: 1 }] : []];
            if (/FROM partner p\s+WHERE p\.organization_id = \? AND p\.recoit_coordonnees = 1/.test(sql)) return [partenaires()];
            if (/SELECT partner_fields FROM organization/.test(sql)) return [[{ partner_fields: champsEcole }]];
            return [[]];
        },
    }),
    query: (sql, params, cb) => {
        if (/FROM learner l/.test(sql)) { requeteListe = sql; return cb(null, LIGNES.map((l) => ({ ...l }))); }
        return cb(null, []);
    },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { getLearners } = require('../controllers/learner.controller.js');

/* Répond avec le corps de `res.json` — ou, au bout de deux secondes, `{ data: null }` : une liste
   qui plante dans son rappel ne répond JAMAIS, et le test doit alors échouer, pas attendre. */
function lister() {
    return new Promise((ok) => {
        const erreurs = console.error; console.error = () => {};
        const rendre = () => { console.error = erreurs; };
        const minuterie = setTimeout(() => { rendre(); ok({ data: null }); }, 2000);
        const res = { status() { return this; }, json: (b) => { clearTimeout(minuterie); ok(b); } };
        getLearners({ user: { organization_id: 'o1' }, query: {} }, res).finally(() => setTimeout(rendre, 50));
    });
}

test('la ligne incomplète porte ce qui lui manque ; la complète, rien', async () => {
    colonnes = ['project_improvement']; partenaires = () => [{ name: 'Moulins du Sud' }];
    const { data } = await lister();
    const [marie, paul] = data;
    assert.deepStrictEqual(paul.champs_manquants, ['Adresse postale', 'Code postal', 'Ville'],
        'des espaces ne sont pas une adresse');
    assert.ok(!('champs_manquants' in marie), 'une fiche complète ne porte pas la clé');
});

test('civilité et projet servent au calcul, pas à la charge utile', async () => {
    const { data } = await lister();
    for (const l of data) {
        for (const cle of ['civility', 'project_creation', 'project_takeover', 'project_oven', 'project_truck', 'project_job', 'project_improvement']) {
            assert.ok(!(cle in l), `${cle} ne part pas avec la liste`);
        }
    }
});

test('sans la migration 158, la liste tient : NULL pour la case « perfectionnement »', async () => {
    colonnes = [];
    const { data } = await lister();
    assert.match(requeteListe, /NULL AS project_improvement/);
    assert.strictEqual(data.length, 2);
    colonnes = ['project_improvement'];
    await lister();
    assert.match(requeteListe, /l\.project_improvement/);
});

test('registre des partenaires illisible : la liste perd le repère, pas ses lignes', async () => {
    partenaires = () => { throw new Error('connexion perdue'); };
    const { data } = await lister();
    assert.strictEqual(data.length, 2);
    assert.ok(data.every((l) => !('champs_manquants' in l)));
    partenaires = () => [{ name: 'Moulins du Sud' }];
});

test('ce que l\'école envoie n\'est réclamé que si quelqu\'un le reçoit', async () => {
    /* L'école envoie la civilité et la situation, que Paul n'a pas. Avec un partenaire destinataire,
       elles lui manquent ; sans destinataire — la 131 démarre à zéro —, rien ne part vers personne :
       seul l'essentiel reste réclamé. */
    champsEcole = 'civilite,adresse,code_postal,ville,statut';
    partenaires = () => [{ name: 'Moulins du Sud' }];
    let { data } = await lister();
    assert.deepStrictEqual(data[1].champs_manquants, ['Civilité', 'Adresse postale', 'Code postal', 'Ville', 'Situation professionnelle']);
    partenaires = () => [];
    ({ data } = await lister());
    assert.deepStrictEqual(data[1].champs_manquants, ['Adresse postale', 'Code postal', 'Ville']);
    champsEcole = 'nom,prenom,email,telephone,adresse,code_postal,ville';
    partenaires = () => [{ name: 'Moulins du Sud' }];
});

test('l\'écran pose le repère sur la ligne, avec la liste en info-bulle', () => {
    const LISTE = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/pages/Stagiaires.jsx'), 'utf8');
    assert.match(LISTE, /\{l\.champs_manquants\?\.length > 0 && \(\s*<Badge tone="n" className="fiche-chip" title=\{`Fiche incomplète : \$\{l\.champs_manquants\.join\(", "\)\}`\}>/);
    const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/styles/app.css'), 'utf8');
    /* Pas `.rappel-chip` : son `display:inline-block` casserait l'alignement de l'icône et du texte,
       que `.badge` tient en inline-flex. */
    assert.match(CSS, /\.fiche-chip\{margin-left:8px;vertical-align:1px;white-space:nowrap\}/);
    assert.doesNotMatch(CSS.match(/\.fiche-chip\{[^}]*\}/)[0], /display:/);
    /* LE LIBELLÉ RESTE ENTIER, téléphone compris. Il s'y réduisait à son icône quand la colonne du
       nom ne faisait que 70 px ; la ligne y passe désormais les actions sous le nom
       (stagiaires-lignes-telephone.test.js), et la place ne manque plus. Une icône seule ne se
       comprenait pas au doigt : pas d'info-bulle sur un écran tactile. */
    assert.match(LISTE, /<Icon name="alert-triangle" size=\{11\} aria-hidden="true" \/>Fiche incomplète/);
    assert.doesNotMatch(CSS, /fiche-chip-t/);
});
