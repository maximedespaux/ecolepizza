/**
 * Les paliers de Pizza Quest, et le moment où on les fête.
 *
 * POURQUOI FÊTER. Terminer un chapitre affichait trois étoiles et refermait la fenêtre. Boucler
 * le DERNIER chapitre d'une formation faisait exactement la même chose — rien ne distinguait la
 * fin d'un monde d'un chapitre ordinaire, alors que c'est le seul instant du jeu qui se raconte.
 * Le cadre gagné à ce moment-là apparaissait, lui, sans un mot : on le découvrait dans le
 * sélecteur de profil, si on y passait.
 *
 * LA RÈGLE EST DUPLIQUÉE, ET C'EST ASSUMÉ. `src/api/lib/cadresQuest.js` fait autorité : c'est
 * lui qui décide de ce qu'un stagiaire POSSÈDE, et lui qui refuse un cadre non gagné. Ici on
 * recalcule la même chose pour une seule raison : fêter au bon moment, c'est-à-dire à l'instant
 * du clic, sans attendre un aller-retour serveur. Un `await` entre la dernière question et la
 * fête la ferait arriver après coup, quand le stagiaire est déjà reparti.
 * Les deux règles sont épinglées ensemble par `test/cadres-quest.test.js` : les faire diverger
 * casse le test, pas l'écran — ce qui est le but.
 *
 * ON NE FÊTE QU'UNE FOIS. La mémoire vit en `localStorage` : rejouer un chapitre pour améliorer
 * ses étoiles ne doit pas relancer la même fête, et un rechargement de page non plus. Perdre
 * cette mémoire (autre appareil, cache vidé) refait la fête une fois — c'est le bon sens de
 * l'échec : mieux vaut une fête en trop qu'un palier qui passe inaperçu.
 */

const CLE = "impasto.quest.fetes";

/** Le palier atteint sur un monde, ou null. Miroir de `palierDuMonde` (api/lib/cadresQuest.js). */
export function palierDuMonde(etoiles = {}, nbChapitres = 0) {
  // Zéro chapitre : rien à terminer, donc rien à fêter. Sans ça, une banque vide déclencherait
  // « Sans faute » (0 chapitre sur 0 à trois étoiles) dès l'ouverture de la formation.
  if (!nbChapitres) return null;
  const faits = Object.keys(etoiles).filter((k) => Number(etoiles[k]) > 0).length;
  const parfaits = Object.keys(etoiles).filter((k) => Number(etoiles[k]) >= 3).length;
  if (parfaits >= nbChapitres) return "qparfait";
  if (faits >= nbChapitres) return "qfini";
  // `Math.ceil` : sur 5 chapitres, la moitié c'est 3. On ne fête pas un palier avant qu'il ne
  // soit franchi — une fête en avance vide le mot de son sens.
  if (faits >= Math.ceil(nbChapitres / 2)) return "qdemi";
  return null;
}

/** Ce qu'on annonce, par palier. Le ton monte avec la rareté. */
export const FETES = {
  qdemi: {
    titre: "À mi-chemin !",
    texte: (m) => `La moitié des chapitres de « ${m} » sont derrière toi.`,
    cadre: "Sur la voie",
  },
  qfini: {
    titre: "Monde bouclé !",
    texte: (m) => `Tu as terminé tous les chapitres de « ${m} ».`,
    cadre: "Monde bouclé",
  },
  qparfait: {
    titre: "Sans faute !",
    texte: (m) => `Tous les chapitres de « ${m} » à trois étoiles. Personne ne fait mieux.`,
    cadre: "Sans faute",
  },
};

const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; } };
const ecrire = (v) => { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch { /* navigation privée */ } };

/** Ce palier a-t-il déjà été fêté sur ce monde ? */
export const dejaFete = (code, palier) => lire()[`${code}:${palier}`] === true;

/** Mémorise qu'il l'a été. */
export function marquerFete(code, palier) {
  const v = lire(); v[`${code}:${palier}`] = true; ecrire(v);
}

/**
 * Le palier à fêter maintenant, ou null.
 *
 * `avant` / `apres` sont les progressions du monde de part et d'autre du chapitre validé. On
 * compare les DEUX plutôt que de regarder `apres` seul : sinon chaque chapitre terminé après le
 * palier le refêterait. Et on croise avec la mémoire, pour le cas où l'état d'avant a été perdu.
 */
export function paliersFranchis(code, avant, apres, nbChapitres) {
  const a = palierDuMonde(avant, nbChapitres);
  const b = palierDuMonde(apres, nbChapitres);
  if (!b || a === b) return null;
  return dejaFete(code, b) ? null : b;
}
