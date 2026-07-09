// Scellement PAdES d'un PDF (signature électronique « avancée » / cachet d'organisme).
// Cachet cryptographique auto-signé : rend le PDF INFALSIFIABLE (toute modification
// après scellement casse la signature) et vérifiable par les outils eIDAS
// (l'intégrité est validée ; le certificat est signalé « non qualifié » car
// auto-signé — passer par un prestataire qualifié pour un certificat de confiance).
const forge = require('node-forge');
const { PDFDocument } = require('pdf-lib');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
const signpdf = require('@signpdf/signpdf').default;
const { P12Signer } = require('@signpdf/signer-p12');

// Le conteneur P12 est chiffré au repos (cf. crypto.encrypt) ; cette passphrase
// protège la clé privée à l'intérieur du conteneur.
const P12_PASS = 'impasto-seal';

/** Génère un certificat d'organisme auto-signé et le renvoie au format PKCS#12 (Buffer). */
function generateOrgP12(orgName = 'Organisme de formation') {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(Date.now());
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 6 * 365 * 24 * 3600 * 1000); // ~6 ans
    const attrs = [
        { name: 'commonName', value: String(orgName).slice(0, 60) },
        { name: 'organizationName', value: String(orgName).slice(0, 60) },
        { name: 'countryName', value: 'FR' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], P12_PASS, { algorithm: '3des' });
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

/**
 * Appose un cachet PAdES sur un PDF existant. Renvoie le PDF scellé (Buffer).
 * En cas d'erreur (PDF non chargeable, etc.), relance : l'appelant décide du repli.
 */
async function sealPdf(pdfBuffer, p12, { orgName = 'Organisme', reason = 'Scellement', contact = '', location = '' } = {}) {
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false });
    pdflibAddPlaceholder({
        pdfDoc: doc,
        reason: String(reason).slice(0, 120),
        contactInfo: String(contact || '').slice(0, 120),
        name: String(orgName).slice(0, 120),
        location: String(location || '').slice(0, 120),
        signatureLength: 8192,
    });
    const withPlaceholder = Buffer.from(await doc.save({ useObjectStreams: false }));
    return signpdf.sign(withPlaceholder, new P12Signer(p12, { passphrase: P12_PASS }));
}

module.exports = { generateOrgP12, sealPdf, P12_PASS };
