/**
 * L'APERÇU DU PROCÈS-VERBAL DE JURY (demandé le 2026-10-09).
 *
 * Le PV ne se voyait qu'une fois IMPRIMÉ (un PDF ouvert dans un onglet, et seulement après clôture).
 * On ajoute une VUE de ce qu'il donnera, rendue en HTML — donc SANS LibreOffice, et disponible même
 * commission OUVERTE (brouillon). Ce qu'on éprouve ici, base simulée :
 *   · l'aperçu remplit les mêmes jetons que le PDF (même `contextePv`, même `fillHtml`) — le numéro,
 *     la certification et un candidat se retrouvent dans l'HTML rendu ;
 *   · il NE dépend PAS de la clôture : une commission ouverte rend quand même l'aperçu, `cloture:false` ;
 *   · sans le modèle `pv-jury`, on répond 404 avec un message qui dit quoi faire (le créer), pas une
 *     page blanche ; sans commission, 404 aussi.
 * Puis le câblage (route, handler, apiClient, écran) est lu au source.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const JURY = [
    { nom: 'DESPAUX Jean-Jacques', qualite: 'présidente', externe: false, na_pas_forme: true },
    { nom: 'RIOS Pascal', qualite: 'membre du jury', externe: true, na_pas_forme: true },
    { nom: 'LE FAOU Dominique', qualite: 'membre du jury', externe: true, na_pas_forme: true },
];
const COMMISSION = {
    id: 'ex-1', training_session_id: 's-1', certification: 'Titre professionnel Pizzaïolo',
    rncp_code: 'RS7404', voie_acces: 'FORMATION_CONTINUE', pv_ref: 'EPJJD-2026-38',
    date_examen: '2026-12-18', lieu: '101 rue Alsace Lorraine', centre: '', status: 'OUVERTE',
    jury: JSON.stringify(JURY), heure: '9h30', representant: '', representant_fonction: '', aleas: 'Néant.',
};
const CANDIDATS = [
    { learner_id: 'l-1', first_name: 'Jérémy', last_name: 'HANY', civility: 'M.', birthday: '12/04/1990' },
    { learner_id: 'l-2', first_name: 'Elodie', last_name: 'JOFFRE', civility: 'Mme', birthday: '03/11/1988' },
];
/* Un modèle `pv-jury` minimal, dans la forme des puces de l'éditeur (data-token) : de quoi prouver
   que le remplissage de jetons passe (le numéro et la certification doivent apparaître dans l'HTML). */
const puce = (cle) => `<span class="doc-token" data-token="${cle}" data-label="${cle}">${cle}</span>`;
const TEMPLATE = {
    kind: 'builder',
    body_html: `<p>N° ${puce('PV')}</p><p>${puce('Certification')} — ${puce('Code RNCP')}</p><p>${puce('PVListeCandidats')}</p>`,
    header_html: '', footer_html: '', layout: null, file: null, name: null, mime: null,
};

