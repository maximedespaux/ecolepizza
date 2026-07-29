import { useEffect } from "react";

/**
 * Ferme au clavier — Échap.
 *
 * L'application compte une trentaine de modales et AUCUNE ne se fermait autrement qu'en
 * visant la croix ou le voile à la souris. Échap est le geste attendu partout ailleurs :
 * son absence se remarque surtout quand on a les mains sur le clavier, c'est-à-dire pendant
 * qu'on remplit le formulaire que la modale contient.
 *
 * Il n'existe pas de composant `Modal` partagé (chaque écran recopie `.overlay`/`.mhead`) —
 * ce hook est donc le plus petit dénominateur commun, à appeler dans chaque modale.
 *
 * `capture: true` : une modale ouverte PAR-DESSUS une autre reçoit l'évènement en premier et
 * l'arrête, de sorte qu'Échap ne referme jamais les deux d'un coup.
 */
export function useEchap(onClose, actif = true) {
  useEffect(() => {
    if (!actif || typeof onClose !== "function") return;
    const surTouche = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", surTouche, true);
    return () => window.removeEventListener("keydown", surTouche, true);
  }, [onClose, actif]);
}

export default useEchap;
