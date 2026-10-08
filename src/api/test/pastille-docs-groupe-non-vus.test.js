/**
 * LA PASTILLE « MES DOCUMENTS » COMPTE LES DOCUMENTS DE GROUPE REÇUS MAIS JAMAIS VUS.
 *
 * LE DÉFAUT GELÉ ICI, constaté le 2026-10-08. Un stagiaire inscrit PAR UNE ENTREPRISE reçoit des
 * documents de GROUPE (devis, convention, CGV) qu'il peut consulter mais pas signer. La pastille
 * de son espace ne les comptait JAMAIS : `pendingDocsCount` ne regardait que ses documents
 * NOMINATIFS (`d.learner_id = moi`), et un document de groupe n'a pas de `learner_id`. Il recevait
 * donc des documents sans le moindre signal.
 *
 * LA RÈGLE RETENUE (décidée avec l'école) : « reçus mais jamais vus », et la pastille RETOMBE dès
 * qu'il les ouvre. Le statut d'un document de groupe étant PARTAGÉ (une ligne pour toute
 * l'entreprise), on trace l'OUVERTURE par compte (table `document_vu`, migration 204) — marquée à
 * l'ouverture (getDocument), lue au comptage, signalée à l'écran (pingAcces).
 *
 * TOUT EST TOLÉRANT : sans la 204, la pastille garde son décompte d'avant (les documents de groupe
 * ne sont pas comptés) et l'enregistrement d'une ouverture est avalé — le code marche avant ET
 * après la migration.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p, f) => fs.readFileSync(path.join(p, f), 'utf8');
const ESPACE = lire(API, 'controllers/espace.controller.js');
const DOC = lire(API, 'controllers/document.controller.js');

/* ─── Serveur : le comptage ──────────────────────────────────────────────────────────────────── */

test('pendingDocsCount ajoute les documents de GROUPE non vus, par compte', () => {
    assert.match(ESPACE, /async function pendingDocsCount\(conn, learner, orgId, userId\)/,
        'le comptage reçoit le compte (userId) pour savoir ce qu\'IL a vu');
    assert.match(ESPACE, /return aFaire \+ await groupeNonVusCount\(conn, learner\.id, orgId, userId\);/,
        'à faire (ses propres docs) + documents de groupe non vus');
    // getMyAccess transmet bien le compte connecté.
    assert.match(ESPACE, /pendingDocsCount\(conn, learner, learner\.organization_id, req\.user\.id\)/);
});

test('les documents de groupe comptés : reçus, scope COMPANY, rattachés au dossier, JAMAIS ouverts', () => {
    const z = ESPACE.slice(ESPACE.indexOf('async function groupeNonVusCount'), ESPACE.indexOf('async function groupeNonVusCount') + 1200);
    assert.match(z, /gd\.scope = 'COMPANY'/, 'uniquement les documents de GROUPE');
    assert.match(z, /gd\.status IN \('ENVOYE','CONSULTE'\)/, 'reçus (pas encore signés/finalisés)');
    assert.match(z, /JOIN enrollment e ON e\.id = df\.enrollment_id/);
    assert.match(z, /WHERE e\.learner_id = \?/, 'rattachés à un dossier DE CE stagiaire');
    assert.match(z, /LEFT JOIN document_vu v ON v\.document_id = gd\.id AND v\.user_id = \?/);
    assert.match(z, /v\.document_id IS NULL/, 'jamais ouverts par ce compte');
    // Tolérant : sans la migration 204, on rend 0 (pas d'échec du comptage entier).
    assert.match(z, /if \(isMissingSchema\(e\)\) return 0;/);
});

/* ─── Serveur : marquer « vu » à l'ouverture ─────────────────────────────────────────────────── */

test('ouvrir un document le marque « vu » (getDocument), hors personnel et tolérant', () => {
    const g = DOC.slice(DOC.indexOf('const getDocument = async'), DOC.indexOf('const getDocument = async') + 1600);
    // Réservé aux NON-membres du personnel : un aperçu du bureau n'est pas une lecture du stagiaire.
    assert.match(g, /if \(!\['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'\]\.includes\(req\.user\.role\)\)/);
    assert.match(g, /INSERT IGNORE INTO document_vu \(document_id, user_id\) VALUES \(\?, \?\)/);
    assert.match(g, /\[doc\.id, req\.user\.id\]/, 'CE document, CE compte');
    // Tolérant : table absente (204 non jouée) ⇒ on avale, on ne casse pas l'ouverture.
    assert.match(g, /e\.code === 'ER_NO_SUCH_TABLE' \|\| e\.code === 'ER_BAD_FIELD_ERROR'/);
    // Le marquage vient APRÈS le contrôle d'accès : on ne note « vu » que ce qu'on avait le droit d'ouvrir.
    assert.ok(g.indexOf('lecteurDuDocument(conn, req.user, doc)') < g.indexOf('INSERT IGNORE INTO document_vu'));
});

/* ─── Écran : la pastille retombe dès l'ouverture ────────────────────────────────────────────── */

test('DocumentViewModal signale l\'ouverture (pingAcces) pour faire retomber la pastille', () => {
    const m = lire(UI, 'components/DocumentViewModal.jsx');
    // À l'ouverture, le chargement du document émet pingAcces (StudentLayout relit alors la pastille).
    assert.match(m, /getDocument\(id\)\.then\(\(r\) => \{ setDoc\(r\.data\); pingAcces\(\); \}\)/);
});

test('la pastille « Mes documents » existe et dit ce qu\'elle compte', () => {
    const l = lire(UI, 'layouts/StudentLayout.jsx');
    assert.match(l, /to="\/mon-espace"/, 'la pastille est sur « Mes documents »');
    // Depuis le 2026-10-08, la pastille somme ses propres pièces et les documents d'entreprise
    // à signer (`docsBadge = pending + repPending`) : « Entreprise » est devenu un onglet de la page.
    assert.match(l, /docsBadge > 0 && <span className="stu-count">\{docsBadge\}<\/span>/, 'elle montre le nombre');
    assert.match(l, /document.*en attente/, 'et dit « en attente »');
});

/* ─── Migration 204 ──────────────────────────────────────────────────────────────────────────── */

test('la migration 204 crée document_vu proprement, et son revert la retire', () => {
    const dir = path.join(__dirname, '../../../database/migrations');
    const aller = fs.readFileSync(path.join(dir, '204_document_vu.sql'), 'utf8');
    const retour = fs.readFileSync(path.join(dir, '204_revert_document_vu.sql'), 'utf8');
    assert.match(aller, /CREATE TABLE IF NOT EXISTS document_vu/, 'rejouable sans risque');
    assert.match(aller, /REFERENCES generated_document \(id\) ON DELETE CASCADE/, 'les traces partent avec le document');
    assert.match(aller, /REFERENCES user \(id\) ON DELETE CASCADE/, 'et avec le compte');
    assert.match(retour, /DROP TABLE IF EXISTS document_vu/);
    // Commentaires en BLOCS seulement (CLAUDE.md §2.1), jamais « -- » en tête de ligne.
    for (const f of [aller, retour]) assert.doesNotMatch(f, /^\s*--/m, 'commentaires /* */ seulement');
});
