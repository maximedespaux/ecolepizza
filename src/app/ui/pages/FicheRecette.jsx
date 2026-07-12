import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";
import { searchCatalog, getCatalogFamilies, getCatalogBrands, getMyRecipes, getComponents, getRecipe, createRecipe, updateRecipe, deleteRecipe, getMyFormations } from "../api/apiClient.js";

/**
 * Fiche technique — trois types composables :
 *  • PÂTE       : un empâtement calculé en pourcentage boulanger (calculateur intégré :
 *                 typologie, empâtement direct/indirect, hydratation, sel, huile, levure).
 *  • PRÉPARATION: une base (ex. sauce tomate = tomate + sel + huile). Rendement = quantité produite.
 *  • RECETTE    : une pizza complète = pâte + préparations importées + garnitures du catalogue.
 * Le coût matière et le prix conseillé sont calculés à partir du catalogue Metro. Une pâte ou
 * une préparation peut être « importée » dans une recette comme ingrédient, à son coût unitaire.
 */
const TYPES = ["Classique", "Contemporaine", "Napolitaine", "Teglia", "Pala"];
const KINDS = [
  { k: "PATE", label: "Pâte", icon: "settings", hint: "Un empâtement — rendement en pâtons" },
  { k: "PREPARATION", label: "Préparation", icon: "list-checks", hint: "Sauce, base… avec un rendement" },
  { k: "RECETTE", label: "Recette", icon: "pizza", hint: "Pizza complète : pâte + préparations + garnitures" },
];
const YIELD_UNITS = ["g", "kg", "ml", "l", "piece"];
const MASS_VOL = { g: 1000, kg: 1, mg: 1e6, l: 1, ml: 1000, cl: 100 };
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Calculateur de pâte (ex-« Atelier pâte ») — typologies & pourcentages par défaut.
const PRESETS = [
  { nom: "Classique", ic: "pizza", methods: ["Direct", "Biga", "Poolish"], hydra: 60, sel: 2.5, huile: 0, levure: 0.5, paton: 250, desc: "Cornicione léger ; direct, ou indirect (biga/poolish) au Niveau II." },
  { nom: "Contemporaine", ic: "pizza", methods: ["Biga", "Poolish"], hydra: 75, sel: 2.8, huile: 0, levure: 0.3, paton: 270, desc: "Cornicione plus haut & dense — souvent en empâtement indirect (biga/poolish)." },
  { nom: "Napolitaine", ic: "flame", methods: ["Direct"], hydra: 62, sel: 2.8, huile: 0, levure: 0.2, paton: 250, desc: "Empâtement direct uniquement, cuisson à très haute température." },
  { nom: "Teglia", ic: "package", methods: ["Direct", "Biga", "Poolish"], hydra: 80, sel: 2.5, huile: 2, levure: 0.3, paton: 300, spe: true, desc: "En plaque rectangulaire (al taglio), souvent avec un filet d'huile." },
  { nom: "Pala", ic: "package", methods: ["Direct", "Biga", "Poolish"], hydra: 78, sel: 2.5, huile: 1.5, levure: 0.3, paton: 300, spe: true, desc: "Rectangulaire, cuite sur pierre, servie sur pelle." },
];
const INDIRECT = ["Biga", "Poolish"]; // empâtements indirects → prérequis Niveau II
const DP_DEFAULT = { preset: "Classique", method: "Direct", autolyse: false, hydra: 60, sel: 2.5, huile: 0, levure: 0.5 };
const gfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(2) + " kg" : Math.round(n) + " g");
const addPctOf = (dp) => 1 + (num(dp.hydra) + num(dp.sel) + num(dp.huile) + num(dp.levure)) / 100;

const NEW = () => ({
  id: null, kind: "RECETTE", name: "", type: "Classique", description: "", servings: 6, paton_g: 250, flour_price: 1.2,
  visibility: "PRIVATE", margin_pct: 70, yield_qty: 1000, yield_unit: "g", dough_params: { ...DP_DEFAULT },
  ingredients: [],
});

