import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";

/**
 * Message d'état — une BANDE flottante en haut de l'écran (plus dans le flux de la page).
 *
 * La confirmation (« Stagiaire créé », en vert) ou l'erreur (en rouge) montait jadis dans la page,
 * sous l'en-tête : elle décalait le contenu, et restait là jusqu'au rechargement. Elle s'affiche
 * désormais en bande fixée en haut de l'écran, qui :
 *   · s'efface SEULE après un délai (le « cooldown ») — succès bref, erreur plus longue (on la lit) ;
 *   · porte une CROIX pour la fermer tout de suite ;
 *   · se met en pause tant que la souris est dessus (le temps de lire).
 *
 * `status` : { type: "success" | "error" | "info", message: string } | null. `info` reste jusqu'à
 * la croix (guidance, « Enregistré sauf… ») : il ne s'efface pas seul — on ne devine pas le temps
 * qu'il faut pour le lire et agir.
 *
 * `inline` : rendu DANS LE FLUX (sans bande, sans disparition), pour un « Chargement… » qui occupe
 * la page (EntrepriseDetail en renvoie un à la place du contenu tant que les données arrivent). Le
 * défaut est la bande flottante.
 */
const DUREES = { ok: 4000, err: 7000, info: 0 }; // ms ; 0 = reste jusqu'à la croix

function StatusMessage({ status, inline = false }) {
  const type = status && status.type === "error" ? "err" : status && status.type === "info" ? "info" : "ok";
  const [visible, setVisible] = useState(false);
  const minuteur = useRef(null);
  const stop = () => { clearTimeout(minuteur.current); minuteur.current = null; };
  const relancer = () => { stop(); if (!inline && DUREES[type]) minuteur.current = setTimeout(() => setVisible(false), DUREES[type]); };

  /* Réapparaît à CHAQUE nouveau message : `status` reçoit un objet NEUF à chaque appel de setStatus,
     donc son identité change même pour deux messages identiques de suite — et le minuteur repart. */
  useEffect(() => {
    if (!status) { setVisible(false); return stop; }
    setVisible(true);
    relancer();
    return stop;
  }, [status, type, inline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status) return null;
  const role = type === "err" ? "alert" : "status";
  const live = type === "err" ? "assertive" : "polite";

  // Placeholder dans le flux (« Chargement… » qui occupe la page) : rendu d'origine, sans bande.
  if (inline) return <div className={`status ${type}`} role={role} aria-live={live}>{status.message}</div>;

  if (!visible) return null;
  return (
    <div className="status-bande-zone">
      <div className={`status-bande ${type}`} role={role} aria-live={live} onMouseEnter={stop} onMouseLeave={relancer}>
        <span className="status-bande-txt">{status.message}</span>
        <button type="button" className="status-bande-x" aria-label="Fermer le message" onClick={() => { stop(); setVisible(false); }}>
          <Icon name="x" size={15} />
        </button>
      </div>
    </div>
  );
}

export default StatusMessage;
