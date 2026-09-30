/**
 * LES MÉMOS DU PERSONNEL — ce que l'écran calcule seul (demandé le 2026-09-22).
 *
 * Du JavaScript pur, sans JSX : les tests de `src/api/test` l'importent. Le serveur décide de ce
 * qu'on voit et de ce qu'on peut faire (controllers/memo.controller.js) ; ici, seulement comment on
 * le dit — « aujourd'hui », « en retard de 3 jours » — et dans quel ordre.
 */

/** Les rôles qui ont des mémos : ceux de la route (`STAFF_ROLES`), un test tient les deux égaux.
 *  Le bouton ne s'affiche pas aux autres — l'auditeur verrait sinon un bouton qui répond 403. */
export const ROLES_MEMO = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"];

/** La borne du serveur (lib/memos.js, colonne de la migration 176). */
export const MAX_TEXTE = 1000;

/**
 * CE QU'UN MÉMO PEUT DÉSIGNER (migration 177) — la même liste que le serveur, tenue par un test.
 *
 * `@` trouve QUI : un stagiaire, une entreprise, un membre de l'équipe. `#` trouve QUOI : une
 * session, un partenaire, une facture. `lien` dit où mène la puce ; `null` quand il n'y a nulle part
 * où aller — un MEMBRE mentionné n'est pas une fiche à ouvrir, c'est quelqu'un qu'on prévient, et
 * l'annuaire de l'équipe n'est ouvert qu'au responsable.
 *
 * Le partenaire et la facture mènent à leur LISTE, faute de page par fiche : c'est déjà le chemin
 * le plus court vers la bonne ligne, et cela ne promet pas une page qui n'existe pas.
 */
export const TYPES_LIEN = {
  stagiaire: { genre: "@", icone: "user", mot: "Stagiaire", lien: (id) => `/stagiaires/${id}` },
  entreprise: { genre: "@", icone: "building", mot: "Entreprise", lien: (id) => `/entreprises/${id}` },
  membre: { genre: "@", icone: "users", mot: "Équipe", lien: null },
  session: { genre: "#", icone: "calendar", mot: "Session", lien: (id) => `/sessions/${id}` },
  partenaire: { genre: "#", icone: "handshake", mot: "Partenaire", lien: () => "/partenaires" },
  facture: { genre: "#", icone: "receipt", mot: "Facture", lien: () => "/factures" },
};
export const GENRES = ["@", "#"];

/**
 * LA MENTION EN COURS DE FRAPPE : `{ genre, requete, debut }`, ou `null`.
 *
 * On ne regarde QUE ce qui précède le curseur, et on s'arrête au premier espace : « @cam » cherche,
 * « @Camille BERGER » ne cherche plus — sinon le choix fait, la liste se rouvrirait à chaque mot.
 * Un @ collé à un mot (« jean@exemple.fr ») n'ouvre rien : il lui faut un début de champ ou une
 * espace devant, faute de quoi toute adresse e-mail déclencherait la recherche.
 */
