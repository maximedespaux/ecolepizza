import { useState } from "react";
import { Icon } from "./Icon.jsx";
import Card from "./Card.jsx";
import { GARN_BASES, pairSuggestions, num } from "../lib/garnitures.js";

/**
 * ACCORDS DE SAVEURS — helper d'une fiche GARNITURE. On part d'une base (sauce tomate, crème…)
 * puis `pairSuggestions` remonte, à partir de ce qui est posé, les produits que l'école associe
 * (relations ASYMÉTRIQUES : cf. lib/garnitures.js). Chaque suggestion s'ajoute comme LIGNE
 * D'INGRÉDIENT à la fiche, chiffrée depuis MA MERCURIALE quand le produit y figure (par libellé),
 * sinon au prix indicatif du produit. Le partage de la fiche et le calcul du coût sont inchangés.
 */
const stars = (s) => "★".repeat(s >= 3 ? 3 : s >= 2 ? 2 : 1);

export default function PairingSuggest({ merc, onAdd, bare = false }) {
  const [base, setBase] = useState("");
  const [picked, setPicked] = useState([]); // clés de produits déjà ajoutés via les accords

  // Prix : d'abord MA MERCURIALE (par libellé, insensible à la casse), sinon le prix indicatif.
  const priceOf = (label, fallback) => {
    const m = (merc || []).find((x) => (x.label || "").toLowerCase() === String(label).toLowerCase());
    return m ? num(m.price) : num(fallback);
  };
  const chooseBase = (b) => { setBase(b.key); onAdd({ label: b.label, unit_price: priceOf(b.label, b.price), unit: "g", qty: b.qty || 60 }); };
  const addProd = (p) => { setPicked((k) => [...k, p.key]); onAdd({ label: p.label, unit_price: priceOf(p.label, p.price), unit: "g", qty: p.qty || 40 }); };

  const baseObj = GARN_BASES.find((b) => b.key === base);
  const sugg = base ? pairSuggestions(picked, base) : [];

  // `bare` : sans sa carte ni son titre, quand l'appelant l'enveloppe déjà (section repliable
  // de l'éditeur de fiche).
  const Cadre = bare ? Nu : Card;
  return (
    <Cadre title={<span className="card-ttl"><Icon name="star" size={16} /> Accords de saveurs <span className="hint" style={{ fontWeight: 400 }}>· ce que l'école associe</span></span>}>
      {!base ? (
        <>
          <p className="hint" style={{ marginTop: 0 }}>Choisis une base : elle s'ajoute à la fiche, puis les produits suggérés (chiffrés depuis ta mercuriale) s'ajoutent d'un clic.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {GARN_BASES.filter((b) => (b.pairs || []).length).map((b) => (
              <button key={b.key} className="btn sm ghost" onClick={() => chooseBase(b)}>{b.emoji} {b.label}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="fiche-tag">{baseObj?.emoji} {baseObj?.label}</span>
            <button className="btn sm ghost" onClick={() => { setBase(""); setPicked([]); }}><Icon name="chevron-left" size={13} /> Changer de base</button>
          </div>
          {sugg.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Plus de suggestion pour cet accord — ajoute d'autres ingrédients depuis ta mercuriale.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sugg.map((p) => (
                <button key={p.key} className="btn sm ghost" onClick={() => addProd(p)} title={`Suggéré par ${p.matches.join(", ")}`}>
                  <Icon name="plus" size={12} /> {p.emoji} {p.label} <span style={{ color: "var(--gold)", letterSpacing: 1 }}>{stars(p.score)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Cadre>
  );
}

function Nu({ children }) { return <>{children}</>; }
