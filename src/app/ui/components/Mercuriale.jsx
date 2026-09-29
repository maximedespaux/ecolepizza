import { useEffect, useState } from "react";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";
import { euro } from "../lib/format.js";
import { searchCatalog, addMercurialeItem, updateMercurialeItem, deleteMercurialeItem } from "../api/apiClient.js";
import { num, FRESH_PRODUCE, FRESH_FAMS, parseMetroName } from "../lib/mercuriale.js";
import { RAYONS, rayonOf, isRawProduct } from "../lib/garnitures.js";

// Unité Metro (Kg/L/Piece) → unité mercuriale (kg/litre/pièce).
const metroUnit = (t) => (t === "Piece" ? "pièce" : t === "L" ? "litre" : "kg");
const unitPer = (u) => (u === "kg" ? "kg" : u === "litre" ? "L" : u);
const SOURCE_LABEL = { RNM: "RNM / marché", METRO: "Metro", FOURNISSEUR: "Fournisseur", MANUEL: "Manuel" };

// Ma mercuriale = liste de prix curée. Deux onglets : « Ma mercuriale » (ma liste éditable, avec un
// AJOUT UNIFIÉ en tête : on cherche un produit, il vient des « Prix du marché » en un clic ou se crée
// à la main s'il n'y est pas) et « Prix du marché » (le catalogue Metro + frais/marché, à parcourir).
// Outil à part entière (MercurialePage) OU vue interne d'un assistant : sans `onBack`, pas de retour.
export default function Mercuriale({ items, reload, onBack }) {
  const [tab, setTab] = useState("mine"); // on arrive sur sa liste, avec la recherche d'ajout en tête
  const refs = new Set(items.map((i) => i.catalog_product_id).filter(Boolean));

  async function addItem(payload) { try { await addMercurialeItem(payload); reload(); } catch { /* barre globale */ } }
  const addFresh = (p) => addItem({ label: p.label, family: p.family, origin: p.origin, calibre: p.calibre, conditionnement: p.cond, market: p.market, unit: p.unit, price: p.price, source: p.market === "Fournisseur" ? "FOURNISSEUR" : "RNM", catalog_product_id: p.id });
  const addMetro = (p) => { const { label, origin } = parseMetroName(p.name); addItem({ label, origin, family: (p.family || ""), brand: p.brand, unit: metroUnit(p.type_unity), price: num(p.unit_ht ?? p.price_ht), market: "Metro", source: "METRO", catalog_product_id: p.id }); };
  // Produit HORS catalogue, créé à la main depuis la recherche d'ajout (prix/unité à compléter ensuite).
  const addManual = (label) => addItem({ label, source: "MANUEL", unit: "kg", price: 0, market: "Manuel" });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {onBack && <button className="btn ghost sm" onClick={onBack}><Icon name="chevron-left" size={14} /> Retour</button>}
        <span style={{ flex: 1 }} />
        <div className="src" role="tablist">
          <button className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>Ma mercuriale{items.length ? ` (${items.length})` : ""}</button>
          <button className={tab === "catalogue" ? "on" : ""} onClick={() => setTab("catalogue")}>Prix du marché</button>
        </div>
      </div>

      {tab === "catalogue"
        ? <CatalogueTab refs={refs} onAddFresh={addFresh} onAddMetro={addMetro} />
        : <MineTab items={items} reload={reload} refs={refs} onAddFresh={addFresh} onAddMetro={addMetro} onAddManual={addManual} />}
    </>
  );
}

