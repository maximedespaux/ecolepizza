/**
 * LA CLÉ D'UNE ZONE À REMPLIR, posée par l'éditeur de modèles : « saisie:<type>:<identifiant> ».
 * Le serveur la lit (src/api/lib/zonesARemplir.js, `lireCle`) — un test confronte les deux.
 *
 * L'IDENTIFIANT VIENT DU LIBELLÉ : deux zones de même libellé sont UNE zone, remplie une fois et
 * imprimée à chaque place (le nom de l'entreprise en haut et en bas, par exemple). Deux questions
 * différentes demandent donc deux libellés différents.
 */
export const TYPES_ZONE = [
  { valeur: "texte", libelle: "Texte" },
  { valeur: "date", libelle: "Date" },
];

export function cleDeZone(libelle, type) {
  const id = String(libelle || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return `saisie:${type === "date" ? "date" : "texte"}:${id || "zone"}`;
}
