/**
 * GARDER UNE COPIE D'UN DOCUMENT REMIS, UNE FOIS LA RÉCEPTION CONFIRMÉE (demandé le 2026-10-21).
 *
 * LE BESOIN. L'école remet des documents à un stagiaire (ou à l'entreprise) — un accord de prise en
 * charge, un courrier nominatif. Le destinataire pouvait les VOIR (ouverture en onglet, servis
 * `inline`), confirmer la réception (« J'ai bien reçu »)… mais pas en GARDER une copie : aucun
 * bouton de téléchargement. On en ajoute un, à côté de « Voir », qui n'apparaît qu'UNE FOIS la
 * réception confirmée (statut RECUE) — avant, c'est « Voir » puis « J'ai bien reçu » qui priment.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · le téléchargement passe par le MÊME endpoint que « Voir » (`/remises/fichier/:id`), mais
 *     ENREGISTRE le fichier (helper `download`) au lieu d'ouvrir un onglet — le serveur le sert en
 *     `inline`, c'est donc le client qui force l'enregistrement, sous le nom d'origine du fichier ;
 *   · le bouton n'est proposé qu'une fois la remise RECUE, des DEUX côtés (espace entreprise,
 *     espace stagiaire) ;
 *   · l'endpoint autorise déjà le DESTINATAIRE (le représentant pour une remise d'entreprise, le
 *     stagiaire sinon) — c'est ce qui rend le téléchargement atteignable depuis ces deux espaces.
 *     Le geler ici : un futur verrouillage « bureau seulement » casserait le bouton en silence.
 *
 * Tests de câblage (composants React + source serveur, non exécutables ici), comme leurs miroirs.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

test('apiClient : downloadRemiseFichier ENREGISTRE le fichier (et ne l\'ouvre pas)', () => {
    const api = lireUi('api/apiClient.js');
    /* Le helper `download` fait un fetch du blob puis un clic sur une ancre `download` : c'est lui
       qui force l'enregistrement, puisque le serveur sert le fichier en `inline`. */
    assert.match(api, /export function downloadRemiseFichier\(fichierId, filename\) \{[\s\S]*?return download\(`\/remises\/fichier\/\$\{fichierId\}`, filename \|\| "document"\);/);
    /* La route de « Voir » (ouverture en onglet) reste, inchangée : les deux coexistent. */
    assert.match(api, /export function remiseFichierUrl\(fichierId\) \{ return `\$\{API_BASE_URL\}\/remises\/fichier\/\$\{fichierId\}`; \}/);
});

test('espace ENTREPRISE : « Télécharger » n\'apparaît qu\'une fois la remise RECUE, à côté de « Voir »', () => {
    const ui = lireUi('pages/RepresentantEspace.jsx');
    assert.match(ui, /import \{ Fragment, /, 'les deux boutons par fichier tiennent dans un Fragment');
    assert.match(ui, /downloadRemiseFichier/, 'la fonction est importée');
    /* « Voir » toujours là ; « Télécharger » SOUS condition de réception (recue = statut RECUE). */
    assert.match(ui, /const recue = r\.statut === "RECUE";/);
    assert.match(ui, /\{recue && \(\s*<button className="btn sm ghost"[\s\S]*?onClick=\{\(\) => downloadRemiseFichier\(f\.id,/);
    assert.match(ui, /Télécharger\{r\.fichiers\.length > 1/);
});

test('espace STAGIAIRE : même bouton « Télécharger », gardé lui aussi par la réception', () => {
    const ui = lireUi('pages/StudentFormationDetail.jsx');
    assert.match(ui, /import \{ Fragment, /);
    assert.match(ui, /downloadRemiseFichier/);
    assert.match(ui, /\{e\.r\.statut === "RECUE" && \(\s*<button className="btn sm ghost"[\s\S]*?onClick=\{\(\) => downloadRemiseFichier\(f\.id,/);
    assert.match(ui, /Télécharger\{\(e\.r\.fichiers\.length > 1\)/);
});

test('le serveur sert le fichier à SON DESTINATAIRE (représentant pour l\'entreprise, stagiaire sinon)', () => {
    const ctrl = lireApi('controllers/remise.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('const servirFichier'), ctrl.indexOf('const supprimerFichier'));
    /* C'est cette garde — bureau OU destinataire effectif — qui rend le fichier atteignable depuis
       les deux espaces. Si elle se resserrait au seul bureau, le bouton « Télécharger » (comme
       « Voir ») renverrait 403 sans prévenir. */
    assert.match(fn, /const destinataire = pourEntreprise\(f\) \? f\.representant : f\.user_id;/);
    assert.match(fn, /if \(!estBureau\(req\.user\) && destinataire !== req\.user\.id\) return res\.status\(403\)/);
    /* Servi `inline` : le navigateur l'afficherait — d'où l'enregistrement forcé côté client. */
    assert.match(fn, /Content-Disposition', `inline; filename=/);
    /* Le nom du fichier est bien exposé au client (il sert de nom d'enregistrement). */
    assert.match(ctrl, /SELECT id, remise_id, nom, mime, taille, sort_order FROM remise_fichier/);
});
