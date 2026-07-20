import { gfmt } from "../lib/dough.js";

/** Barre de composition d'un empâtement — chaque segment révèle son détail au survol/focus. */
export default function DoughBar({ items, total, height = 14 }) {
  return (
    <div className="dough-bar2" style={{ height }}>
      {items.map((i) => (
        <span key={i.k} className="dough-seg" style={{ width: `${total ? (i.v / total) * 100 : 0}%`, background: i.color }} tabIndex={0} aria-label={`${i.k} ${i.pct} ${gfmt(i.v)}`}>
          <span className="dough-seg-tip">{i.k} · {i.pct} · <b>{gfmt(i.v)}</b></span>
        </span>
      ))}
    </div>
  );
}
