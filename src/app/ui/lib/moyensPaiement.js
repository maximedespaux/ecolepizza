/**
 * LES MOYENS DE PAIEMENT d'un règlement — la MÊME liste que le serveur (src/api/lib/moyensPaiement.js,
 * où le besoin est raconté). L'écran s'en sert pour la liste déroulante de la carte « Règlement » et
 * pour savoir quel moyen demande une référence (chèque → n°, virement → référence).
 *
 * Depuis le 2026-10-06, ce qui est proposé vient des MOYENS DE PAIEMENT de l'entité émettrice
 * (Paramètres → Facturation), transmis par l'API ; MOYENS ci-dessous n'est plus que le REPLI et la
 * table des CODES HISTORIQUES déjà en base. `moyens-paiement.test.js` confronte les deux fichiers.
 */

// Le repli (aucun moyen configuré) ET les codes historiques. `ref` n'est plus lu (c'est l'heuristique
// `refDemandee` qui tranche, libellé compris) ; on le garde pour que les deux fichiers restent jumeaux.
export const MOYENS = [
  { code: "ESPECES", label: "Espèces", ref: null },
  { code: "CHEQUE", label: "Chèque", ref: "N° de chèque" },
  { code: "VIREMENT", label: "Virement", ref: "Référence du virement" },
  { code: "CARTE", label: "Carte bancaire", ref: null },
];

export const CODES = MOYENS.map((m) => m.code);
const parCode = (code) => MOYENS.find((m) => m.code === code) || null;

// Sans accents ni casse, pour reconnaître un chèque ou un virement quel que soit le libellé saisi.
const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// La liste PROPOSÉE : les moyens cochés sur l'entité (« Espèces,CB,Virement »), ou les quatre de repli.
export function moyensConfigures(paymentMethods) {
  const libs = String(paymentMethods || "").split(",").map((s) => s.trim()).filter(Boolean);
  return libs.length ? libs : MOYENS.map((m) => m.label);
}

// Un CODE historique (« CHEQUE ») rend son libellé ; un libellé enregistré tel quel se rend lui-même.
export function libelleMoyen(valeur) {
  if (valeur == null || valeur === "") return "";
  const m = parCode(valeur);
  return m ? m.label : String(valeur);
}

export function moyenValide(valeur, autorises) {
  if (valeur == null || valeur === "") return true;
  if (CODES.includes(valeur)) return true;
  return Array.isArray(autorises) && autorises.includes(valeur);
}

// Le libellé du champ « référence » (chèque → n°, virement → référence), ou null — libellé compris.
export function refDemandee(valeur) {
  const v = sansAccent(valeur);
  if (!v) return null;
  if (v.includes("cheque")) return "N° de chèque";
  if (v.includes("virement")) return "Référence du virement";
  return null;
}
