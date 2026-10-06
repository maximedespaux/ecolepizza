/**
 * LES MOYENS DE PAIEMENT d'un règlement — la MÊME liste à l'écran et au serveur (demandé le
 * 2026-09-30, carte « Règlement » de la fiche stagiaire ; ÉLARGI le 2026-10-06).
 *
 * L'école note COMMENT l'acompte et le solde ont été réglés, et, pour un chèque ou un virement, le
 * NUMÉRO / la RÉFÉRENCE (`ref`). Ces valeurs se saisissent sur la carte « Règlement » et deviennent
 * des jetons du groupe « Stagiaire » ({Moyen acompte}, {Réf acompte}, {Moyen solde}, {Réf solde}) :
 * une facture peut imprimer « réglé par chèque n° 12345 ».
 *
 * CE QUI EST PROPOSÉ vient des MOYENS DE PAIEMENT de l'entité émettrice (Paramètres → Facturation →
 * « École Pizza », colonne `billing_profile.payment_methods`) — la MÊME liste qu'à la caisse — et non
 * plus de ces quatre-là seuls (demandé le 2026-10-06 : « il manque des moyens, il y en a plus en
 * Facturation »). MOYENS ci-dessous n'est donc plus la liste close : c'est le REPLI (aucune entité, ou
 * aucun moyen coché) ET la table des CODES HISTORIQUES déjà en base (ESPECES/CHEQUE/VIREMENT/CARTE,
 * écrits avant ce changement). Depuis le 2026-10-06, on enregistre le LIBELLÉ choisi tel quel
 * (« Espèces », « CB », « Prélèvement »…) : la colonne est un varchar (migration 195), un moyen de
 * plus ne demande donc aucune migration.
 *
 * DU CODE PARTAGÉ, à l'identique côté écran (src/app/ui/lib/moyensPaiement.js) : `moyens-paiement.test.js`
 * confronte les deux fichiers.
 */

// Le repli (aucun moyen configuré) ET les codes historiques. `ref` n'est plus lu (c'est l'heuristique
// `refDemandee` qui tranche, libellé compris) ; on le garde pour que les deux fichiers restent jumeaux.
const MOYENS = [
    { code: 'ESPECES', label: 'Espèces', ref: null },
    { code: 'CHEQUE', label: 'Chèque', ref: 'N° de chèque' },
    { code: 'VIREMENT', label: 'Virement', ref: 'Référence du virement' },
    { code: 'CARTE', label: 'Carte bancaire', ref: null },
];

const CODES = MOYENS.map((m) => m.code);
const parCode = (code) => MOYENS.find((m) => m.code === code) || null;

// Sans accents ni casse, pour reconnaître un chèque ou un virement quel que soit le libellé saisi
// (« Chèque », « CHEQUE », « Chèque différé »…).
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * La liste PROPOSÉE : les moyens cochés sur l'entité (chaîne « Espèces,CB,Virement », séparée par des
 * virgules, comme à la caisse), ou, à défaut, les quatre libellés de repli. Jamais vide.
 */
function moyensConfigures(paymentMethods) {
    const libs = String(paymentMethods || '').split(',').map((s) => s.trim()).filter(Boolean);
    return libs.length ? libs : MOYENS.map((m) => m.label);
}

/**
 * Le libellé affiché d'un moyen. Un CODE historique (« CHEQUE ») rend son libellé (« Chèque ») ; un
 * libellé enregistré tel quel (« CB », « Prélèvement ») se rend lui-même. Vide si rien n'est noté.
 */
function libelleMoyen(valeur) {
    if (valeur == null || valeur === '') return '';
    const m = parCode(valeur);
    return m ? m.label : String(valeur);
}

/**
 * Ce que le serveur accepte d'enregistrer : le vide, un code historique, ou l'un des moyens
 * `autorises` (ceux de l'entité). Sans `autorises`, seuls le vide et les codes historiques passent —
 * c'est ce que vérifie le test pur ; le contrôleur, lui, passe toujours la liste de l'entité.
 */
function moyenValide(valeur, autorises) {
    if (valeur == null || valeur === '') return true;
    if (CODES.includes(valeur)) return true;
    return Array.isArray(autorises) && autorises.includes(valeur);
}

/** Le libellé du champ « référence » (chèque → n°, virement → référence), ou null — libellé compris. */
function refDemandee(valeur) {
    const v = sansAccent(valeur);
    if (!v) return null;
    if (v.includes('cheque')) return 'N° de chèque';
    if (v.includes('virement')) return 'Référence du virement';
    return null;
}

module.exports = { MOYENS, CODES, moyensConfigures, libelleMoyen, moyenValide, refDemandee };
