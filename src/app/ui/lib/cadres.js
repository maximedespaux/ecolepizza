/**
 * Cadres d'avatar — la récompense cosmétique de l'espace stagiaire.
 *
 * Remplace l'ancienne mécanique d'XP et de cœurs, qui récompensait le TEMPS PASSÉ dans le jeu
 * de QCM. Ici, ce qui se voit récompense ce qui compte pour une école : les formations
 * réellement terminées. Un cadre ne s'achète pas et ne se farme pas — il s'obtient en venant.
 *
 * Purement cosmétique : aucun cadre ne débloque de fonctionnalité.
 *
 * TROIS FAMILLES :
 *  · PARCOURS — débloqués au nombre de formations terminées. Tout le monde peut les avoir.
 *  · EXCLUSIFS — attribués par l'école (podium du Championnat de France, jury, ancienneté).
 *    Ils ne s'obtiennent pas en cumulant : ils se reçoivent. D'où `exclusif: true` et une
 *    `condition` affichée en clair — un cadre verrouillé sans explication ne motive personne,
 *    il frustre.
 *  · PIZZA QUEST — gagnés en jouant, un par formation, À LA COULEUR DE CETTE FORMATION.
 *    Les cadres de parcours se comptent en années : entre deux formations, un stagiaire qui
 *    revient tous les jours ne voyait rien bouger. Ceux-ci répondent à la semaine. La liste
 *    n'est pas ici mais VIENT DU SERVEUR (`quest_cadres`) : elle dépend des formations de
 *    l'organisme et de sa banque de questions, donc elle ne peut pas être écrite en dur.
 *    Valeur enregistrée : `palier|#rrggbb` — même convention que les avatars.
 *
 * Le stagiaire CHOISIT lequel porter parmi ceux qu'il possède : le dernier obtenu n'est pas
 * forcément celui qu'il préfère montrer.
 */
import { useEffect, useState } from "react";
import { saveMyCadre } from "../api/apiClient.js";

const CLE = (uid) => `impasto.cadre.${uid || "anon"}`;
export const CADRE_EVENT = "impasto:cadre";

