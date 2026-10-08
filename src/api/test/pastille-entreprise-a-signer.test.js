/**
 * UNE PASTILLE SUR « ENTREPRISE » : les documents de groupe que le REPRÉSENTANT doit signer.
 *
 * LE DÉFAUT GELÉ ICI, constaté le 2026-10-08. L'espace Entreprise (représentant d'une société, qui
 * signe devis/convention/CGV pour elle) affichait « 3 document(s) à signer » SUR LA PAGE, mais
 * l'entrée « Entreprise » de la barre ne portait AUCUNE pastille — un stagiaire qui n'ouvre pas cet
 * onglet ne voyait pas qu'il avait des documents à signer. Pendant de « Mes documents ».
 *
 * La pastille compte, côté serveur (getMyAccess → repPendingDocsCount), les documents de GROUPE
 * (scope COMPANY) des entreprises DE CE COMPTE encore NON SIGNÉS — le même `toSign` que l'écran.
 * Elle retombe dès qu'il signe : les gestes de signature du représentant émettent `pingAcces`, que
 * StudentLayout écoute déjà. Tolérant : schémas absents ⇒ 0 (pas de pastille), rien ne casse.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p, f) => fs.readFileSync(path.join(p, f), 'utf8');
const ESPACE = lire(API, 'controllers/espace.controller.js');

/* ─── Serveur ─────────────────────────────────────────────────────────────────────────────────── */

test('getMyAccess renvoie rep_pending_docs — les documents d\'entreprise à signer', () => {
    assert.match(ESPACE, /async function repPendingDocsCount\(conn, userId, orgId\)/);
    const z = ESPACE.slice(ESPACE.indexOf('async function repPendingDocsCount'), ESPACE.indexOf('async function repPendingDocsCount') + 900);
    assert.match(z, /JOIN company c ON c\.id = gd\.company_id AND c\.user_id = \?/, 'les entreprises DE CE COMPTE (représentant)');
    assert.match(z, /gd\.scope = 'COMPANY' AND gd\.status <> 'SIGNE'/, 'documents de groupe non encore signés = « à signer »');
    assert.match(z, /if \(isMissingSchema\(e\)\) return 0;/, 'tolérant (schéma absent ⇒ pas de pastille)');
    // Calculée une fois, et transmise à TOUTES les sorties de getMyAccess (représentant avec ou sans fiche stagiaire).
    assert.match(ESPACE, /const rep_pending_docs = await repPendingDocsCount\(conn, req\.user\.id, req\.user\.organization_id\);/);
    const acc = ESPACE.slice(ESPACE.indexOf('const getMyAccess'));
    const sorties = (acc.match(/rep_pending_docs/g) || []).length;
    assert.ok(sorties >= 5, 'rep_pending_docs figure dans chaque réponse (calcul + 4 sorties au moins)');
});

/* ─── Écran : la barre ────────────────────────────────────────────────────────────────────────── */

test('StudentLayout porte la pastille sur « Entreprise » et son infobulle', () => {
    const l = lire(UI, 'layouts/StudentLayout.jsx');
    assert.match(l, /setRepPending\(Number\(r\?\.data\?\.rep_pending_docs\) \|\| 0\)/, 'lue depuis getMyAccess');
    assert.match(l, /to: "\/entreprise-documents", ic: "building", label: "Entreprise", badge: repPending/,
        'la pastille est portée par l\'entrée « Entreprise »');
    assert.match(l, /titre: \(n\) => `\$\{n\} document\$\{n > 1 \? "s" : ""\} à signer`/, 'l\'infobulle dit « à signer », pas « commentaires »');
    assert.match(l, /title=\{e\.badge > 0 && e\.titre \? e\.titre\(e\.badge\) : undefined\}/, 'chaque entrée a SON libellé d\'infobulle');
    // Le point du menu replié (téléphone) s'allume aussi pour les documents d'entreprise.
    assert.match(l, /\(pending > 0 \|\| repPending > 0 \|\| news > 0\)/);
});

test('signer un document de l\'entreprise fait retomber la pastille (pingAcces)', () => {
    const r = lire(UI, 'pages/RepresentantEspace.jsx');
    assert.match(r, /import \{ pingAcces \} from "\.\.\/lib\/gamification\.js"/);
    // Après chaque signature (cachet ou dessin) ET après une confirmation de remise, on prévient la barre.
    const nbPing = (r.match(/load\(\); pingAcces\(\)/g) || []).length;
    assert.ok(nbPing >= 3, 'les gestes du représentant (2 signatures + 1 confirmation) émettent pingAcces');
});