export function mentionEnCours(texte, curseur) {
  const avant = String(texte || "").slice(0, curseur ?? (texte || "").length);
  const m = /(^|\s)([@#])([^\s@#]*)$/.exec(avant);
  if (!m) return null;
  return { genre: m[2], requete: m[3], debut: avant.length - m[3].length - 1 };
}

/**
 * Le texte où la mention en cours est remplacée par le libellé choisi, et le curseur qui suit.
 *
 * UNE ESPACE APRÈS LE NOM, SAUF SI LA PHRASE EN A DÉJÀ UNE : choisir au milieu d'un mémo écrivait
 * sinon « @Camille BERGER  demain », avec deux espaces. Le curseur repart dans les deux cas APRÈS
 * l'espace, pour qu'on continue la phrase sans la couper en deux.
 */
export function insererMention(texte, mention, libelle) {
  const avant = String(texte || "").slice(0, mention.debut);
  const apres = String(texte || "").slice(mention.debut + 1 + mention.requete.length);
  const espace = /^\s/.test(apres) ? "" : " ";
  const pose = `${mention.genre}${libelle}${espace}`;
  return { texte: `${avant}${pose}${apres}`, curseur: (avant + pose).length + (espace ? 0 : 1) };
}

/**
 * UNE PUCE : une espace ou une tabulation, puis « * », « - » ou « \u2022 », puis le texte.
 *
 * L'ÉCOLE ÉCRIT SES LISTES COMME ELLE LES ÉCRIT SUR PAPIER — « * 1 », « - 2 » —, et le mémo doit
 * les reconnaître telles quelles. Ce n'est PAS du Markdown : il n'y a ni gras, ni titre, ni lien.
 * Une seule forme, celle qu'on tape sans y penser, et rien d'autre à apprendre.
 * Le texte APRÈS la marque est facultatif : une puce qu'on vient d'ouvrir n'a pas encore de texte.
 */
const PUCE = /^([ \t]*)([*\u2022-])(?:[ \t]+(.*))?$/;

/**
 * LE TEXTE D'UN MÉMO DÉCOUPÉ POUR L'AFFICHAGE : une suite de blocs, `{ type: "puces", items }` ou
 * `{ type: "texte", lignes }`.
 *
 * POURQUOI DÉCOUPER PLUTÔT QUE RENDRE LE TEXTE TEL QUEL. « Il faut faire : » suivi de deux lignes
 * à puces s'affichait sur une seule ligne, les marques au milieu de la phrase — la liste ne se
 * lisait plus comme une liste. Les puces consécutives forment donc UN bloc, rendu en vraie liste :
 * les lecteurs d'écran l'annoncent comme telle, et l'alignement tient quand une ligne se replie.
 *
 * TOUT LE RESTE EST RENDU MOT POUR MOT, retours à la ligne compris. On n'interprète rien d'autre :
 * un mémo est ce qu'on a tapé.
 */
export function blocsMemo(texte) {
  const blocs = [];
  for (const ligne of String(texte == null ? "" : texte).split("\n")) {
    const p = PUCE.exec(ligne);
    const dernier = blocs[blocs.length - 1];
    if (p) {
      const item = (p[3] || "").trim();
      if (dernier && dernier.type === "puces") dernier.items.push(item);
      else blocs.push({ type: "puces", items: [item] });
    } else if (dernier && dernier.type === "texte") dernier.lignes.push(ligne);
    else blocs.push({ type: "texte", lignes: [ligne] });
  }
  return blocs;
}

/**
 * CE QUE MAJ + ENTRÉE ÉCRIT : `{ texte, curseur }`.
 *
 * Une ligne de plus, et la PUCE CONTINUE toute seule quand on en écrivait une — sinon il faudrait
 * retaper « * » à chaque ligne d'une liste, ce que personne ne fait deux fois.
 *
 * ET UNE PUCE VIDE FERME LA LISTE. C'est le geste par lequel on en sort : on va à la ligne une
 * fois de trop, la marque s'efface, et la phrase suivante repart au bord. Sans cela, la liste se
 * poursuivrait indéfiniment et il faudrait effacer la marque à la main — deux retours en arrière
 * dont on ne devine ni l'un ni l'autre.
 */
export function continuerPuce(texte, curseur) {
  const t = String(texte == null ? "" : texte);
  const c = Math.max(0, Math.min(curseur == null ? t.length : curseur, t.length));
  const debut = t.lastIndexOf("\n", c - 1) + 1;
  const p = PUCE.exec(t.slice(debut, c));
  if (p && !(p[3] || "").trim()) return { texte: t.slice(0, debut) + t.slice(c), curseur: debut };
  const pose = p ? `\n${p[1]}${p[2]} ` : "\n";
  return { texte: t.slice(0, c) + pose + t.slice(c), curseur: c + pose.length };
}

/**
 * Le mémo en UNE ligne, sans ses marques de puce : ce qu'on met dans un `aria-label` ou une
 * info-bulle. « Supprimer : Il faut faire : * 1 » se lit mal, et un lecteur d'écran annoncerait
 * des étoiles au milieu d'une phrase.
 */
export function resumeMemo(texte) {
  return String(texte == null ? "" : texte)
    .split("\n")
    .map((l) => l.replace(PUCE, "$3"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const pad = (n) => String(n).padStart(2, "0");
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Aujourd'hui en AAAA-MM-JJ, dans le fuseau du navigateur — celui de l'école. */
export function aujourdhui(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* Les jours se comptent sur des dates UTC : un changement d'heure au milieu ne fait pas d'une
   différence de 3 jours un « 2,96 » arrondi de travers. */
const utc = (iso) => {
  const [a, m, j] = String(iso).split("-").map(Number);
  return Date.UTC(a, m - 1, j);
};
const ecartJours = (de, a) => Math.round((utc(a) - utc(de)) / 86400000);

/**
 * L'échéance dite comme on la dit : `{ ton, libelle }`, ou `null` sans échéance.
 *   · `retard` — passée : « hier », « en retard de 3 jours » ;
 *   · `jour`   — aujourd'hui ;
 *   · `proche` — dans la semaine : « demain », « vendredi » ;
 *   · `plus`   — au-delà : « 5 oct. », l'année en plus si ce n'est pas celle-ci.
 * `retard` et `jour` sont exactement ce que compte le bouton de la barre du haut.
 */
export function etatEcheance(echeance, jour = aujourdhui()) {
  if (!echeance) return null;
  const n = ecartJours(jour, echeance);
  if (n < 0) return { ton: "retard", libelle: n === -1 ? "hier" : `en retard de ${-n} jours` };
  if (n === 0) return { ton: "jour", libelle: "aujourd’hui" };
  if (n === 1) return { ton: "proche", libelle: "demain" };
  const d = new Date(utc(echeance));
  if (n < 7) return { ton: "proche", libelle: JOURS[d.getUTCDay()] };
  const annee = d.getUTCFullYear() !== Number(String(jour).slice(0, 4)) ? ` ${d.getUTCFullYear()}` : "";
  return { ton: "plus", libelle: `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}${annee}` };
}

/** Échu ou dû aujourd'hui, et pas encore fait : ce que compte le bouton du haut. */
export const estDu = (m, jour = aujourdhui()) => !m.fait_le && !!m.echeance && m.echeance <= jour;

/**
 * L'ordre de la liste : À FAIRE d'abord — l'échéance la plus proche en tête (les retards ouvrent
 * donc la liste), les mémos sans échéance ensuite, du plus récent au plus ancien — puis les FAITS,
 * le dernier coché en premier. Le serveur trie déjà ainsi ; l'écran retrie après chaque geste pour
 * ne pas attendre sa réponse.
 */
export function trierMemos(liste) {
  const cle = (m) => [m.fait_le ? 1 : 0, m.fait_le ? 0 : (m.echeance ? 0 : 1), m.fait_le ? "" : (m.echeance || "")];
  return [...(liste || [])].sort((a, b) => {
    const [fa, ea, da] = cle(a);
    const [fb, eb, db] = cle(b);
    if (fa !== fb) return fa - fb;
    /* CE QU'ON VIENT DE ME CONFIER PASSE DEVANT : la pastille du bouton annonce ces mémos-là, et
       c'est eux qu'on cherche en ouvrant le panneau. Ils n'ont pas forcément d'échéance. */
    if (!fa && !!a.nouveau !== !!b.nouveau) return a.nouveau ? -1 : 1;
    if (fa) return String(b.fait_le).localeCompare(String(a.fait_le));
    if (ea !== eb) return ea - eb;
    if (da !== db) return da.localeCompare(db);
    return String(b.cree_le || "").localeCompare(String(a.cree_le || ""));
  });
}

/* ── LES PIÈCES JOINTES (migration 193, demandées le 2026-09-30) ─────────────────────────────────
 * Deux au plus par mémo : une image — collée depuis le presse-papiers, ou choisie — ou un PDF. Les
 * plafonds sont ceux du SERVEUR (src/api/lib/memoFichiers.js), qui revérifie tout dans les octets :
 * ici, on ne fait que le dire AVANT l'envoi, pour ne pas écrire un mémo et le voir refusé. Un test
 * tient les deux côtés d'accord. */
export const MAX_FICHIERS = 2;
export const MAX_IMAGE_KO = 1024;
export const MAX_PDF_MO = 5;

/** « image », « pdf », ou `null` : ce qu'un mémo sait joindre, d'après le type que le navigateur annonce. */
export function genreFichier(type) {
  const t = String(type || "").toLowerCase();
  if (t === "application/pdf") return "pdf";
  // gif et bmp sont réencodés en WebP par la réduction (lib/image.js) ; un HEIC ne l'est pas.
  return /^image\/(jpeg|png|webp|gif|bmp)$/.test(t) ? "image" : null;
}

/**
 * Pourquoi ce fichier ne peut pas partir, ou `null`. À lire sur ce qui PARTIRA : l'image déjà
 * réduite. Une image que la réduction n'a pas su convertir (elle rend alors le fichier d'origine)
 * serait refusée par le serveur, qui n'accepte que JPEG, PNG et WebP — autant le dire ici.
 */
export function refusDeFichier(blob) {
  const genre = genreFichier(blob && blob.type);
  if (!genre) return "Pièce jointe refusée : une image ou un PDF.";
  if (genre === "pdf") return blob.size > MAX_PDF_MO * 1024 * 1024 ? `PDF trop lourd : ${MAX_PDF_MO} Mo au plus.` : null;
  if (!/^image\/(jpeg|png|webp)$/i.test(blob.type)) return "Cette image n'a pas pu être convertie : enregistrez-la en JPEG ou en PNG.";
  return blob.size > MAX_IMAGE_KO * 1024 ? "Image trop lourde, même réduite : 1 Mo au plus." : null;
}

/** « 340 Ko », « 1,2 Mo » : le poids d'une pièce, comme on le dit. */
export function poidsLisible(octets) {
  const n = Number(octets) || 0;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}\u00a0Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")}\u00a0Mo`;
}

/**
 * CE QU'UN COLLAGE APPORTE À JOINDRE — les fichiers du presse-papiers, SAUF s'il porte du texte.
 *
 * Copier trois cellules d'un tableur, ou une phrase d'un traitement de texte, pose dans le
 * presse-papiers le texte ET une IMAGE de ce texte. Coller doit alors écrire la phrase, pas joindre
 * sa photo. Une capture d'écran, elle, n'apporte que l'image : c'est elle qu'on joint.
 */
export function fichiersColles(presse) {
  if (!presse) return [];
  const texte = typeof presse.getData === "function" ? presse.getData("text/plain") : "";
  if (texte && texte.trim()) return [];
  return [...(presse.files || [])].filter((f) => genreFichier(f.type));
}
