/**
 * LES TROIS RAYONS DE « MES FICHES TECHNIQUES » — ce que chacun dit, et ce qu'une carte résume.
 *
 * Demandé le 2026-09-30 : cliquer « Empâtement », « Préparation » ou « Réalisation » montre D'ABORD
 * les fiches déjà enregistrées de ce type, puis le bouton qui en crée une — au lieu d'ouvrir
 * l'éditeur sur une fiche vide (pages/FichesTechniques.jsx).
 *
 * Pur, sans React : rayons-fiches.test.js l'importe.
 */
import { lireParams } from "./coutFiche.js";

/* Le type d'une fiche (`recipe.kind`) et le mot qui le désigne dans l'adresse et dans l'éditeur. */
export const KIND_MODE = { PATE: "empatement", PREPARATION: "preparation", RECETTE: "realisation" };
export const MODE_KIND = { empatement: "PATE", preparation: "PREPARATION", realisation: "RECETTE" };

/* CE QUE DIT CHAQUE RAYON. Les accords sont écrits en toutes lettres : « Nouvel empâtement » devant
   une voyelle, « Nouvelle préparation » au féminin — un accord calculé finit par écrire « Nouveau
   réalisation ». */
export const RAYONS = {
  PATE: {
    titre: "Mes empâtements", creer: "Nouvel empâtement", premier: "Créer mon premier empâtement",
    vide: "Aucun empâtement enregistré", attente: "Une fois enregistré, il apparaîtra ici.",
    lead: "Tes pâtes, calculées au pourcentage boulanger : hydratation, sel, huile, levure.",
  },
  PREPARATION: {
    titre: "Mes préparations", creer: "Nouvelle préparation", premier: "Créer ma première préparation",
    vide: "Aucune préparation enregistrée", attente: "Une fois enregistrée, elle apparaîtra ici.",
    lead: "Ce que tu prépares avant de garnir : une sauce, une base, une crème… chiffré depuis ta mercuriale.",
  },
  RECETTE: {
    titre: "Mes réalisations", creer: "Nouvelle réalisation", premier: "Créer ma première réalisation",
    vide: "Aucune réalisation enregistrée", attente: "Une fois enregistrée, elle apparaîtra ici.",
    lead: "Tes pizzas : une pâte, tes préparations et les autres ingrédients, avec leur coût matière et leur prix conseillé.",
  },
};

const nombre = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fr = (n) => String(Math.round(n * 10) / 10).replace(".", ",");

/**
 * Ce qu'une carte dit sous le nom de la fiche : l'essentiel de son type, puis quand elle a été
 * modifiée. La liste ne porte ni ingrédients ni coût (`GET /recipes/mine` rend la fiche sans sa
 * composition) : on ne dit donc que ce qu'elle sait — l'hydratation et le pâton d'une pâte, le
 * rendement d'une préparation, le type d'une réalisation.
 */
export function resumeFiche(s) {
  const bouts = [];
  if (s.kind === "PATE") {
    const hydra = nombre(lireParams(s).hydra);
    if (hydra > 0) bouts.push(`Hydratation ${fr(hydra)}\u00a0%`);
    if (nombre(s.paton_g) > 0) bouts.push(`pâtons de ${fr(nombre(s.paton_g))}\u00a0g`);
  } else if (s.kind === "PREPARATION") {
    if (nombre(s.yield_qty) > 0) bouts.push(`Rendement ${fr(nombre(s.yield_qty))}\u00a0${s.yield_unit || "g"}`);
  } else if (s.type) {
    bouts.push(String(s.type));
  }
  // « 2026-09-30 00:56 » : lue en texte, sans `new Date` — un fuseau ferait reculer le jour.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s.updated_at || ""));
  if (m) bouts.push(`modifiée le ${m[3]}/${m[2]}/${m[1]}`);
  return bouts.join(" · ");
}
