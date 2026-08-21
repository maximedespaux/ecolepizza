import { useEffect, useRef } from "react";
import { subscribeRealtime } from "./realtime.js";

/**
 * Rafraîchit automatiquement des données sans action manuelle :
 *   - en TEMPS RÉEL, dès que le serveur signale un changement (SSE) ;
 *   - dès que l'utilisateur revient sur l'onglet/la fenêtre (focus / visibilité) ;
 *   - périodiquement (intervalle de secours), seulement si l'onglet est visible.
 * `fn` peut changer à chaque rendu (appelée via ref, pas besoin de la mémoïser).
 * Ne déclenche PAS au montage : le composant fait déjà son chargement initial.
 */
export function useAutoRefresh(fn, { interval = 60000, enabled = true } = {}) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    const runIfVisible = () => { if (document.visibilityState !== "hidden") ref.current && ref.current(); };
    const onBack = () => { if (document.visibilityState === "visible") ref.current && ref.current(); };
    const id = interval ? setInterval(runIfVisible, interval) : null;
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    const offRealtime = subscribeRealtime(runIfVisible); // push instantané (SSE)
    return () => {
      if (id) clearInterval(id);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
      offRealtime();
    };
  }, [interval, enabled]);
}
