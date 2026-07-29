import { INDIRECT_WMIN } from "../lib/dough.js";

/**
 * Jauge de force W — la bande d'usages sous le curseur.
 *
 * Le curseur W était un `range` nu bordé de deux nombres : on déplaçait une valeur sans voir
 * ce qu'elle CHANGE. Or W est un choix de méthode avant d'être un chiffre — sous 320, les
 * indirects (biga, poolish) sont hors de portée, et c'est invisible tant qu'on ne l'a pas
 * essayé. La bande montre les quatre familles d'usage et marque ce seuil.
 *
 * Les bornes viennent de `wUsage()` (lib/dough.js) : une seule vérité, la jauge ne peut pas
 * diverger du texte affiché à côté d'elle.
 */
const ZONES = [
  { max: 250, label: "Directs courts", couleur: "#e0ac48" },
  { max: 320, label: "Napolitaine",    couleur: "#5f9e3f" },
  { max: 400, label: "Indirects",      couleur: "#2c3371" },
  { max: Infinity, label: "Manitoba",  couleur: "#6b4fbb" },
];

export default function WGauge({ value, min, max }) {
  const pos = (w) => Math.max(0, Math.min(100, ((w - min) / (max - min)) * 100));
  // Chaque zone n'est dessinée que pour sa partie visible dans la plage du curseur : selon la
  // typologie choisie, la plage peut commencer à 280 — afficher « Directs courts » serait faux.
  const bandes = ZONES.map((z, i) => {
    const bas = i === 0 ? -Infinity : ZONES[i - 1].max;
    const de = Math.max(bas, min), a = Math.min(z.max, max);
    return a > de ? { ...z, gauche: pos(de), largeur: pos(a) - pos(de) } : null;
  }).filter(Boolean);
  const seuilVisible = INDIRECT_WMIN > min && INDIRECT_WMIN < max;

  return (
    <div className="wg" aria-hidden="true" style={{ position: "relative" }}>
      <div className="wg-band">
        {bandes.map((b) => (
          <span key={b.label} className="wg-zone" title={b.label}
            style={{ left: `${b.gauche}%`, width: `${b.largeur}%`, background: b.couleur }}>
            {b.largeur > 22 && <em>{b.label}</em>}
          </span>
        ))}
        {/* Seuil des indirects : en dessous, biga et poolish ne tiennent pas. */}
        {seuilVisible && <span className="wg-seuil" style={{ left: `${pos(INDIRECT_WMIN)}%` }} />}
      </div>
      {/* Le curseur se pose SOUS la bande : posé dessus, il masquait le nom de la zone
          (« N⬤LITAINE »). La bande est en overflow:hidden, il doit donc en sortir. */}
      <span className="wg-curseur" style={{ left: `${pos(value)}%` }} />
      <div className="wg-ticks">
        <span>W {min}</span>
        {seuilVisible && <span className="wg-tick-seuil" style={{ left: `${pos(INDIRECT_WMIN)}%` }}>biga / poolish ≥ {INDIRECT_WMIN}</span>}
        <span>W {max}</span>
      </div>
    </div>
  );
}
