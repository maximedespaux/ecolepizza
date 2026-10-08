/**
 * LE RÈGLEMENT CÔTÉ ENTREPRISE (demandé le 2026-10-08) — la MÊME carte que la fiche stagiaire, mais
 * un bloc par dossier de l'ENTREPRISE (ses stagiaires inscrits). AUCUNE migration : les colonnes
 * 194/195 (acompte_moyen/ref, solde_moyen/ref, payé le…) vivent déjà sur `enrollment`.
 *
 * Le cœur (assemblage GET, validation + écriture PATCH) est PARTAGÉ avec la fiche stagiaire —
 * `reponseReglements` / `appliquerReglement` — ; seul le filtre change (`e.company_id = ?` au lieu de
 * `e.learner_id = ?`). Le règlement d'un dossier ne se valide donc qu'à UN endroit, pour les deux fiches.
 *
 * Lecture = STAFF (le `router.use` du routeur), écriture = ADMIN + délégation sur /entreprises (la
 * section `companies` pointe sur `/entreprises`, cf. sectionAccess) : mêmes droits qu'éditer la fiche.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p, f) => fs.readFileSync(path.join(p, f), 'utf8');
const LEARNER = lire(API, 'controllers/learner.controller.js');
const COMPANY = lire(API, 'controllers/company.controller.js');
const ROUTES = lire(API, 'routes/company.routes.js');
const API_CLIENT = lire(UI, 'api/apiClient.js');
const CARTE = lire(UI, 'components/CarteReglement.jsx');
const FICHE = lire(UI, 'pages/EntrepriseDetail.jsx');

/* ─── Le cœur partagé, et la fiche stagiaire l'emploie ─────────────────────────────────────────── */

test('le cœur du règlement est PARTAGÉ (reponseReglements / appliquerReglement), filtre paramétré', () => {
    assert.match(LEARNER, /async function reponseReglements\(conn, orgId, filtre, filtreVals\)/);
    assert.match(LEARNER, /async function appliquerReglement\(conn, orgId, enrollmentId, b\)/);
    assert.match(LEARNER, /WHERE \$\{filtre\} AND e\.organization_id = \?/, 'le filtre (learner_id / company_id) est paramétré');
    // La fiche stagiaire délègue désormais au cœur partagé (pas de duplication).
    assert.match(LEARNER, /reponseReglements\(conn, orgId, 'e\.learner_id = \?', \[req\.params\.id\]\)/);
    assert.match(LEARNER, /appliquerReglement\(conn, orgId, req\.params\.enrollmentId, req\.body \|\| \{\}\)/);
    assert.match(LEARNER, /reponseReglements, appliquerReglement,/, 'exportés pour la fiche entreprise');
});

/* ─── La fiche entreprise, filtrée par company_id ──────────────────────────────────────────────── */

test('getReglementsEntreprise filtre par company_id et réutilise le cœur partagé', () => {
    const z = COMPANY.slice(COMPANY.indexOf('const getReglementsEntreprise'), COMPANY.indexOf('const getReglementsEntreprise') + 800);
    assert.match(z, /FROM company WHERE id = \? AND organization_id = \?/, 'l\'entreprise doit exister (404 sinon)');
    assert.match(z, /reponseReglements\(conn, orgId, 'e\.company_id = \?', \[req\.params\.id\]\)/);
});

test('updateReglementEntreprise exige un dossier DE CETTE entreprise, puis écrit par le cœur', () => {
    const z = COMPANY.slice(COMPANY.indexOf('const updateReglementEntreprise'), COMPANY.indexOf('const updateReglementEntreprise') + 900);
    assert.match(z, /FROM enrollment WHERE id = \? AND company_id = \? AND organization_id = \?/, 'scopé à l\'entreprise (404 sinon)');
    assert.match(z, /appliquerReglement\(conn, orgId, req\.params\.enrollmentId, req\.body \|\| \{\}\)/);
    assert.match(z, /logAudit\(req, 'enrollment\.reglement', 'Company', req\.params\.id\)/, 'journalisé sur la fiche entreprise');
    assert.match(COMPANY, /const \{ reponseReglements, appliquerReglement \} = require\('\.\/learner\.controller\.js'\)/);
});

/* ─── Routes : lecture STAFF (router.use), écriture ADMIN ─────────────────────────────────────── */

test('les routes entreprise du règlement : GET (STAFF hérité) et PATCH (ADMIN)', () => {
    assert.match(ROUTES, /router\.get\('\/:id\/reglements', getReglementsEntreprise\)/);
    assert.match(ROUTES, /router\.patch\('\/:id\/reglement\/:enrollmentId', authorizeRoles\(\.\.\.ADMIN_ROLES\), updateReglementEntreprise\)/);
});

/* ─── apiClient + écran ────────────────────────────────────────────────────────────────────────── */

test('apiClient : les deux appels côté entreprise', () => {
    assert.match(API_CLIENT, /getReglementsEntreprise\(companyId\) \{\s*return request\(`\/companies\/\$\{companyId\}\/reglements`\)/);
    assert.match(API_CLIENT, /updateReglementEntreprise\(companyId, enrollmentId, payload\)/);
    assert.match(API_CLIENT, /`\/companies\/\$\{companyId\}\/reglement\/\$\{enrollmentId\}`/);
});

test('CarteReglement réutilisable : onUpdate (sinon updateReglement) et videMessage', () => {
    assert.match(CARTE, /onUpdate \? onUpdate\(enrollmentId, patch\) : updateReglement\(learnerId, enrollmentId, patch\)/);
    assert.match(CARTE, /videMessage \|\|/);
});

test('EntrepriseDetail : un onglet « Règlement » qui rend la carte, scopé par la permission', () => {
    assert.match(FICHE, /onClick=\{\(\) => setTab\("reglement"\)\}>Règlement<\/button>/);
    assert.match(FICHE, /tab === "reglement" &&/);
    assert.match(FICHE, /<CarteReglement/);
    assert.match(FICHE, /onUpdate=\{\(eid, patch\) => updateReglementEntreprise\(id, eid, patch\)\}/);
    assert.match(FICHE, /canEdit=\{peutEcrire\(user, "\/entreprises"\)\}/);
    assert.match(FICHE, /getReglementsEntreprise\(id\)/);
});
