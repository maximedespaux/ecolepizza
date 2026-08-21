/**
 * Dock collant des assistants (mobile uniquement — masqué en CSS au-delà de 820px).
 *
 * Pourquoi : sous 820px, `.wiz-layout` passe en une colonne et la colonne « résultat » part
 * sous le pli. Le stagiaire réglait donc son hydratation (ou sa garniture) sans jamais voir
 * ce que ça donne. Le dock garde le visuel + le chiffre clé sous les yeux, et renvoie au
 * panneau complet d'un tap.
 */

import { Icon } from "./Icon.jsx";

export default function WizDock({ visual, title, sub, target = "wiz-result" }) {
  const open = () => {
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <button type="button" className="wiz-dock" onClick={open} aria-label={`${title}, voir le détail`}>
      {visual && <span className="wiz-dock-v" aria-hidden="true">{visual}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="wiz-dock-t">{title}</span>
        {sub && <span className="wiz-dock-s">{sub}</span>}
      </span>
      <Icon name="chevron-down" size={16} style={{ opacity: 0.7, flexShrink: 0 }} />
    </button>
  );
}
