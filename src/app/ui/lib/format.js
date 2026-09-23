import { badgeColor } from "./levels.js";

/** Couleur d'une formation à partir de son code — palette UNIFIÉE (cf. levels.js)
 *  pour que formation / badge / session partagent le même code couleur. */
export const colorOf = badgeColor;

/** Initiales d'un nom complet. */
export function initials(first = "", last = "") {
  return `${(first[0] || "")}${(last[0] || "")}`.toUpperCase() || "?";
}

/** Prix en euros formaté FR (2 décimales max — évite les TTC à rallonge type 10,692). */
/**
 * LE NOMBRE D'UNE PASTILLE — le VRAI, pas « 9+ ».
 *
 * CE QU'IL REMPLACE : `n > 9 ? "9+" : n`, écrit à quatre endroits. Au-delà de neuf, la cloche
 * disait la même chose qu'on en ait dix ou deux cents — or c'est précisément quand il y en a
 * beaucoup qu'on veut le savoir : « 9+ » n'aide pas à décider s'il faut ouvrir maintenant.
 * La pastille est un `min-width` avec de la garniture : elle s'allonge en pilule sans casser.
 *
 * UN PLAFOND QUAND MÊME, à mille : au-delà, le nombre exact n'apprend plus rien (« 1247 » ou
 * « 1248 », on ouvrira de toute façon) et la pastille deviendrait un bandeau sur un téléphone.
 */
export function compteurPastille(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return v > 999 ? "999+" : String(v);
}

export function euro(value) {
  return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
}

/**
 * Prix affiché À LA FRANÇAISE SUR UNE CARTE : toujours deux décimales.
 *
 * `euro()` supprime les décimales inutiles, ce qui est le bon choix pour un total de facture mais
 * pas pour une colonne de prix : une carte qui aligne « 5,5 € », « 9 € » et « 12,50 € » se lit
 * comme une erreur de saisie. Ici les chiffres se comparent verticalement, donc ils doivent avoir
 * la même forme.
 */
