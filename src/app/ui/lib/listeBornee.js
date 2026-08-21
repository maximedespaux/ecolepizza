import { useEffect, useState } from "react";

/**
 * Combien de lignes une liste rend d'un coup.
 *
 * Deux pages affichaient l'INTÉGRALITÉ de leur table : 1 069 fiches sur /stagiaires
 * (19 681 nœuds, 74 écrans), 469 lignes sur /entreprises (49 écrans). Dans les deux cas
 * le métier cherche UN enregistrement — personne ne lit mille fiches. Cinquante suffisent
 * à voir qu'on a trouvé, ou qu'il faut préciser.
 */
export const PAS = 50;

/**
 * Borne le rendu d'une liste, et REMET LE COMPTEUR À ZÉRO quand la recherche change.
 *
 * Ce retour en arrière est la partie subtile, et la raison d'être de ce fichier : sans lui,
 * avoir déplié trois fois laisse le seuil à deux cents pour TOUTES les recherches suivantes.
 * On récupère alors la lenteur qu'on venait d'éliminer, sans jamais l'avoir demandé — et le
 * défaut ne se voit pas, puisque la page reste juste. Écrit une fois ici plutôt que recopié
 * dans chaque page : deux listes qui ont le même défaut doivent partager la correction,
 * sinon la seconde régressera le jour où l'on oubliera qu'elle existe.
 *
 * @param {number} total  nombre d'éléments après filtrage
 * @param {string} cle    ce qui doit tout remettre à zéro (recherche + filtres, concaténés)
 */
export function useListeBornee(total, cle) {
  const [max, setMax] = useState(PAS);
  useEffect(() => { setMax(PAS); }, [cle]);
  return {
    max,
    borne: total > max,                       // la liste est-elle tronquée ?
    reste: Math.max(0, total - max),
    plus: () => setMax((m) => m + PAS),
  };
}
