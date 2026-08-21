import { Icon } from "./Icon.jsx";

/** Panneau d'accueil d'un outil : cartes de choix (créer / calculer / consulter…). */
export default function BuilderHub({ cards }) {
  return (
    <div className="hub-grid">
      {cards.map((c) => (
        <button key={c.title} className="hub-card" onClick={c.onClick} style={{ borderTopColor: c.color }}>
          <span className="hub-top">
            <span className="hub-ic" style={{ background: `color-mix(in srgb, ${c.color} 16%, var(--surface))`, color: c.color }}><Icon name={c.icon} size={24} /></span>
            {c.badge != null && <span className="hub-badge">{c.badge}</span>}
            <span className="hub-arrow"><Icon name="chevron-right" size={18} /></span>
          </span>
          <b className="hub-t">{c.title}</b>
          <span className="hint" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{c.desc}</span>
        </button>
      ))}
    </div>
  );
}
