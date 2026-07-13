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
 * une préparation peut être « importée » dans une réalisation comme ingrédient, à son coût unitaire.
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

// Indice de force de la farine (W) — Manuel École Pizza p.17 (usages) & p.32 (hydratation
// minimale + eau/kg). `hydra` = taux minimal recommandé pour cette force.
// `hydra` = hydratation min. de coulage (manuel p.32). `maxTotal` = hydratation TOTALE max
// (coulage + bassinage) atteignable pour cette force — progressif : un W faible ne bassine
// presque pas, un W fort monte jusqu'à 68 % (règle Jean-Jacques Despaux).
const W_BRACKETS = [
  { w: 225, label: "W 200–250", use: "Empâtement direct, levage court", hydra: 54, maxTotal: 60 },
  { w: 280, label: "W 250–310", use: "Pizza napolitaine", hydra: 55, maxTotal: 62 },
  { w: 360, label: "W 330–390", use: "Directs longs & indirects", hydra: 57, maxTotal: 65 },
  { w: 415, label: "W 400–430", use: "Manitoba — renfort de farine", hydra: 60, maxTotal: 68 },
];
const wBracket = (w) => W_BRACKETS.find((b) => b.w === w) || W_BRACKETS[0];
// Plafond d'hydratation TOTALE (coulage + bassinage) : dépend du W (progressif) ; les
// spécialités Teglia/Pala montent plus haut (jusqu'à 80 %) quelle que soit la force.
const maxTotalFor = (preset, wObj) => (preset.spe ? (preset.hydraMax || 80) : (wObj.maxTotal || 68));

// Calculateur de pâte — typologies. `hydraMax` = plafond d'hydratation recommandé (au-delà :
// réalisable mais plus difficile à travailler & plus instable) ; `wMin`/`wMax` = plage de force
// W recommandée (Manuel École Pizza + règles Jean-Jacques Despaux).
const PRESETS = [
  { nom: "Classique", ic: "pizza", methods: ["Direct", "Biga", "Poolish"], w: 225, wMin: 200, hydra: 55, hydraMax: 68, sel: 2.5, huile: 2.5, levure: 0.5, paton: 250, desc: "Cornicione léger ; direct, ou indirect (biga/poolish) au Niveau II. W ≥ 200. Huile ≈ 2,5 % (manuel École Pizza)." },
  { nom: "Contemporaine", ic: "pizza", methods: ["Biga", "Poolish"], w: 360, wMin: 320, hydra: 60, hydraMax: 68, sel: 2.8, huile: 0, levure: 0.3, paton: 270, desc: "Cornicione haut & dense — empâtement indirect, farine forte recommandée (≥ W320)." },
  { nom: "Napolitaine", ic: "flame", methods: ["Direct"], w: 280, wMin: 280, wMax: 310, hydra: 57, hydraMax: 68, sel: 2.8, huile: 0, levure: 0.2, paton: 250, desc: "Empâtement direct uniquement, W 280–310, cuisson à très haute température." },
  { nom: "Teglia", ic: "package", methods: ["Direct", "Biga", "Poolish"], w: 360, wMin: 280, hydra: 75, hydraMax: 80, sel: 2.5, huile: 2, levure: 0.3, paton: 300, spe: true, desc: "En plaque rectangulaire (al taglio), haute hydratation (jusqu'à 80 %), filet d'huile." },
  { nom: "Pala", ic: "package", methods: ["Direct", "Biga", "Poolish"], w: 360, wMin: 280, hydra: 75, hydraMax: 80, sel: 2.5, huile: 1.5, levure: 0.3, paton: 300, spe: true, desc: "Rectangulaire, cuite sur pierre, haute hydratation (jusqu'à 80 %), servie sur pelle." },
];
const INDIRECT = ["Biga", "Poolish"]; // empâtements indirects → prérequis Niveau II + farine ≥ W320
const INDIRECT_WMIN = 320;

// Cahiers des charges de la pizza napolitaine — sous-sélecteur de la typologie « Napolitaine ».
// STG = Règlement UE 97/2010 ; AVPN = disciplinare 2024 ; École = règles Jean-Jacques Despaux.
// Chaque cahier surcharge W (plage), hydratation, sel, levure (basse, longue fermentation), pâton.
const NAPO_SPECS = [
  { key: "stg", label: "STG", w: 280, wMin: 220, wMax: 380, hydra: 56, hydraMin: 55, hydraMax: 62, sel: 2.9, huile: false,
    levure: 0.17, levureMin: 0.17, levureMax: 0.17, levureNote: "Fraîche 3 g / L d'eau · sèche = ⅓ de la fraîche.",
    paton: 220, patonMin: 180, patonMax: 250,
    ambT: 25, ambH: 7, doughTemp: 25, ferment: "Pointage 2 h + apprêt 4-6 h, à température ambiante (~25 °C)", cuisson: "Four à bois — sole 485 °C, voûte 430 °C · 60-90 s", src: "Règlement UE 97/2010" },
  { key: "avpn", label: "AVPN", w: 280, wMin: 250, wMax: 320, hydra: 58, hydraMin: 55, hydraMax: 62, sel: 2.9, huile: false,
    levure: 0.1, levureMin: 0.01, levureMax: 0.18, levureNote: "Fraîche 0,1-3 g / L d'eau (selon T°, humidité, temps) · sèche = ⅓ de la fraîche · levain < 10 % de la farine.",
    paton: 250, patonMin: 200, patonMax: 280,
    ctrlT: 19, ctrlH: 8, doughTemp: 22, ferment: "2 étapes en chambre contrôlée 18-20 °C, 60-70 % HR", cuisson: "Four à bois — sole 380-430 °C, voûte 485 °C · 60-90 s", src: "Disciplinare AVPN 2024" },
  { key: "ecole", label: "École (libre)", w: 280, wMin: 280, wMax: 310, hydra: 60, hydraMin: 55, hydraMax: 68, sel: 2.8, levure: null, paton: 250,
    ferment: "", cuisson: "", src: "Règles École Pizza" },
];
const napoSpecOf = (k) => NAPO_SPECS.find((s) => s.key === k) || NAPO_SPECS[0];
const DP_DEFAULT = { preset: "Classique", method: "Direct", autolyse: false, w: 225, hydra: 55, bassinage: 0, sel: 2.5, huile: 2.5, levure: 0.35, yeastType: "fraiche", flourTemp: 17, mode: "patons", flourKg: 10, prefermentH: "", fermentH: "", ambH: "", ambT: "", ctrlH: "", ctrlT: "", napoSpec: "" };
const gfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(2) + " kg" : Math.round(n) + " g");
// Ratio pâte/farine — inclut l'eau d'hydratation ET l'eau de bassinage.
const addPctOf = (dp) => 1 + (num(dp.hydra) + num(dp.bassinage) + num(dp.sel) + num(dp.huile) + num(dp.levure)) / 100;

