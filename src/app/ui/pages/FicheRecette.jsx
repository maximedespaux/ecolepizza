import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";
import { searchCatalog, getCatalogFamilies, getCatalogBrands, getMyRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe } from "../api/apiClient.js";

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

const unitLabel = (tu) => (tu === "Piece" ? "pc" : tu === "L" ? "L" : "kg");
const PAGE_SIZE = 12;
const PRICE_MAX = 50; // borne haute du curseur (€/unité) ; au max = « sans limite »

// Curseur de prix à double poignée (min / max). Les deux <input range> se superposent ;
// seules les poignées captent le clic (pointer-events), pour pouvoir attraper les deux.
function DualRange({ min, max, step, value, onChange }) {
  const [lo, hi] = value;
  const pct = (v) => ((v - min) / (max - min)) * 100;
  return (
    <div className="range-slider">
      <div className="rs-rail" />
      <div className="rs-fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
      <input type="range" className="rs-in" min={min} max={max} step={step} value={lo}
        onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])} />
      <input type="range" className="rs-in" min={min} max={max} step={step} value={hi}
        onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])} />
    </div>
  );
}

// Modale « Catalogue d'ingrédients » : filtres (nom, marque, catégorie, prix min/max,
// tri) + résultats paginés. Chaque ligne a un bouton « Ajouter » (la modale reste
// ouverte pour en ajouter plusieurs).
function IngredientSearchModal({ onClose, onAdd, added }) {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [family, setFamily] = useState("");
  const [sort, setSort] = useState("");
  const [range, setRange] = useState([0, PRICE_MAX]);
  const [families, setFamilies] = useState([]);
  const [brands, setBrands] = useState([]);
  const [res, setRes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const priceMin = range[0] > 0 ? range[0] : "";
  const priceMax = range[1] < PRICE_MAX ? range[1] : "";
  const priceActive = range[0] > 0 || range[1] < PRICE_MAX;
  const anyFilter = q || brand || family || sort || priceActive;
  const resetAll = () => { setQ(""); setBrand(""); setFamily(""); setSort(""); setRange([0, PRICE_MAX]); };

  useEffect(() => {
    getCatalogFamilies().then((r) => setFamilies(r.data || [])).catch(() => {});
    getCatalogBrands().then((r) => setBrands(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { setPage(1); }, [q, brand, family, sort, priceMin, priceMax]);
  useEffect(() => {
    const t = setTimeout(() => {
      searchCatalog({ q, brand, family, sort, price_min: priceMin, price_max: priceMax, page, limit: PAGE_SIZE })
        .then((r) => { setRes(r.data || []); setTotal(r.total || 0); })
        .catch(() => { setRes([]); setTotal(0); });
    }, 250);
    return () => clearTimeout(t);
  }, [q, brand, family, sort, priceMin, priceMax, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Catalogue d'ingrédients</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="gs-bar">
            <span className="gs-search">
              <span aria-hidden style={{ fontSize: 13, opacity: 0.6 }}>🔍</span>
              <input placeholder="Rechercher un ingrédient…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
              {q && <button className="gs-clear" title="Effacer" onClick={() => setQ("")}><Icon name="x" size={13} /></button>}
            </span>
            <span className="gs-field">
              <select className="inp" value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">Toutes marques</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              {brand && <button className="gs-clear" title="Effacer la marque" onClick={() => setBrand("")}><Icon name="x" size={12} /></button>}
            </span>
            <span className="gs-field">
              <select className="inp" value={family} onChange={(e) => setFamily(e.target.value)}>
                <option value="">Toutes catégories</option>
                {families.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              {family && <button className="gs-clear" title="Effacer la catégorie" onClick={() => setFamily("")}><Icon name="x" size={12} /></button>}
            </span>
            <span className="gs-field">
              <select className="inp" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="">Tri : nom</option>
                <option value="price_asc">Prix croissant</option>
                <option value="price_desc">Prix décroissant</option>
              </select>
              {sort && <button className="gs-clear" title="Réinitialiser le tri" onClick={() => setSort("")}><Icon name="x" size={12} /></button>}
            </span>
            <button className="btn sm ghost" onClick={resetAll} disabled={!anyFilter} title="Tout réinitialiser"><Icon name="x" size={14} /> Réinitialiser</button>
          </div>
          <div className="gs-range-row">
            <span className="hint" style={{ whiteSpace: "nowrap" }}>Prix / unité</span>
            <DualRange min={0} max={PRICE_MAX} step={0.5} value={range} onChange={setRange} />
            <span className="gs-range-lbl">{range[0]} € – {range[1] >= PRICE_MAX ? `${PRICE_MAX} €+` : `${range[1]} €`}</span>
            {priceActive && <button className="gs-clear" title="Réinitialiser le prix" onClick={() => setRange([0, PRICE_MAX])}><Icon name="x" size={13} /></button>}
          </div>

          <div className="gs-res" style={{ maxHeight: "48vh", minHeight: 200 }}>
            {res.length === 0 ? (
              <p className="hint" style={{ margin: "auto", padding: 24 }}>Aucun ingrédient trouvé.</p>
            ) : res.map((p) => (
              <div key={p.id} className="gs-item">
                {p.image_url ? <img src={p.image_url} alt="" className="cat-thumb" /> : <span className="cat-thumb" />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{[p.brand, p.family].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{p.unit_ht != null ? `${euro(p.unit_ht)}/${unitLabel(p.type_unity)}` : "—"}</span>
                <button className={"btn sm " + (added.has(p.id) ? "ghost" : "primary")} onClick={() => onAdd(p)}>
                  <Icon name={added.has(p.id) ? "check" : "plus"} size={13} /> {added.has(p.id) ? "Ajouté" : "Ajouter"}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="mfoot" style={{ justifyContent: "space-between" }}>
          <span className="hint">{total} ingrédient{total > 1 ? "s" : ""}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn sm ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><Icon name="chevron-left" size={15} /></button>
            <span className="hint">Page {page} / {pages}</span>
            <button className="btn sm ghost" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}><Icon name="chevron-right" size={15} /></button>
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FicheRecette() {
  const [r, setR] = useState(NEW);
  const [saved, setSaved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const added = useMemo(() => new Set(r.ingredients.map((i) => i.product_id).filter(Boolean)), [r.ingredients]);

  const reload = () => getMyRecipes().then((res) => setSaved(res.data || [])).catch(() => {});
  useEffect(() => { reload(); }, []);

  const set = (k) => (e) => setR((p) => ({ ...p, [k]: e.target.value }));
  const setIng = (i, patch) => setR((p) => ({ ...p, ingredients: p.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addIng = () => setR((p) => ({ ...p, ingredients: [...p.ingredients, { label: "", qty: 0, unit: "g", unit_price: 0, product_id: null }] }));
  const delIng = (i) => setR((p) => ({ ...p, ingredients: p.ingredients.filter((_, j) => j !== i) }));
  // Ajoute un ingrédient depuis le catalogue : on stocke le NOM du produit (jamais la marque).
  const addProduct = (prod) => setR((p) => ({ ...p, ingredients: [...p.ingredients, {
    label: prod.name, product_id: prod.id,
    unit: prod.type_unity === "Piece" ? "piece" : "g",
    unit_price: prod.unit_ht != null ? Number(prod.unit_ht) : 0,
    qty: prod.type_unity === "Piece" ? 1 : 50,
  }] }));

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

        {/* Ligne 2 — prix conseillé / coût total + actions (au-dessus de la garniture) */}
        <div className="card dough-result fr-result">
          <div>
            <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{r.name || "Nouvelle recette"} · {r.type}</div>
            <div style={{ font: "800 32px/1.1 var(--font-d)", margin: "8px 0 2px" }}>{euro(pricePerPizza)} <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>/ pizza conseillé</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
              <Row label="Coût matière total" value={euro(totalCost)} />
              <Row label="Coût par pizza" value={euro(perPizza)} />
              <Row label={`Marge (${r.margin_pct} %)`} value={euro(marginEur)} accent />
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,.7)", marginBottom: 6 }}><span>Marge sur coût</span><b>{r.margin_pct} %</b></div>
            <input type="range" min="0" max="300" step="5" value={r.margin_pct} onChange={set("margin_pct")} style={{ width: "100%", accentColor: "var(--gold)" }} />
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn primary" onClick={() => persist()} disabled={busy} style={{ flex: 1, justifyContent: "center" }}><Icon name="check" size={15} /> {r.id ? "Enregistrer" : "Créer"}</button>
              <button className={"btn " + (shared ? "primary" : "ghost")} onClick={() => persist({ visibility: shared ? "PRIVATE" : "SHARED" })} disabled={busy}
                title={shared ? "Rendre privée" : "Partager à la communauté"} style={shared ? null : { color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.35)" }}>
                <Icon name={shared ? "users" : "send"} size={15} /> {shared ? "Partagée" : "Partager"}
              </button>
            </div>
            <button className="btn ghost" onClick={() => setR(NEW())} style={{ marginTop: 10, width: "100%", justifyContent: "center", color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.3)" }}><Icon name="plus" size={14} /> Nouvelle recette</button>
          </div>
        </div>

        {/* Ligne 3 — garniture, pleine largeur, agrandie */}
        <Card className="fr-garniture" title={<span className="card-ttl" style={{ fontSize: 17 }}><Icon name="list-checks" size={18} /> Garniture <span className="hint" style={{ fontWeight: 400 }}>(par pizza)</span></span>}
          more={<span style={{ display: "flex", gap: 8 }}>
            <button className="btn sm primary" onClick={() => setSearchOpen(true)}><span aria-hidden>🔍</span> Rechercher des ingrédients</button>
            <button className="btn sm ghost" onClick={addIng}><Icon name="plus" size={14} /> Ligne manuelle</button>
          </span>}>
          <div className="ing-table big">
            <div className="ing-row ing-head">
              <span>Ingrédient</span><span>Quantité</span><span>Unité</span><span>Prix</span><span>Coût / pizza</span><span />
            </div>
            {r.ingredients.map((t, i) => (
              <div className="ing-row" key={i}>
                <input className="inp" placeholder="Ingrédient" value={t.label} onChange={(e) => setIng(i, { label: e.target.value, product_id: null })} />
                <input className="inp" type="number" title="Quantité" value={t.qty} onChange={(e) => setIng(i, { qty: e.target.value })} />
                <select className="inp" value={t.unit} onChange={(e) => setIng(i, { unit: e.target.value })}><option value="g">g</option><option value="piece">pièce</option></select>
                <input className="inp" type="number" step="0.01" title={t.unit === "g" ? "€/kg" : "€/pièce"} placeholder={t.unit === "g" ? "€/kg" : "€/pc"} value={t.unit_price} onChange={(e) => setIng(i, { unit_price: e.target.value })} />
                <span className="mono ing-cost">{euro(lineCost(t))}</span>
                <button className="iconbtn del" title="Retirer" onClick={() => delIng(i)}><Icon name="trash" size={15} /></button>
              </div>
            ))}
            {r.ingredients.length === 0 && <p className="hint" style={{ margin: "6px 2px" }}>Aucun ingrédient. Recherche ci-dessus, ou « Ligne manuelle ».</p>}
          </div>
          <p className="hint" style={{ margin: "16px 0 0", fontSize: 13 }}>Recherche un produit du catalogue Metro et clique « Ajouter » (prix pré-rempli). Coût garniture : <b>{euro(toppingPerPizza)}</b> / pizza</p>
        </Card>

        {/* Ligne 4 — mes recettes */}
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

      {searchOpen && <IngredientSearchModal onClose={() => setSearchOpen(false)} onAdd={addProduct} added={added} />}
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
