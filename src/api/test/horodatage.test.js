/**
 * HORODATAGE RFC 3161 DES SIGNATURES — PAdES-T (demandé le 2026-10-04, niveau B).
 *
 * L'« heure déclarée de dépôt » d'une signature était l'horloge du SERVEUR, invérifiable. Un jeton
 * d'horodatage RFC 3161 la fait contresigner par une autorité indépendante (TSA) → la date devient
 * PROUVABLE (PAdES-T). On n'envoie à la TSA que l'EMPREINTE de la signature, jamais le document.
 *
 * CES TESTS (SANS RÉSEAU) GÈLENT la mécanique ASN.1, qui doit être exacte :
 *   · la requête d'horodatage (TimeStampReq) porte l'empreinte, SHA-256, et demande le certificat ;
 *   · le jeton se lit dans la réponse À L'OCTET PRÈS (sa signature interne n'en tolère pas un de plus) ;
 *   · le jeton s'AJOUTE au CMS en attribut NON signé, SANS toucher la signature du document ;
 *   · sans TSA configurée (ou en cas d'échec), on retombe sur la signature NON horodatée — jamais
 *     d'exception : un horodatage raté ne doit pas empêcher quelqu'un de signer.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { P12Signer } = require('@signpdf/signer-p12');
const { generateSelfSignedP12, P12_PASS } = require('../lib/pdfseal.js');
const {
    construireTSQ, extraireJetonDer, signatureDuCms, ajouterHorodatage, horodaterCms, cfgTSA,
} = require('../lib/horodatage.js');

const asn1 = forge.asn1;
const toBuf = (o) => Buffer.from(asn1.toDer(o).getBytes(), 'binary');
const parse = (b) => asn1.fromDer(forge.util.createBuffer(b.toString('binary')));
// OID 1.2.840.113549.1.9.16.2.14 (id-aa-timeStampToken) en DER.
const OID_TST_DER = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x02, 0x0e]);

// Un vrai CMS auto-signé sert de cobaye — et, structurellement, de faux « jeton » (c'est un ContentInfo).
let cms;
test('préparation : un CMS signé', async () => {
    const p12 = generateSelfSignedP12('Essai Horodatage');
    cms = await new P12Signer(p12, { passphrase: P12_PASS }).sign(Buffer.from('contenu à signer'));
    assert.ok(cms.length > 500, 'un CMS plausible');
});

test('la requête d\'horodatage porte l\'empreinte, en SHA-256, avec demande de certificat', () => {
    const hash = Buffer.alloc(32, 7); // 32 octets => SHA-256
    const tsq = construireTSQ(hash);
    const a = parse(tsq);
    // SEQUENCE { version=1, messageImprint, nonce, certReq=TRUE }
    assert.strictEqual(a.value[0].value.charCodeAt(0), 1, 'version 1');
    assert.ok(tsq.includes(hash), 'l\'empreinte est présente telle quelle');
    const certReq = a.value[a.value.length - 1];
    assert.strictEqual(certReq.type, asn1.Type.BOOLEAN);
    assert.strictEqual(certReq.value.charCodeAt(0), 0xFF, 'certReq = TRUE (on veut le certificat de la TSA)');
});

test('le jeton se lit dans la réponse TSA À L\'OCTET PRÈS', () => {
    const jetonAsn1 = parse(cms);                    // un ContentInfo fait un jeton structurellement valide
    const jetonDer = toBuf(jetonAsn1);
    // TimeStampResp ::= SEQUENCE { PKIStatusInfo { INTEGER 0 }, timeStampToken }
    const resp = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
            asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(0).getBytes()),
        ]),
        jetonAsn1,
    ]);
    const extrait = extraireJetonDer(toBuf(resp));
    assert.ok(extrait.equals(jetonDer), 'octets du jeton identiques à ceux insérés');
});

test('un statut « rejeté » (>1) est refusé', () => {
    const resp = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
            asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(2).getBytes()),
        ]),
    ]);
    assert.throws(() => extraireJetonDer(toBuf(resp)), /statut 2/);
});

test('le jeton s\'ajoute au CMS SANS toucher la signature du document', () => {
    const sigAvant = signatureDuCms(cms);
    const jetonDer = toBuf(parse(cms)); // faux jeton = un CMS valide
    const cmsT = ajouterHorodatage(cms, jetonDer);
    // Le CMS reste du DER valide, et porte désormais l'OID de l'horodatage…
    assert.doesNotThrow(() => parse(cmsT));
    assert.ok(cmsT.includes(OID_TST_DER), 'id-aa-timeStampToken présent');
    assert.ok(!cms.includes(OID_TST_DER), '…absent de l\'original');
    // …sans avoir modifié la VALEUR de signature du document (sinon elle serait invalidée).
    assert.ok(signatureDuCms(cmsT).equals(sigAvant), 'la signature du document est inchangée');
});

test('sans TSA configurée, horodaterCms rend le CMS INCHANGÉ (pas d\'horodatage, pas d\'erreur)', async () => {
    const out = await horodaterCms(cms, { url: '', timeoutMs: 500 });
    assert.ok(out.equals(cms));
});

test('TSA injoignable : repli sur le CMS non horodaté, sans exception', async () => {
    // Port 1 en local : connexion refusée immédiatement (aucun appel réseau sortant).
    const out = await horodaterCms(cms, { url: 'http://127.0.0.1:1/tsr', timeoutMs: 500 });
    assert.ok(out.equals(cms), 'on garde la signature PAdES-B');
});

test('cfgTSA : TSA_URL="" coupe l\'horodatage, une URL l\'active', () => {
    const avant = process.env.TSA_URL;
    process.env.TSA_URL = '';
    assert.strictEqual(cfgTSA().url, '', 'vide = désactivé');
    process.env.TSA_URL = 'http://tsa.example/tsr';
    assert.strictEqual(cfgTSA().url, 'http://tsa.example/tsr');
    if (avant === undefined) delete process.env.TSA_URL; else process.env.TSA_URL = avant;
});

/* LE CÂBLAGE, lu au source : l'horodatage n'est demandé QUE sur les vraies signatures (stagiaire,
   représentant, contreseing de l'organisme), jamais sur le cachet « à la volée » d'un téléchargement. */
test('signPdf accepte timestamp, et seules les signatures l\'activent', () => {
    const seal = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pdfseal.js'), 'utf8');
    assert.match(seal, /timestamp = false/, 'option timestamp sur signPdf');
    assert.match(seal, /new SignerP12Horodate\(p12, \{ passphrase: P12_PASS, tsa, maxLen: signatureLength \}\)/);
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
    // Les quatre vraies signatures horodatent ; sealPdf (téléchargement) ne reçoit jamais timestamp.
    assert.strictEqual((ctrl.match(/timestamp: true/g) || []).length, 4, 'les 4 signatures horodatent');
    assert.doesNotMatch(seal, /sealPdf[\s\S]*timestamp: true/, 'le cachet à la volée n\'horodate pas');
});