// Dosage de la levure selon la température de la farine (Manuel École Pizza p.21) — g par kg de
// farine, convertis en % boulanger. Fraîche = sèche active ; sèche instantanée = moitié.
const LEVURE_TYPES = [
  { k: "fraiche", label: "Fraîche" },
  { k: "seche_active", label: "Sèche active" },
  { k: "seche_instant", label: "Sèche instantanée" },
];
const LEVURE_TABLE = [
  { tmax: 16, fraiche: 0.4, seche_active: 0.4, seche_instant: 0.2 },
  { tmax: 21, fraiche: 0.35, seche_active: 0.35, seche_instant: 0.175 },
  { tmax: 26, fraiche: 0.3, seche_active: 0.3, seche_instant: 0.15 },
  { tmax: 31, fraiche: 0.25, seche_active: 0.25, seche_instant: 0.125 },
  { tmax: 999, fraiche: 0.2, seche_active: 0.2, seche_instant: 0.1 },
];
const recoLevure = (t, type) => {
  const row = LEVURE_TABLE.find((r) => t <= r.tmax) || LEVURE_TABLE[LEVURE_TABLE.length - 1];
  return row[type] ?? row.fraiche;
};
const yeastLabel = (k) => (LEVURE_TYPES.find((y) => y.k === k) || LEVURE_TYPES[0]).label;

const NEW = () => ({
  id: null, kind: "RECETTE", name: "", type: "Classique", description: "", servings: 6, paton_g: 250, flour_price: 1.2,
  visibility: "PRIVATE", margin_pct: 70, yield_qty: 1000, yield_unit: "g", dough_params: { ...DP_DEFAULT },
  ingredients: [], steps: [], cooking: { type: "", temp: "", energy: "", time: "" },
});

// Chaque page (mode) est verrouillée sur un type de fiche — trois builders distincts.
const MODE_KIND = { empatement: "PATE", garniture: "PREPARATION", realisation: "RECETTE" };
const KIND_NOUN = { PATE: "empâtement", PREPARATION: "garniture", RECETTE: "réalisation" };
const KIND_LABEL = { PATE: "Empâtement", PREPARATION: "Garniture", RECETTE: "Réalisation" };
const SAVED_TITLE = { PATE: "Mes empâtements enregistrés", PREPARATION: "Mes garnitures enregistrées", RECETTE: "Mes réalisations enregistrées" };
const SAVED_EMPTY = { PATE: "Aucun empâtement enregistré pour l'instant.", PREPARATION: "Aucune garniture enregistrée pour l'instant.", RECETTE: "Aucune réalisation enregistrée pour l'instant." };
const HEADS = {
  empatement: { eyebrow: "Outils · mes empâtements", title: "Mes empâtements", lead: "Calcule ton empâtement au pourcentage boulanger : typologie, force de la farine (W), hydratation, sel, huile, levure, température. Obtiens le poids de chaque ingrédient, le nombre de pâtons et le coût — puis enregistre ta pâte pour la réutiliser dans une réalisation." },
  garniture: { eyebrow: "Outils · mes garnitures", title: "Mes garnitures", lead: "Compose une garniture (sauce, base, topping…) à partir du catalogue Metro : coût matière, rendement, et le déroulé de fabrication. Réutilisable dans une réalisation." },
  realisation: { eyebrow: "Outils · mes réalisations", title: "Mes réalisations", lead: "Assemble une pizza complète : ton empâtement + tes garnitures + le catalogue, avec la cuisson (four, température, énergie, temps). Calcule le coût matière et fixe ton prix de vente conseillé." },
};
// Bloc « cuisson » d'une réalisation (rangé dans dough_params côté back, en attendant sa colonne).
const COOK_TYPES = ["Four à bois", "Four à gaz", "Four électrique", "Four hybride", "Convoyeur", "Plaque / teglia"];
const NEW_COOKING = () => ({ type: "", temp: "", energy: "", time: "" });
const initFor = (mode) => ({ ...NEW(), kind: MODE_KIND[mode] || "RECETTE" });

// Extrait les hashtags (#truc) de la description → badges. Unicode (accents) accepté.
const TAG_RE = /#[\p{L}\p{N}_-]+/gu;
const parseTags = (s) => Array.from(new Set((String(s || "").match(TAG_RE) || []).map((t) => t.slice(1))));
function Tags({ text, dark }) {
  const tags = parseTags(text);
  if (!tags.length) return null;
  return <div className="tag-row">{tags.map((t) => <span key={t} className={"badge-tag" + (dark ? " on-dark" : "")}>#{t}</span>)}</div>;
}

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

// Curseur d'hydratation avec plage recommandée [min de la force W ; plafond de la typologie].
// VERT dans la plage, AMBRE en dessous du minimum, ROUGE au-dessus du plafond (réalisable mais
// plus difficile à travailler & instable).
function HydraSlider({ val, recoMin, recoMax, eauPerKg, set, confirmed }) {
  // Mode « confirmé » (cahier des charges) : curseur borné à la zone, sans seuil bas/haut.
  if (confirmed) {
    const v = Math.min(Math.max(val, recoMin), recoMax);
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <b style={{ fontSize: 13 }}>Hydratation</b>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="hydra-badge ok"><Icon name="check" size={12} /> Confirmé</span>
            <span className="tnum" style={{ fontWeight: 800, color: "var(--green)", fontSize: 15 }}>{val} %</span>
          </span>
        </div>
        <div className="hydra-track"><span className="hydra-zone" style={{ left: 0, right: 0 }} /></div>
        <input type="range" min={recoMin} max={recoMax} step={1} value={v}
          onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--green)" }} />
        <p className="hint" style={{ margin: "3px 0 0", fontSize: 11.5 }}>Zone confirmée du cahier : <b style={{ color: "var(--green)" }}>{recoMin}–{recoMax} %</b> · eau ≈ <b>{eauPerKg} g</b> / kg.</p>
      </div>
    );
  }
  const min = 45, max = 90;
  const below = val < recoMin, above = val > recoMax, ok = !below && !above;
  const pctN = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const c = ok ? "var(--green)" : above ? "var(--ember1)" : "var(--gold)";
  const badge = ok ? "ok" : above ? "high" : "low";
  const label = ok ? "Recommandé" : above ? "Au-dessus du seuil" : "Sous le minimum";
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <b style={{ fontSize: 13 }}>Hydratation</b>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={"hydra-badge " + badge}>{ok && <Icon name="check" size={12} />} {label}</span>
          <span className="tnum" style={{ fontWeight: 800, color: c, fontSize: 15 }}>{val} %</span>
        </span>
      </div>
      <div className="hydra-track">
        <span className="hydra-zone" style={{ left: `${pctN(recoMin)}%`, right: `${100 - pctN(recoMax)}%` }} />
        <span className="hydra-mark" style={{ left: `${pctN(recoMin)}%` }} title={`Minimum ${recoMin} %`} />
        <span className="hydra-mark hi" style={{ left: `${pctN(recoMax)}%` }} title={`Plafond ${recoMax} %`} />
      </div>
      <input type="range" min={min} max={max} step={1} value={val}
        onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: c }} />
      <p className="hint" style={{ margin: "3px 0 0", fontSize: 11.5 }}>
        {above
          ? <>Au-delà de <b style={{ color: "var(--ember1)" }}>{recoMax} %</b> : réalisable, mais pâte plus difficile à travailler &amp; instable.</>
          : <>Plage recommandée <b style={{ color: "var(--green)" }}>{recoMin}–{recoMax} %</b> · eau ≈ <b>{eauPerKg} g</b> / kg de farine</>}
      </p>
    </div>
  );
}

