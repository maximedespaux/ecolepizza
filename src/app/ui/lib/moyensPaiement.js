/**
 * LES MOYENS DE PAIEMENT d'un règlement — la MÊME liste que le serveur (src/api/lib/moyensPaiement.js,
 * où le besoin est raconté). L'écran s'en sert pour la liste déroulante de la carte « Règlement » et
 * pour savoir quel moyen demande une référence (chèque → n°, virement → référence).
 * `moyens-paiement.test.js` confronte les deux fichiers : ils doivent proposer les mêmes moyens.
 */

export const MOYENS = [
  { code: "ESPECES", label: "Espèces", ref: null },
  { code: "CHEQUE", label: "Chèque", ref: "N° de chèque" },
  { code: "VIREMENT", label: "Virement", ref: "Référence du virement" },
  { code: "CARTE", label: "Carte bancaire", ref: null },
];

export const CODES = MOYENS.map((m) => m.code);
const parCode = (code) => MOYENS.find((m) => m.code === code) || null;

export function libelleMoyen(code) {
  const m = parCode(code);
  return m ? m.label : "";
}

export function moyenValide(code) {
  return code == null || code === "" || CODES.includes(code);
}

export function refDemandee(code) {
  const m = parCode(code);
  return m ? m.ref : null;
}
