import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro, euroFixe, dateHeure } from "../lib/format.js";
import { searchCatalog, getCatalogFamilies, getCatalogBrands, getComponents, getRecipe, createRecipe, updateRecipe, getMyFormations, getMercuriale, photoFicheUrl, envoyerPhotoFiche, retirerPhotoFiche } from "../api/apiClient.js";
import { num, W_BRACKETS, wBracket, maxTotalFor, PRESETS, NEEDS_LABEL, INDIRECT, INDIRECT_WMIN, NAPO_SPECS, napoSpecOf, DP_DEFAULT, gfmt, addPctOf, LEVURE_TYPES, recoLevure, yeastLabel, computeBuild, PRICE_DEFAULT } from "../lib/dough.js";
import { reduireSiImage, PROFILS } from "../lib/image.js";
import { perWeightUnit, unitShort } from "../lib/garnitures.js";
import { coutFiche, coutLigne, repartition, pctPart, phraseCout, aUneFichePate, pateEstimeeActive, MASS_VOL } from "../lib/coutFiche.js";
import Mercuriale from "../components/Mercuriale.jsx";
import MercProductPicker from "../components/MercProductPicker.jsx";
import PairingSuggest from "../components/PairingSuggest.jsx";
import FichePrint from "../components/FichePrint.jsx";
import { UserContext } from "../context/UserContext.jsx";

/**
 * Fiche technique — trois types composables :
 *  • PÂTE (empâtement) : calculée en pourcentage boulanger (calculateur intégré : typologie,
 *                        empâtement direct/indirect, hydratation, sel, huile, levure).
 *  • PRÉPARATION (garniture) : une base (sauce tomate = tomate + sel + huile) et son rendement.
 *  • RECETTE (réalisation) : une pizza complète = sa pâte + des garnitures importées + des
 *                        ingrédients de la mercuriale ou du catalogue.
 *
 * LA MISE EN PAGE (2026-09-29). À gauche, la fiche telle qu'elle s'imprime : identité,
 * composition, procédé. À droite, le résultat, COLLANT, avec les boutons : on règle une quantité
 * sans perdre de vue ce qu'elle coûte. Le panneau vivait au milieu de la page, et les boutons
 * avec lui — sur une réalisation, « Enregistrer » disparaissait dès qu'on descendait composer.
 * Sous ~1 100 px de place, le résultat passe sous la fiche et un dock garde le prix et
 * « Enregistrer » sous le pouce.
 *
 * UN SEUL CHAMP POUR AJOUTER : mercuriale, fiches, catalogue Metro et ligne à la main dans la
 * même recherche (`AjoutLigne`), là où quatre boutons ouvraient quatre fenêtres différentes.
 *
 * LES CHIFFRES viennent de lib/coutFiche.js, que l'impression et la Communauté appellent aussi :
 * la pâte n'y est comptée qu'une fois, et le coût au kg d'une garniture y a une seule définition,
 * celle du serveur quand une réalisation l'importe.
 */
const TYPES = ["Classique", "Contemporaine", "Napolitaine", "Teglia", "Pala"];
const YIELD_UNITS = ["g", "kg", "ml", "l", "piece"];
// Constantes & helpers de calcul d'empâtement (W, presets, cahiers napolitains, levure, TB50…)
// → source unique dans lib/dough.js, importée ci-dessus. Partagée avec l'assistant pas-à-pas.

/* Le RENDEMENT naît VIDE. Il valait 1 000 g, que personne n'ajustait : toute garniture se
   chiffrait comme si elle produisait un kilo, quel que soit son poids réel. Vide, la règle
   commune s'applique — le coût au kg se calcule sur le poids des ingrédients. */
const NEW = () => ({
  id: null, kind: "RECETTE", name: "", type: "Classique", description: "", servings: 6, paton_g: 250, flour_price: 1.2,
  visibility: "PRIVATE", margin_pct: 70, yield_qty: "", yield_unit: "g", dough_params: { ...DP_DEFAULT },
  ingredients: [], steps: [], cooking: { type: "", temp: "", energy: "", time: "" }, pate: "",
});

// Chaque page (mode) est verrouillée sur un type de fiche — trois builders distincts.
const MODE_KIND = { empatement: "PATE", garniture: "PREPARATION", realisation: "RECETTE" };
const KIND_LABEL = { PATE: "Empâtement", PREPARATION: "Garniture", RECETTE: "Réalisation" };
const KIND_ICON = { PATE: "wheat", PREPARATION: "list-checks", RECETTE: "pizza" };
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

// Recherche tolérante : sans casse ni accents (« creme » trouve « Crème »).
const normaliser = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const nbSig = (v) => (v === "" || v === null || v === undefined ? "" : String(Number(v)));
const nbChamp = (v) => (v === "" || v === null || v === undefined ? "" : Number(v));
const grammes = (g) => `${Math.round(num(g)).toLocaleString("fr-FR")}\u00a0g`;
const kgFr = (kg) => (num(kg) < 1 ? grammes(num(kg) * 1000) : `${num(kg).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}\u00a0kg`);
const pctSigne = (x) => `${x < 0 ? "−" : "+"}${Math.abs(Math.round(x * 100))}\u00a0%`;
const heure = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * L'EMPREINTE de ce qui s'enregistre : comparée à celle du dernier chargement ou enregistrement,
 * elle dit s'il reste des modifications à enregistrer. Les nombres passent par `Number` — le
 * serveur rend « 80.000 » là où le champ tape « 80 », et la fiche se croirait modifiée à
 * l'ouverture.
 */
function signature(r) {
  return JSON.stringify([
    r.name || "", r.type || "", r.description || "", nbSig(r.servings), nbSig(r.paton_g), nbSig(r.flour_price),
    nbSig(r.margin_pct), nbSig(r.yield_qty), r.yield_unit || "", r.visibility || "PRIVATE",
    r.kind === "PATE" ? r.dough_params : null, r.steps || [], r.kind === "RECETTE" ? (r.cooking || {}) : null, r.pate || "",
    (r.ingredients || []).map((t) => [t.label || "", nbSig(t.qty), t.unit, nbSig(t.unit_price), t.product_id || null, t.component_recipe_id || null]),
  ]);
}

