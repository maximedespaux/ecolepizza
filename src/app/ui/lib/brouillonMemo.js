/**
 * LE MÉMO EN COURS D'ÉCRITURE — gardé jusqu'à ce qu'on l'envoie ou qu'on l'efface (2026-09-30).
 *
 * LE DÉFAUT : ce qu'on écrivait vivait DANS le panneau. Le fermer — la croix, Échap, un clic à
 * côté pour aller lire un numéro sur la page — jetait le panneau, et le mémo avec : on le rouvrait
 * vide. La carte du tableau de bord faisait pareil en changeant de page.
 *
 * Le brouillon vit donc ICI, hors de tout écran : un seul, que le panneau et la carte lisent tous
 * deux (« la même liste à deux endroits »). Il tient :
 *   · à la FERMETURE du panneau et au changement de page : la mémoire du module ;
 *   · au RECHARGEMENT de la page : `sessionStorage`, pour le texte, les liens, l'échéance et le
 *     partage. Propre à l'onglet, il part avec lui ;
 *   · jusqu'à l'ENVOI, ou jusqu'à ce qu'on l'EFFACE.
 *
 * CE QUI N'Y EST PAS GRAVÉ : LES FICHIERS JOINTS. Des octets n'ont rien à faire dans
 * `sessionStorage` (quelques Mo au plus, en texte). Ils restent en mémoire : ils tiennent à la
 * fermeture du panneau, pas au rechargement — et l'écran n'en montre alors aucun.
 *
 * UN BROUILLON EST CELUI D'UN COMPTE. C'est une note privée : il est gravé avec l'identifiant de son
 * auteur, n'est relu que par lui, et s'efface à la déconnexion (`oublierBrouillon`, UserContext). Sur
 * un poste partagé, le compte suivant ne doit pas trouver le pense-bête du précédent.
 *
 * Pur, sans React : `useSyncExternalStore` s'y abonne (MemoListe), et brouillon-memo.test.js
 * l'éprouve avec un faux `sessionStorage`.
 */
import { MAX_TEXTE } from "./memos.js";

const CLE = "impastio:memo-brouillon";
const VIDE = Object.freeze({ texte: "", liens: Object.freeze([]), echeance: "", partage: false, fichiers: Object.freeze([]) });

let proprietaire;        // le compte dont on tient le brouillon — `undefined` tant qu'on n'a rien lu
let brouillon = VIDE;
const abonnes = new Set();

/* `sessionStorage` peut manquer (navigation privée stricte, test) ou refuser : le brouillon tient
   alors en mémoire seulement, ce qui reste mieux que de le perdre à chaque fermeture. */
function reserve() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

export const brouillonVide = (b) => !b.texte && !b.liens.length && !b.echeance && !b.partage && !b.fichiers.length;

function graver() {
  const r = reserve();
  if (!r) return;
  try {
    const { texte, liens, echeance, partage } = brouillon;
    if (!proprietaire || (!texte && !liens.length && !echeance && !partage)) r.removeItem(CLE);
    else r.setItem(CLE, JSON.stringify({ uid: proprietaire, texte, liens, echeance, partage }));
  } catch { /* quota, réserve fermée : la mémoire garde le brouillon */ }
}

/* Ce qui est gravé pour CE compte, remis en forme : on ne fait pas confiance à ce qu'on relit. */
function relire(uid) {
  const r = reserve();
  if (!r || !uid) return VIDE;
  try {
    const lu = JSON.parse(r.getItem(CLE) || "null");
    if (!lu || typeof lu !== "object") return VIDE;
    // Le brouillon d'un AUTRE compte : il ne s'affiche pas, et il ne reste pas.
    if (lu.uid !== uid) { r.removeItem(CLE); return VIDE; }
    const liens = (Array.isArray(lu.liens) ? lu.liens : [])
      .filter((l) => l && typeof l.type === "string" && typeof l.id === "string" && typeof l.libelle === "string")
      .map((l) => ({ type: l.type, id: l.id, libelle: l.libelle }));
    return {
      texte: typeof lu.texte === "string" ? lu.texte.slice(0, MAX_TEXTE) : "",
      liens,
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(lu.echeance) ? lu.echeance : "",
      partage: lu.partage === true,
      fichiers: VIDE.fichiers,
    };
  } catch { return VIDE; }
}

function prevenir() { for (const f of [...abonnes]) f(); }
const liberer = (fichiers) => {
  for (const f of fichiers) { if (f.apercu && typeof URL !== "undefined" && URL.revokeObjectURL) URL.revokeObjectURL(f.apercu); }
};

/** Le brouillon de ce compte. Lu une fois, puis rendu tel quel tant que rien ne change. */
export function lireBrouillon(uid = null) {
  if (uid !== proprietaire) {
    liberer(brouillon.fichiers);
    proprietaire = uid;
    brouillon = relire(uid);
  }
  return brouillon;
}

export function abonnerBrouillon(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** Change une part du brouillon (`{ texte }`, `{ liens }`, `{ fichiers }`…), grave, et prévient les écrans. */
export function ecrireBrouillon(patch) {
  const suivant = { ...brouillon, ...patch };
  brouillon = brouillonVide(suivant) ? VIDE : suivant;
  graver();
  prevenir();
}

/** Envoyé, ou effacé : il ne reste rien, ni en mémoire ni dans la réserve. */
export function viderBrouillon() {
  liberer(brouillon.fichiers);
  brouillon = VIDE;
  graver();
  prevenir();
}

/** À la DÉCONNEXION : le brouillon part, et le compte suivant relira le sien. */
export function oublierBrouillon() {
  liberer(brouillon.fichiers);
  brouillon = VIDE;
  proprietaire = undefined;
  const r = reserve();
  try { if (r) r.removeItem(CLE); } catch { /* rien à retirer */ }
  prevenir();
}