// --- Onglet Prix du marché : Metro (catalog_product) + Frais/Marché (RNM), à parcourir ---
function CatalogueTab({ refs, onAddFresh, onAddMetro }) {
  const [src, setSrc] = useState("frais"); // frais | metro
  const [fam, setFam] = useState("");      // filtre famille (frais) ou rayon (metro)
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name_asc"); // name / price / origin, _asc | _desc
  const [metro, setMetro] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(null); // { row, x, y }, bulle info au survol
  const dir = sort.endsWith("desc") ? -1 : 1;
  const sortKey = sort.replace(/_(asc|desc)$/, "");
  const toggleSort = (field) => setSort((s) => (s === field + "_asc" ? field + "_desc" : field + "_asc"));

  useEffect(() => { setFam(""); }, [src]);
  useEffect(() => {
    if (src !== "metro") return;
    const rr = rayonOf(fam);
    const params = { limit: 24, sort: sortKey === "origin" ? "name_asc" : sort }; // origine → tri côté client
    if (q.trim().length >= 2) params.q = q.trim();
    if (rr && rr.cat) params.cat = rr.cat;
    if (rr && rr.family) params.family = rr.family;
    setLoading(true);
    const t = setTimeout(() => { searchCatalog(params).then((d) => { setMetro(d.data || []); setTotal(d.total || 0); }).catch(() => setMetro([])).finally(() => setLoading(false)); }, 260);
    return () => clearTimeout(t);
  }, [src, fam, q, sort]);

  // Lignes normalisées { id, label (nettoyé), full (nom complet au survol), family, origin, price, unit, add }.
  const rows = src === "frais"
    ? FRESH_PRODUCE.filter((p) => (!fam || p.family === fam) && (!q.trim() || (p.label + p.origin + p.market).toLowerCase().includes(q.trim().toLowerCase())))
        .map((p) => ({ id: p.id, label: p.label, full: p.label, family: p.family, origin: p.origin, brand: null, image: null, cond: p.cond, market: p.market, price: p.price, unit: p.unit, add: () => onAddFresh(p) }))
    : metro.filter(isRawProduct).map((p) => { const { label, origin } = parseMetroName(p.name); return { id: p.id, label, full: p.name, family: p.family, origin, brand: p.brand && p.brand !== "NO BRAND" ? p.brand : null, image: p.image_url, market: "Metro", price: num(p.unit_ht ?? p.price_ht), unit: metroUnit(p.type_unity), add: () => onAddMetro(p) }; });
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "price") return (num(a.price) - num(b.price)) * dir;
    if (sortKey === "origin") { const ao = a.origin || "", bo = b.origin || ""; if (!ao !== !bo) return ao ? -1 : 1; return ao.localeCompare(bo, "fr") * dir; } // sans origine → toujours en dernier
    return String(a.label || "").localeCompare(String(b.label || ""), "fr") * dir;
  });
  const arrow = (f) => (sortKey === f ? (dir === 1 ? " ▲" : " ▼") : "");

  return (
    <Card>
      <div className="eyebrow" style={{ color: "var(--ember1)" }}>Référence marché</div>
      <p className="hint" style={{ margin: "4px 0 14px" }}>Ajoute les produits que tu utilises vraiment. Le frais/marché complète le catalogue Metro (sans produits frais). <b>Clique une colonne pour trier</b> (nom, origine, prix).</p>

      <div className="bar" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div className="src">
          <button className={src === "frais" ? "on" : ""} onClick={() => setSrc("frais")}>🌿 Frais / marché</button>
          <button className={src === "metro" ? "on" : ""} onClick={() => setSrc("metro")}>🛒 Metro</button>
        </div>
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={15} /></span>
          <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit…" style={{ paddingLeft: 34, width: "100%" }} />
        </div>
      </div>

      <div className="rayon-tabs" style={{ marginBottom: 4 }}>
        <button className={"rayon-tab" + (fam === "" ? " on" : "")} onClick={() => setFam("")}>Tout</button>
        {(src === "frais" ? FRESH_FAMS.map((f) => ({ key: f, label: f, emoji: "" })) : RAYONS).map((r) => (
          <button key={r.key || r} className={"rayon-tab" + (fam === (r.key || r) ? " on" : "")} onClick={() => setFam(r.key || r)}>{r.emoji ? r.emoji + " " : ""}{r.label || r}</button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="merc-table" style={{ minWidth: 560 }}>
          <thead><tr>
            <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("name")}>Produit{arrow("name")}</th>
            <th>Famille</th>
            <th className="hidecol">Marque</th>
            <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("origin")}>Origine{arrow("origin")}</th>
            <th className="r" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("price")}>Prix{arrow("price")}</th>
            <th></th>
          </tr></thead>
          <tbody>
            {loading && src === "metro" && sorted.length === 0 ? <tr><td colSpan="6"><div className="cat-empty">Chargement…</div></td></tr>
              : sorted.length === 0 ? <tr><td colSpan="6"><div className="cat-empty">Aucun produit ici, change de rayon ou de mot-clé.</div></td></tr>
              : sorted.map((r) => { const added = refs.has(r.id); return (
                <tr key={r.id}
                    onMouseEnter={(e) => { const q = e.currentTarget.getBoundingClientRect(); setHover({ row: r, x: q.right, y: q.top, left: q.left }); }}
                    onMouseLeave={() => setHover((h) => (h && h.row.id === r.id ? null : h))}>
                  <td><b style={{ display: "block", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.full}>{r.label}</b></td>
                  <td><span className="chip">{r.family || "-"}</span></td>
                  <td className="hidecol" style={{ color: "var(--muted)", fontSize: 12.5 }}>{r.brand || "-"}</td>
                  <td>{r.origin || "-"}</td>
                  <td className="r"><span className="price">{euro(num(r.price))}</span><span style={{ color: "var(--dim)" }}>/{unitPer(r.unit)}</span></td>
                  <td className="r">{added ? <span className="chip">✓ Ajouté</span> : <button className="btn sm primary" onClick={r.add}><Icon name="plus" size={12} /> Ajouter</button>}</td>
                </tr>); })}
          </tbody>
        </table>
      </div>
      {src === "metro" && total > sorted.length && <p className="hint" style={{ margin: "8px 0 0", fontSize: 11.5 }}>{sorted.length} produits affichés (sur {total} au rayon), affine avec la recherche.</p>}
      {hover && <ProductBubble r={hover.row} anchor={hover} />}
    </Card>
  );
}