// Curseur simple (empâtement en pourcentage boulanger).
function Slider({ label, val, min, max, step, set, suffix }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <b style={{ fontSize: 13 }}>{label}</b>
        <span className="chiffres" style={{ fontWeight: 700, color: "var(--blue)" }}>{val}{suffix}</span>
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
            <span className="chiffres" style={{ fontWeight: 800, color: "var(--green)", fontSize: 15 }}>{val} %</span>
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
          <span className="chiffres" style={{ fontWeight: 800, color: c, fontSize: 15 }}>{val} %</span>
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
            <span className="chiffres" style={{ fontWeight: 800, color: "var(--green)", fontSize: 15 }}>{val} %</span>
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
          <span className="chiffres" style={{ fontWeight: 800, color: c, fontSize: 15 }}>{val} %</span>
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
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Catalogue d'ingrédients</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="gs-bar">
            <span className="gs-search">
              <Icon name="search" size={14} aria-hidden="true" />
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
                <span className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{p.unit_ht != null ? `${euro(p.unit_ht)}/${unitLabel(p.type_unity)}` : "-"}</span>
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

// Fenêtre « Choisir une fiche » : empâtements / garnitures (à soi ou partagés) avec leur coût
// unitaire calculé, à insérer comme ingrédient. `kinds` restreint la liste (la pâte d'une
// réalisation ne se choisit que parmi les empâtements).
function ComponentPickerModal({ onClose, onAdd, added, excludeId, kinds = null }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      getComponents(q).then((r) => setRes((r.data || []).filter((c) => c.id !== excludeId && (!kinds || kinds.includes(c.kind))))).catch(() => setRes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, excludeId, kinds]);
  const pates = kinds && kinds.length === 1 && kinds[0] === "PATE";
  return createPortal(
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>{pates ? "Choisir un empâtement" : "Importer une fiche technique"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="gs-search">
            <Icon name="search" size={14} aria-hidden="true" />
            <input placeholder={pates ? "Rechercher un empâtement…" : "Rechercher un empâtement ou une garniture…"} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {q && <button className="gs-clear" title="Effacer" onClick={() => setQ("")}><Icon name="x" size={13} /></button>}
          </span>
          <div className="gs-res" style={{ maxHeight: "48vh", minHeight: 160 }}>
            {res.length === 0 ? (
              <p className="hint" style={{ margin: "auto", padding: 24 }}>{pates ? "Aucun empâtement. Crée-en un d'abord dans Mes fiches techniques." : "Aucun empâtement ni garniture. Crée-en d'abord."}</p>
            ) : res.map((c) => (
              <div key={c.id} className="gs-item">
                <span className={"fe-kind sm fe-k-" + c.kind}><Icon name={KIND_ICON[c.kind] || "file-text"} size={12} /> {KIND_LABEL[c.kind] || "Fiche"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</b>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{c.kind === "PATE" ? `pâton de ${num(c.piece_g) || "?"} g` : c.unit === "piece" ? "à l'unité" : "au poids"}</span>
                </span>
                <span className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{euroFixe(c.unit_price)}/{c.unit === "piece" ? (c.kind === "PATE" ? "pâton" : "pc") : "kg"}</span>
                <button className={"btn sm " + (added.has(c.id) ? "ghost" : "primary")} disabled={added.has(c.id)} onClick={() => onAdd(c)}>
                  <Icon name={added.has(c.id) ? "check" : "plus"} size={13} /> {added.has(c.id) ? "Ajoutée" : "Choisir"}
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

/**
 * Modale « Depuis ma mercuriale » : choisir un produit de sa mercuriale → ligne d'ingrédient
 * (prix et unité repris de la mercuriale). Bascule « gestion » pour compléter sa mercuriale
 * (catalogue Metro + frais/marché) sans quitter la fiche.
 */
function MercurialeModal({ items, reload, onClose, onAdd }) {
  const [view, setView] = useState("pick"); // pick | manage
  return createPortal(
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>{view === "manage" ? "Ma mercuriale" : "Depuis ma mercuriale"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          {view === "manage"
            ? <Mercuriale items={items} reload={reload} onBack={() => setView("pick")} />
            : <MercProductPicker items={items} onAdd={onAdd} addedKeys={null} onManage={() => setView("manage")} />}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* D'où vient une ligne : sa pastille dit d'où vient son PRIX. Une ligne de la mercuriale se
   reconnaît à son produit Metro rattaché, ou, pour le frais, à son libellé. */
const SOURCES = {
  merc: { ic: "coins", t: "Mercuriale" },
  metro: { ic: "tag", t: "Metro" },
  main: { ic: "pencil", t: "À la main" },
};
function sourceDe(t, merc) {
  if (t.component_recipe_id) return "fiche";
  if (t.product_id) return merc.some((m) => m.catalog_product_id === t.product_id) ? "merc" : "metro";
  const l = normaliser(t.label);
  return l && merc.some((m) => normaliser(m.label) === l) ? "merc" : "main";
}
function Source({ source, kind }) {
  if (source === "fiche") {
    return <span className={"fe-src fe-k-" + (kind || "AUTRE")}><Icon name="file-text" size={12} /> {KIND_LABEL[kind] || "Fiche"}</span>;
  }
  const s = SOURCES[source] || SOURCES.main;
  return <span className={"fe-src s-" + source}><Icon name={s.ic} size={12} /> {s.t}</span>;
}

/* La part d'une ligne dans le coût, sous son montant : la barre prend la couleur de la
   répartition du panneau pour les trois lignes qui coûtent le plus. */
function Part({ c }) {
  return (
    <span className="fe-part">
      <span className="fe-part-bar"><span style={{ width: `${Math.min(100, c.part * 100)}%`, ...(c.couleur ? { background: c.couleur } : {}) }} /></span>
      <span className="fe-part-pct">{pctPart(c.part)}</span>
    </span>
  );
}

/**
 * Une ligne de la composition. Le NOM se modifie sur place (sauf une fiche importée, qui porte
 * le nom de sa fiche) ; un prix venu du catalogue est VERROUILLÉ, et le cadenas le libère — il
 * fallait jusqu'ici renommer la ligne pour pouvoir saisir un prix, ce que rien n'indiquait.
 */
function LigneCompo({ t, i, c, source, onChange, onRemove, onOuvrir }) {
  const comp = !!t.component_recipe_id;
  const verrou = comp || !!t.product_id;
  const piece = t.unit === "piece";
  const pate = comp && t.component_kind === "PATE";
  const uPrix = piece ? (pate ? "pâton" : "pc") : "kg";
  const uQte = piece ? (pate ? (num(t.qty) > 1 ? "pâtons" : "pâton") : "pc") : "g";
  const nom = String(t.label || "").trim() || "cet ingrédient";
  return (
    <div className="fe-ing" data-ligne={i}>
      <div className="fe-ing-nom">
        {comp ? (
          <span className="fe-ing-titre">
            <span>{t.label}</span>
            {onOuvrir && <button type="button" className="fe-open" onClick={onOuvrir} aria-label={`Ouvrir la fiche ${t.label}`} title="Ouvrir cette fiche"><Icon name="arrow-up-right" size={15} /></button>}
          </span>
        ) : (
          <input className="fe-ing-label" data-champ="nom" value={t.label} maxLength={255} placeholder="Nom de l'ingrédient"
            aria-label="Nom de l'ingrédient" onChange={(e) => onChange({ label: e.target.value })} />
        )}
        <Source source={source} kind={t.component_kind} />
      </div>
      <div className={"fe-ing-mes" + (verrou ? " fixe" : "")}>
        {verrou ? <span className="fe-ing-u">{uPrix === "pc" ? "pièce" : uPrix}</span> : (
          <select className="inp" value={t.unit} onChange={(e) => onChange({ unit: e.target.value })} aria-label={`Mesure de ${nom}`}>
            <option value="g">kg</option><option value="piece">pièce</option>
          </select>
        )}
      </div>
      <div className="fe-ing-prix">
        {verrou ? (
          <span className="fe-prix-fixe">
            {euroFixe(t.unit_price)}/{uPrix}
            {comp ? (
              <span className="fe-lock" title="Coût de la fiche importée : il suit la fiche."><Icon name="lock" size={12} /></span>
            ) : (
              <button type="button" className="fe-lock" onClick={() => onChange({ product_id: null })}
                aria-label={`Saisir le prix de ${nom} à la main`}
                title={`${source === "merc" ? "Prix de ta mercuriale" : "Prix du catalogue Metro"}. Cliquer pour le saisir à la main.`}>
                <Icon name="lock" size={12} />
              </button>
            )}
          </span>
        ) : (
          <span className="fe-num">
            <input className="inp" type="number" step="0.01" min="0" inputMode="decimal" data-champ="prix" value={t.unit_price}
              onChange={(e) => onChange({ unit_price: e.target.value })} aria-label={`Prix de ${nom}, en euros par ${piece ? "pièce" : "kilo"}`} />
            <span>€/{uPrix}</span>
          </span>
        )}
      </div>
      <div className="fe-ing-qte">
        <span className="fe-num">
          <input className="inp" type="number" min="0" step={piece ? 1 : 5} inputMode="decimal" data-champ="qte" value={t.qty}
            onChange={(e) => onChange({ qty: e.target.value })} aria-label={`Quantité de ${nom}, en ${piece ? (pate ? "pâtons" : "pièces") : "grammes"}`} />
          <span>{uQte}</span>
        </span>
      </div>
      <div className="fe-ing-cout">
        <b className="chiffres">{euroFixe(c.cout)}</b>
        <Part c={c} />
      </div>
      <button type="button" className="fe-icobtn del fe-ing-del" onClick={onRemove} aria-label={`Retirer ${nom}`} title="Retirer"><Icon name="trash" size={16} /></button>
    </div>
  );
}

/**
 * La pâte ESTIMÉE d'une réalisation qui n'importe pas d'empâtement : l'ancienne carte
 * « Empâtement » (pâton + prix de la farine), devenue une ligne. Elle s'efface d'elle-même dès
 * qu'une fiche Empâtement entre dans la composition — c'est ce qui empêche de compter la pâte
 * deux fois.
 */
function LignePateEstimee({ r, c, set, onRetirer, onChoisir }) {
  return (
    <div className="fe-ing est" data-ligne="estimee">
      <div className="fe-ing-nom">
        <span className="fe-ing-titre"><span>Pâte (estimation)</span></span>
        <span className="fe-ing-src">
          <span className="fe-src s-est" title="Une pâte classique : 55 % d'eau, 2 % de sel, 2,5 % d'huile, 0,35 % de levure. La farine au prix saisi, le reste aux prix indicatifs.">
            <Icon name="wheat" size={12} /> Estimation
          </span>
          <button type="button" className="fe-lien" onClick={onChoisir}>Choisir mon empâtement</button>
        </span>
      </div>
      <div className="fe-ing-mes fixe"><span className="fe-ing-u">pâton</span></div>
      <div className="fe-ing-prix">
        <span className="fe-num">
          <input className="inp" type="number" step="0.01" min="0" inputMode="decimal" value={r.flour_price} onChange={set("flour_price")}
            aria-label="Prix de la farine, en euros par kilo" />
          <span>€/kg</span>
        </span>
        <span className="fe-ing-note">farine</span>
      </div>
      <div className="fe-ing-qte">
        <span className="fe-num">
          <input className="inp" type="number" min="1" step="10" inputMode="numeric" value={r.paton_g} onChange={set("paton_g")}
            aria-label="Poids du pâton, en grammes" />
          <span>g</span>
        </span>
        <span className="fe-ing-note">pâton</span>
      </div>
      <div className="fe-ing-cout">
        <b className="chiffres">{euroFixe(c.cout)}</b>
        <Part c={c} />
      </div>
      <button type="button" className="fe-icobtn del fe-ing-del" onClick={onRetirer} aria-label="Ne compter aucune pâte" title="Ne compter aucune pâte"><Icon name="trash" size={16} /></button>
    </div>
  );
}

/**
 * UN SEUL CHAMP POUR AJOUTER. Il cherche, dans l'ordre : ma mercuriale (sur place), mes fiches
 * (réalisation seulement), le catalogue Metro (à partir de deux lettres) — et propose toujours
 * la ligne à la main, avec ce qu'on a tapé pour nom. Au clavier : flèches, Entrée, Échap.
 * Sur téléphone, la liste s'ouvre en feuille depuis le bas de l'écran.
 */
function AjoutLigne({ avecFiches, merc, excludeId, dejaProduits, dejaFiches, dejaLabels, onMerc, onProduit, onFiche, onMain, onCatalogue, onMercuriale }) {
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [fiches, setFiches] = useState([]);
  const [metro, setMetro] = useState([]);
  const [actif, setActif] = useState(0);
  const boite = useRef(null);
  const champ = useRef(null);
  const qt = q.trim();

  useEffect(() => {
    if (!ouvert || !avecFiches) return undefined;
    const t = setTimeout(() => {
      getComponents(qt).then((res) => setFiches((res.data || []).filter((c) => c.id !== excludeId))).catch(() => setFiches([]));
    }, 200);
    return () => clearTimeout(t);
  }, [ouvert, qt, avecFiches, excludeId]);
  useEffect(() => {
    if (!ouvert || qt.length < 2) { setMetro([]); return undefined; }
    const t = setTimeout(() => {
      searchCatalog({ q: qt, limit: 5 }).then((res) => setMetro(res.data || [])).catch(() => setMetro([]));
    }, 250);
    return () => clearTimeout(t);
  }, [ouvert, qt]);
  useEffect(() => { setActif(0); }, [qt]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);

  const qn = normaliser(qt);
  const mesMerc = merc.filter((m) => !qn || normaliser(`${m.label} ${m.brand || ""} ${m.family || ""}`).includes(qn)).slice(0, 6);
  const groupes = [
    { cle: "merc", titre: "Ma mercuriale", icone: "coins", items: mesMerc.map((m) => ({
      id: `m-${m.id}`, label: m.label, sous: [m.family, m.brand].filter(Boolean).join(" · "),
      prix: `${euroFixe(num(m.price))}/${unitShort(m.unit)}`,
      deja: (!!m.catalog_product_id && dejaProduits.has(m.catalog_product_id)) || dejaLabels.has(normaliser(m.label)),
      choisir: () => onMerc(m) })) },
    avecFiches && { cle: "fiches", titre: "Mes fiches", icone: "file-text", items: fiches.slice(0, 6).map((c) => ({
      id: `f-${c.id}`, label: c.name, sous: KIND_LABEL[c.kind] || "Fiche", kind: c.kind,
      prix: `${euroFixe(c.unit_price)}/${c.unit === "piece" ? (c.kind === "PATE" ? "pâton" : "pc") : "kg"}`,
      deja: dejaFiches.has(c.id), choisir: () => onFiche(c) })) },
    { cle: "metro", titre: "Prix du marché · Metro", icone: "tag", items: metro.map((p) => ({
      id: `p-${p.id}`, label: p.name, sous: [p.brand, p.family].filter(Boolean).join(" · "),
      prix: p.unit_ht != null ? `${euroFixe(p.unit_ht)}/${unitLabel(p.type_unity)}` : "",
      deja: dejaProduits.has(p.id), choisir: () => onProduit(p) })) },
  ].filter((g) => g && g.items.length);
  const main = { id: "main", label: qt ? `Ajouter « ${qt} » à la main` : "Ajouter une ligne à la main",
    sous: "Hors mercuriale : tu saisis le prix", choisir: () => onMain(qt) };
  const options = [...groupes.flatMap((g) => g.items.filter((it) => !it.deja)), main];
  const courant = options[Math.min(actif, options.length - 1)];
  const optId = (o) => `fe-ajout-${o.id}`;

  const choisir = (o) => { o.choisir(); setQ(""); setOuvert(false); };
  const clavier = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOuvert(true); setActif((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && ouvert && courant) { e.preventDefault(); choisir(courant); }
    else if (e.key === "Escape") { setOuvert(false); }
  };
  // Un choix à la souris ne doit pas voler le focus au champ (sinon la liste se refermerait
  // avant que le clic n'arrive).
  const garderFocus = (e) => e.preventDefault();
  const libelle = avecFiches ? "Ajouter un ingrédient ou une fiche" : "Ajouter un ingrédient";

  return (
    <div className="fe-add-slot">
      <div ref={boite} className={"fe-add" + (ouvert ? " ouvert" : "")}>
        <div className="fe-add-top">
          <span className="fe-add-poignee" aria-hidden="true" />
          <span>Ajouter à la composition</span>
          <button type="button" className="fe-icobtn" onClick={() => setOuvert(false)} aria-label="Fermer"><Icon name="x" size={20} /></button>
        </div>
        <div className="fe-add-champ">
          <Icon name="search" size={17} />
          <input ref={champ} value={q} placeholder={`${libelle}…`} aria-label={libelle}
            role="combobox" aria-expanded={ouvert} aria-controls="fe-ajout-liste" aria-autocomplete="list"
            aria-activedescendant={ouvert && courant ? optId(courant) : undefined}
            onChange={(e) => { setQ(e.target.value); setOuvert(true); }} onFocus={() => setOuvert(true)} onKeyDown={clavier} />
          {q && <button type="button" className="fe-add-effacer" onPointerDown={garderFocus} onClick={() => setQ("")} aria-label="Effacer la recherche"><Icon name="x" size={16} /></button>}
        </div>
        {ouvert && (
          <div className="fe-add-pop" id="fe-ajout-liste" role="listbox" aria-label="Propositions">
            {groupes.map((g) => (
              <div key={g.cle} role="group" aria-label={g.titre} className="fe-add-grp">
                <div className="fe-add-grp-t" aria-hidden="true"><Icon name={g.icone} size={13} /> {g.titre}</div>
                {g.items.map((it) => (
                  <div key={it.id} id={optId(it)} role="option" aria-selected={courant === it} aria-disabled={it.deja || undefined}
                    className={"fe-add-opt" + (courant === it ? " actif" : "") + (it.deja ? " deja" : "")}
                    onPointerDown={garderFocus} onClick={() => { if (!it.deja) choisir(it); }}>
                    <span className="fe-add-opt-t">
                      <b>{it.label}</b>
                      {it.sous && <span className={it.kind ? "fe-add-k fe-k-" + it.kind : undefined}>{it.sous}</span>}
                    </span>
                    {it.deja ? <span className="fe-add-deja"><Icon name="check" size={13} /> Ajouté</span> : <span className="fe-add-prix chiffres">{it.prix}</span>}
                  </div>
                ))}
              </div>
            ))}
            <div id={optId(main)} role="option" aria-selected={courant === main} className={"fe-add-opt manuel" + (courant === main ? " actif" : "")}
              onPointerDown={garderFocus} onClick={() => choisir(main)}>
              <Icon name="pencil" size={16} />
              <span className="fe-add-opt-t"><b>{main.label}</b><span>{main.sous}</span></span>
            </div>
            <div className="fe-add-pied">
              <button type="button" onPointerDown={garderFocus} onClick={() => { setOuvert(false); onMercuriale(); }}><Icon name="coins" size={14} /> Toute ma mercuriale</button>
              <button type="button" onPointerDown={garderFocus} onClick={() => { setOuvert(false); onCatalogue(); }}><Icon name="search" size={14} /> Tout le catalogue Metro</button>
            </div>
          </div>
        )}
      </div>
      {ouvert && <div className="fe-add-voile" onClick={() => setOuvert(false)} aria-hidden="true" />}
    </div>
  );
}

/**
 * LE PROCÉDÉ, étape par étape. Une étape se déplace en la GLISSANT par sa poignée (souris ou
 * doigt : événements de pointeur, capturés par la poignée), ou au clavier, poignée en main, avec
 * les flèches. Entrée crée l'étape suivante, Retour arrière sur une étape vide la retire.
 * Remplace les deux boutons « monter / descendre » par étape.
 */
function Procede({ steps, onChange }) {
  const liste = useRef(null);
  // L'étape en cours de déplacement : une RÉFÉRENCE pour la logique (un pointeur rapide envoie
  // son premier mouvement avant que React n'ait rendu l'état), un état pour l'affichage.
  const tireRef = useRef(null);
  const [tire, setTire] = useState(null);
  const [focus, setFocus] = useState(null); // { i, quoi: "grip" | "txt" } à rendre après le rendu
  const [annonce, setAnnonce] = useState("");
  useEffect(() => {
    if (!focus || !liste.current) return;
    const li = liste.current.children[focus.i];
    const el = li && li.querySelector(focus.quoi === "grip" ? ".fe-grip" : "textarea");
    if (el) el.focus();
    setFocus(null);
  }, [focus]);
  // La liste à jour même entre deux rendus : deux mouvements rapprochés ne doivent pas repartir
  // de l'ordre d'avant le premier.
  const vivant = useRef(steps);
  vivant.current = steps;
  const deplacer = (de, vers) => {
    if (vers < 0 || vers >= steps.length || de === vers) return false;
    const a = [...vivant.current]; const [x] = a.splice(de, 1); a.splice(vers, 0, x);
    vivant.current = a;
    onChange(a);
    setAnnonce(`Étape déplacée en position ${vers + 1} sur ${steps.length}.`);
    return true;
  };
  // La place de l'étape tirée : le nombre des AUTRES étapes dont le milieu est au-dessus du
  // pointeur. Compter l'étape tirée elle-même la posait une place trop bas en descendant.
  const indexSous = (y, exclu) => {
    const items = liste.current ? [...liste.current.children] : [];
    return items.reduce((k, el, j) => {
      if (j === exclu) return k;
      const b = el.getBoundingClientRect();
      return b.top + b.height / 2 < y ? k + 1 : k;
    }, 0);
  };
  const inserer = (apres) => { const a = [...steps]; a.splice(apres + 1, 0, ""); onChange(a); setFocus({ i: apres + 1, quoi: "txt" }); };
  const retirer = (i) => onChange(steps.filter((_, j) => j !== i));
  return (
    <>
      {steps.length === 0 ? (
        <p className="fe-vide">Décris les étapes dans l'ordre : « Étaler le pâton », « Répartir la sauce »… Entrée passe à l'étape suivante.</p>
      ) : (
        <ol ref={liste} className="fe-steps">
          {steps.map((s, i) => (
            <li key={i} className={"fe-step" + (tire === i ? " tire" : "")}>
              <button type="button" className="fe-grip" aria-label={`Déplacer l'étape ${i + 1} (flèches haut et bas)`} title="Glisser pour déplacer"
                onPointerDown={(e) => {
                  // La capture garde les mouvements sur la poignée même quand le pointeur la quitte ;
                  // elle peut échouer (pointeur déjà relâché) sans que le déplacement en dépende.
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sans capture */ }
                  tireRef.current = i; setTire(i);
                }}
                onPointerMove={(e) => {
                  const de = tireRef.current;
                  if (de === null) return;
                  const k = indexSous(e.clientY, de);
                  if (k !== de && deplacer(de, k)) { tireRef.current = k; setTire(k); }
                }}
                onPointerUp={() => { tireRef.current = null; setTire(null); }}
                onPointerCancel={() => { tireRef.current = null; setTire(null); }}
                onKeyDown={(e) => {
                  const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
                  if (!d) return;
                  e.preventDefault();
                  if (deplacer(i, i + d)) setFocus({ i: i + d, quoi: "grip" });
                }}>
                <Icon name="grip-vertical" size={18} />
              </button>
              <span className="fe-step-n" aria-hidden="true">{i + 1}</span>
              <textarea className="inp fe-step-txt" rows={1} maxLength={600} value={s} placeholder={`Étape ${i + 1}`} aria-label={`Étape ${i + 1}`}
                onChange={(e) => onChange(steps.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); inserer(i); }
                  else if (e.key === "Backspace" && s === "" && steps.length > 1) { e.preventDefault(); retirer(i); setFocus({ i: Math.max(0, i - 1), quoi: "txt" }); }
                }} />
              <button type="button" className="fe-icobtn del" onClick={() => retirer(i)} aria-label={`Supprimer l'étape ${i + 1}`} title="Supprimer l'étape"><Icon name="trash" size={16} /></button>
            </li>
          ))}
        </ol>
      )}
      <span className="fe-sr" aria-live="polite">{annonce}</span>
      <button type="button" className="fe-add-step" onClick={() => { onChange([...steps, ""]); setFocus({ i: steps.length, quoi: "txt" }); }}>
        <Icon name="plus" size={16} /> Ajouter une étape
      </button>
    </>
  );
}

/**
 * LE RENDEMENT d'une garniture : ce que le lot produit une fois préparé. Vide, le coût au kg se
 * calcule sur le poids des ingrédients ; rempli, sur le produit fini, et la perte se lit.
 */
function Rendement({ r, cf, set }) {
  const p = cf.prep || {};
  const poids = cf.poids;
  const unite = String(r.yield_unit || "g").toLowerCase();
  const enMasse = !!MASS_VOL[unite];
  const perte = cf.perte;
  const finiG = p.source === "rendement" && p.unit === "g" ? p.quantite * 1000 : null;
  const base = Math.max(poids, finiG || 0);
  const suggestion = poids > 0 && enMasse
    ? (unite === "kg" || unite === "l" ? (poids / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : String(Math.round(poids))) : "";
  const note = p.source === "poids"
    ? <>Laisse vide si rien ne s'évapore : le coût au kg se calcule sur le poids des ingrédients, <b className="chiffres">{euroFixe(p.unitPrice)}/kg</b>. Pour une sauce qui réduit, pèse le produit fini.</>
    : p.source === "rendement" && p.unit === "g"
      ? <>Coût au kg du produit fini : <b className="chiffres">{euroFixe(p.unitPrice)}/kg</b>. C'est ce prix qu'une réalisation importe, et le même que la fiche imprime.</>
      : p.source === "rendement"
        ? <>Coût à la pièce : <b className="chiffres">{euroFixe(p.unitPrice)}</b>. C'est ce prix qu'une réalisation importe.</>
        : <>Ajoute des ingrédients au poids, ou déclare un rendement, pour obtenir un coût au kg.</>;
  return (
    <div className="fe-rdt">
      <div className="fe-sec-head"><h3 className="fe-h3">Rendement</h3><span className="fe-scope">ce que le lot produit une fois préparé</span></div>
      <div className="fe-rdt-ligne">
        <div className="fe-rdt-in"><span>Ingrédients</span><b className="chiffres">{grammes(poids)}</b></div>
        <Icon name="arrow-right" size={20} className="fe-rdt-fl" />
        <div className="fe-rdt-out">
          <label htmlFor="fe-rdt-q">Produit fini</label>
          <span className="fe-rdt-champs">
            <input id="fe-rdt-q" className="inp chiffres" type="number" min="0" step="any" inputMode="decimal"
              value={r.yield_qty ?? ""} placeholder={suggestion} onChange={set("yield_qty")} />
            <select className="inp" value={r.yield_unit || "g"} onChange={set("yield_unit")} aria-label="Unité du produit fini">
              {YIELD_UNITS.map((u) => <option key={u} value={u}>{u === "piece" ? "pièces" : u}</option>)}
            </select>
          </span>
        </div>
        {perte != null && Math.abs(perte) >= 0.005 && (
          <span className={"fe-rdt-chip" + (perte > 0 ? " gain" : "")}>
            {perte < 0 && <Icon name="trending-down" size={15} />} {pctSigne(perte)} {perte < 0 ? "à la préparation" : "de gain"}
          </span>
        )}
      </div>
      {finiG != null && poids > 0 && (
        <div className="fe-rdt-barres" aria-hidden="true">
          <span className="fe-rdt-b"><i>Ingrédients</i><span><span style={{ width: `${(poids / base) * 100}%` }} /></span></span>
          <span className="fe-rdt-b fini"><i>Produit fini</i><span><span style={{ width: `${(finiG / base) * 100}%` }} /></span></span>
        </div>
      )}
      <p className="fe-rdt-note">{note}</p>
      {perte != null && perte < -0.5 && (
        <p className="fe-rdt-alerte"><Icon name="alert-triangle" size={15} /> Plus de la moitié du lot se perdrait : vérifie le produit fini. Les anciennes fiches portaient 1 000 g par défaut.</p>
      )}
    </div>
  );
}

/**
 * LA PHOTO DE LA FICHE : un cadre carré en tête de fiche. Vide, il invite à en ajouter une ; plein,
 * il propose de la changer ou de la retirer. L'image est réduite par le navigateur avant l'envoi
 * (lib/image.js, profil `fiche`) : elle ne pèse jamais « lourd ».
 */
function PhotoFiche({ src, occupe, erreur, indisponible, nouvelle, onChoisir, onRetirer }) {
  const entree = useRef(null);
  const ouvrir = () => entree.current && entree.current.click();
  return (
    <div className="fe-photo">
      {src ? (
        <div className="fe-photo-cadre">
          <img src={src} alt="Photo de la fiche" />
          <div className="fe-photo-actions">
            <button type="button" className="fe-photo-btn" onClick={ouvrir} disabled={occupe}><Icon name="camera" size={15} /> Changer</button>
            <button type="button" className="fe-photo-btn" onClick={onRetirer} disabled={occupe} aria-label="Retirer la photo" title="Retirer la photo"><Icon name="trash" size={15} /></button>
          </div>
        </div>
      ) : (
        <button type="button" className="fe-photo-vide" onClick={ouvrir} disabled={occupe || indisponible}>
          <Icon name="camera" size={26} />
          <span>{occupe ? "Envoi…" : indisponible ? "Photo pas encore disponible" : "Ajouter une photo"}</span>
        </button>
      )}
      {nouvelle && src && <span className="fe-photo-note">Enregistrée avec la fiche</span>}
      {/* `e.target.value = ""` : sans lui, rechoisir le MÊME fichier après un refus ne déclenche rien. */}
      <input ref={entree} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) onChoisir(f); }} />
      {erreur && <p className="fe-photo-err" role="alert">{erreur}</p>}
    </div>
  );
}

/* La répartition du coût dans le panneau : les trois lignes les plus chères, puis le reste. */
function Repartition({ lignes }) {
  const { top, autres } = repartition(lignes);
  if (!top.length) return null;
  return (
    <div className="fe-rep">
      <span className="fe-panel-lbl">Répartition du coût</span>
      <div className="fe-rep-bar" aria-hidden="true">
        {top.map((l, k) => <span key={k} style={{ width: `${l.part * 100}%`, background: l.couleur }} />)}
        {autres > 0 && <span className="autres" style={{ width: `${autres * 100}%` }} />}
      </div>
      <ul className="fe-rep-leg">
        {top.map((l, k) => <li key={k}><i style={{ background: l.couleur }} /><span>{l.label}</span><b className="chiffres">{pctPart(l.part)}</b></li>)}
        {autres > 0 && <li><i className="autres" /><span>Autres</span><b className="chiffres">{pctPart(autres)}</b></li>}
      </ul>
    </div>
  );
}

/* Où sert cette fiche : les réalisations de son auteur qui l'importent, avec ce qu'elle leur
   coûte AUJOURD'HUI — le prix de l'éditeur, pas celui de l'import. */
function UtiliseeDans({ liste, kind, coutDe, onOpen }) {
  if (!liste || !liste.length) return null;
  const titre = liste.length === 1 ? "Utilisée dans une de tes réalisations" : `Utilisée dans ${liste.length} de tes réalisations`;
  return (
    <div className="fe-used">
      <span className="fe-used-t">{titre}</span>
      <ul>
        {liste.map((u, k) => {
          const c = coutDe(u);
          const q = u.unit === "piece" ? `${num(u.qty)} ${kind === "PATE" ? (num(u.qty) > 1 ? "pâtons" : "pâton") : "pc"}` : grammes(u.qty);
          const contenu = <><Icon name="pizza" size={15} /><span className="fe-used-n">{u.name}</span><span className="fe-used-q chiffres">{q}{c != null ? ` · ${euroFixe(c)}` : ""}</span></>;
          return <li key={k}>{onOpen ? <button type="button" onClick={() => onOpen(u.kind, u.id)} title="Ouvrir cette réalisation">{contenu}</button> : <span>{contenu}</span>}</li>;
        })}
      </ul>
    </div>
  );
}

/* Une carte repliable : au niveau module pour rester une instance stable (sinon ses champs
   internes perdraient le focus à chaque frappe). */
function Repliable({ titre, sous, icone, defaultOpen = false, children }) {
  const [ouvert, setOuvert] = useState(defaultOpen);
  return (
    <section className={"card fe-card fe-repli" + (ouvert ? " ouvert" : "")}>
      <button type="button" className="fe-repli-t" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
        {icone && <Icon name={icone} size={17} />}
        <span className="fe-h2">{titre}</span>
        {sous && <span className="fe-scope">{sous}</span>}
        <Icon name={ouvert ? "chevron-up" : "chevron-down"} size={20} className="fe-repli-ch" />
      </button>
      {ouvert && <div className="fe-repli-c">{children}</div>}
    </section>
  );
}

/**
 * `mode` verrouille le TYPE de fiche (empâtement / garniture / réalisation). Toujours EMBARQUÉ par
 * « Mes fiches techniques » (FichesTechniques.jsx), qui gère la liste de toutes les fiches :
 * l'éditeur reçoit `openId` (la fiche à ouvrir à l'entrée), `onExit` (retour à la liste) et
 * `onOpen(kind, id)` (ouvrir une autre fiche : celle qu'on importe, ou une réalisation qui
 * utilise celle-ci). Il ne rend que l'éditeur, jamais son propre en-tête de page ni sa liste.
 */
function FicheRecette({ mode = "realisation", openId = null, onExit = null, onOpen = null }) {
  const kind = MODE_KIND[mode] || "RECETTE"; // chaque page est verrouillée sur son type de fiche
  const [r, setR] = useState(() => initFor(mode));
  const [busy, setBusy] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [pateOpen, setPateOpen] = useState(false);
  const [mercOpen, setMercOpen] = useState(false);
  const [merc, setMerc] = useState([]); // ma mercuriale : source de prix des ingrédients
  const [printOpen, setPrintOpen] = useState(false); // aperçu de la fiche imprimable
  const [niv2, setNiv2] = useState(false); // empâtements indirects (biga/poolish) → Niveau II ou Expert
  const [napo, setNapo] = useState(false); // typologie Napolitaine → spécialisation Napolitaine
  const [spe, setSpe] = useState(false);   // typologies Teglia/Pala → spécialisation In Teglia & Pala (ou Expert)
  // Ce qui est enregistré : l'empreinte de la fiche au dernier chargement ou enregistrement, et quand.
  const [enregistre, setEnregistre] = useState(() => ({ sig: signature(initFor(mode)), le: null, session: false }));
  const [majPrix, setMajPrix] = useState([]);   // fiches importées dont le coût a changé depuis l'import
  const [usedIn, setUsedIn] = useState([]);     // réalisations qui importent cette fiche
  const [aFocaliser, setAFocaliser] = useState(null); // { i, champ } : champ d'une ligne à rendre actif
  /* LA PHOTO (migration 191). Sur une fiche enregistrée, elle part TOUT DE SUITE — elle n'attend
     pas « Enregistrer ». Sur une fiche nouvelle, qui n'a pas encore d'identifiant, elle attend,
     montrée depuis la mémoire du navigateur, et part juste après la création. */
  const [photo, setPhoto] = useState({ v: null, attente: null, apercu: null, occupe: false, erreur: "", indisponible: false });
  const apercuRef = useRef(null);
  useEffect(() => () => { if (apercuRef.current) URL.revokeObjectURL(apercuRef.current); }, []);
  const poserApercu = (blob) => {
    if (apercuRef.current) URL.revokeObjectURL(apercuRef.current);
    apercuRef.current = blob ? URL.createObjectURL(blob) : null;
    return apercuRef.current;
  };
  const choisirPhoto = async (f) => {
    setPhoto((p) => ({ ...p, occupe: true, erreur: "" }));
    // Réduite AVANT l'envoi : une photo de téléphone pèse 3 à 8 Mo, le serveur en accepte 250 Ko.
    const blob = await reduireSiImage(f, PROFILS.fiche);
    if (!r.id) { setPhoto((p) => ({ ...p, occupe: false, attente: blob, apercu: poserApercu(blob) })); return; }
    try {
      const res = await envoyerPhotoFiche(r.id, blob);
      setPhoto((p) => ({ ...p, occupe: false, v: (res.data && res.data.photo_v) || null, attente: null, apercu: poserApercu(null) }));
    } catch (e) {
      setPhoto((p) => ({ ...p, occupe: false, erreur: e.message || "Envoi de la photo échoué." }));
    }
  };
  const retirerPhoto = async () => {
    if (photo.attente) { setPhoto((p) => ({ ...p, attente: null, apercu: poserApercu(null), erreur: "" })); return; }
    if (!r.id || !photo.v) return;
    setPhoto((p) => ({ ...p, occupe: true, erreur: "" }));
    try {
      await retirerPhotoFiche(r.id);
      setPhoto((p) => ({ ...p, occupe: false, v: null }));
    } catch (e) {
      setPhoto((p) => ({ ...p, occupe: false, erreur: e.message || "Retrait de la photo échoué." }));
    }
  };

  // Embarqué pour MODIFIER : on charge la fiche demandée à l'entrée (openRecipe est déclarée plus bas, hoistée).
  // Seul le CHANGEMENT de fiche recharge : `openRecipe` est recréée à chaque rendu.
  useEffect(() => { window.scrollTo?.({ top: 0 }); if (openId) openRecipe(openId); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const reloadMerc = () => getMercuriale().then((res) => setMerc(res.data || [])).catch(() => {});
  useEffect(() => { reloadMerc(); }, []);
  // Options avancées (indirects, napolitaine, teglia/pala) : débloquées par les formations SUIVIES
  // — SAUF le personnel, qui les a TOUTES. Il enseigne ces empâtements et n'a pas de fiche
  // stagiaire, si bien que `getMyFormations` lui répond 404 : sans ce raccourci, un formateur de
  // niveau II se verrait refuser la napolitaine dans l'outil qu'il fait utiliser à ses stagiaires.
  const { user } = useContext(UserContext) || {};
  const estPersonnel = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"].includes(user?.role);
  useEffect(() => {
    if (estPersonnel) { setNiv2(true); setNapo(true); setSpe(true); return; }
    getMyFormations().then((r) => {
      const fs = (r.data || []).filter((f) => f.enrolled).map((f) => `${f.program_title} ${f.program_code}`.toLowerCase());
      const has = (re) => fs.some((t) => re.test(t));
      setNiv2(has(/niveau\s+ii|expert/));  // indirects : Niveau II ou Expert
      setNapo(has(/napolit/));             // spécialisation Napolitaine
      setSpe(has(/teglia|pala/));          // spécialisation In Teglia & Pala (Expert inclus)
    }).catch(() => {});
  }, [estPersonnel]);

  const set = (k) => (e) => setR((p) => ({ ...p, [k]: e.target.value }));
  const setIng = (i, patch) => setR((p) => ({ ...p, ingredients: p.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const delIng = (i) => setR((p) => ({ ...p, ingredients: p.ingredients.filter((_, j) => j !== i) }));
  // Ajoute une ligne, puis rend actif son champ quantité (ou son nom, pour une ligne sans nom) :
  // on choisit un ingrédient, on tape sa quantité, sans chercher la ligne.
  const ajouter = (ligne, { enTete = false, champ = "qte", focus = true } = {}) => {
    const i = enTete ? 0 : r.ingredients.length;
    setR((p) => ({ ...p, ingredients: enTete ? [ligne, ...p.ingredients] : [...p.ingredients, ligne] }));
    if (focus) setAFocaliser({ i, champ });
  };
  // Ajoute un ingrédient depuis le catalogue : on stocke le NOM du produit (jamais la marque).
  const addProduct = (prod, focus = true) => ajouter({
    label: prod.name, product_id: prod.id, component_recipe_id: null,
    unit: prod.type_unity === "Piece" ? "piece" : "g",
    unit_price: prod.unit_ht != null ? Number(prod.unit_ht) : 0,
    qty: prod.type_unity === "Piece" ? 1 : 50,
  }, { focus });
  // Importe un empâtement / une garniture comme ingrédient (prix = coût unitaire de la fiche,
  // verrouillé). Un empâtement se range EN TÊTE : la pâte d'abord, comme sur la fiche imprimée.
  const addComponent = (c) => ajouter({
    label: c.name, product_id: null, component_recipe_id: c.id, component_kind: c.kind, piece_g: c.piece_g ?? null,
    unit: c.unit === "piece" ? "piece" : "g", unit_price: Number(c.unit_price) || 0,
    qty: c.unit === "piece" ? 1 : 80,
  }, { enTete: c.kind === "PATE" });
  // Ajoute un ingrédient DEPUIS MA MERCURIALE : prix et unité repris de ma liste de prix (éditables ensuite).
  const addFromMerc = (m, focus = true) => ajouter({
    label: m.label, product_id: m.catalog_product_id || null, component_recipe_id: null,
    unit: perWeightUnit(m.unit) ? "g" : "piece", unit_price: num(m.price),
    qty: perWeightUnit(m.unit) ? 50 : 1,
  }, { focus });
  const addManual = (label) => ajouter({ label: label || "", qty: "", unit: "g", unit_price: "", product_id: null, component_recipe_id: null },
    { champ: label ? "qte" : "nom" });
  // Ligne d'ingrédient générique (accords de saveurs) : complète les valeurs par défaut.
  const addRow = (row) => setR((p) => ({ ...p, ingredients: [...p.ingredients, { label: "", qty: 0, unit: "g", unit_price: 0, product_id: null, component_recipe_id: null, ...row }] }));

  const isRecette = kind === "RECETTE";
  const isPate = kind === "PATE";
  const isPrep = kind === "PREPARATION";

  // Procédé (garniture ET réalisation) & cuisson (réalisation) — persistés dans dough_params (JSON).
  const steps = r.steps || [];
  const setSteps = (a) => setR((p) => ({ ...p, steps: a }));
  const cooking = r.cooking || {};
  const setCook = (k, v) => setR((p) => ({ ...p, cooking: { ...(p.cooking || {}), [k]: v } }));

  // Calculateur de pâte : réglages en pourcentage boulanger + presets verrouillables.
  const dp = r.dough_params || DP_DEFAULT;
  const setDP = (k, v) => setR((p) => ({ ...p, dough_params: { ...(p.dough_params || DP_DEFAULT), [k]: v } }));
  const methodLocked = (m) => INDIRECT.includes(m) && !niv2;
  // Une typologie est verrouillée si son prérequis (`needs`) n'est pas accordé par les formations.
  const access = { niv2, napo, spe };
  const presetLocked = (p) => !!(p.needs && !access[p.needs]);
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
    if (presetLocked(pr)) return;
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
  // Ratio pâte/farine : pourcentage boulanger pour la pâte (les autres fiches : lib/coutFiche.js).
  const addPct = addPctOf(dp);
  const patonG = Math.max(1, num(r.paton_g));
  // Deux modes de calcul (pâte) : « par pâtons » (nb × poids) ou « par farine » (farine dispo → pâtons).
  const dpMode = isPate ? (dp.mode === "farine" ? "farine" : "patons") : "patons";
  const flourKg = num(dp.flourKg);
  const totalDough = dpMode === "farine" ? Math.max(0, flourKg) * 1000 * addPct : nb * patonG;
  const effNb = dpMode === "farine" ? Math.floor(totalDough / patonG) : nb; // pâtons obtenus
  const reste = dpMode === "farine" ? totalDough - effNb * patonG : 0;
  const ingSum = useMemo(() => r.ingredients.reduce((s, t) => s + coutLigne(t), 0), [r.ingredients]);

  /* PÂTE : le coût et la décomposition viennent de `computeBuild` — farine, sel, huile, levure
     (et farines de substitution, adjonctions), décidé par l'école le 2026-09-29. C'est le calcul
     de la fiche imprimée, de la Communauté, et du serveur quand une réalisation importe la pâte
     (lib/coutFiche.js, `coutPate`). L'éditeur ne comptait que la farine : la même pâte y valait
     moins que sur sa propre fiche imprimée. Les autres fiches : lib/coutFiche.js. */
  const build = useMemo(() => computeBuild({ ...r, dough_params: dp }), [r, dp]);
  const dough = build.dough;
  const perUnit = build.costPerPaton + ingSum;
  const totalCost = build.totalCost + ingSum * effNb;
  const setPrixPate = (k, v) => setDP("prices", { ...(dp.prices || {}), [k]: v });
  const cf = useMemo(() => coutFiche({ ...r, kind }), [r, kind]);
  const estimee = pateEstimeeActive({ ...r, kind });
  const decal = estimee ? 1 : 0;
  const phrase = isPate ? null : phraseCout(cf.lignes);

  const sig = signature(r);
  const modifie = sig !== enregistre.sig || !!photo.attente;
  // Fermer l'onglet avec des modifications non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!modifie) return undefined;
    const retenir = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [modifie]);
  const confirmerAbandon = () => !modifie || window.confirm("Quitter sans enregistrer ? Tes modifications seront perdues.");
  const quitter = () => { if (confirmerAbandon() && onExit) onExit(); };
  const ouvrirFiche = onOpen ? (k, id) => { if (k && id && confirmerAbandon()) onOpen(k, id); } : null;

  // Le champ d'une ligne qu'on vient d'ajouter, rendu actif une fois la ligne à l'écran.
  useEffect(() => {
    if (!aFocaliser) return;
    const el = document.querySelector(`.fe [data-ligne="${aFocaliser.i}"] [data-champ="${aFocaliser.champ}"]`);
    if (el) { el.focus(); if (typeof el.select === "function") el.select(); }
    setAFocaliser(null);
  }, [aFocaliser]);

  const dejaProduits = useMemo(() => new Set(r.ingredients.map((i) => i.product_id).filter(Boolean)), [r.ingredients]);
  const dejaFiches = useMemo(() => new Set(r.ingredients.map((i) => i.component_recipe_id).filter(Boolean)), [r.ingredients]);
  const dejaLabels = useMemo(() => new Set(r.ingredients.map((i) => normaliser(i.label)).filter(Boolean)), [r.ingredients]);

  async function persist(overrides = {}) {
    setBusy(true);
    const merged = { ...r, ...overrides };
    const nettoyer = (a) => (a || []).map((s) => String(s).trim()).filter(Boolean);
    const nomParDefaut = merged.kind === "PREPARATION" ? "Garniture maison" : `${merged.type} maison`;
    const name = String(merged.name || "").trim() || nomParDefaut;
    const payload = { ...merged, name,
      // En mode « par farine », le rendement enregistré = nb de pâtons obtenus.
      servings: (merged.kind === "PATE" && dpMode === "farine") ? Math.max(1, effNb) : merged.servings,
      // dough_params (colonne JSON) sert de blob générique : pâte / procédé / cuisson / pâte retirée.
      dough_params: merged.kind === "PATE" ? (merged.dough_params || DP_DEFAULT)
        : merged.kind === "PREPARATION" ? { steps: nettoyer(merged.steps) }
        : { cooking: merged.cooking || {}, steps: nettoyer(merged.steps), ...(merged.pate === "aucune" ? { pate: "aucune" } : {}) },
      ingredients: (merged.ingredients || []).map((t) => ({ label: t.label, qty: t.qty, unit: t.unit, unit_price: t.unit_price,
        product_id: t.product_id || null, component_recipe_id: t.component_recipe_id || null })) };
    try {
      const res = r.id ? await updateRecipe(r.id, payload) : await createRecipe(payload);
      const id = r.id || (res.data && res.data.id);
      setR((p) => ({ ...p, ...overrides, id, name: String(p.name || "").trim() ? p.name : name }));
      setEnregistre({ sig: signature({ ...merged, id, name: String(merged.name || "").trim() ? merged.name : name }), le: new Date(), session: true });
      setMajPrix([]);
      // Fiche NOUVELLE : sa photo attendait son identifiant.
      if (!r.id && id && photo.attente) {
        try {
          const ph = await envoyerPhotoFiche(id, photo.attente);
          setPhoto((p) => ({ ...p, v: (ph.data && ph.data.photo_v) || null, attente: null, apercu: poserApercu(null) }));
        } catch (e) {
          setPhoto((p) => ({ ...p, erreur: e.message || "Envoi de la photo échoué." }));
        }
      }
    } catch { /* silencieux : la barre d'erreur globale s'affiche */ }
    finally { setBusy(false); }
  }
  async function openRecipe(id) {
    try {
      const res = await getRecipe(id); const d = res.data;
      let dpv = d.dough_params;
      if (typeof dpv === "string") { try { dpv = JSON.parse(dpv); } catch { dpv = null; } }
      dpv = dpv || {};
      const charge = { ...NEW(), ...d,
        servings: nbChamp(d.servings), paton_g: nbChamp(d.paton_g), flour_price: nbChamp(d.flour_price),
        margin_pct: nbChamp(d.margin_pct), yield_qty: nbChamp(d.yield_qty),
        dough_params: { ...DP_DEFAULT, ...(d.kind === "PATE" ? dpv : {}) },
        steps: Array.isArray(dpv.steps) ? dpv.steps : [],
        cooking: (dpv.cooking && typeof dpv.cooking === "object") ? { ...NEW_COOKING(), ...dpv.cooking } : NEW_COOKING(),
        pate: dpv.pate === "aucune" ? "aucune" : "",
        ingredients: (d.ingredients || []).map((t) => ({ ...t, qty: nbChamp(t.qty), unit_price: nbChamp(t.unit_price),
          component_kind: t.component_kind || null, piece_g: t.component_piece_g ?? null })) };
      setEnregistre({ sig: signature(charge), le: d.updated_at || null, session: false });
      // Une fiche importée garde le prix du jour de l'import : on reprend celui d'AUJOURD'HUI,
      // et on le dit. La fiche reste « modifiée » tant qu'on n'a pas enregistré.
      const changes = [];
      const ingredients = charge.ingredients.map((t) => {
        if (!t.component_recipe_id || t.component_unit_price == null) return t;
        if ((t.component_unit === "piece" ? "piece" : "g") !== t.unit) return t; // unité changée : on ne devine pas la quantité
        if (Math.abs(num(t.component_unit_price) - num(t.unit_price)) < 0.00005) return t;
        changes.push({ label: t.label, avant: num(t.unit_price), apres: num(t.component_unit_price), u: t.unit === "piece" ? (t.component_kind === "PATE" ? "pâton" : "pièce") : "kg" });
        return { ...t, unit_price: num(t.component_unit_price) };
      });
      setR({ ...charge, ingredients });
      setMajPrix(changes);
      setUsedIn(Array.isArray(d.used_in) ? d.used_in : []);
      setPhoto((p) => ({ ...p, v: d.photo_v || null, attente: null, apercu: poserApercu(null), erreur: "", indisponible: d.photo_disponible === false }));
    } catch { /* ignore */ }
  }
  const shared = r.visibility === "SHARED";

  const nomExemple = isPate ? "Ex. Pâte napolitaine 24 h" : isPrep ? "Ex. Sauce tomate San Marzano" : "Ex. Margherita du chef";
  const etat = !r.id ? (modifie ? "Pas encore enregistrée" : "Nouvelle fiche")
    : modifie ? "Modifications non enregistrées"
    : enregistre.session ? `Enregistrée à ${heure(enregistre.le)}`
    : enregistre.le ? `Enregistrée le ${dateHeure(enregistre.le)}` : "Enregistrée";

  // Boutons du panneau : enregistrer, partager, imprimer.
  const actions = (
    <div className="fe-actions">
      <button type="button" className="btn primary fe-save" onClick={() => persist()} disabled={busy}>
        <Icon name="check" size={16} /> {r.id ? "Enregistrer" : "Créer la fiche"}
      </button>
      <div className="fe-actions-2">
        <button type="button" className={"btn fe-ghost" + (shared ? " on" : "")} aria-pressed={shared} disabled={busy}
          onClick={() => persist({ visibility: shared ? "PRIVATE" : "SHARED" })}
          title={shared ? "Partagée à la communauté : cliquer pour la rendre privée" : "Partager à la communauté (enregistre la fiche)"}>
          <Icon name={shared ? "users" : "send"} size={15} /> {shared ? "Partagée" : "Partager"}
        </button>
        <button type="button" className="btn fe-ghost" onClick={() => setPrintOpen(true)} title="Aperçu imprimable au format fiche technique">
          <Icon name="printer" size={15} /> Imprimer
        </button>
      </div>
    </div>
  );

  // Garniture : le chiffre qu'une réalisation importe, et ce sur quoi il se calcule.
  const pr = cf.prep || {};
  const garnGrand = pr.unit === "g" ? { lbl: "Coût au kg", u: "/ kg" } : pr.source === "lot" ? { lbl: "Coût du lot", u: "" } : { lbl: "Coût à la pièce", u: "/ pièce" };
  const garnSous = pr.source === "rendement" && pr.unit === "g" ? `Produit fini · ${kgFr(pr.quantite)} pour ${euroFixe(cf.total)} de matière`
    : pr.source === "poids" ? `Sur le poids des ingrédients · ${kgFr(pr.quantite)}`
    : pr.source === "rendement" ? `${num(r.yield_qty)} pièces pour ${euroFixe(cf.total)} de matière`
    : "Ajoute des ingrédients au poids pour obtenir un coût au kg";
  const coutPrepDe = (u) => (u.unit !== pr.unit ? null : u.unit === "piece" ? num(u.qty) * num(pr.unitPrice) : (num(u.qty) / 1000) * num(pr.unitPrice));

  const panneau = isPate ? (
    <div className="card dough-result fe-panel">
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)", WebkitTextFillColor: "rgba(255,255,255,.7)" }}>{curPreset.nom} · empâtement {String(dp.method).toLowerCase()}{dp.autolyse ? " + autolyse" : ""}</div>
              <div style={{ font: "800 24px/1.1 var(--font-d)", margin: "4px 0 2px" }}>{gfmt(totalDough)} de pâte</div>
              <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12, marginBottom: 12 }}>{effNb} pâtons de {patonG} g{dpMode === "farine" && reste > 5 ? ` · reste ${gfmt(reste)}` : ""}</div>
              <div className="dough-bar" title="Proportions de l'empâtement">
                {dough.map((i) => <span key={i.k} style={{ width: `${totalDough ? (i.v / totalDough) * 100 : 0}%`, background: i.color }} />)}
              </div>
              {dp.autolyse && (
                <p style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", background: "rgba(255,255,255,.08)", borderRadius: 8, padding: "8px 10px", margin: "0 0 10px" }}>
                  <b>Autolyse</b> : mélange la farine et l'eau, laisse reposer 30–60 min, puis ajoute sel &amp; levure.
                </p>
              )}
              {dough.map((i, idx) => (
                <div key={i.k} className="dough-line">
                  <span className="ate-step">{idx + 1}</span>
                  <span style={{ color: i.color, display: "inline-flex" }}><Icon name={i.ic} size={17} /></span>
                  <b style={{ flex: 1, fontSize: 13 }}>{i.k}</b>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{i.pct}</span>
                  <b className="chiffres" style={{ width: 90, textAlign: "right" }}>{gfmt(i.v)}</b>
                </div>
              ))}
              <div style={{ borderTop: "1px solid rgba(255,255,255,.15)", margin: "16px 0 0" }} />
              <div style={{ font: "800 30px/1.1 var(--font-d)", margin: "14px 0 0" }}>{euroFixe(perUnit)} <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>/ pâton</span></div>
              <span className="fe-panel-sub">{["Farine", "sel", num(dp.huile) > 0 && "huile"].filter(Boolean).join(", ")} et levure compris</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                <Row label="Coût matière total" value={euroFixe(totalCost)} />
                <Row label="Coût au kg de pâte" value={euroFixe(build.costPerKg)} accent />
              </div>
              <p className="hint" style={{ color: "rgba(255,255,255,.75)", margin: "12px 0 0" }}>Importable dans une réalisation comme ingrédient, à son coût / pâton.</p>
      <UtiliseeDans liste={usedIn} kind="PATE" coutDe={(u) => (u.unit === "piece" ? num(u.qty) * perUnit : null)} onOpen={ouvrirFiche} />
      {actions}
    </div>
  ) : isPrep ? (
    <div className="card dough-result fe-panel">
      <span className="fe-panel-eyebrow">Garniture</span>
      <div className="fe-panel-kpi">
        <span className="fe-panel-lbl">{garnGrand.lbl}</span>
        <span className="fe-panel-big"><b className="chiffres">{euroFixe(pr.unitPrice)}</b>{garnGrand.u && <span>{garnGrand.u}</span>}</span>
        <span className="fe-panel-sub">{garnSous}</span>
      </div>
      <Repartition lignes={cf.lignes} />
      <div className="fe-rows">
        <Row label="Coût matière du lot" value={euroFixe(cf.total)} />
        {pr.source === "rendement" && pr.unit === "g" && <Row label="Produit fini" value={kgFr(pr.quantite)} />}
        {cf.perte != null && Math.abs(cf.perte) >= 0.005 && <Row label={cf.perte < 0 ? "Perte à la préparation" : "Gain à la préparation"} value={pctSigne(cf.perte)} accent />}
      </div>
      <UtiliseeDans liste={usedIn} kind="PREPARATION" coutDe={coutPrepDe} onOpen={ouvrirFiche} />
      {actions}
    </div>
  ) : (
    <div className="card dough-result fe-panel">
      <span className="fe-panel-eyebrow">Réalisation · {r.type}</span>
      <div className="fe-panel-kpi">
        <span className="fe-panel-lbl">Prix conseillé</span>
        <span className="fe-panel-big"><b className="chiffres">{euroFixe(cf.prix)}</b><span>/ pizza</span></span>
      </div>
      <label className="fe-marge">
        <span className="fe-marge-t">Marge sur coût <b className="chiffres">{num(r.margin_pct)}&nbsp;%</b></span>
        <input type="range" min="0" max="300" step="5" value={num(r.margin_pct)} onChange={set("margin_pct")} aria-label="Marge sur coût, en pourcentage" />
      </label>
      <Repartition lignes={cf.lignes} />
      <div className="fe-rows">
        <Row label="Coût matière / pizza" value={euroFixe(cf.total)} />
        <Row label={`Marge (${num(r.margin_pct)} %)`} value={`+ ${euroFixe(cf.marge)}`} accent />
        {cf.poids > 0 && <Row label="Coût au kg" value={euroFixe(cf.coutKg)} />}
      </div>
      <label className="fe-lot">
        <span>Pour</span>
        <input className="chiffres" type="number" min="1" inputMode="numeric" value={r.servings} onChange={set("servings")} aria-label="Nombre de pizzas du lot" />
        <span>pizzas</span>
        <b className="chiffres">{euroFixe(cf.lot)} de matière</b>
      </label>
      {actions}
    </div>
  );

  // Le dock (écran étroit) : le chiffre clé et « Enregistrer », sous le pouce.
  const dock = isRecette ? { t: `${euroFixe(cf.prix)} conseillé`, s: `${euroFixe(cf.total)} de matière · marge ${num(r.margin_pct)} %` }
    : isPrep ? { t: `${euroFixe(pr.unitPrice)}${garnGrand.u ? ` ${garnGrand.u}` : ""}`, s: `${euroFixe(cf.total)} de matière pour le lot` }
    : { t: `${euroFixe(perUnit)} / pâton`, s: `${effNb} pâtons de ${patonG} g` };

  const photoSlot = (
    <PhotoFiche src={photo.apercu || (r.id && photo.v ? photoFicheUrl(r.id, photo.v) : null)} occupe={photo.occupe}
      erreur={photo.erreur} indisponible={photo.indisponible} nouvelle={!r.id} onChoisir={choisirPhoto} onRetirer={retirerPhoto} />
  );
  const descriptionChamp = (
    <div className="fe-field">
      <label htmlFor="fe-desc">Description <span className="fe-field-aide">· #tags pour catégoriser</span></label>
      <textarea id="fe-desc" className="inp" rows={isPate ? 3 : 2} maxLength={5000} value={r.description || ""} onChange={set("description")}
        placeholder={isPate ? "Pointage, apprêt, cuisson… #napolitaine #24h" : isPrep ? "Usage, conservation… #sauce #base" : "Style, histoire, cuisson… #signature #24h"} />
      <Tags text={r.description} />
    </div>
  );

  const fiche = (
    <section className="card fe-card" aria-label="La fiche">
      <div className="fe-ident">
        {photoSlot}
        <div className="fe-ident-champs">
          {isRecette && (
            <label className="fe-field fe-type">Type
              <select className="inp" value={r.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
          )}
          {descriptionChamp}
        </div>
      </div>

      <div className="fe-compo">
        <div className="fe-compo-head">
          <h2 className="fe-h2">Composition <span className="fe-scope">{isRecette ? "pour 1 pizza" : "pour le lot"}</span></h2>
          <AjoutLigne avecFiches={isRecette} merc={merc} excludeId={r.id} dejaProduits={dejaProduits} dejaFiches={dejaFiches} dejaLabels={dejaLabels}
            onMerc={addFromMerc} onProduit={addProduct} onFiche={addComponent} onMain={addManual}
            onCatalogue={() => setCatalogueOpen(true)} onMercuriale={() => setMercOpen(true)} />
        </div>
        <div className="fe-ings">
          <div className="fe-ing fe-ing-head" aria-hidden="true">
            <span>Ingrédient</span><span>Mesure</span><span>Prix</span><span>Quantité</span><span className="fe-r">Coût</span><span />
          </div>
          {estimee && (
            <LignePateEstimee r={r} c={cf.lignes[0]} set={set} onChoisir={() => setPateOpen(true)}
              onRetirer={() => setR((p) => ({ ...p, pate: "aucune" }))} />
          )}
          {r.ingredients.map((t, i) => (
            <LigneCompo key={i} t={t} i={i} c={cf.lignes[i + decal]} source={sourceDe(t, merc)}
              onChange={(patch) => setIng(i, patch)} onRemove={() => delIng(i)}
              onOuvrir={t.component_recipe_id && t.component_kind && ouvrirFiche ? () => ouvrirFiche(t.component_kind, t.component_recipe_id) : null} />
          ))}
          {isRecette && !estimee && !aUneFichePate(r) && (
            <p className="fe-sanspate">
              <Icon name="alert-triangle" size={16} />
              <span>Aucune pâte n'est comptée dans cette pizza.</span>
              <button type="button" className="fe-lien" onClick={() => setR((p) => ({ ...p, pate: "" }))}>Compter une pâte estimée</button>
              <button type="button" className="fe-lien" onClick={() => setPateOpen(true)}>Choisir mon empâtement</button>
            </p>
          )}
          {cf.lignes.length === 0 && (
            <p className="fe-vide">Aucun ingrédient pour l'instant. Cherche dans ta mercuriale{isRecette ? ", tes fiches" : ""} ou le catalogue, juste au-dessus.</p>
          )}
          {cf.lignes.length > 0 && (
            <div className="fe-ing fe-ing-total">
              <span className="fe-total-t">Total</span>
              <span /><span />
              <span className="fe-total-poids chiffres">{grammes(cf.poids)}{cf.poidsIncomplet ? <em>hors pièces</em> : null}</span>
              <span className="fe-total-cout chiffres">{euroFixe(cf.total)}</span>
              <span />
            </div>
          )}
          {isRecette && cf.poids > 0 && <p className="fe-coutkg">Coût au kg <b className="chiffres">{euroFixe(cf.coutKg)}/kg</b></p>}
        </div>
        {isPrep && <Rendement r={r} cf={cf} set={set} />}
        {phrase && <p className="fe-insight"><Icon name="info" size={17} /> <span>{phrase}</span></p>}
      </div>
    </section>
  );

  const procede = (
    <section className="card fe-card" aria-labelledby="fe-proc-t">
      <div className="fe-sec-head"><h2 id="fe-proc-t" className="fe-h2">Procédé technique</h2><span className="fe-scope">glisse une étape pour la déplacer</span></div>
      <Procede steps={steps} onChange={setSteps} />
      {isRecette && (
        <div className="fe-cuisson">
          <h3 className="fe-h3"><Icon name="flame" size={17} /> Cuisson</h3>
          <div className="fe-cuisson-g">
            <label className="fe-field">Type de four
              <select className="inp" value={cooking.type || ""} onChange={(e) => setCook("type", e.target.value)}>
                <option value="">à choisir</option>
                {COOK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="fe-field">Température (°C)
              <input className="inp" type="number" min="0" inputMode="numeric" value={cooking.temp ?? ""} onChange={(e) => setCook("temp", e.target.value)} placeholder="Ex. 430" />
            </label>
            <label className="fe-field">Temps (min)
              <input className="inp" type="number" min="0" step="0.5" inputMode="decimal" value={cooking.time ?? ""} onChange={(e) => setCook("time", e.target.value)} placeholder="Ex. 1,5" />
            </label>
            <label className="fe-field">Énergie / combustible
              <input className="inp" value={cooking.energy ?? ""} maxLength={120} onChange={(e) => setCook("energy", e.target.value)} placeholder="Ex. bois de hêtre, gaz…" />
            </label>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="fe">
      <header className="fe-head">
        <div className="fe-head-top">
          <button type="button" className="fe-back" onClick={quitter}><Icon name="chevron-left" size={18} /> Mes fiches techniques</button>
          <span className={"fe-etat" + (modifie ? " modifie" : "")} role="status">{modifie && <span className="fe-etat-pt" aria-hidden="true" />}{etat}</span>
        </div>
        <div className="fe-head-titre">
          <span className={"fe-kind fe-k-" + kind}><Icon name={KIND_ICON[kind]} size={15} /> {KIND_LABEL[kind]}</span>
          <label className="fe-nom" data-valeur={r.name || nomExemple}>
            {/* `size={1}` : sans lui, le champ garde sa largeur par défaut (20 caractères) et c'est
                elle, pas le texte, qui fixe la case. */}
            <input value={r.name} onChange={set("name")} maxLength={160} size={1} aria-label="Nom de la fiche" placeholder={nomExemple} />
            <Icon name="pencil" size={18} />
          </label>
          <span className={"fe-vis" + (shared ? " on" : "")}><Icon name={shared ? "users" : "lock"} size={14} /> {shared ? "Partagée à la communauté" : "Privée"}</span>
        </div>
      </header>

      {majPrix.length > 0 && (
        <div className="fe-note" role="status">
          <Icon name="info" size={17} />
          <span>Coût mis à jour depuis {majPrix.length > 1 ? "tes fiches" : "ta fiche"} : {majPrix.map((m) => `${m.label} (${euroFixe(m.avant)} → ${euroFixe(m.apres)}/${m.u})`).join(", ")}. Enregistre pour le garder.</span>
          <button type="button" className="fe-icobtn" onClick={() => setMajPrix([])} aria-label="Masquer ce message"><Icon name="x" size={16} /></button>
        </div>
      )}

      <div className="fe-layout">
        <div className="fe-main">
          {isPate ? (
            <Card className="fe-card" title={<span className="card-ttl"><Icon name="settings" size={16} /> Calculateur de pâte</span>}>
              <div className="fe-ident">
                {photoSlot}
                <div className="fe-ident-champs">{descriptionChamp}</div>
              </div>
              {/* 1 · Typologie */}
              <div className="ate-lbl"><span className="ate-num">1</span> Typologie de pizza</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {PRESETS.map((p) => {
                  const locked = presetLocked(p);
                  const tag = p.needs === "niv2" ? " · Niv II" : p.needs ? " · Spé" : "";
                  return (
                    <button key={p.nom} onClick={() => applyPreset(p)} disabled={locked}
                      className={`btn sm ${dp.preset === p.nom ? "primary" : "ghost"}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: locked ? 0.5 : 1 }}
                      title={locked ? `Débloqué avec ${NEEDS_LABEL[p.needs]}` : p.desc}>
                      <Icon name={locked ? "lock" : p.ic} size={14} /> {p.nom}{tag}
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
                    <button key={b.w} onClick={() => applyW(b)} title={reco ? b.use : `Déconseillé pour « ${curPreset.nom} », vise ${wRangeLabel}`}
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
                      title={locked ? "Débloqué au Niveau II (empâtements indirects)" : (INDIRECT.includes(m) ? `${m}, farine ≥ W320` : m)}>
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
                    <p className="hint" style={{ margin: 0, fontSize: 11.5 }}>Hydratation totale au plafond de cette force, monte le W pour pouvoir bassiner davantage.</p>
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
                bounded={napoLevFixed ? { min: napoSpec.levureMin, max: napoSpec.levureMax, note: <>Cahier <b>{napoSpec.label}</b>, {napoSpec.levureNote}</> } : null} />
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
              <div className="field" style={{ marginBottom: 10 }}><label>Prix de la farine (€/kg)</label><input className="inp" type="number" step="0.01" value={r.flour_price} onChange={set("flour_price")} /></div>
              {/* Le sel, l'huile et la levure entrent dans le coût : leurs prix se règlent ici. Vides,
                  ce sont les prix indicatifs de l'outil (PRICE_DEFAULT) — les mêmes pour le serveur. */}
              <div className="fe-prix-pate">
                <span className="fe-prix-pate-t">Autres prix (€/kg)</span>
                {[["sel", "Sel"], ...(num(dp.huile) > 0 ? [["huile", "Huile"]] : []), ["levure", "Levure"]].map(([k, l]) => (
                  <label key={k} className="fe-field">{l}
                    <input className="inp" type="number" min="0" step="0.1" inputMode="decimal" value={dp.prices?.[k] ?? PRICE_DEFAULT[k]}
                      onChange={(e) => setPrixPate(k, e.target.value)} />
                  </label>
                ))}
              </div>

              {/* Réglages avancés — repliés par défaut (progressive disclosure) */}
              <Collapse title={<><Icon name="thermometer" size={14} /> Température de la pâte (TB 50)</>} hint="eau de coulage">
                <div className="grid cols-2" style={{ gap: 12, alignItems: "stretch" }}>
                  <div className="field" style={{ marginBottom: 0 }}><label>Température de la farine (°C)</label>
                    <input className="inp" type="number" min="0" max="35" value={dp.flourTemp ?? 17} onChange={(e) => setFlourTemp(Number(e.target.value))} /></div>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 1, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
                    <span className="hint" style={{ fontSize: 11 }}>Eau de coulage <span style={{ opacity: .7 }}>(50 − 2×T°)</span></span>
                    <b className="chiffres" style={{ fontSize: 19, color: eauCoulage < 4 ? "var(--blue)" : "var(--text)" }}>{eauCoulage} °C</b>
                  </div>
                </div>
                {eauCoulage < 2 && <p className="hint" style={{ margin: "8px 0 0", color: "var(--ember1)" }}>Farine trop chaude, mets-en une partie au frais la veille (conseil du manuel).</p>}
              </Collapse>

              <Collapse title={<><Icon name="clock" size={14} /> Stockage &amp; fermentation</>} hint="pointage, apprêt, chambre froide">
                {indirectSel && (
                  <div className="field" style={{ marginBottom: 10 }}><label>Temps de pré-ferment, {dp.method} (heures)</label>
                    <input className="inp" type="number" min="0" step="0.5" value={dp.prefermentH ?? ""} onChange={(e) => setDP("prefermentH", e.target.value)} placeholder="Ex. 16" /></div>
                )}
                <div className="field" style={{ marginBottom: 12 }}><label>Temps de fermentation total (heures)</label>
                  <input className="inp" type="number" min="0" step="0.5" value={dp.fermentH ?? ""} onChange={(e) => setDP("fermentH", e.target.value)} placeholder="Ex. 24" /></div>
                <p className="hint" style={{ margin: "0 0 10px" }}>Conditions, remplis l'une, l'autre, ou <b>les deux</b> (ex. 24 h à 20 °C puis 48 h à 4 °C).</p>
                <div className="stock-cond">
                  <span className="stock-lbl"><Icon name="thermometer" size={14} /> À température ambiante</span>
                  <div className="field" style={{ marginBottom: 0 }}><label>Durée (h)</label><input className="inp" type="number" min="0" step="0.5" value={dp.ambH ?? ""} onChange={(e) => setDP("ambH", e.target.value)} placeholder="-" /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>Température (°C)</label><input className="inp" type="number" value={dp.ambT ?? ""} onChange={(e) => setDP("ambT", e.target.value)} placeholder="Ex. 20" /></div>
                </div>
                <div className="stock-cond" style={{ marginBottom: 0 }}>
                  <span className="stock-lbl"><Icon name="thermometer" size={14} /> En température contrôlée <span className="hint" style={{ fontWeight: 400 }}>· chambre froide</span></span>
                  <div className="field" style={{ marginBottom: 0 }}><label>Durée (h)</label><input className="inp" type="number" min="0" step="0.5" value={dp.ctrlH ?? ""} onChange={(e) => setDP("ctrlH", e.target.value)} placeholder="-" /></div>
                  <div className="field" style={{ marginBottom: 0 }}><label>Température (°C)</label><input className="inp" type="number" value={dp.ctrlT ?? ""} onChange={(e) => setDP("ctrlT", e.target.value)} placeholder="Ex. 4" /></div>
                </div>
              </Collapse>
            </Card>
          ) : fiche}
          {!isPate && procede}
          {isPrep && (
            <Repliable key={r.id || "nouvelle"} defaultOpen={!r.id} titre="Accords de saveurs" sous="ce que l'école associe, chiffré depuis ta mercuriale" icone="star">
              <PairingSuggest merc={merc} onAdd={addRow} bare />
            </Repliable>
          )}
          <div className="fe-dock">
            <button type="button" className="fe-dock-info" aria-label="Voir le résultat de la fiche"
              onClick={() => document.getElementById("fe-panneau")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span className="fe-dock-t chiffres">{dock.t}</span>
              <span className="fe-dock-s">{dock.s}</span>
            </button>
            <button type="button" className="btn primary fe-dock-save" onClick={() => persist()} disabled={busy}>
              <Icon name="check" size={16} /> {r.id ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </div>
        <aside className="fe-side" id="fe-panneau" aria-label="Résultat de la fiche">{panneau}</aside>
      </div>

      {printOpen && <FichePrint fiche={{ ...r, kind }} onClose={() => setPrintOpen(false)} />}
      {mercOpen && <MercurialeModal items={merc} reload={reloadMerc} onClose={() => { setMercOpen(false); reloadMerc(); }} onAdd={(m) => addFromMerc(m, false)} />}
      {catalogueOpen && <IngredientSearchModal onClose={() => setCatalogueOpen(false)} onAdd={(p) => addProduct(p, false)} added={dejaProduits} />}
      {pateOpen && <ComponentPickerModal kinds={["PATE"]} onClose={() => setPateOpen(false)} onAdd={(c) => { setPateOpen(false); addComponent(c); }} added={dejaFiches} excludeId={r.id} />}
    </div>
  );
}

// Une ligne chiffrée du panneau de résultat.
function Row({ label, value, accent }) {
  return <div className="fe-row"><span>{label}</span><b className={"chiffres" + (accent ? " acc" : "")}>{value}</b></div>;
}

export default FicheRecette;
