import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { euro } from "../lib/format.js";
import { num, unitShort } from "../lib/garnitures.js";

/**
 * Sélecteur de produits DANS MA MERCURIALE — la liste de prix curée du compte, filtrable et
 * groupée par famille, prix/unité affichés. Partagé (extrait de l'ancien assistant garniture) :
 * « Mes fiches techniques » s'en sert pour chiffrer un ingrédient depuis la mercuriale.
 * `onAdd(m)` reçoit l'item mercuriale choisi ; `onManage` mène à sa gestion (ajout depuis le catalogue).
 */
export default function MercProductPicker({ items, onAdd, addedKeys, onManage, filter, emptyLabel }) {
  const [q, setQ] = useState("");
  if (!items.length) return (
    <div className="cat-empty" style={{ border: "1px dashed var(--border)", borderRadius: 12 }}>
      Ta mercuriale est vide. <button className="btn sm primary" onClick={onManage} style={{ marginLeft: 6 }}><Icon name="plus" size={12} /> Ajouter des produits</button>
    </div>
  );
  const base = filter ? items.filter(filter) : items;
  const list = base.filter((m) => !q.trim() || (m.label + (m.brand || "") + (m.origin || "")).toLowerCase().includes(q.trim().toLowerCase()));
  const byFam = {}; list.forEach((m) => { const f = m.family || "Autres"; (byFam[f] = byFam[f] || []).push(m); });
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={15} /></span>
          <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer dans ma mercuriale…" style={{ paddingLeft: 34, width: "100%" }} />
        </div>
        <button className="btn sm ghost" onClick={onManage}><Icon name="plus" size={13} /> depuis le catalogue</button>
      </div>
      <div className="cat-results">
        {list.length === 0 ? <div className="cat-empty">{emptyLabel || "Aucun produit ici, ajoute-en depuis le catalogue."}</div>
          : Object.entries(byFam).map(([fam, ms]) => (
            <div key={fam}>
              <div className="ate-lbl" style={{ margin: "4px 0", fontSize: 11 }}>{fam}</div>
              {ms.map((m) => { const added = addedKeys && addedKeys.has("merc:" + m.id); return (
                <button key={m.id} className={"cat-row" + (added ? " added" : "")} onClick={() => !added && onAdd(m)} style={{ marginBottom: 4 }}>
                  <Icon name={added ? "check" : "plus"} size={15} />
                  <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 12.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</b><span style={{ fontSize: 11, color: "var(--muted)" }}>{[m.brand, m.origin, m.market].filter(Boolean).join(" · ") || "-"}</span></div>
                  <span className="tnum" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{euro(num(m.price))}/{unitShort(m.unit)}</span>
                </button>
              ); })}
            </div>
          ))}
      </div>
    </div>
  );
}
