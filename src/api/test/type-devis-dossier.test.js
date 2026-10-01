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
    assert.match(det, /await updateEnrollment\(curEnrId, \{ financing: v \}\)/, 'enregistré par dossier (PATCH)');
    assert.match(det, /setParcoursRefresh/, 'le parcours se recharge : le type change les documents applicables');
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
