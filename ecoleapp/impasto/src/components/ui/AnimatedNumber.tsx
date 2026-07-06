"use client";
import { useEffect, useRef, useState } from "react";

// Compteur qui « monte » en douceur vers sa valeur (easing cubic).
export default function AnimatedNumber({ value, duration = 900 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const startVal = from.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(startVal + (value - startVal) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{n}</>;
}
