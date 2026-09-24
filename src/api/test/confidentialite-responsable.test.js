/**
 * LE RESPONSABLE DE TRAITEMENT SUR LA PAGE PUBLIQUE « CONFIDENTIALITÉ » (2026-09-24).
 *
 * Le RGPD (art. 13) impose de nommer le responsable de traitement et un contact pour l'exercice
 * des droits sur la page de confidentialité — laquelle se lit AVANT de créer un compte. La page
 * portait un « à compléter avant mise en ligne » resté en place sur le site en production. Plutôt
 * que d'y recopier une adresse à la main (qui dériverait de la fiche réelle, et une adresse fausse
 * sur une page de droits est pire qu'une page absente), on lit la fiche organisme par un endpoint
 * PUBLIC, avec un repli honnête tant qu'un champ manque.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

test('l\'endpoint /coordonnees est PUBLIC — déclaré avant la garde d\'authentification', () => {
    const routes = lire('routes/organization.routes.js');
    /* Le routeur applique `router.use(authenticateToken, …)` : tout ce qui vient APRÈS est fermé.
       La route publique doit donc être déclarée AVANT cette ligne, sinon elle n'est pas publique. */
    const iRoute = routes.indexOf("router.get('/coordonnees'");
    const iGarde = routes.indexOf('router.use(authenticateToken');
    assert.ok(iRoute > -1, 'la route /coordonnees doit exister');
    assert.ok(iGarde > -1, 'la garde d’authentification doit exister');
    assert.ok(iRoute < iGarde, 'la route /coordonnees doit précéder router.use(authenticateToken…), sinon elle est fermée');
});

test('le contrôleur ne renvoie qu\'un lot de contact — jamais SELECT *, jamais de colonne sensible', () => {
    const ctrl = lire('controllers/organization.controller.js');
    const bloc = ctrl.slice(ctrl.indexOf('const getOrgCoordonnees'), ctrl.indexOf('const getOrgCoordonnees') + 900);
    assert.match(bloc, /SELECT legal_name, short_name, manager, email, phone, address, zip_code, town/,
        'liste blanche explicite des champs de contact');
    assert.ok(!/SELECT \*/.test(bloc), 'jamais SELECT * sur un endpoint public');
    /* La table `organization` porte aussi des colonnes qui ne doivent JAMAIS sortir sans auth. */
    for (const sensible of ['signature_image', 'sign_cert', 'mail_credentials', 'mail_reset', 'iban', 'bic']) {
        assert.ok(!bloc.includes(sensible), `« ${sensible} » ne doit pas figurer dans l’endpoint public`);
    }
    /* Une erreur de lecture ne casse pas la page : elle renvoie data:null, et la page retombe sur
       son repli « à compléter ». */
    assert.match(bloc, /res\.json\(\{ data: null \}\)/);
});

test('la page lit la fiche organisme et garde un repli honnête', () => {
    const page = lireUi('pages/Confidentialite.jsx');
    assert.match(page, /getOrgCoordonnees\(\)\.then/, 'la page lit le responsable depuis la fiche organisme');
    /* IDENTITÉ + CONTACT, sinon repli : afficher « Responsable : » suivi d’un vide serait pire que
       le « à compléter ». */
    assert.match(page, /if \(!nom \|\| !\(org\.email \|\| postal\)\) return null;/,
        'sans identité ET contact, on garde le repli');
    assert.match(page, /Responsable de traitement\s*:/, 'le bloc nomme le responsable de traitement');
    assert.match(page, /mailto:\$\{responsable\.email\}/, 'le contact e-mail est cliquable');
    /* LE REPLI DIT OÙ RENSEIGNER — un « à compléter » sans mode d’emploi laisse la page bloquée. */
    assert.match(page, /Paramètres → Organisme/);
    /* On n’écrit AUCUNE adresse en dur dans le JSX : elle viendrait doubler la fiche et dériverait. */
    assert.ok(!/@ecole-pizza\.fr|@impastio/.test(page), 'aucune adresse de contact codée en dur dans la page');
});
