/**
 * Cadres d'avatar — la récompense cosmétique de l'espace stagiaire.
 *
 * Remplace l'ancienne mécanique d'XP et de cœurs, qui récompensait le TEMPS PASSÉ dans le jeu
 * de QCM. Ici, ce qui se voit récompense ce qui compte pour une école : les formations
 * réellement terminées. Un cadre ne s'achète pas et ne se farme pas — il s'obtient en venant.
 *
 * Purement cosmétique : aucun cadre ne débloque de fonctionnalité.
 *
 * DEUX FAMILLES :
 *  · PARCOURS — débloqués au nombre de formations terminées. Tout le monde peut les avoir.
 *  · EXCLUSIFS — attribués par l'école (podium du Championnat de France, jury, ancienneté).
 *    Ils ne s'obtiennent pas en cumulant : ils se reçoivent. D'où `exclusif: true` et une
 *    `condition` affichée en clair — un cadre verrouillé sans explication ne motive personne,
 *    il frustre.
 *
 * Le stagiaire CHOISIT lequel porter parmi ceux qu'il possède : le dernier obtenu n'est pas
 * forcément celui qu'il préfère montrer.
 */
import { useEffect, useState } from "react";
import { saveMyCadre } from "../api/apiClient.js";

const CLE = (uid) => `impasto.cadre.${uid || "anon"}`;
export const CADRE_EVENT = "impasto:cadre";

export const CADRES = [
  { min: 0, id: "aucun",   nom: "Sans cadre", desc: "Aucun cadre — votre avatar seul." },
  { min: 1, id: "bronze",  nom: "Bronze",     desc: "1 formation terminée" },
  { min: 2, id: "argent",  nom: "Argent",     desc: "2 formations terminées" },
  { min: 3, id: "or",      nom: "Or",         desc: "3 formations terminées" },
  { min: 5, id: "braise",  nom: "Braise",     desc: "5 formations terminées", anime: true },
  { min: 8, id: "maestro", nom: "Maestro",    desc: "8 formations terminées", anime: true },

  // — Exclusifs : attribués par l'école, jamais atteints en cumulant des formations. —
  { id: "champion", nom: "Champion",  exclusif: true, anime: true,
    condition: "Podium du Championnat de France de la pizza" },
  { id: "jury",     nom: "Jury",      exclusif: true,
    condition: "Avoir siégé au jury d'un concours" },
  { id: "fondateur", nom: "Fondateur", exclusif: true,
    condition: "Première promotion de l'école" },

  /* — Personnel de l'organisme. Le SEUL cadre que l'équipe porte, et le seul qu'un stagiaire ne
       peut pas porter. Les cadres de parcours annoncent un nombre de formations terminées : un
       secrétariat en « Maestro » se lirait comme un stagiaire chevronné, et l'inverse ferait
       passer un stagiaire pour le bureau. Le serveur refuse les deux (cf. saveMyCadre). */
  { id: "ecole", nom: "École", personnel: true,
    desc: "Vous faites partie de l'organisme", condition: "Réservé au personnel de l'organisme" },
];

/** Les cadres proposés au personnel de l'organisme : « Sans cadre » et le sien. */
export const CADRES_PERSONNEL = CADRES.filter((c) => c.id === "aucun" || c.personnel);

export const cadreById = (id) => CADRES.find((c) => c.id === id) || CADRES[0];

/** Le cadre de parcours atteint, et le prochain palier (null si le dernier est atteint). */
export function cadreFor(formationsDone = 0) {
  const parcours = CADRES.filter((c) => !c.exclusif);
  let idx = 0;
  for (let i = 0; i < parcours.length; i++) if (formationsDone >= parcours[i].min) idx = i;
  return { cadre: parcours[idx], suivant: parcours[idx + 1] || null, index: idx };
}

/**
 * Un cadre est-il possédé ?
 * `attribues` = identifiants des cadres exclusifs accordés par l'école (source serveur à
 * venir ; en attendant, la liste est vide et les exclusifs restent visibles mais verrouillés,
 * ce qui les fait exister comme objectif au lieu de les cacher).
 */
export function cadrePossede(c, formationsDone = 0, attribues = []) {
  if (c.id === "aucun") return true;
  // Le cadre du personnel ne s'atteint pas en cumulant : le serveur le pose dans `attribues`
  // (cf. listPosts), exactement comme un exclusif. Sans ça `cadrePorteDe` le rejetterait et
  // l'école réapparaîtrait sans cadre chez les AUTRES, alors qu'elle en porte un chez elle.
  if (c.personnel) return attribues.includes(c.id);
  return c.exclusif ? attribues.includes(c.id) : formationsDone >= c.min;
}

/**
 * Le cadre effectivement porté, à partir d'un choix DÉJÀ LU — fonction pure.
 *
 * Séparée de `cadrePorte` parce qu'un composant React ne doit pas dépendre d'une lecture
 * de `localStorage` faite pendant le rendu : rien ne le rerendrait quand la valeur change.
 * Il lit le choix une fois avec `useCadreChoisi` (état React), puis résout ici.
 */
export function cadrePorteDe(choisi, formationsDone = 0, attribues = []) {
  if (choisi) {
    const c = CADRES.find((x) => x.id === choisi);
    // Un cadre choisi puis perdu (donnée corrigée côté école) ne doit pas rester affiché.
    if (c && cadrePossede(c, formationsDone, attribues)) return c;
  }
  return cadreFor(formationsDone).cadre;
}

/** Idem, en lisant le choix du navigateur. */
export function cadrePorte(uid, formationsDone = 0, attribues = []) {
  return cadrePorteDe(getCadreChoisi(uid), formationsDone, attribues);
}

export function getCadreChoisi(uid) {
  try { return localStorage.getItem(CLE(uid)) || null; } catch { return null; }
}

/**
 * Hook : le cadre choisi, resynchronisé à chaque changement — même onglet ou autre onglet.
 *
 * `setCadreChoisi` émettait `CADRE_EVENT` que PERSONNE n'écoutait : changer de cadre ne se
 * voyait que dans la modale qui venait de le faire. Partout ailleurs (Communauté), l'ancien
 * cadre restait affiché jusqu'au rechargement de la page.
 */
export function useCadreChoisi(uid) {
  const [choisi, setChoisi] = useState(() => getCadreChoisi(uid));
  useEffect(() => {
    const sync = () => setChoisi(getCadreChoisi(uid));
    sync(); // `uid` arrive après le premier rendu (contexte utilisateur)
    window.addEventListener(CADRE_EVENT, sync);
    window.addEventListener("storage", sync); // autres onglets
    return () => { window.removeEventListener(CADRE_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [uid]);
  return choisi;
}
export function setCadreChoisi(uid, id) {
  try {
    if (id) localStorage.setItem(CLE(uid), id); else localStorage.removeItem(CLE(uid));
    window.dispatchEvent(new CustomEvent(CADRE_EVENT));
  } catch { /* navigation privée : le choix ne survivra pas, l'affichage reste correct */ }
  // ET en base, pour que les AUTRES le voient — même schéma que `setAvatar` : le local sert
  // aux lectures synchrones et à l'affichage immédiat, le serveur à la diffusion. Best-effort :
  // hors ligne, on garde un affichage juste chez soi plutôt que de bloquer sur une erreur.
  saveMyCadre(id || null).catch(() => {});
}

/** Classe CSS du cadre — chaîne vide quand il n'y en a pas, pour ne rien ajouter au DOM. */
export const cadreClass = (id) => (id && id !== "aucun" ? `cadre cadre-${id}` : "");
