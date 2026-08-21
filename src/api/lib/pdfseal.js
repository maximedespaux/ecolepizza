// Scellement PAdES d'un PDF (signature électronique « avancée » / cachet d'organisme).
// Cachet cryptographique auto-signé : rend le PDF INFALSIFIABLE (toute modification
// après scellement casse la signature) et vérifiable par les outils eIDAS
// (l'intégrité est validée ; le certificat est signalé « non qualifié » car
// auto-signé — passer par un prestataire qualifié pour un certificat de confiance).
const forge = require('node-forge');
const { PDFDocument } = require('pdf-lib');
const { plainAddPlaceholder } = require('@signpdf/placeholder-plain');
const signpdf = require('@signpdf/signpdf').default;
const { P12Signer } = require('@signpdf/signer-p12');

/* Le conteneur P12 est chiffré au repos (cf. crypto.encrypt) ; cette passphrase
   protège la clé privée à l'intérieur du conteneur.

   ⚠ ELLE NE SE RENOMME PAS — elle a gardé « impasto » après le passage à Impastio. Les
   conteneurs DÉJÀ créés (certificats de l'organisme et des stagiaires, en base) sont scellés
   avec cette phrase-là : la changer rend leur clé privée inouvrable, donc toute signature
   ultérieure impossible avec un certificat existant. Même raison que le sel de `crypto.js`. */
const P12_PASS = 'impasto-seal';

/**
 * Génère un certificat AUTO-SIGNÉ (organisme OU stagiaire) au format PKCS#12 (Buffer).
 * `name` = nom commun affiché comme signataire (ex. « ECOLE PIZZAIOLO », « Jean Dupont »).
 * Auto-signé = non « qualifié » : garantit l'intégrité, pas l'identité auprès d'une
 * autorité de confiance (brancher un prestataire qualifié pour lever cet avertissement).
 */
function generateSelfSignedP12(name = 'Signataire') {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(Date.now());
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 6 * 365 * 24 * 3600 * 1000); // ~6 ans
    const attrs = [
        { name: 'commonName', value: String(name).slice(0, 60) },
        { name: 'organizationName', value: String(name).slice(0, 60) },
        { name: 'countryName', value: 'FR' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], P12_PASS, { algorithm: '3des' });
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}
// Rétro-compat : ancien nom.
const generateOrgP12 = generateSelfSignedP12;

/**
 * Appose UNE signature PAdES sur un PDF. Renvoie le PDF signé (Buffer).
 *
 * Les DEUX signatures utilisent le placeholder « plain » (ajout en MISE À JOUR
 * INCRÉMENTALE) : c'est la seule variante qui écrit « /Type /AcroForm » et sait donc
 * FUSIONNER le champ de signature existant avec le nouveau (/Fields = [ancien, nouveau]).
 * Résultat : les visionneuses (Adobe, poppler, DSS…) reconnaissent BIEN les 2 signatures,
 * et la 1re reste valide (l'ajout se fait en fin de fichier, sans réécriture).
 *
 *   · incremental=false (1re signature) : on NORMALISE d'abord le PDF via pdf-lib
 *     (table xref classique, sans flux d'objets) car « plain » ne lit pas les flux xref
 *     produits par pdf-lib (documents « builder » : en-tête/pied superposés).
 *   · incremental=true (signatures suivantes) : ajout direct sur le PDF déjà signé.
 *
 * En cas d'erreur (PDF non chargeable, etc.), relance : l'appelant décide du repli.
 */
async function signPdf(pdfBuffer, p12, { name = 'Signataire', reason = 'Signature', contact = '', location = '', incremental = false } = {}) {
    let base = pdfBuffer;
    if (!incremental) {
        // Ré-sérialise en table xref classique (lisible par plainAddPlaceholder).
        try {
            const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false });
            base = Buffer.from(await doc.save({ useObjectStreams: false }));
        } catch { base = pdfBuffer; }
    }
    const prepared = plainAddPlaceholder({
        pdfBuffer: base,
        reason: String(reason).slice(0, 120),
        contactInfo: String(contact || '').slice(0, 120),
        name: String(name).slice(0, 120),
        location: String(location || '').slice(0, 120),
        signatureLength: 8192,
    });
    return signpdf.sign(prepared, new P12Signer(p12, { passphrase: P12_PASS }));
}

/**
 * Cachet PAdES de l'organisme sur un PDF non signé (chemin « à la volée » : documents
 * non encore signés électroniquement). Conserve l'API historique.
 */
async function sealPdf(pdfBuffer, p12, { orgName = 'Organisme', reason = 'Scellement', contact = '', location = '' } = {}) {
    return signPdf(pdfBuffer, p12, { name: orgName, reason, contact, location, incremental: false });
}

module.exports = { generateSelfSignedP12, generateOrgP12, signPdf, sealPdf, P12_PASS };
