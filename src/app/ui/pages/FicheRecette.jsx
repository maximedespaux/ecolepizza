import { useMemo, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";

/**
 * Fiche recette — crée une pizza (empâtement + garnitures), calcule le coût matière,
 * le coût par pizza et le prix de vente conseillé selon une marge. Les prix pourront
 * être pré-remplis depuis la Mercuriale plus tard ; ils sont saisis à la main pour
 * l'instant. Recettes enregistrées en local (partage communauté à venir).
 */
const TYPES = ["Classique", "Contemporaine", "Napolitaine", "Teglia", "Pala"];
const KEY = "impasto.recettes";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } };
const NEW = () => ({
  name: "", type: "Classique", desc: "", nb: 6, paton: 250, flourPrice: 1.2,
  toppings: [{ name: "Sauce tomate", qty: 80, unit: "g", price: 2.5 }, { name: "Mozzarella fiordilatte", qty: 100, unit: "g", price: 8 }],
  margin: 70,
});
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function FicheRecette() {
  const [r, setR] = useState(NEW);
  const [saved, setSaved] = useState(load);
  const set = (k) => (e) => setR((p) => ({ ...p, [k]: e.target.value }));
  const setTop = (i, patch) => setR((p) => ({ ...p, toppings: p.toppings.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addTop = () => setR((p) => ({ ...p, toppings: [...p.toppings, { name: "", qty: 0, unit: "g", price: 0 }] }));
  const delTop = (i) => setR((p) => ({ ...p, toppings: p.toppings.filter((_, j) => j !== i) }));

  // Coûts PAR PIZZA (garnitures saisies par pizza), puis ×nb pour le total.
  // Pâte : 1 pâton → farine (≈ pourcentage boulanger TH 65 %) → prix farine.
  const nb = Math.max(1, num(r.nb));
  const flourBatchKg = (nb * num(r.paton)) / 1000 / 1.68;
  const doughPerPizza = ((num(r.paton) / 1000) / 1.68) * num(r.flourPrice);
  const lineCost = (t) => (t.unit === "g" ? (num(t.qty) / 1000) * num(t.price) : num(t.qty) * num(t.price));
  const toppingPerPizza = useMemo(() => r.toppings.reduce((s, t) => s + lineCost(t), 0), [r.toppings]);
  const perPizza = doughPerPizza + toppingPerPizza;
  const totalCost = perPizza * nb;
  const pricePerPizza = perPizza * (1 + num(r.margin) / 100);
  const marginEur = pricePerPizza - perPizza;

  function saveRecipe() {
    if (!r.name.trim()) { setR((p) => ({ ...p, name: `${p.type} maison` })); }
    const item = { ...r, name: r.name.trim() || `${r.type} maison`, id: r.id || crypto.randomUUID(), perPizza: Number(perPizza.toFixed(2)), price: Number(pricePerPizza.toFixed(2)) };
    setSaved((l) => { const next = [item, ...l.filter((x) => x.id !== item.id)]; save(next); return next; });
    setR((p) => ({ ...p, id: item.id }));
  }
  function open(item) { setR(item); }
  function del(id) { setSaved((l) => { const next = l.filter((x) => x.id !== id); save(next); return next; }); }

  return (
    <>
      <PageHead eyebrow="Outils · recettes" title="Fiche recette"
        lead="Compose ta pizza (empâtement + garnitures), calcule le coût matière et fixe ton prix. Bientôt : prix depuis la Mercuriale et partage sur la communauté." />

      <div className="grid cols-2">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title={<span className="card-ttl"><Icon name="pizza" size={16} /> La pizza</span>}>
            <div className="row2">
              <div className="field"><label>Nom de la recette</label>
                <input className="inp" value={r.name} onChange={set("name")} placeholder="Ex. Margherita du chef" /></div>
              <div className="field"><label>Type</label>
                <select className="inp" value={r.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            </div>
            <div className="field"><label>Description</label>
              <textarea className="inp" rows={3} value={r.desc} onChange={set("desc")} placeholder="Style, histoire, cuisson, dressage…" /></div>
          </Card>

          <Card title={<span className="card-ttl"><Icon name="settings" size={16} /> Empâtement</span>}>
            <div className="row3">
              <div className="field"><label>Nb de pizzas</label><input className="inp" type="number" min="1" value={r.nb} onChange={set("nb")} /></div>
              <div className="field"><label>Poids pâton (g)</label><input className="inp" type="number" min="100" value={r.paton} onChange={set("paton")} /></div>
              <div className="field"><label>Prix farine (€/kg)</label><input className="inp" type="number" step="0.01" value={r.flourPrice} onChange={set("flourPrice")} /></div>
            </div>
            <p className="hint" style={{ margin: 0 }}>≈ {flourBatchKg.toFixed(2)} kg de farine ({nb} pizzas) · coût pâte <b>{euro(doughPerPizza)}</b> / pizza</p>
          </Card>

          <Card title={<span className="card-ttl"><Icon name="list-checks" size={16} /> Garniture</span>}
            more={<button className="btn sm ghost" onClick={addTop}><Icon name="plus" size={13} /> Ingrédient</button>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {r.toppings.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input className="inp" style={{ flex: 1 }} placeholder="Ingrédient" value={t.name} onChange={(e) => setTop(i, { name: e.target.value })} />
                  <input className="inp" style={{ width: 62 }} type="number" title="Quantité" value={t.qty} onChange={(e) => setTop(i, { qty: e.target.value })} />
                  <select className="inp" style={{ width: 74 }} value={t.unit} onChange={(e) => setTop(i, { unit: e.target.value })}><option value="g">g</option><option value="pièce">pièce</option></select>
                  <input className="inp" style={{ width: 72 }} type="number" step="0.01" title={t.unit === "g" ? "€/kg" : "€/pièce"} value={t.price} onChange={(e) => setTop(i, { price: e.target.value })} />
                  <span className="mono" style={{ width: 60, textAlign: "right", fontSize: 12 }}>{euro(lineCost(t))}</span>
                  <button className="iconbtn del" title="Retirer" onClick={() => delTop(i)}><Icon name="trash" size={14} /></button>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>Quantités &amp; prix par pizza (€/kg ou €/pièce). Coût garniture : <b>{euro(toppingPerPizza)}</b> / pizza</p>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card dough-result">
            <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{r.name || "Nouvelle recette"} · {r.type}</div>
            <div style={{ font: "800 26px/1.1 var(--font-d)", margin: "6px 0 2px" }}>{euro(pricePerPizza)} <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>/ pizza conseillé</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              <Row label="Coût matière total" value={euro(totalCost)} />
              <Row label="Coût par pizza" value={euro(perPizza)} />
              <Row label={`Marge (${r.margin} %)`} value={euro(marginEur)} accent />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,.7)", marginBottom: 4 }}><span>Marge sur coût</span><b>{r.margin} %</b></div>
              <input type="range" min="0" max="300" step="5" value={r.margin} onChange={set("margin")} style={{ width: "100%", accentColor: "var(--gold)" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="btn primary" onClick={saveRecipe} style={{ flex: 1, justifyContent: "center" }}><Icon name="check" size={15} /> Enregistrer</button>
              <button className="btn ghost" disabled title="Partage communauté à venir" style={{ color: "rgba(255,255,255,.8)", borderColor: "rgba(255,255,255,.3)" }}><Icon name="send" size={15} /> Partager</button>
            </div>
          </div>

          <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes recettes</span>}>
            {saved.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Aucune recette enregistrée pour l'instant.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {saved.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b><span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{s.type} · {euro(s.price)}/pizza</span></span>
                    <button className="btn sm ghost" onClick={() => open(s)}>Ouvrir</button>
                    <button className="iconbtn del" title="Supprimer" onClick={() => del(s.id)}><Icon name="trash" size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.10)", borderRadius: 10, padding: "9px 12px" }}>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,.85)" }}>{label}</span>
      <b className="tnum" style={{ fontSize: 15, color: accent ? "var(--gold)" : "#fff" }}>{value}</b>
    </div>
  );
}

export default FicheRecette;