export function euroFixe(value) {
  return `${Number(value || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Classe de badge pour un score de conformité Qualiopi. */
export function scoreBadge(score) {
  return { VERT: "g", ORANGE: "a", ROUGE: "r" }[score] || "n";
}

/**
 * LE SEUL ENDROIT QUI DÉCOUPE UNE DATE ISO. Tout affichage passe par les deux fonctions
 * ci-dessous — `dateFr` pour une date seule, `dateHeure` quand l'heure compte.
 *
 * LE SERVEUR CONTINUE D'ENVOYER DE L'ISO (`2026-08-01 14:32`), et c'est délibéré : les listes
 * TRIENT sur cette valeur par comparaison de chaînes. En « jj/mm/aaaa », le tri se ferait sur le
 * JOUR d'abord — le 31 janvier passerait devant le 1er décembre. Le format est donc affaire
 * d'affichage, jamais de transport.
 *
 * SURTOUT PAS `new Date(iso).toLocaleDateString()` : `new Date('2027-01-15')` se lit en UTC, et
 * rend la veille dans tout fuseau négatif (cf. lib/contrat.js, qui l'a déjà payé). Ici rien
 * n'est converti — on découpe la chaîne, donc la date affichée est celle qui est écrite.
 *
 * Tolérant à l'entrée : ISO avec ou sans heure, avec `T` ou espace. Une valeur vide rend une
 * chaîne vide plutôt qu'un « Invalid Date » — une date manquante ne doit pas crier.
 */
function morceaux(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(v));
  return m ? { a: m[1], mo: m[2], j: m[3], h: m[4], mi: m[5] } : null;
}

/**
 * Une date seule, au format français : « 01/08/2026 ».
 *
 * LA BARRE OBLIQUE, ET PAS LE TIRET. « 01-08-2026 » n'est le format d'aucun pays : ni l'ISO
 * (2026-08-01), ni le français (01/08/2026). L'école lisait donc des dates à deux formats selon
 * l'écran, et un troisième — l'ISO brut — là où un raccourci local court-circuitait ces
 * fonctions (`d10` sur la fiche stagiaire).
 */
export function dateFr(v) {
  const p = morceaux(v);
  return p ? `${p.j}/${p.mo}/${p.a}` : (v ? String(v) : "");
}

/** Date ET heure : « 01/08/2026 14:32 ». L'heure n'apparaît que si la valeur en porte une. */
export function dateHeure(v) {
  const p = morceaux(v);
  if (!p) return v ? String(v) : "";
  return `${p.j}/${p.mo}/${p.a}` + (p.h ? ` ${p.h}:${p.mi}` : "");
}

/**
 * « Four, 400 °C » → ["Four", "400 °C"] — une catégorie qui en contient plusieurs.
 *
 * POURQUOI UN SÉPARATEUR PLUTÔT QUE DES CHAMPS EN PLUS. Un four est « Four » ET « 400 °C » ET
 * « électrique » : combien de champs faudrait-il prévoir ? Trois, et le quatrième manquera. Une
 * seule ligne, des virgules, autant d'étiquettes que nécessaire — et rien à migrer, puisque la
 * colonne reste une chaîne de texte.
 *
 * LA VIRGULE, ET ELLE SEULE. Le point-virgule et la barre oblique se glissent naturellement dans
 * un libellé (« Bac 60/40 », « Pelle 33 cm ; manche court ») : les accepter comme séparateurs
 * couperait des catégories en deux au premier libellé qui en contient une. La virgule, elle,
 * n'apparaît pas dans les libellés de cet annuaire.
 *
 * UNE VALEUR SANS VIRGULE RESSORT TELLE QUELLE, en un seul élément : tout l'existant continue de
 * s'afficher exactement comme avant, sans reprise de données.
 */
export function listeCategories(v) {
  return String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/* DURÉES D'ÉVALUATION — une performance se saisit et se lit en minutes et secondes.
   La base, elle, ne stocke que des SECONDES : un seul nombre se compare, se trie et se
   compte sans ambiguïté, là où « 1:30 » demanderait d'être ré-analysé à chaque usage. */
export function secondesEnMinSec(total) {
  const s = Math.max(0, Math.round(Number(total) || 0));
  return { min: Math.floor(s / 60), sec: s % 60 };
}
export function minSecEnSecondes(min, sec) {
  return Math.max(0, Math.round(Number(min) || 0)) * 60 + Math.max(0, Math.round(Number(sec) || 0));
}
/**
 * Une durée saisie à la volée : « 90 », « 1:30 », « 1'30 », « 1m30 ». `null` = illisible.
 *
 * ON NE DEVINE PAS. Une saisie incomprise rend `null` plutôt qu'un nombre plausible : noter un
 * examen sur une durée mal interprétée est pire que ne pas la noter, et l'écran réaffiche ce
 * qu'il a COMPRIS pour que l'ambiguïté se voie tout de suite.
 */
export function lireDuree(txt) {
  const s = String(txt == null ? "" : txt).trim().replace(/\s+/g, "");
  if (!s) return null;
  const mm = /^(\d+)[:'m](\d{1,2})?$/i.exec(s);
  if (mm) return Number(mm[1]) * 60 + Number(mm[2] || 0);
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

/**
 * L'inverse, pour REMPLIR un champ de saisie : « 100 » → « 1:40 ».
 *
 * LA BASE STOCKE DES SECONDES, le formateur a tapé « 1:40 ». Réafficher « 100 » au rechargement
 * lui ferait relire sa propre saisie dans une autre unité — et douter de ce qu'il a noté.
 * Sous la minute, on garde le nombre nu : « 45 » se retape tel quel.
 */
export function dureeSaisissable(v) {
  if (v === "" || v === null || v === undefined) return "";
  const s = Number(v);
  if (!Number.isFinite(s)) return String(v);
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, "0")}` : String(s);
}

/** « 1 min 12 s » — même écriture que le serveur (api/lib/bareme.js). */
export function dureeLisible(total) {
  const { min, sec } = secondesEnMinSec(total);
  if (!min) return `${sec} s`;
  return sec ? `${min} min ${String(sec).padStart(2, "0")} s` : `${min} min`;
}

/**
 * TEXTE PRÊT POUR UNE RECHERCHE HUMAINE — minuscules, sans accents.
 *
 * LE DÉFAUT QUE ÇA CORRIGE, mesuré sur la carte des stagiaires le 2026-09-15 : taper
 * « herault » ne trouvait RIEN, « hérault » trouvait le département. Or personne ne tape les
 * accents dans un champ de recherche — et sur une carte de démarchage, la moitié des noms de
 * départements en portent : Hérault, Ardèche, Côte-d'Or, Finistère, Côtes-d'Armor.
 *
 * `NFD` sépare la lettre de son accent (« é » → « e » + ◌́), et l'on retire les diacritiques
 * restants. Le résultat se compare donc à la saisie la plus paresseuse.
 *
 * À EMPLOYER DES DEUX CÔTÉS : normaliser la saisie sans normaliser le texte cherché ne règle
 * que la moitié du problème — c'est « Hérault » qui porte l'accent, pas la requête.
 */
export function normaliseRecherche(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
