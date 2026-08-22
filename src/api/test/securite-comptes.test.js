/**
 * RÉGRESSION DE SÉCURITÉ — les six correctifs de l'audit du 2026-08-22 (cf. SECURITY_AUDIT.md).
 *
 * Tests de CONTRAT lus sur le source (comme le reste de la suite) : chaque garde retirée fait
 * virer un test au rouge. Ce ne sont pas des vues de l'esprit — chacun gèle une faille prouvée :
 *   #1 un SECRETARIAT prenait le compte SUPER_ADMIN via reset de mot de passe (aucune garde de rôle)
 *   #2 XSS stocké via une « signature » data-URL rendue dans la session admin
 *   #3 suppression d'un login de n'importe quel rôle (dont le dernier propriétaire)
 *   #4 les flux de RÉCUPÉRATION ne coupaient pas les sessions (le pirate survivait 7 jours)
 *   #5 IDOR : métadonnées des pièces d'identité lisibles hors propriété
 *   #6 lien « annuler » rejouable 24 h (réécrivait l'ancien mot de passe)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const C = (f) => fs.readFileSync(path.join(__dirname, '..', 'controllers', f), 'utf8');
const L = (f) => fs.readFileSync(path.join(__dirname, '..', 'lib', f), 'utf8');
const learner = C('learner.controller.js');
const auth = C('auth.controller.js');
const user = C('user.controller.js');
const piece = C('piece.controller.js');
const tokens = L('tokens.js');

test("#1 — resetStagiairePassword refuse de toucher un compte NON-stagiaire", () => {
    // Les deux branches (compte lié / e-mail correspondant) doivent vérifier le rôle avant de réinitialiser.
    assert.ok(learner.includes("role !== 'STAGIAIRE'"),
        "Sans cette garde, une fiche à l'e-mail d'un admin + reset = prise de contrôle (escalade SECRETARIAT→SUPER_ADMIN).");
    assert.ok(learner.includes('SELECT id, role FROM user WHERE email = ?'),
        "La branche e-mail doit lire le rôle du compte correspondant.");
});

test("#3 — deleteStagiaireAccount ne supprime QUE des comptes stagiaire", () => {
    assert.ok(learner.includes("DELETE FROM user WHERE id = ? AND organization_id = ? AND role = 'STAGIAIRE'"),
        "Sans `role = 'STAGIAIRE'`, on peut supprimer un login admin (voire le dernier propriétaire).");
});

test("#4 — les trois flux de RÉCUPÉRATION coupent les sessions", () => {
    assert.ok(auth.includes('await couperSessions(user.id);'), "resetPassword doit couper les sessions.");
    assert.ok(user.includes('if (pwChanged) await couperSessions'), "user.update doit couper les sessions après reset.");
    assert.ok(learner.includes('await couperSessions('), "resetStagiairePassword doit couper les sessions.");
});

test("#2 — la signature est validée à l'écriture ET échappée au rendu", () => {
    for (const f of ['document.controller.js', 'rep.controller.js', 'public.controller.js']) {
        assert.ok(C(f).includes('estSignatureValide'), `${f} doit valider la signature (anti-XSS stocké).`);
    }
    assert.ok(tokens.includes(`.replace(/"/g, '&quot;')`),
        "signatureBox doit échapper le `\"` (contexte attribut) — sinon un data-URL casse la balise <img>.");
    // Le motif de validation est ANCRÉ (^…$) : aucun caractère hors base64 ne peut suivre.
    assert.ok(L('signatures.js').includes('$/'), "Le motif de signature doit être ancré en fin (^…$).");
});

test("#5 — listDossier vérifie la propriété du dossier", () => {
    const ld = piece.slice(piece.indexOf('const listDossier'), piece.indexOf('async function dossierDe'));
    assert.ok(ld.includes('dossierDe(') && ld.includes('!== req.user.id'),
        "listDossier doit refuser le dossier d'un autre stagiaire (métadonnées de pièces d'identité).");
});

test("#6 — le jeton d'annulation est à usage unique (lié à la valeur courante)", () => {
    assert.ok(auth.includes('JWT_SECRET + String(current'),
        "jetonAnnulation doit être signé avec la valeur ACTUELLE, sinon le lien reste rejouable 24 h.");
    assert.ok(auth.includes('jetonAnnulation(userId, kind, prev, current)'),
        "alerteChangement doit passer la valeur courante au jeton.");
});