const unitLabel = (tu) => (tu === "Piece" ? "pc" : tu === "L" ? "L" : "kg");
const PAGE_SIZE = 12;
const PRICE_MAX = 50; // borne haute du curseur (€/unité) ; au max = « sans limite »

// Curseur simple (empâtement en pourcentage boulanger).
function Slider({ label, val, min, max, step, set, suffix }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <b style={{ fontSize: 13 }}>{label}</b>
        <span className="tnum" style={{ fontWeight: 700, color: "var(--blue)" }}>{val}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--ember1)" }} />
    </div>
  );
}

// Coût par unité produite d'une préparation (coût total ÷ rendement).
function prepUnitCost(total, yq, yu) {
  const y = num(yq); const u = String(yu || "").toLowerCase();
  if (y > 0 && MASS_VOL[u]) { const kg = y / MASS_VOL[u]; return { per: kg > 0 ? total / kg : 0, unit: "kg" }; }
  if (y > 0) return { per: total / y, unit: "unité" };
  return { per: total, unit: "lot" };
}

// Curseur de prix à double poignée (min / max).
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

// Modale « Catalogue d'ingrédients » : filtres + résultats paginés, bouton « Ajouter » par ligne.
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

// Modale « Importer une fiche » : liste des pâtes / préparations (à soi ou partagées) avec
// leur coût unitaire calculé, à insérer comme ingrédient de la recette.
function ComponentPickerModal({ onClose, onAdd, added, excludeId }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      getComponents(q).then((r) => setRes((r.data || []).filter((c) => c.id !== excludeId))).catch(() => setRes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, excludeId]);
  const kindLbl = (k) => (k === "PATE" ? "Pâte" : "Préparation");
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Importer une fiche technique</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="gs-search">
            <span aria-hidden style={{ fontSize: 13, opacity: 0.6 }}>🔍</span>
            <input placeholder="Rechercher une pâte ou préparation…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {q && <button className="gs-clear" title="Effacer" onClick={() => setQ("")}><Icon name="x" size={13} /></button>}
          </span>
          <div className="gs-res" style={{ maxHeight: "48vh", minHeight: 160 }}>
            {res.length === 0 ? (
              <p className="hint" style={{ margin: "auto", padding: 24 }}>Aucune pâte ni préparation. Crée-en une d'abord.</p>
            ) : res.map((c) => (
              <div key={c.id} className="gs-item">
                <span className="fiche-tag">{kindLbl(c.kind)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</b>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{c.unit === "piece" ? "à l'unité" : "au poids"}</span>
                </span>
                <span className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{euro(c.unit_price)}/{c.unit === "piece" ? "pc" : "kg"}</span>
                <button className={"btn sm " + (added.has(c.id) ? "ghost" : "primary")} onClick={() => onAdd(c)}>
                  <Icon name={added.has(c.id) ? "check" : "plus"} size={13} /> {added.has(c.id) ? "Ajoutée" : "Importer"}
                </button>
              </div>
            ))}
          </div>
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
  const [importOpen, setImportOpen] = useState(false);
  const [niv2, setNiv2] = useState(false); // empâtements indirects (biga/poolish) débloqués au Niveau II
  const [spe, setSpe] = useState(false);   // typologies teglia/pala débloquées avec la spécialisation
  const added = useMemo(() => new Set(r.ingredients.map((i) => i.product_id).filter(Boolean)), [r.ingredients]);
  const importedIds = useMemo(() => new Set(r.ingredients.map((i) => i.component_recipe_id).filter(Boolean)), [r.ingredients]);

  const reload = () => getMyRecipes().then((res) => setSaved(res.data || [])).catch(() => {});
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    getMyFormations().then((r) => {
      const fs = (r.data || []).filter((f) => f.enrolled).map((f) => `${f.program_title} ${f.program_code}`);
      setNiv2(fs.some((t) => /niveau ii|emp[aâ]tement/i.test(t)));
      setSpe(fs.some((t) => /teglia|pala|sp[ée]cialis/i.test(t)));
    }).catch(() => {});
  }, []);

  const set = (k) => (e) => setR((p) => ({ ...p, [k]: e.target.value }));
  const setKind = (kind) => setR((p) => ({ ...p, kind }));
  const setIng = (i, patch) => setR((p) => ({ ...p, ingredients: p.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const addIng = () => setR((p) => ({ ...p, ingredients: [...p.ingredients, { label: "", qty: 0, unit: "g", unit_price: 0, product_id: null, component_recipe_id: null }] }));
  const delIng = (i) => setR((p) => ({ ...p, ingredients: p.ingredients.filter((_, j) => j !== i) }));
  // Ajoute un ingrédient depuis le catalogue : on stocke le NOM du produit (jamais la marque).
  const addProduct = (prod) => setR((p) => ({ ...p, ingredients: [...p.ingredients, {
    label: prod.name, product_id: prod.id, component_recipe_id: null,
    unit: prod.type_unity === "Piece" ? "piece" : "g",
    unit_price: prod.unit_ht != null ? Number(prod.unit_ht) : 0,
    qty: prod.type_unity === "Piece" ? 1 : 50,
  }] }));
  // Importe une pâte / préparation comme ingrédient (prix = coût unitaire de la fiche, verrouillé).
  const addComponent = (c) => setR((p) => ({ ...p, ingredients: [...p.ingredients, {
    label: c.name, product_id: null, component_recipe_id: c.id,
    unit: c.unit === "piece" ? "piece" : "g", unit_price: Number(c.unit_price) || 0,
    qty: c.unit === "piece" ? 1 : 80,
  }] }));

  const kind = r.kind || "RECETTE";
  const isRecette = kind === "RECETTE";
  const isPate = kind === "PATE";
  const isPrep = kind === "PREPARATION";
  const doughUnit = isPate ? "pâton" : "pizza";

  // Calculateur de pâte : réglages en pourcentage boulanger + presets verrouillables.
  const dp = r.dough_params || DP_DEFAULT;
  const setDP = (k, v) => setR((p) => ({ ...p, dough_params: { ...(p.dough_params || DP_DEFAULT), [k]: v } }));
  const methodLocked = (m) => INDIRECT.includes(m) && !niv2;
  const applyPreset = (pr) => {
    if (pr.spe && !spe) return;
    setR((p) => ({ ...p, type: pr.nom, paton_g: pr.paton, dough_params: {
      ...(p.dough_params || DP_DEFAULT), preset: pr.nom, hydra: pr.hydra, sel: pr.sel, huile: pr.huile, levure: pr.levure,
      method: pr.methods.find((m) => !methodLocked(m)) || pr.methods[0],
    } }));
  };
  const curPreset = PRESETS.find((p) => p.nom === dp.preset) || PRESETS[0];

  const nb = Math.max(1, num(r.servings));
  // Ratio pâte/farine : pourcentage boulanger pour la pâte, forfait 1.68 sinon.
  const addPct = isPate ? addPctOf(dp) : 1.68;
  const flourBatchKg = (nb * num(r.paton_g)) / 1000 / addPct;
  const doughPerUnit = ((num(r.paton_g) / 1000) / addPct) * num(r.flour_price);
  const lineCost = (t) => (t.unit === "g" ? (num(t.qty) / 1000) * num(t.unit_price) : num(t.qty) * num(t.unit_price));
  const ingSum = useMemo(() => r.ingredients.reduce((s, t) => s + lineCost(t), 0), [r.ingredients]);

  // Décomposition de la pâte (grammes) pour le résultat du calculateur.
  const totalDough = nb * num(r.paton_g);
  const farineG = totalDough / addPct;
  const dough = [
    { k: "Farine", ic: "wheat", v: farineG, pct: "100 %", color: "#fcb900" },
    { k: "Eau", ic: "droplet", v: farineG * num(dp.hydra) / 100, pct: `${dp.hydra} %`, color: "#3aa0e0" },
    { k: "Sel", ic: "salt", v: farineG * num(dp.sel) / 100, pct: `${dp.sel} %`, color: "#c9cede" },
    ...(num(dp.huile) > 0 ? [{ k: "Huile", ic: "oil", v: farineG * num(dp.huile) / 100, pct: `${dp.huile} %`, color: "#7bb661" }] : []),
    { k: "Levure", ic: "yeast", v: farineG * num(dp.levure) / 100, pct: `${dp.levure} %`, color: "#ff6900" },
  ];

  // Coûts selon le type de fiche.
  const perUnit = (isPate || isRecette) ? doughPerUnit + ingSum : ingSum; // par pâton / pizza / lot
  const totalCost = isPrep ? ingSum : perUnit * nb;
  const pricePerPizza = perUnit * (1 + num(r.margin_pct) / 100);
  const marginEur = pricePerPizza - perUnit;
  const prep = prepUnitCost(totalCost, r.yield_qty, r.yield_unit);

  async function persist(overrides = {}) {
    setBusy(true);
    const merged = { ...r, ...overrides };
    const payload = { ...merged, name: (overrides.name ?? r.name).trim() || `${r.type} maison`,
      dough_params: merged.kind === "PATE" ? (merged.dough_params || DP_DEFAULT) : null };
    try {
      const res = r.id ? await updateRecipe(r.id, payload) : await createRecipe(payload);
      const id = r.id || (res.data && res.data.id);
      setR((p) => ({ ...p, ...overrides, id }));
      reload();
    } catch { /* silencieux : la barre d'erreur globale s'affiche */ }
    finally { setBusy(false); }
  }
  async function openRecipe(id) {
    try {
      const res = await getRecipe(id); const d = res.data;
      let dpv = d.dough_params;
      if (typeof dpv === "string") { try { dpv = JSON.parse(dpv); } catch { dpv = null; } }
      setR({ ...NEW(), ...d, dough_params: { ...DP_DEFAULT, ...(dpv || {}) }, ingredients: d.ingredients?.length ? d.ingredients : [] });
    } catch { /* ignore */ }
  }
  async function removeRecipe(id) {
    if (!window.confirm("Supprimer cette fiche ?")) return;
    try { await deleteRecipe(id); if (r.id === id) setR(NEW()); reload(); } catch { /* ignore */ }
  }
  const shared = r.visibility === "SHARED";

  // Bloc d'actions (créer / partager / nouvelle), réutilisé par les panneaux de résultat.
  const actions = (
    <>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn primary" onClick={() => persist()} disabled={busy} style={{ flex: 1, justifyContent: "center" }}><Icon name="check" size={15} /> {r.id ? "Enregistrer" : "Créer"}</button>
        <button className={"btn " + (shared ? "primary" : "ghost")} onClick={() => persist({ visibility: shared ? "PRIVATE" : "SHARED" })} disabled={busy}
          title={shared ? "Rendre privée" : "Partager à la communauté"} style={shared ? null : { color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.35)" }}>
          <Icon name={shared ? "users" : "send"} size={15} /> {shared ? "Partagée" : "Partager"}
        </button>
      </div>
      <button className="btn ghost" onClick={() => setR(NEW())} style={{ marginTop: 10, width: "100%", justifyContent: "center", color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.3)" }}><Icon name="plus" size={14} /> Nouvelle fiche</button>
    </>
  );

  const ingTitle = isPate ? "Ingrédients" : isPrep ? "Ingrédients" : "Garniture";
  const ingScope = isPate ? "(par pâton)" : isPrep ? "(pour le lot)" : "(par pizza)";

  return (
    <>
      <PageHead eyebrow="Outils · fiches techniques" title="Fiche technique"
        lead="Crée une pâte, une préparation ou une recette complète. Compose avec le catalogue Metro, importe tes propres fiches, calcule le coût matière et fixe ton prix." />

      {/* Sélecteur de type de fiche */}
      <div className="kind-seg">
        {KINDS.map((it) => (
          <button key={it.k} className={"kind-btn" + (kind === it.k ? " on" : "")} onClick={() => setKind(it.k)} title={it.hint}>
            <Icon name={it.icon} size={16} /> {it.label}
          </button>
        ))}
        <span className="hint kind-hint">{KINDS.find((it) => it.k === kind)?.hint}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Ligne 1 — identité + empâtement (pâte/recette) ou rendement (préparation) */}
        <div className="grid cols-2" style={{ gap: 22, alignItems: "start" }}>
          {!isPate && (
          <Card title={<span className="card-ttl"><Icon name={isRecette ? "pizza" : "list-checks"} size={16} /> {isRecette ? "La pizza" : "La préparation"}</span>}>
            <div className="field"><label>Nom de la fiche</label>
              <input className="inp" value={r.name} onChange={set("name")} placeholder={isPrep ? "Ex. Sauce tomate San Marzano" : "Ex. Margherita du chef"} /></div>
            <div className="field"><label>Type</label>
              <select className="inp" value={r.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Description</label>
              <textarea className="inp" rows={4} value={r.description} onChange={set("description")} placeholder="Style, histoire, cuisson, dressage…" /></div>
          </Card>
          )}

          {isPrep ? (
            <Card title={<span className="card-ttl"><Icon name="settings" size={16} /> Rendement</span>}>
              <p className="hint" style={{ margin: "0 0 12px" }}>Quantité totale produite par ce lot d'ingrédients. Sert à calculer le coût par unité quand la préparation est importée dans une recette.</p>
              <div className="grid cols-2" style={{ gap: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}><label>Quantité produite</label><input className="inp" type="number" step="0.1" min="0" value={r.yield_qty ?? ""} onChange={set("yield_qty")} /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>Unité</label>
                  <select className="inp" value={r.yield_unit || "g"} onChange={set("yield_unit")}>{YIELD_UNITS.map((u) => <option key={u} value={u}>{u === "piece" ? "pièce" : u}</option>)}</select></div>
              </div>
              <p className="hint" style={{ margin: "12px 0 0" }}>Coût total du lot <b>{euro(totalCost)}</b> → <b>{euro(prep.per)}</b> / {prep.unit}</p>
            </Card>
          ) : isPate ? (
            <Card title={<span className="card-ttl"><Icon name="settings" size={16} /> Calculateur de pâte</span>}>
              {/* Identité — en haut du calculateur (le type découle de la typologie ci-dessous) */}
              <div className="field"><label>Nom de la fiche</label>
                <input className="inp" value={r.name} onChange={set("name")} placeholder="Ex. Pâte napolitaine 24 h" /></div>
              {/* Typologies */}
              <div className="ate-lbl">Typologie de pizza</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {PRESETS.map((p) => {
                  const locked = p.spe && !spe;
                  return (
                    <button key={p.nom} onClick={() => applyPreset(p)} disabled={locked}
                      className={`btn sm ${dp.preset === p.nom ? "primary" : "ghost"}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: locked ? 0.5 : 1 }}
                      title={locked ? "Déverrouillé avec la spécialisation « In Teglia & Pala »" : p.desc}>
                      <Icon name={locked ? "lock" : p.ic} size={14} /> {p.nom}{p.spe ? " · Spé" : ""}
                    </button>
                  );
                })}
              </div>
              {/* Empâtement (+ Autolyse) */}
              <div className="ate-lbl">Empâtement</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                {curPreset.methods.map((m) => {
                  const locked = methodLocked(m);
                  return (
                    <button key={m} onClick={() => !locked && setDP("method", m)} disabled={locked}
                      className={`btn sm ${dp.method === m ? "primary" : "ghost"}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: locked ? 0.5 : 1 }}
                      title={locked ? "Débloqué au Niveau II (empâtements indirects)" : m}>
                      {locked && <Icon name="lock" size={12} />}{m}
                    </button>
                  );
                })}
                <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 3px" }} />
                <button onClick={() => setDP("autolyse", !dp.autolyse)} className={`btn sm ${dp.autolyse ? "primary" : "ghost"}`}
                  title="Repos farine + eau avant pétrissage (facultatif)">
                  <Icon name={dp.autolyse ? "check" : "plus"} size={13} /> Autolyse
                </button>
              </div>
              <p className="hint" style={{ margin: "0 0 16px" }}>Direct &amp; Autolyse → Niveau I · Biga &amp; Poolish (indirects) → Niveau II</p>
              {/* Rendement + prix */}
              <div className="grid cols-2" style={{ gap: 12, marginBottom: 4 }}>
                <div className="field" style={{ marginBottom: 8 }}><label>Nombre de pâtons</label><input className="inp" type="number" min="1" value={r.servings} onChange={set("servings")} /></div>
                <div className="field" style={{ marginBottom: 8 }}><label>Poids d'un pâton (g)</label><input className="inp" type="number" min="100" value={r.paton_g} onChange={set("paton_g")} /></div>
              </div>
              <div className="field" style={{ marginBottom: 14 }}><label>Prix de la farine (€/kg)</label><input className="inp" type="number" step="0.01" value={r.flour_price} onChange={set("flour_price")} /></div>
              {/* Pourcentage boulanger */}
              <Slider label="Hydratation" val={num(dp.hydra)} min={50} max={90} step={1} set={(v) => setDP("hydra", v)} suffix=" %" />
              <Slider label="Sel" val={num(dp.sel)} min={0} max={4} step={0.1} set={(v) => setDP("sel", v)} suffix=" %" />
              <Slider label="Huile (facultatif)" val={num(dp.huile)} min={0} max={6} step={0.5} set={(v) => setDP("huile", v)} suffix=" %" />
              <Slider label="Levure" val={num(dp.levure)} min={0} max={2} step={0.05} set={(v) => setDP("levure", v)} suffix=" %" />
              <p className="hint" style={{ margin: "0 0 14px" }}>≈ {flourBatchKg.toFixed(2)} kg de farine pour {nb} pâtons · coût pâte <b>{euro(doughPerUnit)}</b> / pâton</p>
              {/* Description — en bas du calculateur */}
              <div className="field" style={{ marginBottom: 0 }}><label>Description</label>
                <textarea className="inp" rows={3} value={r.description} onChange={set("description")} placeholder="Hydratation, pointage/apprêt, cuisson…" /></div>
            </Card>
          ) : (
            <Card title={<span className="card-ttl"><Icon name="settings" size={16} /> Empâtement</span>}>
              <div className="field"><label>Nombre de pizzas</label><input className="inp" type="number" min="1" value={r.servings} onChange={set("servings")} /></div>
              <div className="field"><label>Poids d'un pâton (g)</label><input className="inp" type="number" min="100" value={r.paton_g} onChange={set("paton_g")} /></div>
              <div className="field" style={{ marginBottom: 12 }}><label>Prix de la farine (€/kg)</label><input className="inp" type="number" step="0.01" value={r.flour_price} onChange={set("flour_price")} /></div>
              <p className="hint" style={{ margin: 0 }}>≈ {flourBatchKg.toFixed(2)} kg de farine pour {nb} {doughUnit}s · coût pâte <b>{euro(doughPerUnit)}</b> / {doughUnit}</p>
            </Card>
          )}

          {/* Pâte — panneau bleu (résultat) à côté du calculateur */}
          {isPate && (
            <div className="card dough-result">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{curPreset.nom} · empâtement {String(dp.method).toLowerCase()}{dp.autolyse ? " + autolyse" : ""}</div>
              <div style={{ font: "800 24px/1.1 var(--font-d)", margin: "4px 0 2px" }}>{gfmt(totalDough)} de pâte</div>
              <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12, marginBottom: 12 }}>{nb} pâtons de {num(r.paton_g)} g</div>
              <div className="dough-bar" title="Proportions de l'empâtement">
                {dough.map((i) => <span key={i.k} style={{ width: `${totalDough ? (i.v / totalDough) * 100 : 0}%`, background: i.color }} />)}
              </div>
              {dp.autolyse && (
                <p style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", background: "rgba(255,255,255,.08)", borderRadius: 8, padding: "8px 10px", margin: "0 0 10px" }}>
                  <b>Autolyse</b> — mélange la farine et l'eau, laisse reposer 30–60 min, puis ajoute sel &amp; levure.
                </p>
              )}
              {dough.map((i, idx) => (
                <div key={i.k} className="dough-line">
                  <span className="ate-step">{idx + 1}</span>
                  <span style={{ color: i.color, display: "inline-flex" }}><Icon name={i.ic} size={17} /></span>
                  <b style={{ flex: 1, fontSize: 13 }}>{i.k}</b>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{i.pct}</span>
                  <b className="tnum" style={{ width: 90, textAlign: "right" }}>{gfmt(i.v)}</b>
                </div>
              ))}
              <div style={{ borderTop: "1px solid rgba(255,255,255,.15)", margin: "16px 0 0" }} />
              <div style={{ font: "800 30px/1.1 var(--font-d)", margin: "14px 0 0" }}>{euro(perUnit)} <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>/ pâton</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                <Row label="Coût matière total" value={euro(totalCost)} />
                <Row label="Coût pâte / pâton" value={euro(doughPerUnit)} />
                <Row label="Coût ingrédients / pâton" value={euro(ingSum)} accent />
              </div>
              <p className="hint" style={{ color: "rgba(255,255,255,.75)", margin: "12px 0 0" }}>Importable dans une recette comme ingrédient, à son coût / pâton.</p>
              {actions}
            </div>
          )}
        </div>

        {/* Ligne 2 — résultat : panneau prix conseillé (recette) ou coût unitaire (pâte / préparation) */}
        {isRecette ? (
          <div className="card dough-result fr-result">
            <div>
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{r.name || "Nouvelle recette"} · {r.type}</div>
              <div style={{ font: "800 32px/1.1 var(--font-d)", margin: "8px 0 2px" }}>{euro(pricePerPizza)} <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>/ pizza conseillé</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                <Row label="Coût matière total" value={euro(totalCost)} />
                <Row label="Coût par pizza" value={euro(perUnit)} />
                <Row label={`Marge (${r.margin_pct} %)`} value={euro(marginEur)} accent />
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,.7)", marginBottom: 6 }}><span>Marge sur coût</span><b>{r.margin_pct} %</b></div>
              <input type="range" min="0" max="300" step="5" value={r.margin_pct} onChange={set("margin_pct")} style={{ width: "100%", accentColor: "var(--gold)" }} />
              {actions}
            </div>
          </div>
        ) : isPate ? null : (
          <div className="card dough-result fr-result">
            <div>
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{r.name || "Nouvelle préparation"} · {r.type}</div>
              <div style={{ font: "800 32px/1.1 var(--font-d)", margin: "8px 0 2px" }}>
                {euro(prep.per)} <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>/ {prep.unit}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                <Row label="Coût matière total" value={euro(totalCost)} />
                <Row label="Rendement" value={`${num(r.yield_qty)} ${r.yield_unit || ""}`} />
                <Row label="Coût ingrédients" value={euro(ingSum)} accent />
              </div>
            </div>
            <div>
              <p className="hint" style={{ color: "rgba(255,255,255,.75)", margin: "0 0 4px" }}>Cette fiche pourra être importée dans une recette comme ingrédient, à son coût unitaire.</p>
              {actions}
            </div>
          </div>
        )}

        {/* Ligne 3 — ingrédients / garniture */}
        <Card className="fr-garniture" title={<span className="card-ttl" style={{ fontSize: 17 }}><Icon name="list-checks" size={18} /> {ingTitle} <span className="hint" style={{ fontWeight: 400 }}>{ingScope}</span></span>}
          more={<span style={{ display: "flex", gap: 8 }}>
            <button className="btn sm primary" onClick={() => setSearchOpen(true)}><span aria-hidden>🔍</span> Rechercher des ingrédients</button>
            {isRecette && <button className="btn sm ghost" onClick={() => setImportOpen(true)}><Icon name="plus" size={14} /> Importer une fiche</button>}
            <button className="btn sm ghost" onClick={addIng}><Icon name="plus" size={14} /> Ligne manuelle</button>
          </span>}>
          <div className="ing-table big">
            <div className="ing-row ing-head">
              <span>Ingrédient</span><span>Quantité</span><span>Unité</span><span>Prix</span><span>Coût {isPate ? "/ pâton" : isPrep ? "" : "/ pizza"}</span><span />
            </div>
            {r.ingredients.map((t, i) => {
              const isComp = !!t.component_recipe_id;
              const locked = !!t.product_id || isComp;
              return (
                <div className="ing-row" key={i}>
                  {isComp ? (
                    <span className="inp comp-label" title="Fiche technique importée"><span className="fiche-tag">Fiche</span> {t.label}</span>
                  ) : (
                    <input className="inp" placeholder="Ingrédient" value={t.label} onChange={(e) => setIng(i, { label: e.target.value, product_id: null })} />
                  )}
                  <input className="inp" type="number" title="Quantité" value={t.qty} onChange={(e) => setIng(i, { qty: e.target.value })} />
                  <select className="inp" value={t.unit} disabled={locked} onChange={(e) => setIng(i, { unit: e.target.value })}><option value="g">g</option><option value="piece">pièce</option></select>
                  <input className="inp" type="number" step="0.01" disabled={locked}
                    title={locked ? (isComp ? "Coût unitaire de la fiche importée (verrouillé)." : "Prix issu du catalogue Metro (verrouillé). Modifie le nom pour saisir un prix manuel.") : (t.unit === "g" ? "€/kg" : "€/pièce")}
                    placeholder={t.unit === "g" ? "€/kg" : "€/pc"} value={t.unit_price} onChange={(e) => setIng(i, { unit_price: e.target.value })} />
                  <span className="mono ing-cost">{euro(lineCost(t))}</span>
                  <button className="iconbtn del" title="Retirer" onClick={() => delIng(i)}><Icon name="trash" size={15} /></button>
                </div>
              );
            })}
            {r.ingredients.length === 0 && <p className="hint" style={{ margin: "6px 2px" }}>Aucun ingrédient. Recherche ci-dessus{isRecette ? ", importe une fiche" : ""}, ou « Ligne manuelle ».</p>}
          </div>
          <p className="hint" style={{ margin: "16px 0 0", fontSize: 13 }}>Coût {isPate ? "ingrédients / pâton" : isPrep ? "total des ingrédients" : "garniture / pizza"} : <b>{euro(ingSum)}</b></p>
        </Card>

        {/* Ligne 4 — mes fiches */}
        <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes fiches</span>}>
          {saved.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Aucune fiche enregistrée pour l'instant.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {saved.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span className="fiche-tag">{s.kind === "PATE" ? "Pâte" : s.kind === "PREPARATION" ? "Prépa" : "Recette"}</span>
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
      {importOpen && <ComponentPickerModal onClose={() => setImportOpen(false)} onAdd={addComponent} added={importedIds} excludeId={r.id} />}
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
