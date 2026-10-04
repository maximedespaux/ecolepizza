/**
 * HORODATAGE RFC 3161 DES SIGNATURES — PAdES-T (demandé le 2026-10-04, niveau B du dossier de preuve).
 *
 * POURQUOI. Une signature de l'application porte « l'heure déclarée de dépôt » = l'horloge DU SERVEUR,
 * que personne d'autre ne peut prouver. Un horodatage RFC 3161 fait CONTRESIGNER cette heure par une
 * autorité d'horodatage (TSA) indépendante : le jeton d'horodatage prouve que la signature EXISTAIT à
 * telle date, sans dépendre de l'horloge de l'école. C'est ce qui fait passer une signature PAdES-B
 * (basique) à PAdES-T (horodatée).
 *
 * CE QU'ON ENVOIE À LA TSA : seulement l'EMPREINTE (SHA-256) de la valeur de signature — jamais le
 * document, ni aucune donnée personnelle. La TSA ne voit qu'un condensat.
 *
 * TOLÉRANT PAR CONSTRUCTION : si la TSA est injoignable, lente, ou répond de travers, on RETOURNE LA
 * SIGNATURE SANS HORODATAGE (PAdES-B) plutôt que d'empêcher quelqu'un de signer. Un horodatage est un
 * PLUS ; il ne doit jamais bloquer une signature. Configurable : `TSA_URL` (vide = désactivé),
 * `TSA_TIMEOUT_MS`. Pour un horodatage QUALIFIÉ (eIDAS), pointer `TSA_URL` vers une TSA qualifiée.
 *
 * L'horodatage s'ajoute en ATTRIBUT NON SIGNÉ du CMS (id-aa-timeStampToken) : il n'entre pas dans le
 * calcul de la signature du document, donc il ne l'invalide jamais — il s'y AJOUTE. Le jeton de la TSA
 * est réinséré À L'OCTET PRÈS (garde de ré-encodage ci-dessous), sinon SA PROPRE signature casserait.
 */
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const forge = require('node-forge');
const { P12Signer } = require('@signpdf/signer-p12');

const asn1 = forge.asn1;
const { Class, Type } = asn1;
const OID_TST = '1.2.840.113549.1.9.16.2.14'; // id-aa-timeStampToken
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';

// Réglage de la TSA. `TSA_URL` absent → une TSA publique par défaut ; `TSA_URL=""` → horodatage coupé.
function cfgTSA() {
    const url = process.env.TSA_URL != null ? String(process.env.TSA_URL).trim() : 'http://timestamp.digicert.com';
    const timeoutMs = Math.max(1000, Number(process.env.TSA_TIMEOUT_MS) || 10000);
    return { url, timeoutMs };
}

const bufForge = (b) => forge.util.createBuffer((Buffer.isBuffer(b) ? b : Buffer.from(b, 'binary')).toString('binary'));
const toBuf = (asn1obj) => Buffer.from(asn1.toDer(asn1obj).getBytes(), 'binary');

/** Construit une requête d'horodatage RFC 3161 (TimeStampReq) pour une empreinte SHA-256. */
function construireTSQ(hashBuf) {
    const { create, oidToDer, integerToDer } = asn1;
    const algId = create(Class.UNIVERSAL, Type.SEQUENCE, true, [
        create(Class.UNIVERSAL, Type.OID, false, oidToDer(OID_SHA256).getBytes()),
        create(Class.UNIVERSAL, Type.NULL, false, ''),
    ]);
    const messageImprint = create(Class.UNIVERSAL, Type.SEQUENCE, true, [
        algId,
        create(Class.UNIVERSAL, Type.OCTETSTRING, false, hashBuf.toString('binary')),
    ]);
    const nonce = Math.floor(Math.random() * 0x7fffffff); // positif : DER valide à coup sûr
    const req = create(Class.UNIVERSAL, Type.SEQUENCE, true, [
        create(Class.UNIVERSAL, Type.INTEGER, false, integerToDer(1).getBytes()),   // version 1
        messageImprint,
        create(Class.UNIVERSAL, Type.INTEGER, false, integerToDer(nonce).getBytes()),
        create(Class.UNIVERSAL, Type.BOOLEAN, false, String.fromCharCode(0xFF)),    // certReq = true
    ]);
    return toBuf(req);
}

