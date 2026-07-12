import { useEffect, useMemo, useRef, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";
import { searchCatalog, getMyRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe } from "../api/apiClient.js";

/**
 * Fiche technique — compose une pizza (empâtement + garnitures), calcule le coût
 * matière et le prix conseillé. Ingrédients pris dans le catalogue Metro. Recettes
 * enregistrées en base : privées, ou partagées à la communauté des stagiaires.
 */
const TYPES = ["Classique", "Contemporaine", "Napolitaine", "Teglia", "Pala"];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const NEW = () => ({
  id: null, name: "", type: "Classique", description: "", servings: 6, paton_g: 250, flour_price: 1.2,
  visibility: "PRIVATE", margin_pct: 70,
  ingredients: [
    { label: "Sauce tomate", qty: 80, unit: "g", unit_price: 2.5, product_id: null },
    { label: "Mozzarella fiordilatte", qty: 100, unit: "g", unit_price: 8, product_id: null },
  ],
});

// Autocomplétion catalogue : tape → propositions ; sélection remplit libellé + prix + unité.
function IngredientPicker({ value, onPick, onText }) {
  const [q, setQ] = useState(value || "");
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { setQ(value || ""); }, [value]);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { searchCatalog(q).then((r) => setList(r.data || [])).catch(() => setList([])); }, 220);
    return () => clearTimeout(t);
  }, [q, open]);
  return (
    <span ref={ref} style={{ flex: 1, position: "relative", minWidth: 0 }}>
      <input className="inp" style={{ width: "100%" }} placeholder="Ingrédient (catalogue Metro)" value={q}
        onChange={(e) => { setQ(e.target.value); onText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      {open && list.length > 0 && (
        <div className="cat-pop">
          {list.map((p) => (
            <button key={p.id} type="button" className="cat-opt" onMouseDown={(e) => { e.preventDefault(); onPick(p); setOpen(false); }}>
              {p.image_url ? <img src={p.image_url} alt="" className="cat-thumb" /> : <span className="cat-thumb" />}
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{p.brand || p.family}</span>
              </span>
              <span className="mono" style={{ fontSize: 11 }}>{p.unit_ht != null ? `${euro(p.unit_ht)}/${p.type_unity === "Piece" ? "pc" : p.type_unity === "L" ? "L" : "kg"}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function FicheRecette() {
  const [r, setR] = useState(NEW);
  const [saved, setSaved] = useState([]);
  const [busy, setBusy] = useState(false);

  const reload = () => getMyRecipes().then((res) => setSaved(res.data || [])).catch(() => {});
  useEffect(() => { reload(); }, []);

  const set = (k) => (e) => setR((p) => ({ ...p, [k]: e.target.value }));
  const setIng = (i, patch) => setR((p) => ({ ...p, ingredients: p.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addIng = () => setR((p) => ({ ...p, ingredients: [...p.ingredients, { label: "", qty: 0, unit: "g", unit_price: 0, product_id: null }] }));
  const delIng = (i) => setR((p) => ({ ...p, ingredients: p.ingredients.filter((_, j) => j !== i) }));
  const pickProduct = (i, prod) => setIng(i, {
    label: prod.name, product_id: prod.id,
    unit: prod.type_unity === "Piece" ? "piece" : "g",
    unit_price: prod.unit_ht != null ? Number(prod.unit_ht) : 0,
  });

  const nb = Math.max(1, num(r.servings));
  const flourBatchKg = (nb * num(r.paton_g)) / 1000 / 1.68;
  const doughPerPizza = ((num(r.paton_g) / 1000) / 1.68) * num(r.flour_price);
  const lineCost = (t) => (t.unit === "g" ? (num(t.qty) / 1000) * num(t.unit_price) : num(t.qty) * num(t.unit_price));
  const toppingPerPizza = useMemo(() => r.ingredients.reduce((s, t) => s + lineCost(t), 0), [r.ingredients]);
  const perPizza = doughPerPizza + toppingPerPizza;
  const totalCost = perPizza * nb;
  const pricePerPizza = perPizza * (1 + num(r.margin_pct) / 100);
  const marginEur = pricePerPizza - perPizza;

  async function persist(overrides = {}) {
    setBusy(true);
    const payload = { ...r, ...overrides, name: (overrides.name ?? r.name).trim() || `${r.type} maison` };
    try {
      const res = r.id ? await updateRecipe(r.id, payload) : await createRecipe(payload);
      const id = r.id || (res.data && res.data.id);
      setR((p) => ({ ...p, ...overrides, id }));
      reload();
    } catch { /* silencieux : la barre d'erreur globale s'affiche */ }
    finally { setBusy(false); }
  }
  async function openRecipe(id) {
    try { const res = await getRecipe(id); const d = res.data; setR({ ...NEW(), ...d, ingredients: d.ingredients?.length ? d.ingredients : [] }); } catch { /* ignore */ }
  }
  async function removeRecipe(id) {
    if (!window.confirm("Supprimer cette recette ?")) return;
    try { await deleteRecipe(id); if (r.id === id) setR(NEW()); reload(); } catch { /* ignore */ }
  }
  const shared = r.visibility === "SHARED";

  return (
    <>
      <PageHead eyebrow="Outils · fiches techniques" title="Fiche technique"
        lead="Compose ta pizza avec les ingrédients du catalogue, calcule le coût matière et fixe ton prix. Garde-la pour toi ou partage-la à la communauté." />

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Ligne 1 — identité de la pizza + empâtement */}
        <div className="grid cols-2" style={{ gap: 22, alignItems: "start" }}>
          <Card title={<span className="card-ttl"><Icon name="pizza" size={16} /> La pizza</span>}>
            <div className="field"><label>Nom de la recette</label>
              <input className="inp" value={r.name} onChange={set("name")} placeholder="Ex. Margherita du chef" /></div>
            <div className="field"><label>Type</label>
              <select className="inp" value={r.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Description</label>
              <textarea className="inp" rows={4} value={r.description} onChange={set("description")} placeholder="Style, histoire, cuisson, dressage…" /></div>
          </Card>

          <Card title={<span className="card-ttl"><Icon name="settings" size={16} /> Empâtement</span>}>
            <div className="field"><label>Nombre de pizzas</label><input className="inp" type="number" min="1" value={r.servings} onChange={set("servings")} /></div>
            <div className="field"><label>Poids d'un pâton (g)</label><input className="inp" type="number" min="100" value={r.paton_g} onChange={set("paton_g")} /></div>
            <div className="field" style={{ marginBottom: 12 }}><label>Prix de la farine (€/kg)</label><input className="inp" type="number" step="0.01" value={r.flour_price} onChange={set("flour_price")} /></div>
            <p className="hint" style={{ margin: 0 }}>≈ {flourBatchKg.toFixed(2)} kg de farine pour {nb} pizzas · coût pâte <b>{euro(doughPerPizza)}</b> / pizza</p>
          </Card>
        </div>

        {/* Ligne 2 — garniture, pleine largeur avec en-têtes de colonnes */}
        <Card title={<span className="card-ttl"><Icon name="list-checks" size={16} /> Garniture <span className="hint" style={{ fontWeight: 400 }}>(par pizza)</span></span>}
          more={<button className="btn sm ghost" onClick={addIng}><Icon name="plus" size={13} /> Ajouter un ingrédient</button>}>
          <div className="ing-table">
            <div className="ing-row ing-head">
              <span>Ingrédient</span><span>Quantité</span><span>Unité</span><span>Prix</span><span>Coût / pizza</span><span />
            </div>
            {r.ingredients.map((t, i) => (
              <div className="ing-row" key={i}>
                <IngredientPicker value={t.label} onPick={(p) => pickProduct(i, p)} onText={(v) => setIng(i, { label: v, product_id: null })} />
                <input className="inp" type="number" title="Quantité" value={t.qty} onChange={(e) => setIng(i, { qty: e.target.value })} />
                <select className="inp" value={t.unit} onChange={(e) => setIng(i, { unit: e.target.value })}><option value="g">g</option><option value="piece">pièce</option></select>
                <input className="inp" type="number" step="0.01" title={t.unit === "g" ? "€/kg" : "€/pièce"} placeholder={t.unit === "g" ? "€/kg" : "€/pc"} value={t.unit_price} onChange={(e) => setIng(i, { unit_price: e.target.value })} />
                <span className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{euro(lineCost(t))}</span>
                <button className="iconbtn del" title="Retirer" onClick={() => delIng(i)}><Icon name="trash" size={14} /></button>
              </div>
            ))}
            {r.ingredients.length === 0 && <p className="hint" style={{ margin: "6px 2px" }}>Aucun ingrédient. Clique « Ajouter un ingrédient ».</p>}
          </div>
          <p className="hint" style={{ margin: "14px 0 0" }}>Tape un nom pour choisir un produit du catalogue Metro (le prix se remplit tout seul). Coût garniture : <b>{euro(toppingPerPizza)}</b> / pizza</p>
        </Card>

        {/* Ligne 3 — prix conseillé + mes recettes */}
        <div className="grid cols-2" style={{ gap: 22, alignItems: "start" }}>
          <div className="card dough-result">
            <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{r.name || "Nouvelle recette"} · {r.type}</div>
            <div style={{ font: "800 30px/1.1 var(--font-d)", margin: "8px 0 2px" }}>{euro(pricePerPizza)} <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>/ pizza conseillé</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              <Row label="Coût matière total" value={euro(totalCost)} />
              <Row label="Coût par pizza" value={euro(perPizza)} />
              <Row label={`Marge (${r.margin_pct} %)`} value={euro(marginEur)} accent />
            </div>
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,.7)", marginBottom: 6 }}><span>Marge sur coût</span><b>{r.margin_pct} %</b></div>
              <input type="range" min="0" max="300" step="5" value={r.margin_pct} onChange={set("margin_pct")} style={{ width: "100%", accentColor: "var(--gold)" }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn primary" onClick={() => persist()} disabled={busy} style={{ flex: 1, justifyContent: "center" }}><Icon name="check" size={15} /> {r.id ? "Enregistrer" : "Créer"}</button>
              <button className={"btn " + (shared ? "primary" : "ghost")} onClick={() => persist({ visibility: shared ? "PRIVATE" : "SHARED" })} disabled={busy}
                title={shared ? "Rendre privée" : "Partager à la communauté"} style={shared ? null : { color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.35)" }}>
                <Icon name={shared ? "users" : "send"} size={15} /> {shared ? "Partagée" : "Partager"}
              </button>
            </div>
            {r.id && <button className="btn sm ghost" onClick={() => setR(NEW())} style={{ marginTop: 12, color: "rgba(255,255,255,.8)", borderColor: "rgba(255,255,255,.3)" }}><Icon name="plus" size={13} /> Nouvelle recette</button>}
          </div>

          <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes recettes</span>}>
            {saved.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Aucune recette enregistrée pour l'instant.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {saved.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b>
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{s.type}{s.visibility === "SHARED" ? " · 🌍 partagée" : ""}</span></span>
                    <button className="btn sm ghost" onClick={() => openRecipe(s.id)}>Ouvrir</button>
                    <button className="iconbtn del" title="Supprimer" onClick={() => removeRecipe(s.id)}><Icon name="trash" size={14} /></button>
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
