/**
 * LE TYPE DE DEVIS EST UNE PROPRIÉTÉ DU DOSSIER, plus de la fiche (2026-10-01).
 *
 * Besoin : un même stagiaire peut suivre RS7404 en PARTICULIER et NIV2 en PROFESSIONNEL. Le « type
 * de devis » vivait sur la fiche (learner.financing) et se propageait à TOUS les dossiers à chaque
 * enregistrement — impossible de les distinguer. Désormais :
 *   · il se DÉCIDE À L'INSCRIPTION : « Un stagiaire » = particulier, par une entreprise = professionnel ;
 *   · il se CHANGE dossier par dossier, par un menu dans l'entête du parcours ;
 *   · la fiche ne le propage plus ; learner.financing n'est qu'un RÉSUMÉ dérivé des dossiers.
 *
 * (Le contrat SERVEUR — pas de cascade, défaut selon la méthode, recalcul du résumé — est gelé dans
 * backoffice-invariants.test.js. Ici, l'écran.)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');

test('le menu « type de devis » est dans l’entête du parcours et s’enregistre par dossier', () => {
    const parc = lire('components/EnrollmentParcours.jsx');
    assert.match(parc, /onChangeFinancing/, 'un menu éditable, passé en prop');
    assert.match(parc, /<select className="parc-devis"/, 'un menu, pas du texte');
    assert.match(parc, /value="PARTICULIER"/);
    assert.match(parc, /value="PROFESSIONNEL"/);
    /* Le financement est SORTI de la ligne de texte (headLine) — sinon il s'afficherait deux fois. */
    assert.doesNotMatch(parc, /\[h\.code, h\.session, h\.financing/);

    const det = lire('pages/StagiaireDetail.jsx');
    assert.match(det, /onChangeFinancing=\{peutEncaisser \? changerDevis : undefined\}/, 'éditable pour qui peut écrire');
    assert.match(det, /await updateEnrollment\(curEnrId, payload\)/, 'enregistré par dossier (PATCH)');
    assert.match(det, /setParcoursRefresh/, 'le parcours se recharge : le type change les documents applicables');
});

test('Professionnel ⇒ l’entreprise du dossier : menu, pré-rempli de l’employeur, détaché en Particulier', () => {
    /* C'est enrollment.company_id (le rattachement) qui range le stagiaire sous son entreprise sur
       la session — financing seul ne suffit pas. Passer en Professionnel pré-remplit l'employeur de
       la fiche et ouvre un menu d'entreprises ; repasser en Particulier détache (avec confirmation). */
    const parc = lire('components/EnrollmentParcours.jsx');
    assert.match(parc, /onChangeCompany/, 'un menu entreprise, passé en prop');
    assert.match(parc, /financingValue === "PROFESSIONNEL"/, 'proposé seulement en professionnel');
    assert.match(parc, /aria-label="Entreprise du dossier"/);

    const det = lire('pages/StagiaireDetail.jsx');
    assert.match(det, /financing: "PROFESSIONNEL", company_id: curEnr\?\.company_id \|\| l\.company_id \|\| null/, 'pro ⇒ pré-remplit l’employeur');
    assert.match(det, /financing: "PARTICULIER", company_id: null/, 'particulier ⇒ détache l’entreprise');
    assert.match(det, /window\.confirm\(`Ce dossier est rattaché à/, 'un dossier rattaché se détache sur confirmation');
    assert.match(det, /async function changerEntreprise/, 'changer l’entreprise du dossier');

    /* Le dossier doit porter company_id / company_name pour que le menu pré-remplisse et nomme le détachement. */
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
    assert.match(ctrl, /e\.company_id, c\.name AS company_name/);
    assert.match(ctrl, /LEFT JOIN company c ON c\.id = e\.company_id/);
});

test('le « type de devis » a quitté la fiche ; l’entreprise (employeur) y reste, toujours visible', () => {
    const modale = lire('components/EditStagiaireModal.jsx');
    assert.doesNotMatch(modale, /label="Type de devis"/, 'plus de champ « type de devis » sur la fiche');
    assert.doesNotMatch(modale, /\bisPro\b/, 'plus de bascule pro/particulier dans le formulaire');
    assert.doesNotMatch(modale, /set\("financing"\)/, 'le financement ne se saisit plus ici');
    assert.match(modale, />Entreprise \(employeur\)<\/h3>/, 'la section entreprise reste');
    assert.doesNotMatch(modale, /\{isPro && \(/, 'la section entreprise n’est plus conditionnée au type de devis');

    const det = lire('pages/StagiaireDetail.jsx');
    assert.doesNotMatch(det, /label="Type de devis"/, 'plus de ligne « Type de devis » sur la fiche');

    const client = lire('api/apiClient.js');
    assert.match(client, /export function updateEnrollment/, 'le PATCH d’un dossier existe côté client');
});
