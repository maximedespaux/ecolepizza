import { useState } from "react";

/** Petit « ? » avec une infobulle affichée au survol ou au clic. */
function HelpDot({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`help-dot${open ? " open" : ""}`}
      tabIndex={0}
      role="button"
      aria-label="Aide"
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      onBlur={() => setOpen(false)}
    >
      ?
      <span className="tip">{text}</span>
    </span>
  );
}

export default HelpDot;