// Curseur de levure avec la dose recommandée du manuel (selon T° farine + type de levure) :
// repère vert + badge « Conforme » quand la valeur colle à la reco.
function LevureControl({ val, reco, recoG, typeLabel, flourTemp, set, capNote, bounded }) {
  // Mode « cahier » : dose bornée à la plage du cahier (ou fixe si min = max) + note officielle.
  if (bounded) {
    const { min: bmin, max: bmax, note } = bounded;
    const v = Math.min(Math.max(val, bmin), bmax);
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <b style={{ fontSize: 13 }}>Levure</b>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="hydra-badge ok"><Icon name="check" size={12} /> Cahier</span>
            <span className="tnum" style={{ fontWeight: 800, color: "var(--green)", fontSize: 15 }}>{val} %</span>
          </span>
        </div>
        {bmax > bmin && <input type="range" min={bmin} max={bmax} step={0.01} value={v}
          onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--green)" }} />}
        <p className="hint" style={{ margin: "3px 0 0", fontSize: 11.5 }}>{note}</p>
      </div>
    );
  }
  const min = 0, max = 0.6;
  const ok = Math.abs(val - reco) < 0.02;
  const pctN = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const c = ok ? "var(--green)" : "var(--blue)";
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <b style={{ fontSize: 13 }}>Levure</b>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {ok && <span className="hydra-badge ok"><Icon name="check" size={12} /> Conforme</span>}
          <span className="tnum" style={{ fontWeight: 800, color: c, fontSize: 15 }}>{val} %</span>
        </span>
      </div>
      <div className="hydra-track">
        <span className="hydra-mark" style={{ left: `${pctN(reco)}%` }} title={`Manuel : ${reco} %`} />
      </div>
      <input type="range" min={min} max={max} step={0.025} value={val}
        onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: c }} />
      <p className="hint" style={{ margin: "3px 0 0", fontSize: 11.5 }}>{capNote || <>Manuel : <b style={{ color: "var(--green)" }}>{reco} %</b> = <b>{recoG} g</b> / kg pour une farine à <b>{flourTemp} °C</b> · {typeLabel.toLowerCase()}.</>}</p>
    </div>
  );
}

