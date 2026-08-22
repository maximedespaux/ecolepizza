/**
 * VALIDATION D'UNE « SIGNATURE » (tracé, cachet) À L'ÉCRITURE.
 *
 * Une signature est un data-URL image fourni par l'utilisateur (stagiaire, représentant, signataire
 * public), puis réinséré dans le HTML des documents via un jeton RAW (non échappé par htmlfill) —
 * cf. lib/tokens.js `signatureBox`. Sans validation stricte À L'ÉCRITURE, un payload du genre
 * `data:image/png;base64,AA"><img src=x onerror=…>` passait le simple préfixe `^data:image/` et
 * devenait un XSS STOCKÉ exécuté à l'aperçu du document (dans la session de l'admin). Cf. SECURITY_AUDIT #2.
 *
 * On exige donc un data-URL image base64 au motif ANCRÉ (`^…$`) : aucun caractère hors alphabet
 * base64 ne peut suivre, donc ni `"` ni `<`. (Le rendu échappe AUSSI au sink, en défense de profondeur.)
 */
const MOTIF_SIGNATURE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_SIGNATURE = 2 * 1024 * 1024; // 2 Mo de data-URL — large pour un PNG de signature/cachet

/** Vrai si `s` est un data-URL image base64 acceptable (chaîne, taille bornée, motif ancré). */
function estSignatureValide(s) {
    return typeof s === 'string' && s.length > 0 && s.length <= MAX_SIGNATURE && MOTIF_SIGNATURE.test(s);
}

module.exports = { estSignatureValide, MAX_SIGNATURE };
