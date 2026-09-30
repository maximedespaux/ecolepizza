/**
 * LES MOYENS DE PAIEMENT d'un règlement — la MÊME liste à l'écran et au serveur (demandé le
 * 2026-09-30, carte « Règlement » de la fiche stagiaire).
 *
 * L'école note COMMENT l'acompte et le solde ont été réglés : espèces, chèque, virement, carte ; et,
 * pour un chèque ou un virement, le NUMÉRO / la RÉFÉRENCE (`ref`). Ces valeurs se saisissent sur la
 * carte « Règlement » et deviennent des jetons du groupe « Stagiaire » ({Moyen acompte}, {Réf
 * acompte}, {Moyen solde}, {Réf solde}) : une facture peut imprimer « réglé par chèque n° 12345 ».
 *
 * SÉPARÉMENT pour l'acompte et pour le solde (un acompte par chèque, un solde par virement) : les
 * colonnes vivent sur `enrollment` (migration 195), le CODE tient avant comme après (cf. la carte et
 * updateReglement, qui répond 503 sans la colonne).
 *
 * DU CODE PARTAGÉ, à l'identique côté écran (src/app/ui/lib/moyensPaiement.js) : `moyens-paiement.test.js`
 * confronte les deux fichiers. Le `code` est un IDENTIFIANT stocké en base — on ne le renomme pas ;
 * seul le `label` (affiché) est libre.
 */

// L'ordre est celui de la liste déroulante ; `ref` = le libellé du champ à remplir, ou null si ce
// moyen n'en demande pas.
const MOYENS = [
    { code: 'ESPECES', label: 'Espèces', ref: null },
    { code: 'CHEQUE', label: 'Chèque', ref: 'N° de chèque' },
    { code: 'VIREMENT', label: 'Virement', ref: 'Référence du virement' },
    { code: 'CARTE', label: 'Carte bancaire', ref: null },
];

const CODES = MOYENS.map((m) => m.code);
const parCode = (code) => MOYENS.find((m) => m.code === code) || null;

/** Le libellé affiché d'un moyen (« Chèque »), vide si le code est absent ou inconnu. */
function libelleMoyen(code) {
    const m = parCode(code);
    return m ? m.label : '';
}

/** Vrai si le code est vide (aucun moyen) ou l'un des moyens connus — ce que le serveur accepte. */
function moyenValide(code) {
    return code == null || code === '' || CODES.includes(code);
}

/** Le libellé du champ « référence » d'un moyen (chèque, virement), ou null s'il n'en demande pas. */
function refDemandee(code) {
    const m = parCode(code);
    return m ? m.ref : null;
}

module.exports = { MOYENS, CODES, libelleMoyen, moyenValide, refDemandee };
