import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import WizSteps from "../components/WizSteps.jsx";
import BuilderHub from "../components/BuilderHub.jsx";
import IntroGuide, { GUIDE_KEY } from "../components/IntroGuide.jsx";
import { euro } from "../lib/format.js";
import { getMyRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe, searchCatalog } from "../api/apiClient.js";
import { num, GARN_BASES, GARN_PRODUITS, GARN_DAIRY, GARN_TIPS, prodOf, pairSuggestions, garnitureItems, garnitureCost } from "../lib/garnitures.js";

/**
 * Assistant « Créer une garniture » (kind PREPARATION) — base → produits (+ food-pairing) → laitier.
 * Suggère des associations de saveurs (table d'affinités curée). Sauve dans « Mes garnitures »
 * (réutilisable dans une réalisation + partageable). La garniture se raisonne par pizza.
 */
const STEPS = [
  { key: "base", n: 1, label: "La base", ic: "droplet", q: "Quelle base ?" },
  { key: "produits", n: 2, label: "Produits", ic: "search", q: "Choisis un ou plusieurs produits" },
  { key: "laitier", n: 3, label: "Laitier", ic: "star", q: "Un produit laitier ?" },
];
const NEW = () => ({ id: null, kind: "PREPARATION", name: "", servings: 1, visibility: "PRIVATE", dough_params: { garn: { base: "tomate", baseQty: 80, products: [], dairy: [] } } });
const parseDP = (v) => { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return {}; } };
const garnOf = (r) => (r.dough_params && r.dough_params.garn) || { base: "", products: [], dairy: [] };
const CATS = [...new Set(GARN_PRODUITS.map((p) => p.cat))];

