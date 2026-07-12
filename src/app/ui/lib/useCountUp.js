import { useEffect, useRef, useState } from "react";

/**
 * Anime un nombre de 0 → `value` (easeOutCubic).
 * Respecte prefers-reduced-motion : affiche directement la valeur finale.
 */
export function useCountUp(value, { duration = 900 } = {}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef();

  useEffect(() => {
    const target = Number(value) || 0;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || target === 0) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return display;
}

export default useCountUp;