// Bulle d'info au survol d'un produit : image (asset Metro) + récap bref.
function ProductBubble({ r, anchor }) {
  const W = 232, H = 196;
  const flipLeft = anchor.x + 14 + W > window.innerWidth;
  const left = flipLeft ? Math.max(8, anchor.left - W - 14) : anchor.x + 14;
  const top = Math.min(Math.max(8, anchor.y - 8), window.innerHeight - H - 8);
  return (
    <div style={{ position: "fixed", left, top, zIndex: 260, width: W, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 14px 36px rgba(0,0,0,.28)", padding: 12, pointerEvents: "none" }}>
      {r.image
        ? <img src={r.image} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: 100, objectFit: "contain", background: "#fff", borderRadius: 8, marginBottom: 8 }} />
        : <div style={{ height: 100, display: "grid", placeItems: "center", background: "var(--surface2)", borderRadius: 8, marginBottom: 8, fontSize: 34 }}>🧺</div>}
      <b style={{ fontSize: 13, lineHeight: 1.3, display: "block" }}>{r.full}</b>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5 }}>{[r.brand, r.origin, r.market].filter(Boolean).join(" · ") || "-"}</div>
      <div style={{ fontSize: 13, marginTop: 5 }}><b className="price">{euro(num(r.price))}</b><span style={{ color: "var(--dim)" }}>/{unitPer(r.unit)}</span> · {r.family}</div>
    </div>
  );
}

