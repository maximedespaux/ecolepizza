/**
 * DURCISSEMENT — audit sécurité complet du 2026-10-07 (classes au-delà du contrôle d'accès).
 *
 *   L1 — signature de l'intervenant validée À L'ÉCRITURE, comme toutes les autres signatures
 *        (lib/signatures.js) : un `/^data:image\//` laissait passer un breakout d'attribut ou un
 *        SVG actif. Inerte aujourd'hui (le rendu échappe), mais on ne fait pas reposer la sûreté
 *        sur le seul échappement.
 *   L3 — un document DÉJÀ SIGNÉ ne se re-signe pas (409), à parité du lien public et de
 *        signerMonDocument : sans ce garde, un renvoi réécrivait signataire/horodatage/empreinte.
 *   L4 — la désinscription newsletter (publique, lien PERMANENT) est plafonnée : son POST écrit en
 *        base à chaque appel, son porteur pouvait gonfler la table en boucle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(API, f), 'utf8');

// ── L1 ─────────────────────────────────────────────────────────────────────────────────────────
test('L1 : les TROIS chemins de signature intervenant valident à l\'écriture, plus de préfixe faible', () => {
    const src = lire('controllers/intervenant.controller.js');
    assert.match(src, /const \{ estSignatureValide \} = require\('\.\.\/lib\/signatures\.js'\)/);
    // setMyIntervenantSignature, signMyIntervenantSheet, signerMonDocument : chacun valide.
    const set = src.slice(src.indexOf('const setMyIntervenantSignature'), src.indexOf('const signMyIntervenantSheet'));
    assert.match(set, /estSignatureValide\(data\)/);
    const sheet = src.slice(src.indexOf('const signMyIntervenantSheet'), src.indexOf('const signerMonDocument'));
    assert.match(sheet, /estSignatureValide\(signature_data\)/);
    const doc = src.slice(src.indexOf('const signerMonDocument'));
    assert.match(doc, /estSignatureValide\(fourni\)/);
    // Le préfixe bypassable a disparu de TOUT le fichier.
    assert.doesNotMatch(src, /\/\^data:image\\\/\/\.test/, 'plus aucun /^data:image\\//.test() faible');
});

// La forme ancrée refuse bien les charges que le préfixe laissait passer.
test('L1 : estSignatureValide refuse un breakout d\'attribut et un SVG, accepte un PNG', () => {
    const { estSignatureValide } = require('../lib/signatures.js');
    assert.ok(estSignatureValide('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='), 'un vrai PNG passe');
    assert.ok(!estSignatureValide('data:image/png;base64,AA"><img src=x onerror=alert(1)>'), 'breakout refusé');
    assert.ok(!estSignatureValide('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), 'SVG refusé');
    assert.ok(!estSignatureValide('data:image/png,plain'), 'sans base64 refusé');
});

// ── L3 ─────────────────────────────────────────────────────────────────────────────────────────
test('L3 : signDocument lit le statut et refuse (409) un document déjà SIGNE', () => {
    const src = lire('controllers/document.controller.js');
    const i = src.indexOf('const signDocument = async');
    const bloc = src.slice(i, i + 2500);
    assert.match(bloc, /SELECT d\.id, d\.type, d\.status/, 'le statut est lu');
    assert.match(bloc, /rows\[0\]\.status === 'SIGNE'\) return res\.status\(409\)/, 'refus 409 si déjà signé');
});

// ── L4 ─────────────────────────────────────────────────────────────────────────────────────────
test('L4 : la désinscription newsletter porte un limiteur (par jeton + IP), pas la signature', () => {
    const src = lire('routes/public.routes.js');
    assert.match(src, /require\('\.\.\/middlewares\/rateLimit\.js'\)/);
    assert.match(src, /key: 'nl-unsub', countAll: true/);
    assert.match(src, /identifiant: \(req\) => String\(req\.params\.token \|\| ''\)\.slice\(0, 24\)/);
    assert.match(src, /router\.get\('\/newsletter\/:token', newsletterLimiter, getNewsletterUnsub\)/);
    assert.match(src, /router\.post\('\/newsletter\/:token', newsletterLimiter, postNewsletterUnsub\)/);
    // La signature reste SANS limiteur (jeton 256 bits + used_at), pour ne pas gêner un gros signataire.
    assert.match(src, /router\.post\('\/sign\/:token', submitSign\)/);
});

test('L4 : le limiteur countAll bloque réellement au-delà du plafond', () => {
    const { rateLimit } = require('../middlewares/rateLimit.js');
    const mw = rateLimit({ windowMs: 60000, max: 3, maxIp: 100, key: 't', countAll: true, identifiant: (r) => r.params.token });
    const req = { ip: '9.9.9.9', params: { token: 'jeton-xyz' }, body: {} };
    const tir = () => {
        let code = 0;
        const res = { set() {}, status(c) { code = c; return this; }, json() { return this; }, on() {} };
        mw(req, res, () => { code = 200; });
        return code;
    };
    assert.strictEqual(tir(), 200, '1er passe');
    assert.strictEqual(tir(), 200, '2e passe');
    assert.strictEqual(tir(), 200, '3e passe (plafond = 3)');
    assert.strictEqual(tir(), 429, '4e bloqué');
});

// ── L2 — QCM noté à TENTATIVE UNIQUE ──────────────────────────────────────────────────────────
test('L2 : submitQuiz refuse (409) une RE-soumission d\'un QCM NOTÉ', () => {
    const src = fs.readFileSync(path.join(API, 'controllers/quiz.controller.js'), 'utf8');
    const i = src.indexOf('const submitQuiz = async');
    const bloc = src.slice(i, i + 1800);
    // Garde posée pour les QCM notés seulement, AVANT l'écriture.
    assert.match(bloc, /if \(graded\) \{[\s\S]*?SELECT 1 AS x FROM quiz_response WHERE document_id = \? LIMIT 1/);
    assert.match(bloc, /if \(dejaPasse\) return res\.status\(409\)/);
    // La garde vient AVANT l'INSERT de la réponse (sinon elle ne servirait à rien).
    assert.ok(src.indexOf("SELECT 1 AS x FROM quiz_response") < src.indexOf('INSERT INTO quiz_response'),
        'le refus précède l\'écriture');
});
