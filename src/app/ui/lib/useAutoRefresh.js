import { useEffect, useRef } from "react";

/**
 * Rafraîchit automatiquement des données sans action manuelle :
 *   - périodiquement (intervalle) — mais seulement si l'onglet est visible ;
 *   - dès que l'utilisateur revient sur l'onglet/la fenêtre (focus / visibilité).
 * `fn` peut changer à chaque rendu (appelée via ref, pas besoin de la mémoïser).
 * Ne déclenche PAS au montage : le composant fait déjà son chargement initial.
 */
export function useAutoRefresh(fn, { interval = 30000, enabled = true } = {}) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    const runIfVisible = () => { if (document.visibilityState !== "hidden") ref.current && ref.current(); };
    const onBack = () => { if (document.visibilityState === "visible") ref.current && ref.current(); };
    const id = interval ? setInterval(runIfVisible, interval) : null;
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      if (id) clearInterval(id);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [interval, enabled]);
}
