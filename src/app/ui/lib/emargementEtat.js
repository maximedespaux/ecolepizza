/**
 * L'ÉTAT D'UNE DEMI-JOURNÉE D'ÉMARGEMENT POUR LE STAGIAIRE — ce que le serveur calcule (`etat`,
 * `ouvre_a`, `rattrapee`), dit à l'écran. Deux écrans listent ses demi-journées (Ma feuille de
 * présence, et l'onglet Émargement de sa formation) : une seule lecture pour les deux.
 *
 * DÉCIDÉ PAR L'ÉCOLE LE 2026-09-26 : une demi-journée se signe PENDANT qu'elle a lieu, de son heure
 * de début jusqu'à minuit (lib/emargement.js côté serveur, `fenetreSignature`). Le bouton
 * « Signer » ne paraît donc que sur une demi-journée OUVERTE : ailleurs, le serveur refuserait.
 *
 * `etat` absent (une API d'avant ce changement, le temps d'un déploiement) : on retombe sur la
 * seule règle d'avant, « pas de date future ».
 */
const heure = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":");
  return h ? `${Number(h)}h${m || "00"}` : "";
};

export function etatEmargement(r, today = "") {
  if (r.signed) return { cle: "signee" };
  if (r.rattrapee) return { cle: "rattrapee", texte: "Présence enregistrée par l'école" };
  const etat = r.etat || (today && r.date > today ? "a_venir" : "ouverte");
  if (etat === "ouverte") return { cle: "ouverte" };
  if (etat === "pas_encore") return { cle: "pas_encore", texte: r.ouvre_a ? `À partir de ${heure(r.ouvre_a)}` : "Pas encore ouverte" };
  if (etat === "close") return { cle: "close", texte: "Non signée · voir avec l'école" };
  return { cle: "a_venir", texte: "À venir" };
}

/** Ce qui attend le stagiaire MAINTENANT : une demi-journée ouverte, ni signée ni rattrapée. */
export const aSignerMaintenant = (r, today = "") => etatEmargement(r, today).cle === "ouverte";
