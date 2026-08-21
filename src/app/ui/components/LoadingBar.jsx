import { useEffect, useState } from "react";
import { onLoadingChange } from "../lib/loading.js";

/** Barre de chargement globale : visible dès qu'une requête est en cours. */
function LoadingBar() {
  const [active, setActive] = useState(0);
  useEffect(() => onLoadingChange((e) => setActive(e.detail)), []);
  return (
    <div className={"loadbar" + (active > 0 ? " on" : "")} aria-hidden>
      <span />
    </div>
  );
}

export default LoadingBar;