// Section repliable (progressive disclosure) pour les réglages avancés. Au niveau module pour
// rester une instance stable (sinon les champs internes perdraient le focus à chaque frappe).
function Collapse({ title, hint, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={"ate-fold" + (open ? " open" : "")}>
      <button type="button" className="ate-fold-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="ate-fold-title">{title}{hint ? <span className="hint" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> · {hint}</span> : null}</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      {open && <div className="ate-fold-body">{children}</div>}
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
  const kindLbl = (k) => (k === "PATE" ? "Empâtement" : "Garniture");
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
              <p className="hint" style={{ margin: "auto", padding: 24 }}>Aucun empâtement ni garniture. Crée-en d'abord.</p>
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

function FicheRecette({ mode = "realisation" }) {
  const kind = MODE_KIND[mode] || "RECETTE"; // chaque page est verrouillée sur son type de fiche
  const [r, setR] = useState(() => initFor(mode));
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

  const isRecette = kind === "RECETTE";
  const isPate = kind === "PATE";
  const isPrep = kind === "PREPARATION";
  const doughUnit = isPate ? "pâton" : "pizza";

  // Déroulé (garniture) & cuisson (réalisation) — persistés dans dough_params (JSON) côté back.
  const steps = r.steps || [];
  const setStep = (i, v) => setR((p) => ({ ...p, steps: (p.steps || []).map((s, j) => (j === i ? v : s)) }));
  const addStep = () => setR((p) => ({ ...p, steps: [...(p.steps || []), ""] }));
  const delStep = (i) => setR((p) => ({ ...p, steps: (p.steps || []).filter((_, j) => j !== i) }));
  const moveStep = (i, d) => setR((p) => { const a = [...(p.steps || [])]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, steps: a }; });
  const cooking = r.cooking || {};
  const setCook = (k, v) => setR((p) => ({ ...p, cooking: { ...(p.cooking || {}), [k]: v } }));

  // Calculateur de pâte : réglages en pourcentage boulanger + presets verrouillables.
  const dp = r.dough_params || DP_DEFAULT;
  const setDP = (k, v) => setR((p) => ({ ...p, dough_params: { ...(p.dough_params || DP_DEFAULT), [k]: v } }));
  const methodLocked = (m) => INDIRECT.includes(m) && !niv2;
  // Applique un cahier des charges napolitain (surcharge W, hydratation, sel, levure basse, pâton
  // + pré-remplit le stockage). La levure fixée par le cahier ne suit PAS la table T° farine.
  const applyNapoSpec = (spec) => setR((p) => {
    const d = p.dough_params || DP_DEFAULT;
    const lev = spec.levure != null ? spec.levure : recoLevure(num(d.flourTemp) || 17, d.yeastType || "fraiche");
    return { ...p, type: "Napolitaine", paton_g: spec.paton, dough_params: {
      ...d, preset: "Napolitaine", napoSpec: spec.key, method: "Direct",
      w: spec.w, hydra: spec.hydra, bassinage: 0, sel: spec.sel, huile: 0, levure: lev,
      ambH: spec.ambH ?? "", ambT: spec.ambT ?? "", ctrlH: spec.ctrlH ?? "", ctrlT: spec.ctrlT ?? "", prefermentH: "",
    } };
  });
  const applyPreset = (pr) => {
    if (pr.spe && !spe) return;
    if (pr.nom === "Napolitaine") { applyNapoSpec(napoSpecOf("ecole")); return; } // défaut = recettes du manuel (École)
    setR((p) => { const d = p.dough_params || DP_DEFAULT;
      const mt = maxTotalFor(pr, wBracket(pr.w));
      const hydra = Math.min(pr.hydra, mt);
      const bassinage = Math.min(num(d.bassinage), Math.max(0, mt - hydra));
      return { ...p, type: pr.nom, paton_g: pr.paton, dough_params: {
      ...d, preset: pr.nom, napoSpec: "", w: pr.w, hydra, bassinage, sel: pr.sel, huile: pr.huile,
      levure: recoLevure(num(d.flourTemp) || 17, d.yeastType || "fraiche"), // dose manuel selon T° farine
      method: pr.methods.find((m) => !methodLocked(m)) || pr.methods[0],
    } }; });
  };
  const curPreset = PRESETS.find((p) => p.nom === dp.preset) || PRESETS[0];
  // Napolitaine : un cahier des charges (STG / AVPN / École) surcharge W, hydratation, sel, levure, pâton.
  const isNapo = curPreset.nom === "Napolitaine";
  const napoSpec = isNapo ? napoSpecOf(dp.napoSpec) : null;
  // Force de la farine (W) → hydratation minimale de coulage + plafond total.
  const curW = wBracket(dp.w);
  const recoMin = napoSpec ? napoSpec.hydraMin : curW.hydra;                     // hydratation min. de coulage
  const maxTotal = napoSpec ? napoSpec.hydraMax : maxTotalFor(curPreset, curW);  // plafond d'hydratation totale
  const mtFor = (b) => (napoSpec ? napoSpec.hydraMax : maxTotalFor(curPreset, b)); // plafond selon la force b
  const recoMax = maxTotal;                          // borne haute du curseur d'hydratation (base)
  const totalHydra = +(num(dp.hydra) + num(dp.bassinage)).toFixed(1); // hydratation totale actuelle
  const bassMax = Math.max(0, +(maxTotal - num(dp.hydra)).toFixed(1)); // bassinage encore possible
  const eauPerKg = Math.round(recoMin * 10);         // g d'eau pour 1 kg de farine, au minimum
  // Plage de force W : du cahier napolitain, sinon de la typologie (indirects ≥ W320).
  const indirectSel = INDIRECT.includes(dp.method);
  const effWMin = napoSpec ? napoSpec.wMin : Math.max(curPreset.wMin || 200, indirectSel ? INDIRECT_WMIN : 0);
  const effWMax = napoSpec ? napoSpec.wMax : (curPreset.wMax || 9999);
  const wOk = (w) => w >= effWMin && w <= effWMax;
  const wRangeLabel = effWMax < 9999 ? `W ${effWMin}–${effWMax}` : `W ≥ ${effWMin}`;
  // Choisir une force : cale la base ≥ min de coulage, borne base+bassinage au plafond du W.
  const applyW = (b) => setR((p) => {
    const d = p.dough_params || DP_DEFAULT; const mt = mtFor(b);
    const hydra = Math.min(Math.max(num(d.hydra), napoSpec ? napoSpec.hydraMin : b.hydra), mt);
    const bassinage = Math.min(num(d.bassinage), Math.max(0, mt - hydra));
    return { ...p, dough_params: { ...d, w: b.w, hydra, bassinage } };
  });
  // Changement d'empâtement : un indirect exige une farine ≥ W320 (on remonte le W si besoin).
  const setMethod = (m) => setR((p) => {
    const d = p.dough_params || DP_DEFAULT; let w = d.w;
    if (INDIRECT.includes(m) && w < INDIRECT_WMIN) w = 360;
    const b = wBracket(w); const mt = mtFor(b);
    const hydra = Math.min(Math.max(num(d.hydra), b.hydra), mt);
    const bassinage = Math.min(num(d.bassinage), Math.max(0, mt - hydra));
    return { ...p, dough_params: { ...d, method: m, w, hydra, bassinage } };
  });
  // Température de l'eau de coulage — formule TB 50 du manuel (50 − 2 × T° farine).
  const flourTemp = num(dp.flourTemp) || 17;
  const eauCoulage = Math.round(50 - 2 * flourTemp);
  // Levure — dose du manuel selon T° farine + type ; SAUF cahier napolitain qui la fixe (basse).
  const yeastType = dp.yeastType || "fraiche";
  const napoLevFixed = !!(napoSpec && napoSpec.levure != null);
  const levReco = napoLevFixed ? napoSpec.levure : recoLevure(flourTemp, yeastType);
  const levRecoG = +(levReco * 10).toFixed(3);
  const dpNapoFixed = (d) => d.preset === "Napolitaine" && d.napoSpec && d.napoSpec !== "ecole"; // levure imposée
  const setYeastType = (t) => setR((p) => { const d = p.dough_params || DP_DEFAULT; return { ...p, dough_params: { ...d, yeastType: t, ...(dpNapoFixed(d) ? {} : { levure: recoLevure(num(d.flourTemp) || 17, t) }) } }; });
  // Changer la T° de la farine met à jour l'eau de coulage ET (hors napolitaine) la dose de levure.
  const setFlourTemp = (v) => setR((p) => { const d = p.dough_params || DP_DEFAULT; return { ...p, dough_params: { ...d, flourTemp: v, ...(dpNapoFixed(d) ? {} : { levure: recoLevure(num(v) || 17, d.yeastType || "fraiche") }) } }; });
  // Régler l'hydratation de base réduit le bassinage possible (total borné au plafond du W).
  const setHydra = (v) => setR((p) => { const d = p.dough_params || DP_DEFAULT; return { ...p, dough_params: { ...d, hydra: v, bassinage: Math.min(num(d.bassinage), Math.max(0, maxTotal - v)) } }; });

  const nb = Math.max(1, num(r.servings));
  // Ratio pâte/farine : pourcentage boulanger pour la pâte, forfait 1.68 sinon.
  const addPct = isPate ? addPctOf(dp) : 1.68;
  const patonG = Math.max(1, num(r.paton_g));
  // Deux modes de calcul (pâte) : « par pâtons » (nb × poids) ou « par farine » (farine dispo → pâtons).
  const dpMode = isPate ? (dp.mode === "farine" ? "farine" : "patons") : "patons";
  const flourKg = num(dp.flourKg);
  const totalDough = dpMode === "farine" ? Math.max(0, flourKg) * 1000 * addPct : nb * patonG;
  const effNb = dpMode === "farine" ? Math.floor(totalDough / patonG) : nb; // pâtons obtenus
  const reste = dpMode === "farine" ? totalDough - effNb * patonG : 0;
  const doughPerUnit = ((patonG / 1000) / addPct) * num(r.flour_price);
  const lineCost = (t) => (t.unit === "g" ? (num(t.qty) / 1000) * num(t.unit_price) : num(t.qty) * num(t.unit_price));
  const ingSum = useMemo(() => r.ingredients.reduce((s, t) => s + lineCost(t), 0), [r.ingredients]);

  // Décomposition de la pâte (grammes) pour le résultat du calculateur.
  const farineG = totalDough / addPct;
  const dough = [
    { k: "Farine", ic: "wheat", v: farineG, pct: "100 %", color: "#fcb900" },
    { k: "Eau", ic: "droplet", v: farineG * num(dp.hydra) / 100, pct: `${dp.hydra} %`, color: "#3aa0e0" },
    ...(num(dp.bassinage) > 0 ? [{ k: "Eau de bassinage", ic: "droplet", v: farineG * num(dp.bassinage) / 100, pct: `${dp.bassinage} %`, color: "#7fc7ef" }] : []),
    { k: "Sel", ic: "salt", v: farineG * num(dp.sel) / 100, pct: `${dp.sel} %`, color: "#c9cede" },
    ...(num(dp.huile) > 0 ? [{ k: "Huile", ic: "oil", v: farineG * num(dp.huile) / 100, pct: `${dp.huile} %`, color: "#7bb661" }] : []),
    { k: "Levure", ic: "yeast", v: farineG * num(dp.levure) / 100, pct: `${dp.levure} %`, color: "#ff6900" },
  ];

  // Coûts selon le type de fiche.
  const perUnit = (isPate || isRecette) ? doughPerUnit + ingSum : ingSum; // par pâton / pizza / lot
  const totalCost = isPrep ? ingSum : perUnit * (isPate ? effNb : nb);
  const pricePerPizza = perUnit * (1 + num(r.margin_pct) / 100);
  const marginEur = pricePerPizza - perUnit;
  const prep = prepUnitCost(totalCost, r.yield_qty, r.yield_unit);

  async function persist(overrides = {}) {
    setBusy(true);
    const merged = { ...r, ...overrides };
    const payload = { ...merged, name: (overrides.name ?? r.name).trim() || `${r.type} maison`,
      // En mode « par farine », le rendement enregistré = nb de pâtons obtenus.
      servings: (merged.kind === "PATE" && dpMode === "farine") ? Math.max(1, effNb) : merged.servings,
      // dough_params (colonne JSON) sert de blob générique : pâte / déroulé garniture / cuisson.
      dough_params: merged.kind === "PATE" ? (merged.dough_params || DP_DEFAULT)
        : merged.kind === "PREPARATION" ? { steps: (merged.steps || []).map((s) => String(s).trim()).filter(Boolean) }
        : { cooking: merged.cooking || {} } };
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
      dpv = dpv || {};
      setR({ ...NEW(), ...d,
        dough_params: { ...DP_DEFAULT, ...(d.kind === "PATE" ? dpv : {}) },
        steps: Array.isArray(dpv.steps) ? dpv.steps : [],
        cooking: (dpv.cooking && typeof dpv.cooking === "object") ? { ...NEW_COOKING(), ...dpv.cooking } : NEW_COOKING(),
        ingredients: d.ingredients?.length ? d.ingredients : [] });
    } catch { /* ignore */ }
  }
  async function removeRecipe(id) {
    if (!window.confirm("Supprimer cette fiche ?")) return;
    try { await deleteRecipe(id); if (r.id === id) setR({ ...NEW(), kind: r.kind }); reload(); } catch { /* ignore */ }
  }
  const shared = r.visibility === "SHARED";
  // Liste « mes fiches » : uniquement le type de la page courante.
  const mine = saved.filter((s) => s.kind === kind);

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
      <button className="btn ghost" onClick={() => setR({ ...NEW(), kind: r.kind })} style={{ marginTop: 10, width: "100%", justifyContent: "center", color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.3)" }}><Icon name="plus" size={14} /> Nouvelle fiche</button>
    </>
  );

  const ingTitle = isPate ? "Ingrédients" : isPrep ? "Ingrédients" : "Garniture";
  const ingScope = isPate ? "(par pâton)" : isPrep ? "(pour le lot)" : "(par pizza)";

  return (
    <>
      <PageHead {...(HEADS[mode] || HEADS.realisation)} />

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Ligne 1 — identité + empâtement (pâte/recette) ou rendement (préparation) */}
        <div className="grid cols-2" style={{ gap: 22, alignItems: "start" }}>
          {!isPate && (
          <Card title={<span className="card-ttl"><Icon name={isRecette ? "pizza" : "list-checks"} size={16} /> {isRecette ? "La réalisation" : "La garniture"}</span>}>
            <div className="field"><label>Nom de la fiche</label>
              <input className="inp" value={r.name} onChange={set("name")} placeholder={isPrep ? "Ex. Sauce tomate San Marzano" : "Ex. Margherita du chef"} /></div>
            {isRecette && (
              <div className="field"><label>Type</label>
                <select className="inp" value={r.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            )}
            <div className="field" style={{ marginBottom: 0 }}><label>Description <span className="hint" style={{ fontWeight: 400 }}>· #tags pour catégoriser</span></label>
              <textarea className="inp" rows={4} value={r.description} onChange={set("description")} placeholder="Style, histoire, cuisson… #signature #24h" />
              <Tags text={r.description} /></div>
          </Card>
          )}

          {isPrep ? (
            <Card title={<span className="card-ttl"><Icon name="settings" size={16} /> Rendement</span>}>
              <p className="hint" style={{ margin: "0 0 12px" }}>Quantité totale produite par ce lot d'ingrédients. Sert à calculer le coût par unité quand la garniture est importée dans une réalisation.</p>
              <div className="grid cols-2" style={{ gap: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}><label>Quantité produite</label><input className="inp" type="number" step="0.1" min="0" value={r.yield_qty ?? ""} onChange={set("yield_qty")} /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>Unité</label>
                  <select className="inp" value={r.yield_unit || "g"} onChange={set("yield_unit")}>{YIELD_UNITS.map((u) => <option key={u} value={u}>{u === "piece" ? "pièce" : u}</option>)}</select></div>
              </div>
              <p className="hint" style={{ margin: "12px 0 0" }}>Coût total du lot <b>{euro(totalCost)}</b> → <b>{euro(prep.per)}</b> / {prep.unit}</p>
            </Card>
          ) : isPate ? (
            <Card title={<span className="card-ttl"><Icon name="settings" size={16} /> Calculateur de pâte</span>}>
              <div className="field"><label>Nom de la fiche</label>
                <input className="inp" value={r.name} onChange={set("name")} placeholder="Ex. Pâte napolitaine 24 h" /></div>

              {/* 1 · Typologie */}
              <div className="ate-lbl"><span className="ate-num">1</span> Typologie de pizza</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
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

              {/* Napolitaine — sous-sélecteur des cahiers des charges (STG / AVPN / École) */}
              {isNapo && (
                <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: "var(--surface2)" }}>
                  <div className="ate-lbl" style={{ marginBottom: 8 }}>Cahier des charges</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: napoSpec ? 12 : 0 }}>
                    {NAPO_SPECS.map((s) => (
                      <button key={s.key} onClick={() => applyNapoSpec(s)} title={s.src}
                        className={`btn sm ${dp.napoSpec === s.key ? "primary" : "ghost"}`}>{s.label}</button>
                    ))}
                  </div>
                  {napoSpec && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: "7px 16px", fontSize: 12 }}>
                      <span><span className="hint">Force</span> <b>W {napoSpec.wMin}–{napoSpec.wMax}</b></span>
                      <span><span className="hint">Hydratation</span> <b>{napoSpec.hydraMin}–{napoSpec.hydraMax} %</b></span>
                      <span><span className="hint">Sel</span> <b>{napoSpec.sel} %</b></span>
                      <span><span className="hint">Pâton</span> <b>{napoSpec.patonMin ? `${napoSpec.patonMin}–${napoSpec.patonMax} g` : `${napoSpec.paton} g`}</b></span>
                      <span><span className="hint">Huile</span> <b>aucune</b></span>
                      <span style={{ gridColumn: "1 / -1" }}><span className="hint">Levure :</span> {napoSpec.levureNote || "table du manuel (dose selon la T° de la farine)"}</span>
                      {napoSpec.ferment && <span style={{ gridColumn: "1 / -1" }}><span className="hint">Fermentation :</span> {napoSpec.ferment}</span>}
                      {napoSpec.cuisson && <span style={{ gridColumn: "1 / -1" }}><span className="hint">Cuisson :</span> {napoSpec.cuisson}</span>}
                      <span style={{ gridColumn: "1 / -1", marginTop: 2 }} className="hint">Source : {napoSpec.src}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 2 · Force de la farine (W) — Manuel École Pizza + plage par typologie */}
              <div className="ate-lbl"><span className="ate-num">2</span> Force de la farine (indice W)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {W_BRACKETS.map((b) => {
                  const reco = wOk(b.w);
                  return (
                    <button key={b.w} onClick={() => applyW(b)} title={reco ? b.use : `Déconseillé pour « ${curPreset.nom} » — vise ${wRangeLabel}`}
                      className={`btn sm ${curW.w === b.w ? "primary" : "ghost"}`} style={{ opacity: reco ? 1 : 0.45 }}>
                      {b.label}
                    </button>
                  );
                })}
              </div>
              <p className="hint" style={{ margin: "0 0 18px" }}>
                « {curPreset.nom} » : force recommandée <b>{wRangeLabel}</b>{indirectSel ? " (indirect → farine forte)" : ""}. {wOk(dp.w)
                  ? <>Coulage min. <b style={{ color: "var(--green)" }}>{recoMin} %</b> · plafond total <b>{maxTotal} %</b> <span style={{ opacity: .8 }}>(bassinage compris)</span>.</>
                  : <span style={{ color: "var(--ember1)" }}>La force choisie est hors de la plage conseillée pour cette typologie.</span>}
              </p>

              {/* 3 · Empâtement (+ Autolyse) */}
              <div className="ate-lbl"><span className="ate-num">3</span> Empâtement</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                {curPreset.methods.map((m) => {
                  const locked = methodLocked(m);
                  return (
                    <button key={m} onClick={() => !locked && setMethod(m)} disabled={locked}
                      className={`btn sm ${dp.method === m ? "primary" : "ghost"}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: locked ? 0.5 : 1 }}
                      title={locked ? "Débloqué au Niveau II (empâtements indirects)" : (INDIRECT.includes(m) ? `${m} — farine ≥ W320` : m)}>
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
              <p className="hint" style={{ margin: "0 0 18px" }}>Direct &amp; Autolyse → Niveau I · Biga &amp; Poolish (indirects) → Niveau II, farine ≥ W320.</p>

              {/* 4 · Hydratation (plage recommandée) + assaisonnement en % boulanger */}
              <div className="ate-lbl"><span className="ate-num">4</span> Hydratation &amp; assaisonnement</div>
              <HydraSlider val={num(dp.hydra)} recoMin={recoMin} recoMax={recoMax} eauPerKg={eauPerKg} set={setHydra} confirmed={napoLevFixed} />
              {/* Bassinage & hydratation totale — masqués pour un cahier confirmé (valeur unique fixée) */}
              {!napoLevFixed && (<>
                {bassMax > 0 ? (
                  <Slider label={`Eau de bassinage (facultatif · max ${bassMax} %)`} val={Math.min(num(dp.bassinage), bassMax)} min={0} max={bassMax} step={0.5} set={(v) => setDP("bassinage", v)} suffix=" %" />
                ) : (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <b style={{ fontSize: 13 }}>Eau de bassinage</b>
                      <span className="hydra-badge high">Plafond atteint</span>
                    </div>
                    <p className="hint" style={{ margin: 0, fontSize: 11.5 }}>Hydratation totale au plafond de cette force — monte le W pour pouvoir bassiner davantage.</p>
                  </div>
                )}
                <p className="hint" style={{ margin: "2px 0 12px", fontSize: 11.5 }}>Hydratation totale <b style={{ color: totalHydra > maxTotal ? "var(--ember1)" : "var(--green)" }}>{totalHydra} %</b> <span style={{ opacity: .8 }}>(coulage {num(dp.hydra)} % + bassinage {num(dp.bassinage)} %)</span> · plafond <b>{maxTotal} %</b> pour {curW.label}.</p>
              </>)}
              <Slider label="Sel" val={num(dp.sel)} min={0} max={4} step={0.1} set={(v) => setDP("sel", v)} suffix=" %" />
              {isNapo ? (
                <div style={{ marginBottom: 12 }} title="Interdite par le cahier des charges napolitain">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, opacity: 0.55 }}>
                    <b style={{ fontSize: 13, textDecoration: "line-through" }}>Huile d'olive</b>
                    <span className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="x" size={12} /> non autorisée</span>
                  </div>
                  <input type="range" min={0} max={6} step={0.5} value={0} disabled aria-disabled="true"
                    style={{ width: "100%", accentColor: "var(--dim)", opacity: 0.4, cursor: "not-allowed" }} />
                  <p className="hint" style={{ margin: "3px 0 0", fontSize: 11.5 }}>Pas d'huile dans la pâte napolitaine (cahiers STG &amp; AVPN).</p>
                </div>
              ) : (<>
                <Slider label="Huile d'olive (facultative)" val={num(dp.huile)} min={0} max={6} step={0.5} set={(v) => setDP("huile", v)} suffix=" %" />
                {curPreset.huile > 0 && num(dp.huile) === 0 && (
                  <p className="hint" style={{ margin: "-6px 0 10px", fontSize: 11.5 }}>
                    « {curPreset.nom} » prévoit ≈ {curPreset.huile} % d'huile. Sans huile, complète par l'eau :
                    <button type="button" className="btn sm ghost" style={{ padding: "1px 8px", marginLeft: 6 }}
                      onClick={() => setDP("bassinage", Math.min(num(dp.bassinage) + curPreset.huile, Math.max(0, maxTotal - num(dp.hydra))))}>+ {curPreset.huile} % eau</button>
                  </p>
                )}
              </>)}
              {/* Levure : dose du manuel (T° farine) — sauf cahier napolitain qui la fixe (basse) */}
              {!napoLevFixed && <>
                <div style={{ fontSize: 12.5, fontWeight: 600, margin: "4px 0 6px" }}>Type de levure</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {LEVURE_TYPES.map((y) => (
                    <button key={y.k} onClick={() => setYeastType(y.k)} className={`btn sm ${yeastType === y.k ? "primary" : "ghost"}`}>{y.label}</button>
                  ))}
                </div>
              </>}
              <LevureControl val={num(dp.levure)} reco={levReco} recoG={levRecoG} typeLabel={yeastLabel(yeastType)} flourTemp={flourTemp} set={(v) => setDP("levure", v)}
                bounded={napoLevFixed ? { min: napoSpec.levureMin, max: napoSpec.levureMax, note: <>Cahier <b>{napoSpec.label}</b> — {napoSpec.levureNote}</> } : null} />
              {!napoLevFixed && yeastType === "seche_active" && <p className="hint" style={{ margin: "-2px 0 6px", fontSize: 11.5 }}>À réhydrater dans l'eau à ≈ 38 °C (jamais &gt; 50 °C, sinon elle meurt).</p>}

              {/* 5 · Production : quantités & prix */}
              <div className="ate-lbl" style={{ marginTop: 4 }}><span className="ate-num">5</span> Production</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <button className={`btn sm ${dpMode === "patons" ? "primary" : "ghost"}`} onClick={() => setDP("mode", "patons")}>Par pâtons</button>
                <button className={`btn sm ${dpMode === "farine" ? "primary" : "ghost"}`} onClick={() => setDP("mode", "farine")}>Par farine</button>
              </div>
              <div className="grid cols-2" style={{ gap: 12, marginBottom: 4 }}>
                {dpMode === "farine" ? (
                  <div className="field" style={{ marginBottom: 8 }}><label>Farine disponible (kg)</label><input className="inp" type="number" min="0" step="0.5" value={dp.flourKg ?? 10} onChange={(e) => setDP("flourKg", Number(e.target.value))} /></div>
                ) : (
                  <div className="field" style={{ marginBottom: 8 }}><label>Nombre de pâtons</label><input className="inp" type="number" min="1" value={r.servings} onChange={set("servings")} /></div>
                )}
                <div className="field" style={{ marginBottom: 8 }}><label>Poids d'un pâton (g)</label><input className="inp" type="number" min="100" value={r.paton_g} onChange={set("paton_g")} /></div>
              </div>
              {dpMode === "farine" && <p className="hint" style={{ margin: "0 0 8px" }}>→ {effNb} pâtons de {patonG} g{reste > 5 ? ` · reste ${gfmt(reste)}` : ""}</p>}
              <div className="field" style={{ marginBottom: 16 }}><label>Prix de la farine (€/kg)</label><input className="inp" type="number" step="0.01" value={r.flour_price} onChange={set("flour_price")} /></div>

              {/* Réglages avancés — repliés par défaut (progressive disclosure) */}
              <Collapse title={<><Icon name="thermometer" size={14} /> Température de la pâte (TB 50)</>} hint="eau de coulage">
                <div className="grid cols-2" style={{ gap: 12, alignItems: "stretch" }}>
                  <div className="field" style={{ marginBottom: 0 }}><label>Température de la farine (°C)</label>
                    <input className="inp" type="number" min="0" max="35" value={dp.flourTemp ?? 17} onChange={(e) => setFlourTemp(Number(e.target.value))} /></div>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 1, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
                    <span className="hint" style={{ fontSize: 11 }}>Eau de coulage <span style={{ opacity: .7 }}>(50 − 2×T°)</span></span>
                    <b className="tnum" style={{ fontSize: 19, color: eauCoulage < 4 ? "var(--blue)" : "var(--text)" }}>{eauCoulage} °C</b>
                  </div>
                </div>
                {eauCoulage < 2 && <p className="hint" style={{ margin: "8px 0 0", color: "var(--ember1)" }}>Farine trop chaude — mets-en une partie au frais la veille (conseil du manuel).</p>}
              </Collapse>

              <Collapse title={<><Icon name="clock" size={14} /> Stockage &amp; fermentation</>} hint="pointage, apprêt, chambre froide">
                {indirectSel && (
                  <div className="field" style={{ marginBottom: 10 }}><label>Temps de pré-ferment — {dp.method} (heures)</label>
                    <input className="inp" type="number" min="0" step="0.5" value={dp.prefermentH ?? ""} onChange={(e) => setDP("prefermentH", e.target.value)} placeholder="Ex. 16" /></div>
                )}
                <div className="field" style={{ marginBottom: 12 }}><label>Temps de fermentation total (heures)</label>
                  <input className="inp" type="number" min="0" step="0.5" value={dp.fermentH ?? ""} onChange={(e) => setDP("fermentH", e.target.value)} placeholder="Ex. 24" /></div>
                <p className="hint" style={{ margin: "0 0 10px" }}>Conditions — remplis l'une, l'autre, ou <b>les deux</b> (ex. 24 h à 20 °C puis 48 h à 4 °C).</p>
                <div className="stock-cond">
                  <span className="stock-lbl"><Icon name="thermometer" size={14} /> À température ambiante</span>
                  <div className="field" style={{ marginBottom: 0 }}><label>Durée (h)</label><input className="inp" type="number" min="0" step="0.5" value={dp.ambH ?? ""} onChange={(e) => setDP("ambH", e.target.value)} placeholder="—" /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>Température (°C)</label><input className="inp" type="number" value={dp.ambT ?? ""} onChange={(e) => setDP("ambT", e.target.value)} placeholder="Ex. 20" /></div>
                </div>
                <div className="stock-cond" style={{ marginBottom: 0 }}>
                  <span className="stock-lbl"><Icon name="thermometer" size={14} /> En température contrôlée <span className="hint" style={{ fontWeight: 400 }}>· chambre froide</span></span>
                  <div className="field" style={{ marginBottom: 0 }}><label>Durée (h)</label><input className="inp" type="number" min="0" step="0.5" value={dp.ctrlH ?? ""} onChange={(e) => setDP("ctrlH", e.target.value)} placeholder="—" /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>Température (°C)</label><input className="inp" type="number" value={dp.ctrlT ?? ""} onChange={(e) => setDP("ctrlT", e.target.value)} placeholder="Ex. 4" /></div>
                </div>
              </Collapse>

              {/* Description */}
              <div className="field" style={{ marginBottom: 0 }}><label>Description <span className="hint" style={{ fontWeight: 400 }}>· #tags pour catégoriser</span></label>
                <textarea className="inp" rows={3} value={r.description} onChange={set("description")} placeholder="Pointage/apprêt, cuisson… #napolitaine #24h" />
                <Tags text={r.description} /></div>
            </Card>
          ) : (
            <Card title={<span className="card-ttl"><Icon name="settings" size={16} /> Empâtement</span>}>
              <div className="field"><label>Nombre de pizzas</label><input className="inp" type="number" min="1" value={r.servings} onChange={set("servings")} /></div>
              <div className="field"><label>Poids d'un pâton (g)</label><input className="inp" type="number" min="100" value={r.paton_g} onChange={set("paton_g")} /></div>
              <div className="field" style={{ marginBottom: 12 }}><label>Prix de la farine (€/kg)</label><input className="inp" type="number" step="0.01" value={r.flour_price} onChange={set("flour_price")} /></div>
              <p className="hint" style={{ margin: 0 }}>≈ {((nb * patonG) / 1000 / addPct).toFixed(2)} kg de farine pour {nb} {doughUnit}s · coût pâte <b>{euro(doughPerUnit)}</b> / {doughUnit}</p>
            </Card>
          )}

          {/* Pâte — panneau bleu (résultat) à côté du calculateur */}
          {isPate && (
            <div className="card dough-result">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{curPreset.nom} · empâtement {String(dp.method).toLowerCase()}{dp.autolyse ? " + autolyse" : ""}</div>
              <div style={{ font: "800 24px/1.1 var(--font-d)", margin: "4px 0 2px" }}>{gfmt(totalDough)} de pâte</div>
              <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12, marginBottom: 12 }}>{effNb} pâtons de {patonG} g{dpMode === "farine" && reste > 5 ? ` · reste ${gfmt(reste)}` : ""}</div>
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
                <Row label="Coût pâte / pâton" value={euro(doughPerUnit)} accent />
              </div>
              <p className="hint" style={{ color: "rgba(255,255,255,.75)", margin: "12px 0 0" }}>Importable dans une réalisation comme ingrédient, à son coût / pâton.</p>
              {actions}
            </div>
          )}
        </div>

        {/* Ligne 2 — résultat : panneau prix conseillé (recette) ou coût unitaire (pâte / préparation) */}
        {isRecette ? (
          <div className="card dough-result fr-result">
            <div>
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{r.name || "Nouvelle réalisation"} · {r.type}</div>
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
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{r.name || "Nouvelle garniture"}</div>
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
              <p className="hint" style={{ color: "rgba(255,255,255,.75)", margin: "0 0 4px" }}>Cette fiche pourra être importée dans une réalisation comme ingrédient, à son coût unitaire.</p>
              {actions}
            </div>
          </div>
        )}

        {/* Ligne 3 — ingrédients / garniture (pas pour la pâte, gérée par le calculateur) */}
        {!isPate && (
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
          <p className="hint" style={{ margin: "16px 0 0", fontSize: 13 }}>Coût {isPrep ? "total des ingrédients" : "garniture / pizza"} : <b>{euro(ingSum)}</b></p>
        </Card>
        )}

        {/* Déroulé de fabrication (garniture) — la « fiche technique » */}
        {isPrep && (
          <Card title={<span className="card-ttl"><Icon name="list-checks" size={16} /> Déroulé de fabrication <span className="hint" style={{ fontWeight: 400 }}>· fiche technique</span></span>}
            more={<button className="btn sm ghost" onClick={addStep}><Icon name="plus" size={14} /> Ajouter une étape</button>}>
            {steps.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Décris les étapes de fabrication, dans l'ordre. Ex. « Mixer les tomates pelées », « Ajouter sel &amp; huile », « Réserver au frais »…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span className="ate-num" style={{ marginTop: 8 }}>{i + 1}</span>
                    <textarea className="inp" rows={1} value={s} onChange={(e) => setStep(i, e.target.value)} placeholder={`Étape ${i + 1}`} style={{ flex: 1, resize: "vertical", minHeight: 38 }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button className="iconbtn" title="Monter" disabled={i === 0} onClick={() => moveStep(i, -1)}><Icon name="chevron-up" size={14} /></button>
                      <button className="iconbtn" title="Descendre" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}><Icon name="chevron-down" size={14} /></button>
                    </span>
                    <button className="iconbtn del" title="Retirer l'étape" onClick={() => delStep(i)} style={{ marginTop: 4 }}><Icon name="trash" size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Cuisson (réalisation) */}
        {isRecette && (
          <Card title={<span className="card-ttl"><Icon name="flame" size={16} /> Cuisson</span>}>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}><label>Type de four</label>
                <select className="inp" value={cooking.type || ""} onChange={(e) => setCook("type", e.target.value)}>
                  <option value="">— à choisir —</option>
                  {COOK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Température (°C)</label>
                <input className="inp" type="number" min="0" value={cooking.temp ?? ""} onChange={(e) => setCook("temp", e.target.value)} placeholder="Ex. 430" /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Énergie / combustible</label>
                <input className="inp" value={cooking.energy ?? ""} onChange={(e) => setCook("energy", e.target.value)} placeholder="Ex. Bois de hêtre, gaz, 380 V…" /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>Temps (min)</label>
                <input className="inp" type="number" min="0" step="0.5" value={cooking.time ?? ""} onChange={(e) => setCook("time", e.target.value)} placeholder="Ex. 4" /></div>
            </div>
          </Card>
        )}

        {/* Ligne 4 — mes fiches enregistrées (du type de la page) */}
        <Card title={<span className="card-ttl"><Icon name="history" size={16} /> {SAVED_TITLE[kind]}</span>}>
          {mine.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>{SAVED_EMPTY[kind]}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {mine.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span className="fiche-tag">{KIND_LABEL[s.kind]}</span>
                  <span style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{s.kind === "RECETTE" && s.type ? s.type : KIND_LABEL[s.kind]}{s.visibility === "SHARED" ? " · partagée" : ""}</span>
                    <Tags text={s.description} /></span>
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