export const CADRES = [
  { min: 0, id: "aucun",   nom: "Sans cadre", desc: "Aucun cadre, votre avatar seul." },
  { min: 1, id: "bronze",  nom: "Bronze",     desc: "1 formation terminée" },
  { min: 2, id: "argent",  nom: "Argent",     desc: "2 formations terminées" },
  { min: 3, id: "or",      nom: "Or",         desc: "3 formations terminées" },
  { min: 5, id: "braise",  nom: "Braise",     desc: "5 formations terminées", anime: true },
  { min: 8, id: "maestro", nom: "Maestro",    desc: "8 formations terminées", anime: true },

  // — Exclusifs : attribués par l'école, jamais atteints en cumulant des formations. —
  /* LES RÉSULTATS DE CONCOURS, du plus haut au plus spécifique. « Champion » couvrait tout
     seul l'ensemble des podiums, ce qui revenait à donner le même cadre au vainqueur et au
     troisième — un organisme qui remet des prix ne peut pas les confondre. */
  { id: "champion", nom: "Champion",  exclusif: true, anime: true,
    condition: "Vainqueur du Championnat de France de la pizza" },
  { id: "categorie", nom: "Champion de catégorie", exclusif: true, anime: true,
    condition: "Premier d'une catégorie (Teglia, Napolitaine, Classique…)" },
  { id: "podium",   nom: "Podium",    exclusif: true, anime: true,
    condition: "2ᵉ ou 3ᵉ place d'un concours" },
  { id: "prix",     nom: "Prix spécial", exclusif: true, anime: true,
    condition: "Prix spécial décerné par un jury" },
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

/* ---- Cadres de Pizza Quest -------------------------------------------------------------
   Les trois paliers doivent rester IDENTIQUES à `src/api/lib/cadresQuest.js`, qui fait
   autorité : c'est le serveur qui dit ce que le stagiaire possède, et lui qui refuse un cadre
   non gagné. Ce qui est écrit ici ne sert qu'à l'affichage — le libellé, et la fête au moment
   où le palier tombe (PizzaQuest.jsx). */
const PALIERS_PAR_MONDE = {
  qdemi: { nom: "Sur la voie", desc: "La moitié des chapitres terminés" },
  qfini: { nom: "Monde bouclé", desc: "Tous les chapitres terminés" },
  qparfait: { nom: "Sans faute", desc: "Tous les chapitres à 3 étoiles" },
};

/**
 * LES EXPLOITS — ils ne tiennent à aucune formation, donc n'en portent pas la couleur : leur
 * valeur enregistrée est leur seul identifiant.
 *
 * LISTÉS ICI ET PAS SEULEMENT REÇUS DU SERVEUR, contrairement aux paliers. Le serveur ne renvoie
 * que ce qui est GAGNÉ ; un exploit non gagné n'apparaîtrait donc nulle part, alors que c'est
 * précisément ce qu'on veut montrer — cet écran affiche déjà les exclusifs verrouillés avec leur
 * condition, parce qu'un objectif visible vaut mieux qu'une case cachée.
 * Les paliers, eux, restent réservés aux gagnés : trois paliers × chaque formation noieraient la
 * liste sous des cases grises. Un exploit est unique, il tient sa place.
 *
 * L'ordre est celui de la rareté croissante — il se retrouve dans le classement visuel (feuille
 * de style) : les premiers sont fixes, les derniers bougent.
 */
export const EXPLOITS_QUEST = [
  { id: "qpas", nom: "Premier pas", condition: "Terminer un premier chapitre" },
  { id: "qtouche", nom: "Touche-à-tout", condition: "Jouer dans 3 formations différentes" },
  { id: "qcent", nom: "Centurion", condition: "Récolter 100 étoiles" },
  { id: "qcollec", nom: "Collectionneur", condition: "Terminer entièrement 3 formations" },
  { id: "qlegende", nom: "Légende", condition: "Récolter 250 étoiles" },
  { id: "qintouch", nom: "Intouchable", condition: "3 formations sans la moindre faute" },
  { id: "qchelem", nom: "Grand Chelem", condition: "Toutes les formations jouables, sans faute" },
];

/** Paliers et exploits confondus — pour retrouver un libellé à partir d'un identifiant. */
export const PALIERS_QUEST = {
  ...PALIERS_PAR_MONDE,
  ...Object.fromEntries(EXPLOITS_QUEST.map((e) => [e.id, { nom: e.nom, desc: e.condition }])),
};
export const estCadreQuest = (id) => Object.prototype.hasOwnProperty.call(PALIERS_QUEST, id || "");

/**
 * Décompose une valeur de cadre : « qparfait|#dc3e37 » -> { id, couleur }.
 * Un cadre ordinaire n'a pas de couleur — elle est dans la feuille de style.
 */
export function parseCadre(valeur) {
  const [id, couleur] = String(valeur || "").split("|");
  return { id: id || null, couleur: /^#[0-9a-fA-F]{6}$/.test(couleur || "") ? couleur : null };
}

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
export function cadrePossede(c, formationsDone = 0, attribues = [], quest = []) {
  if (c.id === "aucun") return true;
  /* Un cadre de quête n'est possédé que dans SA couleur : c'est le serveur qui a établi la
     liste, palier ET teinte, et un « Sans faute » repeint aux couleurs d'une formation jamais
     ouverte dirait quelque chose de faux. */
  if (estCadreQuest(c.id)) return quest.some((q) => q.valeur === c.valeur);
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
export function cadrePorteDe(choisi, formationsDone = 0, attribues = [], quest = []) {
  if (choisi) {
    /* Cadre de quête : il ne figure pas dans `CADRES` — il n'existe qu'une fois la formation
       connue, puisqu'il en prend la couleur. La valeur SE SUFFIT (palier + teinte), et c'est
       nécessaire : dans la Communauté on affiche le cadre des AUTRES, dont on ne peut pas
       recalculer la progression. La possession, elle, a été vérifiée là où c'était possible —
       à l'écriture, par le serveur (cf. saveMyCadre). Refuser ici un cadre qu'on ne sait pas
       revérifier ferait disparaître, dans le fil, un cadre légitimement gagné. */
    const { id, couleur } = parseCadre(choisi);
    if (estCadreQuest(id)) {
      // Le titre de la formation n'est connu que pour SOI (liste du serveur) : ailleurs, le
      // palier seul. La couleur, elle, dit déjà de quelle formation il s'agit.
      const q = quest.find((x) => x.valeur === choisi);
      if (q) return cadreDeQuest(q);
      /* LA CONDITION EXIGEAIT UNE COULEUR — et un EXPLOIT n'en a pas : il n'appartient à aucune
         formation. Choisir « Premier pas » enregistrait donc bien `qpas`, mais l'affichage
         retombait sur le palier de parcours, c'est-à-dire Braise. Le cadre choisi n'était pas
         celui qui apparaissait, et la faute n'était visible NULLE PART ailleurs qu'à l'écran. */
      return { id, valeur: choisi, quest: true, ...(couleur ? { couleur } : {}),
        nom: PALIERS_QUEST[id].nom, desc: PALIERS_QUEST[id].desc };
    }
    const c = CADRES.find((x) => x.id === choisi);
    // Un cadre choisi puis perdu (donnée corrigée côté école) ne doit pas rester affiché.
    if (c && cadrePossede(c, formationsDone, attribues, quest)) return c;
  }
  return cadreFor(formationsDone).cadre;
}

/** Une entrée `quest_cadres` du serveur, mise à la forme d'un cadre affichable. */
export function cadreDeQuest(q) {
  const p = PALIERS_QUEST[q.palier] || {};
  return {
    id: q.palier, valeur: q.valeur, couleur: q.color, quest: true,
    /* LE CODE, PAS LE TITRE. Le nom doit dire de quelle formation vient le cadre — « Sans faute »
       seul ne dit pas sans faute sur quoi, et deux cadres du même palier seraient indiscernables.
       Mais le titre complet fait quatre lignes dans une tuile (« Pizzaïolo Niveau II –
       Empâtements Indirects « Poolish - Biga » »), et écrase le nom du cadre qu'on est venu lire.
       Le code tient en cinq caractères et suffit à distinguer. Le titre reste en info-bulle. */
    nom: p.nom || q.palier, formation: q.code, titre: q.title,
    desc: p.desc || "", global: !!q.global,
  };
}

/** Idem, en lisant le choix du navigateur. */
export function cadrePorte(uid, formationsDone = 0, attribues = [], quest = []) {
  return cadrePorteDe(getCadreChoisi(uid), formationsDone, attribues, quest);
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
/**
 * ADOPTE LE CHOIX ENREGISTRÉ EN BASE, sans le renvoyer au serveur.
 *
 * LE DÉFAUT QU'ELLE RÉPARE : la valeur était ÉCRITE en base et jamais RELUE par son
 * propriétaire. `cadrePorte` ne lit que le `localStorage`, si bien qu'un cadre choisi sur un
 * ordinateur restait invisible sur l'autre — chaque navigateur gardait le sien, et la base, elle,
 * disait autre chose que les deux écrans. Relevé : base « or », local « champion », écran
 * « champion ».
 *
 * LE SERVEUR GAGNE AU CHARGEMENT, le local gagne au clic. C'est le seul arbitrage cohérent :
 * la base est ce que les AUTRES voient dans la Communauté, donc un écran qui la contredit a
 * tort. Au clic, à l'inverse, l'affichage doit répondre tout de suite — d'où l'écriture locale
 * immédiate suivie d'un envoi.
 *
 * Elle n'appelle PAS l'API, contrairement à `setCadreChoisi` : on vient de recevoir cette valeur
 * du serveur, la lui réexpédier serait au mieux inutile, au pire un aller-retour qui écrase un
 * choix fait entre-temps sur un autre appareil.
 */
export function adopterCadreServeur(uid, cadre) {
  if (!cadre) return; // aucun choix enregistré : on garde ce que le navigateur connaît
  try {
    if (localStorage.getItem(CLE(uid)) === cadre) return; // déjà à jour, pas d'événement inutile
    localStorage.setItem(CLE(uid), cadre);
    window.dispatchEvent(new CustomEvent(CADRE_EVENT));
  } catch { /* navigation privée : l'affichage reste sur le repli, sans casser */ }
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

/**
 * Classe CSS du cadre — chaîne vide quand il n'y en a pas, pour ne rien ajouter au DOM.
 * Accepte aussi bien « maestro » que « qparfait|#dc3e37 » : la couleur ne va pas dans la
 * classe (il y en aurait autant que de formations), elle passe par `cadreStyle`.
 */
export const cadreClass = (valeur) => {
  const { id } = parseCadre(valeur);
  return id && id !== "aucun" ? `cadre cadre-${id}` : "";
};

/**
 * CE QU'ON PASSE À L'AFFICHAGE : la valeur complète s'il y en a une, sinon l'identifiant.
 *
 * Un cadre de quête porte sa TEINTE dans sa valeur (« qparfait|#eab308 »). Lui prendre son seul
 * `.id` — ce que faisaient les cinq appels à `AvatarCadre` — jetait la couleur en route : tous
 * les cadres de quête sortaient dans la teinte de repli, donc tous pareils, ce qui vide de son
 * sens l'idée même d'un cadre à la couleur de sa formation.
 */
export const cadreValeur = (c) => (c ? c.valeur || c.id : undefined);

/**
 * Style en ligne du cadre : la teinte d'un cadre de quête, ou rien.
 *
 * LA COULEUR EST UNE DONNÉE, pas une classe. Elle vient de la formation, que l'organisme
 * choisit librement — écrire une règle CSS par formation est impossible. On passe donc la
 * teinte en variable, et une seule règle par palier la décline.
 */
export const cadreStyle = (valeur) => {
  const { id, couleur } = parseCadre(valeur);
  return estCadreQuest(id) && couleur ? { "--cadre-c": couleur } : undefined;
};
