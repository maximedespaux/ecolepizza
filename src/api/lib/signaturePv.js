/**
 * LE LIEN DE SIGNATURE D'UN PROCÈS-VERBAL DE JURY (demandé le 2026-10-29).
 *
 * Les membres de la commission et les candidats signent le PV À DISTANCE, chacun par un lien qui lui
 * est propre. Le lien porte un jeton SIGNÉ (JWT, HS256) — rien à stocker, comme le lien de
 * désinscription de la newsletter (lib/newsletter.js). Le jeton grave : la session d'examen, la
 * NATURE du signataire (membre / candidat) et sa RÉFÉRENCE (compte du membre, ou stagiaire), plus
 * l'organisme. Il ne permet QUE de signer CE PV POUR CE signataire — un jeton de session (connexion)
 * ou de désinscription ne peut pas servir ici, et l'inverse non plus (le « but » `p` est vérifié).
 *
 * `noTimestamp` : le jeton est DÉTERMINISTE (pas d'`iat`), pour que le même lien revienne à chaque
 * affichage de la liste des signatures — l'école le copie une fois. La signature est de toute façon
 * UNIQUE (clé de la table `exam_signature`) : un lien rejoué est refusé par la base, pas besoin
 * d'expiration (signer doit toujours marcher tant que le PV n'est pas signé).
 */
const jwt = require('jsonwebtoken');
const { appUrl } = require('./mailer.js');

const BUT_SIGNATURE_PV = 'pv-sign';
const NATURES = new Set(['MEMBRE', 'CANDIDAT']);

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET manquant : lien de signature du PV non signable.');
    return s;
}

/** Le jeton de signature d'UN signataire d'un PV (HS256, déterministe, sans expiration). */
function signerLienPv({ examSessionId, signerKind, signerRef, orgId }) {
    if (!examSessionId || !NATURES.has(signerKind) || !signerRef || !orgId) {
        throw new Error('Lien de signature du PV : paramètres incomplets.');
    }
    return jwt.sign(
        { p: BUT_SIGNATURE_PV, e: examSessionId, k: signerKind, r: signerRef, o: orgId },
        secret(), { algorithm: 'HS256', noTimestamp: true });
}

/** Rend `{ examSessionId, signerKind, signerRef, orgId }` si le jeton est valide et destiné à
    la signature d'un PV, sinon `null`. */
function verifierLienPv(token) {
    try {
        const d = jwt.verify(String(token || ''), secret(), { algorithms: ['HS256'] });
        if (!d || d.p !== BUT_SIGNATURE_PV || !d.e || !NATURES.has(d.k) || !d.r || !d.o) return null;
        return { examSessionId: d.e, signerKind: d.k, signerRef: d.r, orgId: d.o };
    } catch {
        return null;
    }
}

/** L'URL publique complète du lien de signature (page front `/pv-signer/:token`). */
function urlSignaturePv(token) {
    return `${appUrl()}/pv-signer/${token}`;
}

module.exports = { signerLienPv, verifierLienPv, urlSignaturePv, BUT_SIGNATURE_PV };