/** Lit un élément DER à l'offset donné : ses bornes et le début de son contenu (sans forge). */
function lireTLV(buf, off) {
    let p = off + 1;
    let len = buf[p++];
    if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | buf[p++]; }
    return { start: off, contentStart: p, end: p + len };
}

/**
 * Extrait de la réponse TSA (TimeStampResp) les OCTETS BRUTS du jeton d'horodatage, et vérifie que
 * le statut est « accordé ». On lit les bornes à la main pour renvoyer le jeton À L'IDENTIQUE (sa
 * signature interne ne tolère pas le moindre octet changé).
 * TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken ContentInfo OPTIONAL }
 * PKIStatusInfo ::= SEQUENCE { status INTEGER, … } — 0 = accordé, 1 = accordé avec réserve.
 */
function extraireJetonDer(respBuf) {
    const resp = Buffer.isBuffer(respBuf) ? respBuf : Buffer.from(respBuf, 'binary');
    const outer = lireTLV(resp, 0);
    const statusEl = lireTLV(resp, outer.contentStart);     // PKIStatusInfo
    const statusInt = lireTLV(resp, statusEl.contentStart); // status INTEGER
    const sv = resp[statusInt.contentStart] || 0;
    if (sv > 1) throw new Error('TSA : statut ' + sv + ' (non accordé)');
    if (statusEl.end >= outer.end) throw new Error('TSA : jeton absent (réponse sans timeStampToken)');
    const tokenEl = lireTLV(resp, statusEl.end);            // timeStampToken (ContentInfo)
    if (tokenEl.end <= tokenEl.start || tokenEl.end > resp.length) throw new Error('TSA : jeton illisible');
    return resp.slice(tokenEl.start, tokenEl.end);
}

// Descente dans un CMS SignedData : ContentInfo → [0] → SignedData → signerInfos(SET) → SignerInfo.
function signerInfoDe(cmsDer) {
    const root = asn1.fromDer(bufForge(cmsDer));
    const signedData = root.value[1].value[0]; // [0] explicite → SignedData SEQUENCE
    let signerInfos = null;
    for (let i = signedData.value.length - 1; i >= 0; i--) {
        const e = signedData.value[i];
        if (e.tagClass === Class.UNIVERSAL && e.type === Type.SET) { signerInfos = e; break; }
    }
    if (!signerInfos || !signerInfos.value.length) throw new Error('signerInfos introuvable');
    return { root, signerInfo: signerInfos.value[0] };
}

/** La valeur de signature (OCTET STRING) du SignerInfo — c'est ELLE qu'on horodate (PAdES-T). */
function signatureDuCms(cmsDer) {
    const { signerInfo } = signerInfoDe(cmsDer);
    for (let i = signerInfo.value.length - 1; i >= 0; i--) {
        const e = signerInfo.value[i];
        if (e.tagClass === Class.UNIVERSAL && e.type === Type.OCTETSTRING) return Buffer.from(e.value, 'binary');
    }
    throw new Error('valeur de signature introuvable');
}

/**
 * Ajoute le jeton d'horodatage au CMS, en attribut NON signé (id-aa-timeStampToken). GARDE-FOU : on
 * n'insère le jeton que si forge le ré-encode à l'octet près — sinon la signature interne du jeton
 * serait brisée, et on préfère renoncer à l'horodatage (l'appelant garde la signature PAdES-B).
 */
