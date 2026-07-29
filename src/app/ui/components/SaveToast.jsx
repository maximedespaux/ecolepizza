import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";

/**
 * Confirmation d'enregistrement — la célébration qui manquait.
 *
 * Les trois assistants (empâtement, garniture, réalisation) enregistraient EN SILENCE : ni
 * succès, ni erreur. On cliquait « Enregistrer », rien ne bougeait, et le réflexe était de
 * recliquer — donc de créer un doublon.
 *
 * Volontairement sobre : une pastille qui monte, une coche qui se trace, et elle s'en va.
 * Pas de confettis — le stagiaire enregistre une fiche, il ne gagne pas un niveau.
 *
 * `signal` : un compteur (ou un horodatage) qui CHANGE à chaque enregistrement réussi.
 * On n'utilise pas un booléen : deux enregistrements de suite ne rejoueraient pas l'animation.
 */
export default function SaveToast({ signal, label = "Enregistré", tone = "ok", duration = 2600 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!signal) return;            // 0 / null = aucun enregistrement encore fait
    setVisible(true);
    const t = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(t);
  }, [signal, duration]);

  if (!visible) return null;
  return (
    <div className={`save-toast ${tone}`} role="status" aria-live="polite">
      <span className="save-toast-ic">
        <Icon name={tone === "ok" ? "check" : "alert-triangle"} size={17} strokeWidth={3} />
      </span>
      {label}
    </div>
  );
}
