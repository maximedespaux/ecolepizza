import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import SaveToast from "../components/SaveToast.jsx";
import WizSteps from "../components/WizSteps.jsx";
import BuilderHub from "../components/BuilderHub.jsx";
import { PizzaDisc } from "../components/LivePizza.jsx";
import WizDock from "../components/WizDock.jsx";
import IntroGuide, { GUIDE_KEY } from "../components/IntroGuide.jsx";
import Mercuriale from "../components/Mercuriale.jsx";
import { euro } from "../lib/format.js";
import { getMyRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe, getMercuriale } from "../api/apiClient.js";
import { num, GARN_BASES, GARN_PRODUITS, GARN_DAIRY, GARN_TIPS, prodOf, pairSuggestions, garnitureItems, garnitureCost, lineCost, baseModesOf, unitShort, qtyUnit, qtyStep, perWeightUnit } from "../lib/garnitures.js";

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
const NEW = () => ({ id: null, kind: "PREPARATION", name: "", servings: 1, visibility: "PRIVATE", dough_params: { garn: { base: "tomate", baseMode: "prete", baseQty: 80, products: [], dairy: [] } } });
const parseDP = (v) => { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return {}; } };
const garnOf = (r) => (r.dough_params && r.dough_params.garn) || { base: "", products: [], dairy: [] };
const CATS = [...new Set(GARN_PRODUITS.map((p) => p.cat))];
// Ligne d'ingrédient à partir d'un produit de la mercuriale (déjà curé, prix éditable côté mercuriale).
const mercLine = (key, m) => ({ key, mercId: m.id, productId: m.catalog_product_id || undefined, label: m.label, brand: m.brand, price: num(m.price), unit: m.unit || "kg", qty: perWeightUnit(m.unit) ? 40 : 1, emoji: "🛒", db: true });

