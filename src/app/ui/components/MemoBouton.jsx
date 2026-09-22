import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserContext } from "../context/UserContext.jsx";
import { getMemosCompte } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import { onMemosChange } from "../lib/events.js";
import { ROLES_MEMO } from "../lib/memos.js";
import { Icon } from "./Icon.jsx";
import MemoListe from "./MemoListe.jsx";

/**
 * LE MÉMO DANS LA BARRE DU HAUT, à côté de la cloche (demandé le 2026-09-22).
 *
 * LE CHIFFRE EST CELUI QUI APPELLE UN GESTE : les mémos échus ou dus AUJOURD'HUI, pas le nombre de
 * lignes de la liste. Un compteur qui ne descend jamais cesse d'être lu — c'est la règle déjà suivie
 * par la cloche, où une alerte appelle une action.
 *
 * LE PANNEAU PASSE PAR UN PORTAIL. La barre porte un `backdrop-filter`, et un descendant en
 * `position: fixed` s'y accroche au lieu de l'écran (même piège que la fenêtre de signature, cf.
 * SignatureModal). Rendu dans `document.body`, il se place d'après le bouton — et en pleine largeur
 * sous 560 px, où un panneau de 380 px déborderait.
 *
 * IL NE SE FERME PAS AU DÉFILEMENT, à la différence des menus d'action : on y écrit, et la liste
 * défile à l'intérieur. Un clic à l'extérieur ou Échap le ferment.
 */
const LARGE = 560;

export default function MemoBouton() {
  const { user } = useContext(UserContext);
  const autorise = ROLES_MEMO.includes(user?.role);
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState(null);
  const [echus, setEchus] = useState(0);
  const refBouton = useRef(null);
  const refPanneau = useRef(null);

  const compter = () => getMemosCompte()
    .then((r) => setEchus(Number(r?.data?.echus) || 0))
    .catch(() => { /* silencieux : un compteur ne doit pas casser la barre */ });
  useEffect(() => { if (autorise) compter(); }, [autorise]);
  useEffect(() => (autorise ? onMemosChange(compter) : undefined), [autorise]);
  useAutoRefresh(compter, { interval: 60000, enabled: autorise });

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => {
      if (refBouton.current?.contains(e.target)) return;
      if (refPanneau.current?.contains(e.target)) return;
      setOuvert(false);
    };
    const clavier = (e) => { if (e.key === "Escape") setOuvert(false); };
    const replacer = () => setPos(placer(refBouton.current));
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", clavier);
    window.addEventListener("resize", replacer);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", clavier);
      window.removeEventListener("resize", replacer);
    };
  }, [ouvert]);

  if (!autorise) return null;

  return (
    <>
      <button
        ref={refBouton}
        className="icon-btn"
        style={{ position: "relative" }}
        onClick={() => { if (ouvert) { setOuvert(false); return; } setPos(placer(refBouton.current)); setOuvert(true); }}
        title="Mémo"
        aria-label={echus > 0 ? `Mémo (${echus} à faire aujourd'hui ou en retard)` : "Mémo"}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
      >
        <Icon name="list-checks" size={18} />
        {echus > 0 && <span className="notif-dot">{echus > 9 ? "9+" : echus}</span>}
      </button>

      {ouvert && pos && createPortal(
        <div ref={refPanneau} className="memo-panneau" role="dialog" aria-label="Mémo" style={pos}>
          <div className="memo-panneau-tete">
            <b><Icon name="list-checks" size={15} aria-hidden="true" /> Mémo</b>
            <button className="x" onClick={() => setOuvert(false)} aria-label="Fermer"><Icon name="x" size={15} /></button>
          </div>
          <div className="memo-panneau-corps"><MemoListe autoFocus /></div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* Sous le bouton, aligné à droite sur lui. En pleine largeur sur un écran étroit. */
function placer(bouton) {
  const r = bouton?.getBoundingClientRect();
  if (!r) return null;
  const haut = Math.round(r.bottom + 8);
  if (window.innerWidth <= LARGE) return { top: haut, left: 8, right: 8 };
  return { top: haut, right: Math.max(8, Math.round(window.innerWidth - r.right)) };
}