let commission = COMMISSION;
let resultats = [{ learner_id: 'l-1', decision: 'CERTIFIE', observations: '' }];
let template = TEMPLATE;
const faux = {
    promise: () => ({
        query: async (sql) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            if (/FROM exam_session/i.test(sql)) return [commission ? [commission] : []];
            if (/FROM exam_result/i.test(sql)) return [resultats];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [CANDIDATS];
            if (/FROM organization/i.test(sql)) return [[{ id: 'o1', name: 'École Pizza' }]];
            if (/FROM document_template/i.test(sql)) return [template ? [template] : []];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { pvApercu } = require('../controllers/examen.controller.js');

function faireRes() {
    const res = { code: 200, corps: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    res.set = () => res; res.send = (b) => { res.corps = b; return res; };
    return res;
}
const apercu = async () => {
    const res = faireRes();
    await pvApercu({ user: { organization_id: 'o1' }, params: { id: 's-1' } }, res);
    return res;
};

test('L\'APERÇU REMPLIT LES JETONS, comme le PDF — et sans clôture', async () => {
    commission = COMMISSION; template = TEMPLATE;
    const res = await apercu();
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.corps.data.cloture, false, 'commission ouverte : aperçu quand même, marqué brouillon');
    const html = res.corps.data.html;
    assert.match(html, /EPJJD-2026-38/, 'le numéro de PV est rendu');
    assert.match(html, /Titre professionnel Pizzaïolo/, 'la certification est rendue');
    assert.match(html, /RS7404/, 'le code RNCP est rendu');
    assert.match(html, /HANY/, 'la liste des candidats est remplie');
    assert.doesNotMatch(html, /data-token="PV"/, 'les puces sont résolues, pas laissées brutes');
});

test('COMMISSION CLÔTURÉE : l\'aperçu le dit (cloture:true)', async () => {
    commission = { ...COMMISSION, status: 'CLOTUREE' }; template = TEMPLATE;
    const res = await apercu();
    assert.strictEqual(res.corps.data.cloture, true);
});

test('SANS MODÈLE pv-jury : 404 avec un message qui dit de le créer, pas une page vide', async () => {
    commission = COMMISSION; template = null;
    const res = await apercu();
    assert.strictEqual(res.code, 404);
    assert.match(res.corps.error, /Créez-le|modèle/i);
});

test('SANS COMMISSION : 404', async () => {
    commission = null; template = TEMPLATE;
    const res = await apercu();
    assert.strictEqual(res.code, 404);
    commission = COMMISSION;
});

/* ── Le câblage, lu au source ──────────────────────────────────────────────────────────────── */
const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(f, 'utf8');

test('route + handler : GET apercu, rôles STAFF, modèle épinglé, pas de porte sur la clôture', () => {
    const routes = lire(path.join(API, 'routes/examen.routes.js'));
    assert.match(routes, /router\.get\('\/session\/:id\/pv\/apercu', authorizeRoles\(\.\.\.STAFF_ROLES\), pvApercu\)/);
    const ctrl = lire(path.join(API, 'controllers/examen.controller.js'));
    const corps = ctrl.slice(ctrl.indexOf('const pvApercu ='), ctrl.indexOf('module.exports'));
    assert.match(corps, /getTemplateContent\(orgId, 'pv-jury'\)/, 'le modèle est épinglé, pas pris de l\'URL');
    assert.match(corps, /renderTemplateHtml\(/, 'rendu HTML (pas de LibreOffice)');
    assert.match(corps, /cloture: ctx\.exam\.status === 'CLOTUREE'/);
    assert.doesNotMatch(corps, /status \(409|Clôturez|return[^\n]*CLOTUREE[^\n]*\n[^\n]*error/, 'aucune porte « clôturez d\'abord »');
});

test('écran : bouton « Aperçu du PV », fenêtre d\'aperçu, et « Générer le PV (PDF) »', () => {
    const jsx = lire(path.join(UI, 'components/CommissionJury.jsx'));
    assert.match(jsx, /getPvApercu/, 'le chargeur est importé');
    assert.match(jsx, /onClick=\{voirApercu\}/, 'un bouton ouvre l\'aperçu');
    assert.match(jsx, />\s*\{apercuEnCours \? "Aperçu…" : "Aperçu du PV"\}/, 'libellé du bouton');
    assert.match(jsx, /srcDoc=\{apercu\.html\}[\s\S]*sandbox="allow-same-origin"/, 'aperçu en iframe isolé');
    assert.match(jsx, /Générer le PV \(PDF\)/, 'le bouton de génération est explicite');
    const api = lire(path.join(UI, 'api/apiClient.js'));
    assert.match(api, /export function getPvApercu\(sessionId\)/);
    assert.match(api, /\/examens\/session\/\$\{sessionId\}\/pv\/apercu/);
});