export default function GarnitureWizard() {
  const [r, setR] = useState(NEW);
  const [view, setView] = useState("hub"); // hub | create | mine
  const [detail, setDetail] = useState(null);
  const [expanded, setExpanded] = useState(null); // id de la garniture dépliée dans la liste
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [enregistre, setEnregistre] = useState(0); // compteur : rejoue la confirmation à chaque succès
  const [echec, setEchec] = useState(0);
  const [guide, setGuide] = useState(false); // false | "general" | "garniture"
  const closeGuide = () => { if (guide === "general") { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* ignore */ } } setGuide(false); };

  const [merc, setMerc] = useState([]);
  const [mercFrom, setMercFrom] = useState("hub"); // vue de retour après la mercuriale
  const openMerc = (from) => { setMercFrom(from); setView("mercuriale"); };
  const reloadMerc = () => getMercuriale().then((r) => setMerc(r.data || [])).catch(() => {});
  const reload = () => getMyRecipes("PREPARATION").then((res) => setSaved(res.data || [])).catch(() => {});
  useEffect(() => { reload(); reloadMerc(); }, []);
  useEffect(() => { if (!localStorage.getItem(GUIDE_KEY)) setGuide("general"); }, []);

  const garn = garnOf(r);
  const setGarn = (patch) => setR((p) => ({ ...p, dough_params: { ...p.dough_params, garn: { ...garnOf(p), ...patch } } }));
  const setBase = (key) => { const b = GARN_BASES.find((x) => x.key === key); const modes = baseModesOf(key); setGarn({ base: key, baseMode: modes ? modes[0].key : undefined, baseProduct: undefined, baseLabel: undefined, basePrice: undefined, baseQty: b ? b.qty : 60 }); };
  const setBaseMode = (mode) => setGarn({ baseMode: mode, baseProduct: mode === "prete" ? garn.baseProduct : undefined });
  const setBaseProductFromMerc = (m) => setGarn({ baseProduct: { ...mercLine("merc:" + m.id, m), qty: perWeightUnit(m.unit) ? 80 : 1 }, baseMode: "prete" });
  const prodKeys = (garn.products || []).map((p) => p.key);
  const dairyKeys = (garn.dairy || []).map((d) => d.key);
  const toggleProduct = (key) => setGarn(prodKeys.includes(key)
    ? { products: garn.products.filter((p) => p.key !== key) }
    : { products: [...(garn.products || []), { key, qty: prodOf(key).qty, price: prodOf(key).price, emoji: prodOf(key).emoji, label: prodOf(key).label }] });
  // Ajoute un produit de MA MERCURIALE (source curée & triée) à la garniture.
  const addMercProduct = (m) => { const key = "merc:" + m.id; if (prodKeys.includes(key)) return; setGarn({ products: [...(garn.products || []), mercLine(key, m)] }); };
  const removeProduct = (key) => setGarn({ products: garn.products.filter((p) => p.key !== key) });
  const setProd = (key, patch) => setGarn({ products: garn.products.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const toggleDairy = (key) => setGarn(dairyKeys.includes(key)
    ? { dairy: garn.dairy.filter((d) => d.key !== key) }
    : { dairy: [...(garn.dairy || []), { key, qty: (GARN_DAIRY.find((x) => x.key === key) || {}).qty, price: (GARN_DAIRY.find((x) => x.key === key) || {}).price }] });
  const setDairy = (key, patch) => setGarn({ dairy: garn.dairy.map((d) => (d.key === key ? { ...d, ...patch } : d)) });

  const suggestions = pairSuggestions([...prodKeys, ...dairyKeys], garn.base);
  const { items, total } = garnitureCost(garn);
  const tips = [...prodKeys, ...dairyKeys].map((k) => GARN_TIPS[k] && { k, txt: GARN_TIPS[k] }).filter(Boolean);
  const baseObj = GARN_BASES.find((b) => b.key === garn.base);
  const baseModes = baseModesOf(garn.base);
  const curMode = baseModes && baseModes.find((m) => m.key === garn.baseMode);
  // Filtre les produits de la mercuriale pertinents pour la base choisie (tomate / crème).
  const baseMercFilter = garn.base === "tomate" ? (m) => /tomate|pelati|concentr|coulis|napo|pizza|arrabiat|marinara/i.test(m.label)
    : garn.base === "creme" ? (m) => /cr[èe]me|cream/i.test(m.label) : null;

  async function persist({ asNew = false, overrides = {} } = {}) {
    setBusy(true);
    const merged = { ...r, ...overrides };
    const payload = { ...merged, kind: "PREPARATION", type: baseObj ? baseObj.label : "Garniture",
      name: ((overrides.name ?? r.name) || "").trim() || `Garniture ${baseObj ? baseObj.label.toLowerCase() : ""}`.trim(), dough_params: r.dough_params };
    try {
      if (!asNew && r.id) { await updateRecipe(r.id, payload); setR((p) => ({ ...p, ...overrides })); }
      else { const res = await createRecipe({ ...payload, id: undefined }); setR((p) => ({ ...p, ...overrides, id: res.data && res.data.id })); }
      reload();
      setEnregistre((n) => n + 1);
    } catch {
      // L'échec doit se voir : sans retour, on reclique et on crée un doublon.
      setEchec((n) => n + 1);
    } finally { setBusy(false); }
  }
  const recipeOf = (s) => ({ ...NEW(), ...s, dough_params: { ...parseDP(s.dough_params) } });
  const showDetail = (s) => setDetail(recipeOf(s));
  const editBuild = (s) => { setR(recipeOf(s)); setDetail(null); setView("create"); setStep(0); };
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
  /**
   * Enregistrement. Plus de `window.prompt` : l'annuler — ou avoir un navigateur qui bloque
   * les invites — faisait sortir la fonction EN SILENCE, et le clic restait sans effet ni
   * explication. `persist()` calcule déjà le nom de repli ; on l'inscrit dans le champ pour
   * que le stagiaire voie sous quel nom sa fiche est rangée.
   */
  function saveBuild({ asNew = false, ...overrides } = {}) {
    const nom = (overrides.name ?? r.name ?? "").trim()
      || `Garniture ${baseObj ? baseObj.label.toLowerCase() : ""}`.trim();
    overrides.name = nom;
    setR((p) => ({ ...p, name: nom }));
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
            { title: "Créer une garniture", desc: "L'assistant te guide : base, produits, fromage. Coût matière calculé sur tes prix réels.", icon: "plus", color: "#7bb661", onClick: startCreate },
            { title: "Ma mercuriale", badge: merc.length || "0", desc: "Ta liste de prix : ajoute tes produits (Metro + frais/marché), les recettes piochent dedans.", icon: "coins", color: "#e0ac48", onClick: () => openMerc("hub") },
            { title: "Mes garnitures", badge: saved.length || "0", desc: "Consulter, modifier ou partager tes garnitures enregistrées.", icon: "history", color: "#3aa0e0", onClick: () => setView("mine") },
          ]} />
        </>
      ) : view === "mercuriale" ? (
        <Mercuriale items={merc} reload={reloadMerc} onBack={() => setView(mercFrom)} />
      ) : view === "mine" ? (
        <>
          <button className="btn ghost sm" onClick={() => setView("hub")} style={{ marginBottom: 14 }}><Icon name="chevron-left" size={14} /> Retour</button>
          <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes garnitures enregistrées</span>}>
            {saved.length === 0 ? <p className="hint" style={{ margin: 0 }}>Aucune garniture. <button className="btn sm ghost" onClick={startCreate}>Créer une garniture</button></p> : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {saved.map((s) => { const isOpen = expanded === s.id;
                  return (
                    <div key={s.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", flexWrap: "wrap" }}>
                        <span className="fiche-tag" style={{ background: "color-mix(in srgb, #7bb661 15%, var(--surface))", color: "#5f9e3f" }}>Garniture</span>
                        <b style={{ flex: 1, minWidth: 120, fontSize: 15 }}>{s.name}{s.visibility === "SHARED" && <span className="badge" style={{ marginLeft: 8, fontSize: 10.5, verticalAlign: "middle" }}>Partagé</span>}</b>
                        <button className={"btn sm " + (isOpen ? "primary" : "ghost")} onClick={() => setExpanded(isOpen ? null : s.id)}><Icon name={isOpen ? "chevron-up" : "chevron-down"} size={13} /> Détails</button>
                        <button className="btn sm ghost" onClick={() => showDetail(s)}><Icon name="book-open" size={13} /> Ouvrir</button>
                        <button className="btn sm ghost" onClick={() => editBuild(s)}><Icon name="pencil" size={13} /> Modifier</button>
                        <button className="iconbtn del" title="Supprimer" onClick={() => remove(s.id)}><Icon name="trash" size={14} /></button>
                      </div>
                      {isOpen && <GarnitureDetails recipe={recipeOf(s)} />}
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

                  {baseModes && (
                    <div style={{ marginTop: 16 }}>
                      <div className="ate-lbl" style={{ marginBottom: 8 }}>Comment est faite la base ?</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {baseModes.map((m) => (
                          <button key={m.key} onClick={() => setBaseMode(m.key)} className={"mode-card" + (garn.baseMode === m.key ? " on" : "")}>
                            <b>{m.label}</b><span>{m.desc}</span>
                          </button>
                        ))}
                      </div>
                      {curMode && <p className="hint" style={{ margin: "8px 0 0", fontSize: 11.5 }}>{curMode.hint}</p>}
                    </div>
                  )}

                  {baseObj && baseObj.key !== "autre" && (
                    <div style={{ marginTop: 16 }}>
                      {garn.baseMode === "prete" ? (
                        garn.baseProduct ? (
                          <div className="cat-row" style={{ cursor: "default" }}>
                            <span style={{ fontSize: 17 }}>{baseObj.emoji}</span>
                            <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13 }}>{garn.baseProduct.label}</b><span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>{[garn.baseProduct.brand, `${euro(garn.baseProduct.price)}/${unitShort(garn.baseProduct.unit)}`].filter(Boolean).join(" · ")}</span></div>
                            <button className="btn sm ghost" onClick={() => setGarn({ baseProduct: undefined })}><Icon name="pencil" size={12} /> Changer</button>
                          </div>
                        ) : (
                          <>
                            <div className="ate-lbl" style={{ marginBottom: 6 }}>Choisis la base dans ta mercuriale</div>
                            <MercProductPicker items={merc} onAdd={setBaseProductFromMerc} addedKeys={new Set()} onManage={() => openMerc("create")} filter={baseMercFilter} emptyLabel="Aucune base ici — ajoute une tomate / crème depuis le catalogue." />
                          </>
                        )
                      ) : (
                        <div className="grid cols-2" style={{ gap: 10, maxWidth: 460 }}>
                          <div className="field" style={{ marginBottom: 0 }}><label>Libellé de la base</label><input className="inp" value={garn.baseLabel ?? baseObj.label} onChange={(e) => setGarn({ baseLabel: e.target.value })} /></div>
                          <div className="field" style={{ marginBottom: 0 }}><label>Coût matière (€/kg)</label><input className="inp" type="number" min="0" step="0.1" value={garn.basePrice ?? baseObj.price} onChange={(e) => setGarn({ basePrice: Number(e.target.value) })} /></div>
                        </div>
                      )}
                      {(garn.baseMode === "cuisinee" || garn.baseMode === "perso") && (
                        <p className="hint" style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--orange)" }}>🔧 L'atelier « produit cuisiné » (composer depuis des produits bruts avec rendement) arrive bientôt — en attendant, saisis le libellé et le coût €/kg de ta préparation.</p>
                      )}
                      <div className="field" style={{ marginTop: 12, maxWidth: 240 }}><label>Quantité de base ({qtyUnit((garn.baseProduct && garn.baseMode === "prete") ? garn.baseProduct.unit : "Kg")}/pizza)</label><input className="inp" type="number" min="0" value={garn.baseQty ?? baseObj.qty} onChange={(e) => setGarn({ baseQty: Number(e.target.value) })} /></div>
                    </div>
                  )}
                  <p className="hint" style={{ margin: "14px 0 0" }}>La base pose le profil de saveur — on te proposera ensuite des produits qui s'y associent bien.</p>
                </div>
              )}

              {cur.key === "produits" && (
                <div>
                  <div className="ate-lbl" style={{ marginBottom: 8 }}>Ajoute depuis ta mercuriale <span className="hint" style={{ fontWeight: 400 }}>(tes produits triés, prix réels)</span></div>
                  <MercProductPicker items={merc} onAdd={addMercProduct} addedKeys={new Set(prodKeys)} onManage={() => openMerc("create")} />

                  {(garn.products || []).length > 0 && (
                    <div style={{ marginTop: 18 }}>
                      <div className="ate-lbl" style={{ marginBottom: 6 }}>Produits choisis ({garn.products.length}) <span className="hint" style={{ fontWeight: 400 }}>— ajuste le grammage / pizza</span></div>
                      {garn.products.map((p) => { const m = prodOf(p.key); const unit = p.unit || "Kg";
                        return (
                          <div key={p.key} className="mix-row">
                            <span style={{ fontSize: 16 }}>{p.emoji || m.emoji}</span>
                            <b style={{ flex: 1, minWidth: 80, fontSize: 12.5 }}>{p.label || m.label}{(p.fragile || m.fragile) ? " ❄️" : ""}{p.brand ? <span className="hint" style={{ fontWeight: 400 }}> · {p.brand}</span> : null}</b>
                            <input className="inp" type="number" min="0" step={qtyStep(unit)} value={num(p.qty)} onChange={(e) => setProd(p.key, { qty: Number(e.target.value) })} style={{ width: 72 }} />
                            <span className="hint" style={{ width: 24 }}>{qtyUnit(unit)}</span>
                            <b className="tnum" style={{ width: 54, textAlign: "right", fontSize: 12.5 }}>{euro(lineCost(p))}</b>
                            <button className="iconbtn del" title="Retirer" onClick={() => removeProduct(p.key)}><Icon name="x" size={13} /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {suggestions.length > 0 && (
                    <div className="pair-panel" style={{ marginTop: 18 }}>
                      <div className="pair-head">
                        <span className="pair-badge"><Icon name="star" size={13} fill="currentColor" /> Food-pairing</span>
                        <span className="hint" style={{ fontSize: 11.5 }}>s'associent bien avec ta sélection</span>
                      </div>
                      <div className="pair-list">
                        {suggestions.map((s) => (
                          <button key={s.key} onClick={() => toggleProduct(s.key)} className="pair-item" title={`Ajouter ${s.label}`}>
                            <span style={{ fontSize: 18 }}>{s.emoji}</span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}><b style={{ fontSize: 13 }}>{s.label}</b><span style={{ display: "block", fontSize: 10.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>avec {s.matches.slice(0, 2).join(", ").toLowerCase()}</span></span>
                            <Icon name="plus" size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <details style={{ marginTop: 16 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12.5, color: "var(--muted)" }}>Frais &amp; classiques <span className="hint" style={{ fontWeight: 400 }}>(herbes, produits hors catalogue)</span></summary>
                    <div style={{ marginTop: 10 }}>
                      {CATS.map((cat) => (
                        <div key={cat} style={{ marginBottom: 10 }}>
                          <div className="ate-lbl" style={{ marginBottom: 6 }}>{cat}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {GARN_PRODUITS.filter((p) => p.cat === cat).map((p) => <button key={p.key} onClick={() => toggleProduct(p.key)} className={"gp-chip" + (prodKeys.includes(p.key) ? " on" : "")}><span>{p.emoji}</span> {p.label}{p.fragile ? " ❄️" : ""}</button>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
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
                    <button className={"btn " + (shared ? "primary" : "ghost")} onClick={() => saveBuild({ visibility: shared ? "PRIVATE" : "SHARED" })} disabled={busy}><Icon name={shared ? "users" : "send"} size={15} /> {shared ? "Partagé" : "Partager"}</button>
                    <button className="btn primary" onClick={() => saveBuild()} disabled={busy}><Icon name="check" size={15} /> Enregistrer</button>
                  </div>
                </div>
              )}

              <WizDock title={`${items.length} élément${items.length > 1 ? "s" : ""} · ${euro(total)}`}
                sub={baseObj ? `${baseObj.label} · coût matière / pizza` : "Choisis une base…"}
                visual={<PizzaDisc base={garn.base} items={items} size={54} />} />
            </Card>

            {/* Résultat en direct */}
            <div className="card dough-result wiz-side" id="wiz-result">
              <div className="field" style={{ marginBottom: 10 }}>
                <label style={{ color: "rgba(255,255,255,.8)" }}>Nom de la garniture</label>
                <input className="inp" value={r.name} onChange={(e) => setR((p) => ({ ...p, name: e.target.value }))} placeholder={`Garniture ${baseObj ? baseObj.label.toLowerCase() : ""}`} />
              </div>
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{baseObj ? baseObj.label : "Garniture"} · par pizza</div>
              <div style={{ font: "800 22px/1.1 var(--font-d)", margin: "4px 0 12px" }}>{items.length} élément{items.length > 1 ? "s" : ""}</div>

              {/* La pizza en direct : la base colore le disque, chaque produit s'y pose, et la
                  quantité se voit (doubler les grammes double les morceaux). */}
              <div style={{ margin: "0 0 14px" }}><PizzaDisc base={garn.base} items={items} size={210} /></div>

              {items.length === 0 ? <p className="hint" style={{ color: "rgba(255,255,255,.6)" }}>Ajoute une base et des produits…</p> : items.map((i) => (
                <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                  <span>{i.emoji}</span><b style={{ flex: 1, fontSize: 13 }}>{i.label}{i.fragile ? " ❄️" : ""}</b>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{num(i.qty)} {qtyUnit(i.unit)}</span>
                  <b className="tnum" style={{ width: 54, textAlign: "right" }}>{euro(lineCost(i))}</b>
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
      <SaveToast signal={enregistre} label={`Garniture enregistrée : ${r.name || "sans nom"}`} />
      <SaveToast signal={echec} label="Enregistrement impossible — réessayez" tone="err" />
    </>
  );
}

// Sélecteur de produits depuis MA MERCURIALE (source déjà curée & triée), groupé par famille
// + recherche, avec raccourci vers le catalogue pour en ajouter.
function MercProductPicker({ items, onAdd, addedKeys, onManage, filter, emptyLabel }) {
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
        {list.length === 0 ? <div className="cat-empty">{emptyLabel || "Aucun produit ici — ajoute-en depuis le catalogue."}</div>
          : Object.entries(byFam).map(([fam, ms]) => (
            <div key={fam}>
              <div className="ate-lbl" style={{ margin: "4px 0", fontSize: 11 }}>{fam}</div>
              {ms.map((m) => { const added = addedKeys && addedKeys.has("merc:" + m.id); return (
                <button key={m.id} className={"cat-row" + (added ? " added" : "")} onClick={() => !added && onAdd(m)} style={{ marginBottom: 4 }}>
                  <Icon name={added ? "check" : "plus"} size={15} />
                  <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 12.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</b><span style={{ fontSize: 11, color: "var(--muted)" }}>{[m.brand, m.origin, m.market].filter(Boolean).join(" · ") || "—"}</span></div>
                  <span className="tnum" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{euro(num(m.price))}/{unitShort(m.unit)}</span>
                </button>
              ); })}
            </div>
          ))}
      </div>
    </div>
  );
}

// Détails dépliables d'une garniture dans la liste (« Mes garnitures ») : base + éléments (avec
// grammages et coût) + idées d'amélioration, en lecture seule et compact.
function GarnitureDetails({ recipe }) {
  const garn = parseDP(recipe.dough_params).garn || {};
  const { items, total } = garnitureCost(garn);
  const base = GARN_BASES.find((b) => b.key === garn.base);
  const tips = [...(garn.products || []).map((p) => p.key), ...(garn.dairy || []).map((d) => d.key)].map((k) => GARN_TIPS[k]).filter(Boolean);
  return (
    <div className="acc-body" style={{ padding: "2px 0 18px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {base && <span className="chip">{base.label}</span>}
        <span className="chip">{items.length} élément{items.length > 1 ? "s" : ""}</span>
        <span className="chip">par pizza</span>
      </div>
      <div style={{ maxWidth: 560 }}>
        {items.map((i) => (
          <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
            <span style={{ fontSize: 16 }}>{i.emoji}</span>
            <b style={{ flex: 1, fontSize: 12.5 }}>{i.label}{i.fragile ? " ❄️" : ""}</b>
            <span className="hint">{num(i.qty)} {qtyUnit(i.unit)} · {euro(i.price)}/{unitShort(i.unit)}</span>
            <b className="tnum" style={{ width: 52, textAlign: "right", fontSize: 12.5 }}>{euro(lineCost(i))}</b>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 9, fontWeight: 800, fontSize: 13 }}><span>Coût matière / pizza</span><span className="tnum" style={{ color: "var(--gold)" }}>{euro(total)}</span></div>
      </div>
      {tips.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="ate-lbl" style={{ marginBottom: 8 }}>💡 Idées d'amélioration</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
            {tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

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
              <span className="hint">{num(i.qty)} {qtyUnit(i.unit)} · {euro(i.price)}/{unitShort(i.unit)}</span>
              <b className="tnum" style={{ width: 56, textAlign: "right" }}>{euro(lineCost(i))}</b>
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
