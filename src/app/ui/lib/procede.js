/**
 * LE PROCÉDÉ D'UNE FICHE, tel qu'on le montre à qui la LIT (Communauté, 2026-09-29).
 *
 * Le procédé d'une préparation ou d'une réalisation partagée — celui du « saumon gravlax », relevé
 * par l'école — ne se voyait NULLE PART : ni sur sa carte, ni dans son détail. Seul un empâtement
 * montrait le sien, et seulement dans le détail. Or c'est la moitié d'une fiche technique : les
 * quantités disent quoi, le procédé dit comment.
 *
 * Deux sources, un seul format (`{ titre, texte }`) :
 *   · la PRÉPARATION et la RÉALISATION : les étapes que l'auteur a écrites (`dough_params.steps`) ;
 *   · l'EMPÂTEMENT : le déroulé que le calculateur GÉNÈRE (`computeBuild`), celui de la fiche
 *     imprimée.
 * Et la cuisson d'une réalisation, en une ligne, quand elle est renseignée.
 *
 * `dough_params` arrive tel que l'API le rend — objet ou chaîne JSON : `lireParams` lit les deux.
 */
import { computeBuild, num } from "./dough.js";
import { lireParams } from "./coutFiche.js";

export function procedeDe(fiche) {
  const dp = lireParams(fiche);
  if (fiche?.kind === "PATE") {
    const b = computeBuild({ ...fiche, dough_params: dp });
    return { etapes: (b.steps || []).map((s) => ({ titre: s.t, texte: s.d || "" })), cuisson: null };
  }
  const etapes = (Array.isArray(dp.steps) ? dp.steps : [])
    .map((s) => String(s == null ? "" : s).trim()).filter(Boolean)
    .map((texte) => ({ titre: "", texte }));
  const c = fiche?.kind === "RECETTE" && dp.cooking && typeof dp.cooking === "object" ? dp.cooking : null;
  const cuisson = c ? [
    String(c.type || "").trim(),
    num(c.temp) > 0 ? `${num(c.temp)}\u00a0°C` : "",
    num(c.time) > 0 ? `${String(num(c.time)).replace(".", ",")}\u00a0min` : "",
    String(c.energy || "").trim(),
  ].filter(Boolean).join(" · ") : "";
  return { etapes, cuisson: cuisson || null };
}
