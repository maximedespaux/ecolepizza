/**
 * {Today} DANS LA PALETTE, ET LE CALCUL DANS LES JETONS PERSONNALISÉS.
 *
 * DEUX DÉFAUTS DE VISIBILITÉ, d'abord. {Today} existait comme VALEUR depuis toujours : il
 * fonctionnait si on le tapait à la main, et n'apparaissait nulle part dans la palette — donc
 * personne ne pouvait savoir qu'il existait. `COMPUTED_KEYS` décide seule de ce qui s'affiche dans
 * « Dates et valeurs calculées », et un jeton absent de cette liste reste introuvable. C'était
 * aussi le cas de {HorairesJours}, livré la veille : ajouter un jeton calculé demande DEUX gestes,
 * et le second s'oublie sans que rien ne le signale.
 *
 * LE CALCUL, ensuite. Le modificateur `|` ne savait décaler que des DATES. Le même geste — « ce
 * jeton, moins N » — se dit pourtant pareil sur un montant. C'est la VALEUR qui décide désormais.
 */
const test = require('node:test');
const assert = require('node:assert');
const { applyTemplate, shiftNumber } = require('../lib/customtokens.js');
const { TOKEN_CATALOG } = require('../lib/tokens.js');

/* LA VRAIE PALETTE, sur une base factice où rien n'est activé : `COMPUTED_KEYS` n'existe plus
   (2026-09-26). La liste à la main qui décidait seule du groupe « calculé » a laissé place à une
   palette complète par construction — chaque jeton du catalogue s'y range dans son groupe. Le
   contrat reste celui de ce test : {Today} et {HorairesJours} se TROUVENT. */
const faux = {
    promise: () => ({ query: async () => [[]] }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { getTokens } = require('../controllers/template.controller.js');

async function palette() {
    let corps = null;
    const res = { status() { return this; }, json(b) { corps = b; return this; } };
    await getTokens({ user: { organization_id: 'o1' }, query: {} }, res);
    return corps.data;
}

test('{Today} et {HorairesJours} sont PROPOSÉS dans la palette', async () => {
    const groupes = await palette();
    const groupeDe = (k) => (groupes.find((g) => g.tokens.some((t) => t.key === k)) || {}).group;
    assert.strictEqual(groupeDe('Today'), 'Dates et valeurs calculées');
    /* Les journées et leurs horaires se cherchent avec les dates de la SESSION : ils vivaient dans le
       groupe « calculé », à côté du prix et du formateur. */
    assert.strictEqual(groupeDe('HorairesJours'), 'Session');
    // Et il faut qu'ils soient AU CATALOGUE : c'est de lui que la palette les tire.
    const cles = TOKEN_CATALOG.flatMap((g) => g.tokens).map((t) => t.key);
    for (const k of ['Today', 'HorairesJours']) assert.ok(cles.includes(k), `${k} absent du catalogue`);
});

test('{Date} reste valide pour les modèles qui l\'emploient déjà', () => {
    /* On n'a pas renommé : {Today} s'ajoute, {Date} demeure. Le retirer aurait fait passer pour
       « jeton inconnu » chaque modèle existant qui s'en sert. */
    const cles = TOKEN_CATALOG.flatMap((g) => g.tokens).map((t) => t.key);
    assert.ok(cles.includes('Date'));
});

test('un montant se calcule EN CONSERVANT sa mise en forme', () => {
    /* L'ATTENDU EST CONSTRUIT, pas recopié : `toLocaleString('fr-FR')` sépare les milliers par une
       espace FINE INSÉCABLE (U+202F), invisible à la relecture. Un test qui la recopie à la main
       échoue sur deux chaînes visuellement identiques — et on cherche le défaut dans le code. */
    const eur = (n) => n.toLocaleString('fr-FR') + ' €';
    const v = { Prix: eur(1500), Acompte: eur(450), Heures: '35', Annee: '2026' };
    assert.strictEqual(applyTemplate('{Prix|-450}', v), eur(1050));
    assert.strictEqual(applyTemplate('{Prix|+99,5}', v), eur(1599.5));
    assert.strictEqual(applyTemplate('Reste : {Prix|-450}', v), `Reste : ${eur(1050)}`);
    /* L'ESPACE AVANT LE SYMBOLE. Avec un motif gourmand, « 1 500 € » correspondait à « 1 500 »
       espace compris : le remplacement l'emportait et rendait « 1 050€ », collé. Un détail qui
       se voit sur chaque facture. */
    assert.ok(!/\d€/.test(applyTemplate('{Prix|-450}', v)), 'le symbole ne doit pas coller au nombre');
    // Un nombre SANS séparateur n'en gagne pas : « 2026 » est une année, pas « 2 027 ».
    assert.strictEqual(applyTemplate('{Annee|+1}', v), '2027');
    assert.strictEqual(applyTemplate('{Heures|-7}', v), '28');
});

test('une DATE se décale toujours en jours, et une décimale ne la casse pas', () => {
    const v = { Jour1: '02/06/2026' };
    assert.strictEqual(applyTemplate('{Jour1|-1}', v), '01/06/2026');
    // « La veille » n'a pas de demi-journée : la partie décimale est tronquée, pas refusée.
    assert.strictEqual(applyTemplate('{Jour1|-1,5}', v), '01/06/2026');
});

test('ce qui n\'est ni date ni nombre ressort INTACT', () => {
    /* Jamais « NaN » sur un document signé : un modificateur mal placé doit être invisible, pas
       destructeur. */
    const v = { Titre: 'Pizzaïolo', Vide: '' };
    assert.strictEqual(applyTemplate('{Titre|-5}', v), 'Pizzaïolo');
    assert.strictEqual(applyTemplate('{Vide|-10}', v), '');
    assert.strictEqual(applyTemplate('{Inconnu|-10}', v), '', 'un jeton absent reste vide');
    assert.strictEqual(shiftNumber('Pizzaïolo', -5), null, 'la fonction le signale à l\'appelant');
});
