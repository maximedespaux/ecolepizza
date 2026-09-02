/**
 * SIGNATURE PAR UN COMPTE À DEUX CASQUETTES (rôle bureau configurable ET stagiaire).
 *
 * DÉFAUT GELÉ : le contrôle d'accès par rubrique (enforceSectionMode) est un garde-fou du
 * MENU backoffice. Il rattachait `POST /documents/:id/sign` à la rubrique /stagiaires. Résultat :
 * un compte FORMATEUR/SECRÉTARIAT/AUDITEUR (rubrique /stagiaires en lecture seule) qui est AUSSI
 * stagiaire ne pouvait pas signer SON PROPRE document depuis son espace — refus « Accès en
 * lecture seule ». Or signer est un acte de PARTICIPANT, déjà autorisé sur la PROPRIÉTÉ du
 * document par signDocument (l.user_id = req.user.id). La signature est donc EXEMPTÉE du garde.
 *
 * On NE dé-cadenasse PAS le reste : créer/supprimer un document, et le lien de signature
 * partageable (/sign-link, acte bureau), restent rattachés à /stagiaires.
 */
const test = require('node:test');
const assert = require('node:assert');
const { sectionFor } = require('../middlewares/sectionAccess.middleware.js');

test('signer un document est EXEMPTÉ du contrôle de rubrique (acte de participant)', () => {
    assert.strictEqual(sectionFor('documents', '123/sign'), null, 'POST /documents/:id/sign ne relève pas du garde /stagiaires.');
    assert.strictEqual(sectionFor('documents', '123/sign/'), null, 'tolère une barre finale.');
});

test('le RESTE de /documents reste cadenassé sous /stagiaires (aucune brèche ouverte)', () => {
    assert.strictEqual(sectionFor('documents', '123/sign-link'), '/stagiaires',
        'créer un lien de signature partageable est un acte bureau — toujours gardé.');
    assert.strictEqual(sectionFor('documents', '123'), '/stagiaires', 'supprimer un document reste gardé.');
    assert.strictEqual(sectionFor('documents', ''), '/stagiaires', 'créer un document reste gardé.');
});

test('l\'exception préexistante comptabilite/revenus → /partenaires est préservée', () => {
    // Garde anti-régression : cette exception a son propre test (apports-partenaires), on
    // vérifie ici qu'elle cohabite avec la nouvelle sans être écrasée.
    assert.strictEqual(sectionFor('comptabilite', 'revenus/5'), '/partenaires');
    assert.strictEqual(sectionFor('comptabilite', 'depenses/5'), '/comptabilite');
});
