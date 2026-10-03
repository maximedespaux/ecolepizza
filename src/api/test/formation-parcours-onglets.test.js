/**
 * FORMATIONS → PARCOURS DOCUMENTAIRE : LES DEUX ONGLETS (2026-10-03).
 *
 * Quatre corrections d'un même écran (`Formations.jsx`) :
 *   1. le compteur « (actives/total) » passe de l'onglet EXTÉRIEUR « Parcours documentaire » au
 *      segment « Dossier particulier » — à côté du compteur de « Dossier professionnel » ;
 *   2. les deux segments sont renommés « Dossier particulier » / « Dossier professionnel » ;
 *   3. dans « Dossier professionnel », une étape porte le MÊME badge de contenu qu'en particulier
 *      (`stepBadge` : J-7, à signer…), plus un repère « 🏢 Groupe » — au lieu d'un badge de type
 *      générique (« ❓ QCM ») qui rendait la même carte différente d'un onglet à l'autre ;
 *   4. LE DÉFAUT RÉEL : le compteur de « Dossier professionnel » comptait `company_steps.length`
 *      (les slugs stockés) alors que la section n'affiche que les slugs qui RÉSOLVENT encore vers
 *      une étape — un slug périmé gonflait le compteur d'un cran sans carte en face. Il compte
 *      désormais les slugs RÉSOLUS (`companyStepsResolus`), donc exactement les cartes.
 *
 * Écran React, non exécutable ici : on lit le câblage au source. Réintroduire `company_steps.length`
 * comme compteur, ou l'ancien badge de type, fait rougir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const F = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Formations.jsx'), 'utf8');

test('le compteur quitte l\'onglet « Parcours documentaire » (plus de (x/x) dessus)', () => {
    // L'onglet extérieur ne porte plus que le libellé.
    assert.match(F, /onClick=\{\(\) => setTab\("parcours"\)\}>\s*\n\s*Parcours documentaire\s*\n\s*<\/button>/);
});

test('les deux segments sont renommés, avec leur compteur', () => {
    assert.match(F, /setParcoursKind\("stagiaire"\)\}>Dossier particulier\{steps\.length \? ` \(\$\{nbActives\}\/\$\{steps\.length\}\)` : ""\}/);
    assert.match(F, /setParcoursKind\("entreprise"\)\}>Dossier professionnel\{companyStepsResolus\.length \? ` \(\$\{companyStepsResolus\.length\}\)` : ""\}/);
});

test('LE DÉFAUT : le compteur « professionnel » compte les slugs RÉSOLUS, pas les slugs stockés', () => {
    assert.match(F, /const companyStepsResolus = companySteps\.filter\(\(sl\) => steps\.some\(\(s\) => s\.slug === sl\)\);/);
    // Et nulle part le compteur n'est revenu à company_steps.length (le défaut).
    assert.doesNotMatch(F, /Dossier professionnel\{companySteps\.length/);
});

test('dans « Dossier professionnel », la carte porte le badge de contenu (stepBadge) + repère Groupe', () => {
    // Le bloc CompanySection emploie désormais stepBadge (le même qu'en particulier)…
    assert.match(F, /\{stepBadge\(s\) && <span className="pf-badge">\{stepBadge\(s\)\}<\/span>\}/);
    // … et le repère « 🏢 Groupe » n'est posé que sur un document de groupe.
    assert.match(F, /\{s\.company_level && \(\s*\n\s*<span className="pf-badge"[^>]*>🏢 Groupe<\/span>/);
});