// --- Onglet Ma mercuriale : recherche d'ajout unifiée en tête + cartes éditables (prix, unité, source) ---
function MineTab({ items, reload, refs, onAddFresh, onAddMetro, onAddManual }) {
  const [busy, setBusy] = useState(false);
  const patch = async (id, body) => { setBusy(true); try { await updateMercurialeItem(id, body); reload(); } catch { /* ignore */ } finally { setBusy(false); } };
  const remove = async (id) => { if (!window.confirm("Retirer ce produit de ta mercuriale ?")) return; try { await deleteMercurialeItem(id); reload(); } catch { /* ignore */ } };

  // Regroupe par famille (rayon).
  const byFam = {};
  items.forEach((i) => { const f = i.family || "Autres"; (byFam[f] = byFam[f] || []).push(i); });

  return (
    <>
      <QuickAdd refs={refs} onAddFresh={onAddFresh} onAddMetro={onAddMetro} onAddManual={onAddManual} />

      {items.length === 0 ? (
        <Card><div className="empty" style={{ textAlign: "center", padding: "30px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🧺</div>
          <h3 style={{ margin: "0 0 6px" }}>Ta mercuriale est vide</h3>
          <p className="hint" style={{ margin: 0 }}>Cherche un produit ci-dessus : il vient des prix du marché, ou tu l'ajoutes à la main.</p>
        </div></Card>
      ) : (<>
        <p className="hint" style={{ margin: "0 0 12px" }}>{items.length} produit{items.length > 1 ? "s" : ""} · prix réels, éditables. Les recettes piochent ici.</p>
      {Object.entries(byFam).map(([fam, list]) => (
        <div key={fam} style={{ marginBottom: 16 }}>
          <div className="ate-lbl" style={{ marginBottom: 8 }}>{fam}</div>
          <div className="grid cols-3" style={{ gap: 12 }}>
            {list.map((m) => (
              <div key={m.id} className="mcard" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 14, display: "block" }}>{m.label}</b>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                      {m.brand && <span className="chip">{m.brand}</span>}
                      {m.origin && <span className="chip">{m.origin}</span>}
                      {m.market && <span className="chip">{m.market}</span>}
                    </div>
                  </div>
                  <button className="iconbtn del" title="Retirer" onClick={() => remove(m.id)}><Icon name="trash" size={14} /></button>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>Prix (€)</label><input className="inp tnum" defaultValue={num(m.price)} onBlur={(e) => { const v = Number(String(e.target.value).replace(",", ".")); if (v !== num(m.price)) patch(m.id, { price: v, source: "MANUEL" }); }} /></div>
                  <div className="field" style={{ width: 92, marginBottom: 0 }}><label>Unité</label>
                    <select className="inp" value={m.unit || "kg"} onChange={(e) => patch(m.id, { unit: e.target.value })}>
                      {["kg", "litre", "pièce", "botte", "plateau"].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field" style={{ marginBottom: 0, marginTop: 8 }}><label>Source du prix</label>
                  <div className="src">
                    {["RNM", "METRO", "FOURNISSEUR", "MANUEL"].map((s) => <button key={s} className={m.source === s ? "on" : ""} onClick={() => patch(m.id, { source: s })} disabled={busy}>{SOURCE_LABEL[s].split(" ")[0]}</button>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      </>)}
    </>
  );
}

// Recherche d'ajout UNIFIÉE (2026-09-29) : un seul champ. Ce qu'on tape est cherché dans les PRIX DU
// MARCHÉ (frais/marché local + Metro via l'API) — un clic ajoute le produit à sa mercuriale (prix et
// unité repris). Rien ne correspond ? « Ajouter « X » à la main » crée un produit HORS catalogue, dont
// on fixe le prix et l'unité ensuite dans sa carte. Une seule action pour les deux cas.
function QuickAdd({ refs, onAddFresh, onAddMetro, onAddManual }) {
  const [q, setQ] = useState("");
  const [metro, setMetro] = useState([]);
  const [loading, setLoading] = useState(false);
  const ql = q.trim();
  useEffect(() => {
    if (ql.length < 2) { setMetro([]); return; }
    setLoading(true);
    const t = setTimeout(() => searchCatalog({ q: ql, limit: 8 }).then((d) => setMetro((d.data || []).filter(isRawProduct))).catch(() => setMetro([])).finally(() => setLoading(false)), 260);
    return () => clearTimeout(t);
  }, [ql]);
  const l = ql.toLowerCase();
  const fresh = ql.length >= 2 ? FRESH_PRODUCE.filter((p) => (p.label + (p.origin || "")).toLowerCase().includes(l)).slice(0, 6) : [];
  const results = [
    ...fresh.map((p) => ({ key: "f-" + p.id, id: p.id, label: p.label, sub: [p.origin, p.market].filter(Boolean).join(" · "), price: p.price, unit: p.unit, add: () => onAddFresh(p) })),
    ...metro.map((p) => { const { label, origin } = parseMetroName(p.name); return { key: "m-" + p.id, id: p.id, label, sub: [p.brand && p.brand !== "NO BRAND" ? p.brand : null, origin, "Metro"].filter(Boolean).join(" · "), price: num(p.unit_ht ?? p.price_ht), unit: metroUnit(p.type_unity), add: () => onAddMetro(p) }; }),
  ];
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={16} /></span>
        <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un produit — cherche dans les prix du marché…" style={{ paddingLeft: 38, paddingRight: 32, width: "100%" }} />
        {q && <button className="gs-clear" title="Effacer" onClick={() => setQ("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}><Icon name="x" size={14} /></button>}
      </div>
      {ql.length >= 2 && (
        <div className="cat-results" style={{ marginTop: 10 }}>
          {results.map((r) => { const added = refs.has(r.id); return (
            <button key={r.key} className={"cat-row" + (added ? " added" : "")} onClick={() => !added && r.add()} disabled={added} style={{ marginBottom: 4, width: "100%" }}>
              <Icon name={added ? "check" : "plus"} size={15} />
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}><b style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</b><span style={{ fontSize: 11, color: "var(--muted)" }}>{r.sub || "-"}</span></div>
              <span className="tnum" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{euro(num(r.price))}/{unitPer(r.unit)}</span>
            </button>
          ); })}
          {loading && results.length === 0 && <div className="cat-empty">Recherche…</div>}
          <button className="cat-row" onClick={() => { onAddManual(ql); setQ(""); }} style={{ width: "100%", marginTop: results.length ? 6 : 0, borderTop: results.length ? "1px dashed var(--border)" : "none", paddingTop: results.length ? 10 : undefined }}>
            <Icon name="plus" size={15} />
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}><b style={{ fontSize: 13 }}>Ajouter « {ql} » à la main</b><span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>Produit hors catalogue — tu fixeras le prix et l'unité.</span></div>
          </button>
        </div>
      )}
    </Card>
  );
}
