/**
 * LE LIEN DE SIGNATURE DU PROCÈS-VERBAL (migration 216 / tranche 2).
 *
 * Un membre de la commission ou un candidat signe le PV à distance, par un jeton signé (JWT). Ces
 * tests gèlent : l'aller-retour (on retrouve exactement ce qu'on a gravé), le DÉTERMINISME (même
 * signataire → même lien, pour que l'école le copie une fois), l'ISOLATION du « but » (un jeton de
 * désinscription newsletter ou de session ne peut pas servir à signer un PV), et le refus d'un
 * jeton incomplet. Pur, sans base.
 */
const test = require('node:test');
const assert = require('node:assert');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-pour-les-liens-pv';
const jwt = require('jsonwebtoken');
const { signerLienPv, verifierLienPv, urlSignaturePv } = require('../lib/signaturePv.js');

test('un lien se vérifie et rend EXACTEMENT ce qu\'il porte', () => {
    const t = signerLienPv({ examSessionId: 'ex-1', signerKind: 'MEMBRE', signerRef: 'u-1', orgId: 'o-1' });
    assert.deepStrictEqual(verifierLienPv(t), { examSessionId: 'ex-1', signerKind: 'MEMBRE', signerRef: 'u-1', orgId: 'o-1' });
});

test('déterministe : le même signataire a toujours le même lien', () => {
    const a = signerLienPv({ examSessionId: 'ex-1', signerKind: 'CANDIDAT', signerRef: 'l-9', orgId: 'o-1' });
    const b = signerLienPv({ examSessionId: 'ex-1', signerKind: 'CANDIDAT', signerRef: 'l-9', orgId: 'o-1' });
    assert.strictEqual(a, b, 'pas d\'iat : le lien ne change pas d\'un affichage à l\'autre');
});

test('deux signataires n\'ont pas le même lien', () => {
    const a = signerLienPv({ examSessionId: 'ex-1', signerKind: 'MEMBRE', signerRef: 'u-1', orgId: 'o-1' });
    const b = signerLienPv({ examSessionId: 'ex-1', signerKind: 'MEMBRE', signerRef: 'u-2', orgId: 'o-1' });
    assert.notStrictEqual(a, b);
});

test('un jeton d\'un AUTRE usage (ou trafiqué) est refusé', () => {
    // Même secret, mais « but » de désinscription : il ne doit pas ouvrir la signature d'un PV.
    const autreUsage = jwt.sign({ p: 'nl-unsub', e: 'ex-1', k: 'MEMBRE', r: 'u-1', o: 'o-1' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    assert.strictEqual(verifierLienPv(autreUsage), null, 'mauvais « but » (p)');
    assert.strictEqual(verifierLienPv('nimportequoi'), null);
    assert.strictEqual(verifierLienPv(''), null);
    // Nature inconnue dans un jeton par ailleurs bien formé : refusé.
    const mauvaiseNature = jwt.sign({ p: 'pv-sign', e: 'ex-1', k: 'AUTRE', r: 'u-1', o: 'o-1' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    assert.strictEqual(verifierLienPv(mauvaiseNature), null);
});

test('paramètres incomplets : refus à la génération', () => {
    assert.throws(() => signerLienPv({ examSessionId: 'ex-1', signerKind: 'AUTRE', signerRef: 'u', orgId: 'o' }));
    assert.throws(() => signerLienPv({ examSessionId: '', signerKind: 'MEMBRE', signerRef: 'u', orgId: 'o' }));
    assert.throws(() => signerLienPv({ examSessionId: 'e', signerKind: 'MEMBRE', signerRef: '', orgId: 'o' }));
});

test('l\'URL publique pointe la page /pv-signer/:token', () => {
    assert.match(urlSignaturePv('JETON'), /\/pv-signer\/JETON$/);
});
