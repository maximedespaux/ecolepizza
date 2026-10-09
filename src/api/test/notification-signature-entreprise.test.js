/**
 * LE BUREAU EST PRÉVENU QUAND L'ENTREPRISE SIGNE (2026-10-09).
 *
 * LE DÉFAUT : une signature par le REPRÉSENTANT (signRepDocument, depuis l'espace entreprise)
 * posait la preuve sur le document MAIS ne notifiait personne — ni cloche, ni diffusion. Les deux
 * autres chemins de signature posent, eux, la notification d'organisme : DANS l'app (signDocument)
 * et par LIEN PUBLIC (public.controller, depuis le 2026-10-06). L'entreprise était le trou.
 *
 * LA CORRECTION : signRepDocument pose aussi `notify(orgId, { SIGNATURE, « Document signé » })`,
 * ORG-WIDE (pas d'userId → visible du bureau dans la cloche, sans e-mail), et on l'ATTEND avant de
 * répondre — la réponse réussie déclenche la diffusion SSE `refresh`, qui ne verrait pas une
 * insertion non encore validée (cf. notify, notification.controller.js).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', 'controllers', f), 'utf8');
const REP = lire('rep.controller.js');
const DOC = lire('document.controller.js');
const PUB = lire('public.controller.js');

test('la signature du représentant (entreprise) pose la notification d\'organisme, attendue', () => {
    assert.match(REP, /const \{ notify \} = require\('\.\/notification\.controller\.js'\)/, 'notify est importé');
    assert.match(REP, /await notify\(doc\.organization_id, \{/, 'posée ET attendue (avant la diffusion refresh)');
    assert.match(REP, /type: 'SIGNATURE', title: 'Document signé'/);
    assert.match(REP, /body: `Signé par \$\{signerName\} \(entreprise\)`/, 'le corps dit que c\'est l\'entreprise');
    // Org-wide : AUCUN userId dans l'appel (sinon ce serait une notif ciblée + e-mail).
    const bloc = REP.slice(REP.indexOf('await notify(doc.organization_id'), REP.indexOf('await notify(doc.organization_id') + 300);
    assert.doesNotMatch(bloc, /userId/, 'notification d\'organisme, pas ciblée');
});

test('les TROIS chemins de signature notifient le bureau (app, lien public, entreprise)', () => {
    // Chaque motif est unique à son fichier ; dans document.controller, le seul `notify` est celui
    // de signDocument.
    assert.match(DOC, /notify\(req\.user\.organization_id, \{\s*type: 'SIGNATURE', title: 'Document signé'/, 'dans l\'app');
    assert.match(PUB, /await notify\(doc\.organization_id, \{\s*type: 'SIGNATURE', title: 'Document signé'/, 'par lien public');
    assert.match(REP, /await notify\(doc\.organization_id, \{\s*type: 'SIGNATURE', title: 'Document signé'/, 'par le représentant (entreprise)');
});