function ajouterHorodatage(cmsDer, jetonDer) {
    const jetonAsn1 = asn1.fromDer(bufForge(jetonDer));
    if (!toBuf(jetonAsn1).equals(Buffer.isBuffer(jetonDer) ? jetonDer : Buffer.from(jetonDer, 'binary'))) {
        throw new Error('jeton TSA non ré-encodable à l\'identique : horodatage abandonné');
    }
    const { root, signerInfo } = signerInfoDe(cmsDer);
    const attr = asn1.create(Class.UNIVERSAL, Type.SEQUENCE, true, [
        asn1.create(Class.UNIVERSAL, Type.OID, false, asn1.oidToDer(OID_TST).getBytes()),
        asn1.create(Class.UNIVERSAL, Type.SET, true, [jetonAsn1]),
    ]);
    // [1] IMPLICIT SET OF Attribute (les attributs non signés remplacent le tag SET par [1]).
    signerInfo.value.push(asn1.create(Class.CONTEXT_SPECIFIC, 1, true, [attr]));
    return toBuf(root);
}

/** POST de la requête d'horodatage à la TSA (application/timestamp-query → -reply). */
function posterTSQ(urlStr, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(urlStr); } catch { return reject(new Error('TSA_URL invalide')); }
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request({
            method: 'POST', hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: (u.pathname || '/') + (u.search || ''),
            headers: { 'Content-Type': 'application/timestamp-query', 'Content-Length': body.length },
            timeout: timeoutMs,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                if (res.statusCode !== 200) return reject(new Error('TSA HTTP ' + res.statusCode));
                resolve(Buffer.concat(chunks));
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('TSA : délai dépassé')));
        req.write(body); req.end();
    });
}

/**
 * Horodate un CMS déjà signé : empreinte de la signature → requête TSA → jeton inséré. Renvoie le CMS
 * horodaté, ou LE CMS D'ORIGINE si l'horodatage échoue (jamais d'exception vers l'appelant).
 */
async function horodaterCms(cmsDer, { url, timeoutMs } = cfgTSA()) {
    if (!url) return cmsDer; // horodatage désactivé (TSA_URL vide)
    try {
        const sig = signatureDuCms(cmsDer);
        const hash = crypto.createHash('sha256').update(sig).digest();
        const resp = await posterTSQ(url, construireTSQ(hash), timeoutMs);
        const jeton = extraireJetonDer(resp);
        return ajouterHorodatage(cmsDer, jeton);
    } catch (e) {
        console.error('Horodatage RFC 3161 ignoré :', e.message); // repli : signature PAdES-B, non horodatée
        return cmsDer;
    }
}

/**
 * Signataire P12 qui HORODATE sa signature (PAdES-T). Étend le signataire de @signpdf : il signe comme
 * lui, puis fait contresigner l'heure par la TSA. Si le CMS horodaté dépasse la place réservée dans le
 * PDF (`maxLen`), on garde la version non horodatée (qui, elle, tient) : @signpdf refuserait sinon.
 */
class SignerP12Horodate extends P12Signer {
    constructor(p12, options = {}) {
        super(p12, options);
        this.tsa = options.tsa || cfgTSA();
        this.maxLen = options.maxLen || 0;
    }
    async sign(pdfBuffer, signingTime = undefined) {
        const cms = await super.sign(pdfBuffer, signingTime);
        const horodate = await horodaterCms(cms, this.tsa);
        // `maxLen` = place réservée dans le PDF, en OCTETS (le CMS doit y tenir, sinon @signpdf refuse).
        if (this.maxLen && horodate.length > this.maxLen) {
            console.error('Horodatage ignoré : le jeton dépasse la place réservée dans le PDF.');
            return cms;
        }
        return horodate;
    }
}

module.exports = {
    cfgTSA, construireTSQ, extraireJetonDer, signatureDuCms, ajouterHorodatage, horodaterCms,
    SignerP12Horodate, OID_TST, OID_SHA256,
};