export default function GarnitureWizard() {
  const [r, setR] = useState(NEW);
  const [view, setView] = useState("hub"); // hub | create | mine
  const [detail, setDetail] = useState(null);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dbQ, setDbQ] = useState("");
  const [dbRes, setDbRes] = useState([]);
  const [guide, setGuide] = useState(false); // false | "general" | "garniture"
  const closeGuide = () => { if (guide === "general") { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* ignore */ } } setGuide(false); };

  const reload = () => getMyRecipes("PREPARATION").then((res) => setSaved(res.data || [])).catch(() => {});
  useEffect(() => { reload(); }, []);
  useEffect(() => { if (!localStorage.getItem(GUIDE_KEY)) setGuide("general"); }, []);
  // Recherche de produits dans la base (catalogue) — débounce.
  useEffect(() => {
    const q = dbQ.trim();
    if (q.length < 2) { setDbRes([]); return; }
    const t = setTimeout(() => { searchCatalog({ q, limit: 8 }).then((res) => setDbRes(res.data || res.items || [])).catch(() => setDbRes([])); }, 300);
    return () => clearTimeout(t);
  }, [dbQ]);

  const garn = garnOf(r);
  const setGarn = (patch) => setR((p) => ({ ...p, dough_params: { ...p.dough_params, garn: { ...garnOf(p), ...patch } } }));
  const setBase = (key) => { const b = GARN_BASES.find((x) => x.key === key); setGarn({ base: key, baseQty: b ? b.qty : 60 }); };
  const prodKeys = (garn.products || []).map((p) => p.key);
  const dairyKeys = (garn.dairy || []).map((d) => d.key);
  const toggleProduct = (key) => setGarn(prodKeys.includes(key)
    ? { products: garn.products.filter((p) => p.key !== key) }
    : { products: [...(garn.products || []), { key, qty: prodOf(key).qty, price: prodOf(key).price }] });
  const addDbProduct = (prod) => { const key = "db:" + prod.id; if (prodKeys.includes(key)) return; const price = num(prod.unit_ht ?? prod.price_ht ?? prod.unit_ttc) || 6; setGarn({ products: [...(garn.products || []), { key, label: prod.name, emoji: "🛒", qty: 40, price, db: true }] }); setDbQ(""); setDbRes([]); };
  const setProd = (key, patch) => setGarn({ products: garn.products.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const toggleDairy = (key) => setGarn(dairyKeys.includes(key)
    ? { dairy: garn.dairy.filter((d) => d.key !== key) }
    : { dairy: [...(garn.dairy || []), { key, qty: (GARN_DAIRY.find((x) => x.key === key) || {}).qty, price: (GARN_DAIRY.find((x) => x.key === key) || {}).price }] });
  const setDairy = (key, patch) => setGarn({ dairy: garn.dairy.map((d) => (d.key === key ? { ...d, ...patch } : d)) });

  const suggestions = pairSuggestions([...prodKeys, ...dairyKeys], garn.base);
  const { items, total } = garnitureCost(garn);
  const tips = [...prodKeys, ...dairyKeys].map((k) => GARN_TIPS[k] && { k, txt: GARN_TIPS[k] }).filter(Boolean);
  const baseObj = GARN_BASES.find((b) => b.key === garn.base);

  async function persist({ asNew = false, overrides = {} } = {}) {
    setBusy(true);
    const merged = { ...r, ...overrides };
    const payload = { ...merged, kind: "PREPARATION", type: baseObj ? baseObj.label : "Garniture",
      name: ((overrides.name ?? r.name) || "").trim() || `Garniture ${baseObj ? baseObj.label.toLowerCase() : ""}`.trim(), dough_params: r.dough_params };
    try {
      if (!asNew && r.id) { await updateRecipe(r.id, payload); setR((p) => ({ ...p, ...overrides })); }
      else { const res = await createRecipe({ ...payload, id: undefined }); setR((p) => ({ ...p, ...overrides, id: res.data && res.data.id })); }
      reload();
    } catch { /* ignore */ } finally { setBusy(false); }
  }
  const showDetail = (s) => setDetail({ ...NEW(), ...s, dough_params: { ...parseDP(s.dough_params) } });
  function editFromDetail() { if (!detail) return; setR(detail); setDetail(null); setView("create"); setStep(0); }
  async function persistDetail(patch = {}, asNew = false) {
    if (!detail) return; setBusy(true);
    const d = { ...detail, ...patch };
    const base = GARN_BASES.find((x) => x.key === (d.dough_params.garn || {}).base);
    const payload = { ...d, kind: "PREPARATION", type: base ? base.label : "Garniture", name: (d.name || "").trim() || "Garniture" };
    try {
      if (asNew) { await createRecipe({ ...payload, id: undefined, name: `${payload.name} (copie)`, visibility: "PRIVATE" }); setDetail(null); }
      else { await updateRecipe(d.id, payload); setDetail(d); }
      reload();
    } catch { /* ignore */ } finally { setBusy(false); }
  }
  async function remove(id) { if (!window.confirm("Supprimer cette garniture ?")) return; try { await deleteRecipe(id); if (r.id === id) setR(NEW()); if (detail?.id === id) setDetail(null); reload(); } catch { /* ignore */ } }
  const startCreate = () => { setR(NEW()); setStep(0); setView("create"); };
  function saveBuild({ asNew = false, ...overrides } = {}) {
    let name = (overrides.name ?? r.name ?? "").trim();
    if (!name) {
      name = (window.prompt("Nom de la garniture :", `Garniture ${baseObj ? baseObj.label.toLowerCase() : ""}`.trim()) || "").trim();
      if (!name) return;
      setR((p) => ({ ...p, name }));
      overrides.name = name;
    }
    persist({ asNew, overrides });
  }
  const shared = r.visibility === "SHARED";
  const cur = STEPS[step];
  const ghostWhite = { background: "transparent", color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.35)" };

  return (
    <>
      <PageHead eyebrow="Outils · garnitures" title="Mes garnitures"
        lead="Compose ta garniture pas-à-pas : la base, les produits (avec le food-pairing) et le fromage. Le coût matière par pizza est calculé." />
      <IntroGuide open={!!guide} page={guide && guide !== "general" ? "garniture" : null} onClose={closeGuide} />

      {detail ? (
        <RecapGarniture recipe={detail} busy={busy} onBack={() => setDetail(null)} onEdit={editFromDetail}
          onDuplicate={() => persistDetail({}, true)} onShare={() => persistDetail({ visibility: detail.visibility === "SHARED" ? "PRIVATE" : "SHARED" })} onDelete={() => remove(detail.id)} />
      ) : view === "hub" ? (
        <>
          <button className="btn ghost sm" onClick={() => setGuide("general")} style={{ marginBottom: 14 }}><Icon name="book-open" size={14} /> Comment ça marche&nbsp;?</button>
          <BuilderHub cards={[
            { title: "Créer une garniture", desc: "L'assistant te guide : base, produits (avec le food-pairing), fromage. Coût matière calculé.", icon: "plus", color: "#7bb661", onClick: startCreate },
            { title: "Mes garnitures", badge: saved.length || "0", desc: "Consulter, modifier ou partager tes garnitures enregistrées.", icon: "history", color: "#3aa0e0", onClick: () => setView("mine") },
          ]} />
        </>
      ) : view === "mine" ? (
        <>
          <button className="btn ghost sm" onClick={() => setView("hub")} style={{ marginBottom: 14 }}><Icon name="chevron-left" size={14} /> Retour</button>
          <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes garnitures enregistrées</span>}>
            {saved.length === 0 ? <p className="hint" style={{ margin: 0 }}>Aucune garniture. <button className="btn sm ghost" onClick={startCreate}>Créer une garniture</button></p> : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {saved.map((s) => { const g = parseDP(s.dough_params).garn || {}; const np = (g.products || []).length, nd = (g.dairy || []).length;
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: "1px solid var(--border-soft)" }}>
                      <span className="fiche-tag" style={{ background: "color-mix(in srgb, #7bb661 15%, var(--surface))", color: "#5f9e3f" }}>Garniture</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{s.name}</b>
                        <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{s.type}{np ? ` · ${np} produit${np > 1 ? "s" : ""}` : ""}{nd ? ` · ${nd} fromage${nd > 1 ? "s" : ""}` : ""}{s.visibility === "SHARED" ? " · partagé" : ""}</span>
                      </div>
                      <button className="btn sm ghost" onClick={() => showDetail(s)}><Icon name="book-open" size={13} /> Ouvrir</button>
                      <button className="iconbtn del" title="Supprimer" onClick={() => remove(s.id)}><Icon name="trash" size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <button className="btn ghost sm" onClick={() => setView("hub")}><Icon name="chevron-left" size={14} /> Accueil garnitures</button>
            <button className="btn ghost sm" onClick={() => setGuide("garniture")} style={{ marginLeft: "auto" }} title="Aide sur cet outil"><Icon name="book-open" size={13} /> Aide</button>
          </div>
          <div className="wiz-layout">
            <Card>
              <WizSteps steps={STEPS} step={step} setStep={setStep} />
              <div className="wiz-q"><Icon name={cur.ic} size={18} /> <b>{cur.q}</b></div>

              {cur.key === "base" && (
                <div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {GARN_BASES.map((b) => <button key={b.key} onClick={() => setBase(b.key)} className={"gp-chip" + (garn.base === b.key ? " on" : "")}><span>{b.emoji}</span> {b.label}</button>)}
                  </div>
                  {baseObj && baseObj.key !== "autre" && (
                    <div className="field" style={{ marginTop: 14, maxWidth: 220 }}><label>Quantité de base (g/pizza)</label><input className="inp" type="number" min="0" value={garn.baseQty ?? baseObj.qty} onChange={(e) => setGarn({ baseQty: Number(e.target.value) })} /></div>
                  )}
                  <p className="hint" style={{ margin: "12px 0 0" }}>La base pose le profil de saveur — on te proposera ensuite des produits qui s'y associent bien.</p>
                </div>
              )}

              {cur.key === "produits" && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={15} /></span>
                      <input className="inp" value={dbQ} onChange={(e) => setDbQ(e.target.value)} placeholder="Chercher un produit dans la base (catalogue)…" style={{ paddingLeft: 34 }} />
                    </div>
                    {dbRes.length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                        {dbRes.map((p) => (
                          <button key={p.id} onClick={() => addDbProduct(p)} className="pick-row" style={{ padding: "8px 11px" }}>
                            <Icon name="plus" size={14} />
                            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}><b style={{ fontSize: 13 }}>{p.name}</b><span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>{[p.brand, p.family].filter(Boolean).join(" · ")}</span></div>
                            <span className="tnum" style={{ fontSize: 12 }}>{euro(num(p.unit_ht ?? p.price_ht))}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {(garn.products || []).length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div className="ate-lbl" style={{ marginBottom: 6 }}>Produits choisis ({garn.products.length})</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {garn.products.map((p) => { const m = prodOf(p.key); return <button key={p.key} onClick={() => toggleProduct(p.key)} className="gp-chip on"><span>{p.emoji || m.emoji}</span> {p.label || m.label} <Icon name="x" size={12} /></button>; })}
                      </div>
                    </div>
                  )}

                  <div className="pair-panel">
                    <div className="pair-head">
                      <span className="pair-badge"><Icon name="star" size={13} fill="currentColor" /> Food-pairing</span>
                      <span className="hint" style={{ fontSize: 11.5 }}>{suggestions.length ? "s'associent bien avec ta sélection — clique pour ajouter" : "ajoute une base ou un produit pour des idées"}</span>
                    </div>
                    {suggestions.length > 0 && (
                      <div className="pair-list">
                        {suggestions.map((s) => (
                          <button key={s.key} onClick={() => toggleProduct(s.key)} className="pair-item" title={`Ajouter ${s.label}`}>
                            <span style={{ fontSize: 18 }}>{s.emoji}</span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}><b style={{ fontSize: 13 }}>{s.label}</b><span style={{ display: "block", fontSize: 10.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>avec {s.matches.slice(0, 2).join(", ").toLowerCase()}</span></span>
                            <Icon name="plus" size={14} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {CATS.map((cat) => (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <div className="ate-lbl" style={{ marginBottom: 6 }}>{cat}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {GARN_PRODUITS.filter((p) => p.cat === cat).map((p) => <button key={p.key} onClick={() => toggleProduct(p.key)} className={"gp-chip" + (prodKeys.includes(p.key) ? " on" : "")}><span>{p.emoji}</span> {p.label}{p.fragile ? " ❄️" : ""}</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cur.key === "laitier" && (
                <div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {GARN_DAIRY.map((d) => <button key={d.key} onClick={() => toggleDairy(d.key)} className={"gp-chip" + (dairyKeys.includes(d.key) ? " on" : "")}><span>{d.emoji}</span> {d.label}{d.fragile ? " ❄️" : ""}</button>)}
                  </div>
                  <p className="hint" style={{ margin: "12px 0 0" }}>Tu peux en cumuler plusieurs. ❄️ = produit frais/fragile (à poser après cuisson, à éviter au distributeur).</p>
                </div>
              )}

              {step < STEPS.length - 1 ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20 }}>
                  <button className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><Icon name="chevron-left" size={15} /> Retour</button>
                  <button className="btn primary" onClick={() => setStep((s) => s + 1)}>Suivant <Icon name="chevron-right" size={15} /></button>
                </div>
              ) : (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-soft)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, marginBottom: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={r.dough_params.shareCost !== false} onChange={(e) => setR((p) => ({ ...p, dough_params: { ...p.dough_params, shareCost: e.target.checked } }))} style={{ width: 15, height: 15, accentColor: "var(--ember1)" }} />
                    Partager le coût en communauté <span className="hint" style={{ fontWeight: 400 }}>(sinon confidentiel)</span>
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}><Icon name="chevron-left" size={15} /> Retour</button>
                    <span style={{ flex: 1 }} />
                    {r.id && <button className="btn ghost" onClick={() => saveBuild({ asNew: true, name: `${(r.name || "Garniture").trim()} (copie)`, visibility: "PRIVATE" })} disabled={busy}><Icon name="plus" size={14} /> Dupliquer</button>}
                    <button className={"btn " + (shared ? "primary" : "ghost")} onClick={() => saveBuild({ visibility: shared ? "PRIVATE" : "SHARED" })} disabled={busy}><Icon name={shared ? "users" : "send"} size={15} /> {shared ? "Partagé" : "Partager"}</button>
                    <button className="btn primary" onClick={() => saveBuild()} disabled={busy}><Icon name="check" size={15} /> Enregistrer</button>
                  </div>
                  {r.id && <button className="btn ghost sm" onClick={startCreate} style={{ marginTop: 10 }}><Icon name="plus" size={13} /> Nouvelle garniture</button>}
                </div>
              )}
            </Card>

            {/* Résultat en direct */}
            <div className="card dough-result">
              <div className="field" style={{ marginBottom: 10 }}>
                <label style={{ color: "rgba(255,255,255,.8)" }}>Nom de la garniture</label>
                <input className="inp" value={r.name} onChange={(e) => setR((p) => ({ ...p, name: e.target.value }))} placeholder={`Garniture ${baseObj ? baseObj.label.toLowerCase() : ""}`} />
              </div>
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{baseObj ? baseObj.label : "Garniture"} · par pizza</div>
              <div style={{ font: "800 22px/1.1 var(--font-d)", margin: "4px 0 12px" }}>{items.length} élément{items.length > 1 ? "s" : ""}</div>

              {items.length === 0 ? <p className="hint" style={{ color: "rgba(255,255,255,.6)" }}>Ajoute une base et des produits…</p> : items.map((i) => (
                <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                  <span>{i.emoji}</span><b style={{ flex: 1, fontSize: 13 }}>{i.label}{i.fragile ? " ❄️" : ""}</b>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{num(i.qty)} g</span>
                  <b className="tnum" style={{ width: 54, textAlign: "right" }}>{euro((num(i.qty) / 1000) * num(i.price))}</b>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
                <span className="hint" style={{ color: "rgba(255,255,255,.8)" }}>Coût matière / pizza</span>
                <b className="tnum" style={{ fontSize: 20, color: "var(--gold)" }}>{euro(total)}</b>
              </div>

              {tips.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.15)" }}>
                  <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)", marginBottom: 6 }}>💡 Idées d'amélioration</div>
                  {tips.map((t) => <p key={t.k} style={{ fontSize: 11.5, color: "rgba(255,255,255,.8)", margin: "0 0 5px", lineHeight: 1.4 }}>• {t.txt}</p>)}
                </div>
              )}

            </div>
          </div>
        </>
      )}
    </>
  );
}

// Fiche récap d'une garniture (lecture seule + impression).
function RecapGarniture({ recipe, onBack, onEdit, onDuplicate, onShare, onDelete, busy }) {
  const dpv = parseDP(recipe.dough_params);
  const garn = dpv.garn || {};
  const { items, total } = garnitureCost(garn);
  const base = GARN_BASES.find((b) => b.key === garn.base);
  const tips = [...(garn.products || []).map((p) => p.key), ...(garn.dairy || []).map((d) => d.key)].map((k) => GARN_TIPS[k]).filter(Boolean);
  const shared = recipe.visibility === "SHARED";
  return (
    <div className="print-area">
      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button className="btn ghost sm" onClick={onBack}><Icon name="chevron-left" size={14} /> Mes garnitures</button>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={() => window.print()}><Icon name="printer" size={14} /> Imprimer</button>
        <button className="btn primary sm" onClick={onEdit} disabled={busy}><Icon name="pencil" size={13} /> Modifier</button>
        <button className="btn ghost sm" onClick={onDuplicate} disabled={busy}><Icon name="plus" size={13} /> Dupliquer</button>
        <button className={"btn sm " + (shared ? "primary" : "ghost")} onClick={onShare} disabled={busy}><Icon name={shared ? "users" : "send"} size={13} /> {shared ? "Partagé" : "Partager"}</button>
        <button className="iconbtn del" title="Supprimer" onClick={onDelete} disabled={busy}><Icon name="trash" size={14} /></button>
      </div>
      <Card>
        <div className="eyebrow" style={{ color: "#5f9e3f" }}>Fiche garniture</div>
        <h2 style={{ font: "800 26px/1.1 var(--font-d)", margin: "2px 0 4px" }}>{recipe.name}{shared && <span className="badge" style={{ marginLeft: 8, fontSize: 11, verticalAlign: "middle" }}>Partagé</span>}</h2>
        <div className="hint">{base ? base.label : "Garniture"} · {items.length} éléments · par pizza</div>
        <div style={{ marginTop: 16 }}>
          {items.map((i) => (
            <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span style={{ fontSize: 17 }}>{i.emoji}</span><b style={{ flex: 1, fontSize: 13.5 }}>{i.label}{i.fragile ? " ❄️" : ""}</b>
              <span className="hint">{num(i.qty)} g · {euro(i.price)}/kg</span>
              <b className="tnum" style={{ width: 56, textAlign: "right" }}>{euro((num(i.qty) / 1000) * num(i.price))}</b>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 800 }}><span>Coût matière / pizza</span><span className="tnum" style={{ color: "var(--gold)" }}>{euro(total)}</span></div>
        </div>
        {tips.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="ate-lbl" style={{ marginBottom: 8 }}>💡 Idées d'amélioration</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              {tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
