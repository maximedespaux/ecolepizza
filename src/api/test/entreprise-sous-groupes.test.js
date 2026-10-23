/**
 * SOUS-GROUPES D'UNE ENTREPRISE DANS UNE SESSION (migration 215, demandé le 2026-10-23).
 *
 * LE BESOIN. Un même employeur envoie parfois des stagiaires qui ne doivent PAS figurer sur les
 * mêmes documents de groupe (deux dossiers de prise en charge distincts). Le « groupe » d'une
 * entreprise + session était IMPLICITE (toutes ses inscriptions, un seul jeu de documents) ; on le
 * rend EXPLICITE par un numéro (`enrollment.company_group`), repris sur le document
 * (`generated_document.company_group`) pour dédoublonner un groupe sans toucher au voisin.
 *
 * DÉFAUT = 1 : tant qu'un seul groupe existe, le comportement est STRICTEMENT celui d'avant. La
 * séparation ne s'active qu'à partir d'un 2ᵉ groupe, choisi à l'inscription « Via une entreprise ».
 *
 * Tests de câblage (source serveur + migration, non exécutables ici), comme leurs miroirs.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireMig = (f) => fs.readFileSync(path.join(API, '..', '..', 'database', 'migrations', f), 'utf8');

test('la 215 ajoute deux colonnes de GROUPE (défaut 1), et son revert dit ce qu\'il détruit', () => {
    const aller = lireMig('215_enrollment_company_group.sql');
    assert.match(aller, /ADD COLUMN IF NOT EXISTS company_group smallint NOT NULL DEFAULT 1/);
    assert.strictEqual((aller.match(/ADD COLUMN IF NOT EXISTS company_group/g) || []).length, 2, 'enrollment ET generated_document');
    assert.match(aller, /ALTER TABLE enrollment/);
    assert.match(aller, /ALTER TABLE generated_document/);
    assert.ok(!/^\s*--/m.test(aller), 'commentaires en blocs');
    assert.ok(!/\\/.test(aller), 'aucune barre oblique inverse');
    const revert = lireMig('215_revert_enrollment_company_group.sql');
    assert.match(revert, /DROP COLUMN IF EXISTS company_group/);
    assert.match(revert, /CE QUI SE PERD/);
});

test('inscription « Via une entreprise » : « nouveau » = MAX + 1, et le groupe est ÉCRIT sur le dossier', () => {
    const c = lire('controllers/company.controller.js');
    // Le groupe demandé : « nouveau » → max du groupe pour cette entreprise + session, + 1.
    assert.match(c, /String\(demandeGroupe\)\.toLowerCase\(\) === 'nouveau'/);
    assert.match(c, /SELECT COALESCE\(MAX\(company_group\), 0\) AS mx FROM enrollment WHERE company_id = \? AND session_id = \? AND organization_id = \?/);
    assert.match(c, /companyGroup = \(Number\(mx\.mx\) \|\| 0\) \+ 1;/);
    // On ne DÉPLACE un dossier existant que si le groupe a été EXPLICITEMENT choisi.
    assert.match(c, /const groupeExplicite = aGroupe && !!sessionId && demandeGroupe != null;/);
    assert.match(c, /\$\{groupeExplicite \? ', company_group = \?' : ''\} WHERE id = \?/);
    // Sans la 215, demander un groupe ≠ 1 répond 503 (au lieu d'être ignoré).
    assert.match(c, /Migration 215 non jouée/);
    // Tolérant : la colonne ajoutée à l'INSERT seulement si elle existe.
    assert.match(c, /\$\{aGroupe \? ', company_group' : ''\}/);
});

test('génération : un jeu de documents PAR (sous-groupe, OPCO), le doc PORTE son groupe', () => {
    const c = lire('controllers/company.controller.js');
    // Regroupement par groupe PUIS par OPCO (règle partagée groupesParOpco), clé « groupe|opco ».
    assert.match(c, /for \(const \[g, membres\] of parGroupe\)/);
    assert.match(c, /groupesParOpco\(membres, company\.opco\)\) groupes\.set\(`\$\{g\}\|\$\{cle\}`, \{ \.\.\.grp, company_group: g \}\)/);
    // Le document porte son groupe (colonne ajoutée à l'INSERT si elle existe).
    assert.match(c, /cols\.push\('company_group'\); vals\.push\('\?'\); params\.push\(g\.company_group\);/);
    // Générer un groupe précis : filtre les inscriptions, et le nettoyage est SCOPÉ au groupe.
    assert.match(c, /const enr = groupeDemande != null \? enrToutes\.filter\(\(e\) => grpDe\(e\) === groupeDemande\) : enrToutes;/);
    assert.match(c, /const scopeGroupe = \(aGroupeDoc && groupeDemande != null\) \? ' AND company_group = \?' : '';/);
    // « déjà signé » se compte par (GROUPE, OPCO), pas par OPCO seul.
    assert.match(c, /signedKeys\.has\(`\$\{g\.company_group\}\|\$\{cleOpco\(g\.opco\)\}`\)/);
});

test('lecture : resolveGroupSteps filtre par groupe et expose la LISTE des groupes', () => {
    const c = lire('controllers/company.controller.js');
    assert.match(c, /async function resolveGroupSteps\(conn, orgId, companyId, sessionId, companyGroup = null\)/);
    // Toutes les inscriptions pour connaître les groupes, puis filtre au groupe demandé.
    assert.match(c, /const groups = \[\.\.\.new Set\(enrAll\.map\(grpDe\)\)\]\.sort\(\(a, b\) => a - b\);/);
    assert.match(c, /const enr = companyGroup != null \? enrAll\.filter\(\(e\) => grpDe\(e\) === \(Number\(companyGroup\) \|\| 1\)\) : enrAll;/);
    // getCompanyParcours passe le groupe (query) et rend `groups` + `company_group`.
    assert.match(c, /resolveGroupSteps\(conn, orgId, company\.id, sessionId, req\.query\.company_group \?\? null\)/);
    assert.match(c, /groups: grp\.groups,/);
});

test('le numéro de groupe n\'est PAS un « Champ document » (écarté dans conditions.js)', () => {
    assert.match(lire('lib/conditions.js'), /'company_group',/);
});
