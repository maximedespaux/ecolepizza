import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import WizSteps from "../components/WizSteps.jsx";
import BuilderHub from "../components/BuilderHub.jsx";
import IntroGuide, { GUIDE_KEY } from "../components/IntroGuide.jsx";
import { euro } from "../lib/format.js";
import { getMyRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe } from "../api/apiClient.js";
import { computeBuild, gfmt } from "../lib/dough.js";
import { num, SERVICES, FOURS, COOK_EXTRA, svcLabel, fourLabel, garnitureCost, garnitureItems, realisationAxes } from "../lib/garnitures.js";

/**
 * Assistant « Créer une réalisation » (kind RECETTE) — service → cuisson → empâtement (sauvé) →
 * garniture (sauvée). Produit la fiche complète (coût matière + prix conseillé) + les axes
 * d'amélioration selon les critères (ex. napolitaine à emporter, produits fragiles au distributeur).
 */
const STEPS = [
  { key: "service", n: 1, label: "Service", ic: "users", q: "Type de service ?" },
  { key: "cuisson", n: 2, label: "Cuisson", ic: "flame", q: "Type de cuisson au four ?" },
  { key: "empatement", n: 3, label: "Empâtement", ic: "wheat", q: "Choisis ton empâtement" },
  { key: "garniture", n: 4, label: "Garniture", ic: "pizza", q: "Choisis ta garniture" },
];
const NEW = () => ({ id: null, kind: "RECETTE", name: "", servings: 1, margin_pct: 300, visibility: "PRIVATE", dough_params: { real: { service: "sur_place", four: "gaz", cookExtra: [], emp: null, garn: null } } });
const parseDP = (v) => { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return {}; } };
const realOf = (r) => (r.dough_params && r.dough_params.real) || { service: "", four: "", cookExtra: [], emp: null, garn: null };
const empCost = (emp) => (emp ? computeBuild(emp).costPerPaton : 0);
const garnCost = (garn) => (garn ? garnitureCost((garn.dough_params || {}).garn).total : 0);

export default function RealisationWizard() {
  const nav = useNavigate();
  const [r, setR] = useState(NEW);
  const [view, setView] = useState("hub"); // hub | create | mine
  const [detail, setDetail] = useState(null);
  const [expanded, setExpanded] = useState(null); // id de la réalisation dépliée dans la liste
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState([]);
  const [empats, setEmpats] = useState([]);
  const [garns, setGarns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false); // false | "general" | "realisation"
  const closeGuide = () => { if (guide === "general") { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* ignore */ } } setGuide(false); };

  const reload = () => getMyRecipes("RECETTE").then((res) => setSaved(res.data || [])).catch(() => {});
  useEffect(() => {
    reload();
    getMyRecipes("PATE").then((res) => setEmpats((res.data || []).map((s) => ({ ...s, dough_params: parseDP(s.dough_params) })))).catch(() => {});
    getMyRecipes("PREPARATION").then((res) => setGarns((res.data || []).map((s) => ({ ...s, dough_params: parseDP(s.dough_params) })))).catch(() => {});
  }, []);
  useEffect(() => { if (!localStorage.getItem(GUIDE_KEY)) setGuide("general"); }, []);

  const real = realOf(r);
  const setReal = (patch) => setR((p) => ({ ...p, dough_params: { ...p.dough_params, real: { ...realOf(p), ...patch } } }));
  const toggleExtra = (k) => setReal({ cookExtra: (real.cookExtra || []).includes(k) ? real.cookExtra.filter((x) => x !== k) : [...(real.cookExtra || []), k] });

  const emp = real.emp, garn = real.garn;
  const costMat = empCost(emp) + garnCost(garn);
  const price = costMat * (1 + num(r.margin_pct) / 100);
  const axes = realisationAxes({ service: real.service, doughType: emp?.type, garn: (garn?.dough_params || {}).garn });
  const toneColor = { ok: "#7bb661", warn: "var(--gold)", bad: "var(--ember1)" };

  async function persist({ asNew = false, overrides = {} } = {}) {
    setBusy(true);
    const merged = { ...r, ...overrides };
    const payload = { ...merged, kind: "RECETTE", type: emp ? emp.type : "Pizza",
      name: ((overrides.name ?? r.name) || "").trim() || (garn ? garn.name : "Ma réalisation"), dough_params: r.dough_params };
    try {
      if (!asNew && r.id) { await updateRecipe(r.id, payload); setR((p) => ({ ...p, ...overrides })); }
      else { const res = await createRecipe({ ...payload, id: undefined }); setR((p) => ({ ...p, ...overrides, id: res.data && res.data.id })); }
      reload();
    } catch { /* ignore */ } finally { setBusy(false); }
  }
  const recipeOf = (s) => ({ ...NEW(), ...s, dough_params: parseDP(s.dough_params) });
  const showDetail = (s) => setDetail(recipeOf(s));
  const editBuild = (s) => { setR(recipeOf(s)); setDetail(null); setView("create"); setStep(0); };
  function editFromDetail() { if (!detail) return; setR(detail); setDetail(null); setView("create"); setStep(0); }
  async function persistDetail(patch = {}, asNew = false) {
    if (!detail) return; setBusy(true);
    const d = { ...detail, ...patch };
    const payload = { ...d, kind: "RECETTE", type: (d.dough_params.real?.emp || {}).type || "Pizza", name: (d.name || "").trim() || "Ma réalisation" };
    try {
      if (asNew) { await createRecipe({ ...payload, id: undefined, name: `${payload.name} (copie)`, visibility: "PRIVATE" }); setDetail(null); }
      else { await updateRecipe(d.id, payload); setDetail(d); }
      reload();
    } catch { /* ignore */ } finally { setBusy(false); }
  }
  async function remove(id) { if (!window.confirm("Supprimer cette réalisation ?")) return; try { await deleteRecipe(id); if (r.id === id) setR(NEW()); if (detail?.id === id) setDetail(null); reload(); } catch { /* ignore */ } }
  const startCreate = () => { setR(NEW()); setStep(0); setView("create"); };
  function saveBuild({ asNew = false, ...overrides } = {}) {
    if (!emp) return;
    let name = (overrides.name ?? r.name ?? "").trim();
    if (!name) {
      name = (window.prompt("Nom de la réalisation :", garn ? garn.name : "Ma réalisation") || "").trim();
      if (!name) return;
      setR((p) => ({ ...p, name }));
      overrides.name = name;
    }
    persist({ asNew, overrides });
  }
  const shared = r.visibility === "SHARED";
  const cur = STEPS[step];
  const ghostWhite = { background: "transparent", color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.35)" };

  const Picker = ({ list, sel, onPick, kindLabel, createTo }) => (
    list.length === 0 ? (
      <p className="hint" style={{ margin: 0 }}>Aucun{kindLabel === "garniture" ? "e" : ""} {kindLabel} enregistré{kindLabel === "garniture" ? "e" : ""}. <button className="btn sm primary" onClick={() => nav(createTo)}><Icon name="plus" size={13} /> Créer un{kindLabel === "garniture" ? "e" : ""} {kindLabel}</button></p>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((s) => (
          <button key={s.id} onClick={() => onPick(s)} className={"pick-row" + (sel?.id === s.id ? " on" : "")}>
            <Icon name={sel?.id === s.id ? "check-circle" : "circle"} size={16} />
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}><b style={{ fontSize: 13.5 }}>{s.name}</b><span style={{ display: "block", fontSize: 11.5, color: "var(--muted)" }}>{s.type}</span></div>
          </button>
        ))}
      </div>
    )
  );

  return (
    <>
      <PageHead eyebrow="Outils · réalisations" title="Mes réalisations"
        lead="Assemble ta pizza complète : service, cuisson, ton empâtement et ta garniture. On calcule le coût réel et on te donne les axes d'amélioration." />
      <IntroGuide open={!!guide} page={guide && guide !== "general" ? "realisation" : null} onClose={closeGuide} />

      {detail ? (
        <RecapRealisation recipe={detail} busy={busy} onBack={() => setDetail(null)} onEdit={editFromDetail}
          onDuplicate={() => persistDetail({}, true)} onShare={() => persistDetail({ visibility: detail.visibility === "SHARED" ? "PRIVATE" : "SHARED" })} onDelete={() => remove(detail.id)} />
      ) : view === "hub" ? (
        <>
          <button className="btn ghost sm" onClick={() => setGuide("general")} style={{ marginBottom: 14 }}><Icon name="book-open" size={14} /> Comment ça marche&nbsp;?</button>
          <BuilderHub cards={[
            { title: "Créer une réalisation", desc: "Service, cuisson, empâtement + garniture → fiche complète, coût réel et axes d'amélioration.", icon: "plus", color: "#dc3e37", onClick: startCreate },
            { title: "Mes réalisations", badge: saved.length || "0", desc: "Consulter, modifier ou partager tes pizzas complètes.", icon: "history", color: "#3aa0e0", onClick: () => setView("mine") },
          ]} />
        </>
      ) : view === "mine" ? (
        <>
          <button className="btn ghost sm" onClick={() => setView("hub")} style={{ marginBottom: 14 }}><Icon name="chevron-left" size={14} /> Retour</button>
          <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes réalisations enregistrées</span>}>
            {saved.length === 0 ? <p className="hint" style={{ margin: 0 }}>Aucune réalisation. <button className="btn sm ghost" onClick={startCreate}>Créer une réalisation</button></p> : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {saved.map((s) => { const isOpen = expanded === s.id;
                  return (
                    <div key={s.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", flexWrap: "wrap" }}>
                        <span className="fiche-tag" style={{ background: "color-mix(in srgb, #dc3e37 14%, var(--surface))", color: "#dc3e37" }}>Réalisation</span>
                        <b style={{ flex: 1, minWidth: 120, fontSize: 15 }}>{s.name}{s.visibility === "SHARED" && <span className="badge" style={{ marginLeft: 8, fontSize: 10.5, verticalAlign: "middle" }}>Partagé</span>}</b>
                        <button className={"btn sm " + (isOpen ? "primary" : "ghost")} onClick={() => setExpanded(isOpen ? null : s.id)}><Icon name={isOpen ? "chevron-up" : "chevron-down"} size={13} /> Détails</button>
                        <button className="btn sm ghost" onClick={() => showDetail(s)}><Icon name="book-open" size={13} /> Ouvrir</button>
                        <button className="btn sm ghost" onClick={() => editBuild(s)}><Icon name="pencil" size={13} /> Modifier</button>
                        <button className="iconbtn del" title="Supprimer" onClick={() => remove(s.id)}><Icon name="trash" size={14} /></button>
                      </div>
                      {isOpen && <RealisationDetails recipe={recipeOf(s)} />}
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
            <button className="btn ghost sm" onClick={() => setView("hub")}><Icon name="chevron-left" size={14} /> Accueil réalisations</button>
            <button className="btn ghost sm" onClick={() => setGuide("realisation")} style={{ marginLeft: "auto" }} title="Aide sur cet outil"><Icon name="book-open" size={13} /> Aide</button>
          </div>
          <div className="wiz-layout">
            <Card>
              <WizSteps steps={STEPS} step={step} setStep={setStep} />
              <div className="wiz-q"><Icon name={cur.ic} size={18} /> <b>{cur.q}</b></div>

              {cur.key === "service" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SERVICES.map((s) => <button key={s.key} onClick={() => setReal({ service: s.key })} className={"gp-chip" + (real.service === s.key ? " on" : "")}><span>{s.emoji}</span> {s.label}</button>)}
                </div>
              )}

              {cur.key === "cuisson" && (
                <div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {FOURS.map((f) => <button key={f.key} onClick={() => setReal({ four: f.key })} className={"gp-chip" + (real.four === f.key ? " on" : "")}><span>{f.emoji}</span> {f.label}</button>)}
                  </div>
                  <div className="ate-lbl" style={{ margin: "14px 0 6px" }}>Supplément (optionnel)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {COOK_EXTRA.map((e) => <button key={e.key} onClick={() => toggleExtra(e.key)} className={"gp-chip" + ((real.cookExtra || []).includes(e.key) ? " on" : "")}><span>{e.emoji}</span> {e.label}</button>)}
                  </div>
                </div>
              )}

              {cur.key === "empatement" && <Picker list={empats} sel={emp} onPick={(s) => setReal({ emp: s })} kindLabel="empâtement" createTo="/empatements" />}
              {cur.key === "garniture" && <Picker list={garns} sel={garn} onPick={(s) => setReal({ garn: s })} kindLabel="garniture" createTo="/garnitures" />}

              {step < STEPS.length - 1 ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20 }}>
                  <button className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><Icon name="chevron-left" size={15} /> Retour</button>
                  <button className="btn primary" onClick={() => setStep((s) => s + 1)}>Suivant <Icon name="chevron-right" size={15} /></button>
                </div>
              ) : (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-soft)" }}>
                  {!emp && <p className="hint" style={{ margin: "0 0 10px", color: "var(--orange)" }}>Choisis au moins un empâtement pour enregistrer.</p>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}><Icon name="chevron-left" size={15} /> Retour</button>
                    <span style={{ flex: 1 }} />
                    <button className={"btn " + (shared ? "primary" : "ghost")} onClick={() => saveBuild({ visibility: shared ? "PRIVATE" : "SHARED" })} disabled={busy || !emp}><Icon name={shared ? "users" : "send"} size={15} /> {shared ? "Partagé" : "Partager"}</button>
                    <button className="btn primary" onClick={() => saveBuild()} disabled={busy || !emp}><Icon name="check" size={15} /> Enregistrer</button>
                  </div>
                </div>
              )}
            </Card>

            {/* Résultat : fiche complète + axes */}
            <div className="card dough-result">
              <div className="field" style={{ marginBottom: 10 }}>
                <label style={{ color: "rgba(255,255,255,.8)" }}>Nom de la réalisation</label>
                <input className="inp" value={r.name} onChange={(e) => setR((p) => ({ ...p, name: e.target.value }))} placeholder={garn ? garn.name : "Ma réalisation"} />
              </div>
              <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{svcLabel(real.service)} · {fourLabel(real.four)}{(real.cookExtra || []).length ? ` · ${real.cookExtra.join("/")}` : ""}</div>

              <div style={{ margin: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                  <Icon name="wheat" size={16} style={{ color: "#fcb900" }} /><b style={{ flex: 1, fontSize: 13 }}>{emp ? emp.name : <span style={{ color: "rgba(255,255,255,.5)" }}>Empâtement…</span>}</b>
                  {emp && <span className="tnum" style={{ fontSize: 12 }}>{euro(empCost(emp))}/pâton</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                  <Icon name="pizza" size={16} style={{ color: "#7bb661" }} /><b style={{ flex: 1, fontSize: 13 }}>{garn ? garn.name : <span style={{ color: "rgba(255,255,255,.5)" }}>Garniture…</span>}</b>
                  {garn && <span className="tnum" style={{ fontSize: 12 }}>{euro(garnCost(garn))}/pizza</span>}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="hint" style={{ color: "rgba(255,255,255,.8)" }}>Coût matière / pizza</span>
                <b className="tnum" style={{ fontSize: 18, color: "var(--gold)" }}>{euro(costMat)}</b>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <span className="hint" style={{ color: "rgba(255,255,255,.8)", flex: 1 }}>Marge</span>
                <input className="inp" type="number" value={r.margin_pct} onChange={(e) => setR((p) => ({ ...p, margin_pct: e.target.value }))} style={{ width: 70 }} /><span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>%</span>
                <b className="tnum" style={{ color: "#fff", fontSize: 17, whiteSpace: "nowrap" }}>{euro(price)}</b>
              </div>

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.15)" }}>
                <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)", marginBottom: 8 }}>🎯 Axes d'amélioration</div>
                {axes.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: toneColor[a.tone], marginTop: 5, flexShrink: 0 }} />
                    <div><b style={{ fontSize: 12.5 }}>{a.t}</b><div style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", lineHeight: 1.4 }}>{a.d}</div></div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </>
      )}
    </>
  );
}

// Détails dépliables d'une réalisation dans la liste (« Mes réalisations ») : composants + coût
// matière + prix conseillé + axes d'amélioration, en lecture seule et compact.
function RealisationDetails({ recipe }) {
  const real = parseDP(recipe.dough_params).real || {};
  const emp = real.emp, garn = real.garn;
  const cm = empCost(emp) + garnCost(garn);
  const price = cm * (1 + num(recipe.margin_pct) / 100);
  const items = garnitureItems((garn?.dough_params || {}).garn);
  const axes = realisationAxes({ service: real.service, doughType: emp?.type, garn: (garn?.dough_params || {}).garn });
  const toneColor = { ok: "#7bb661", warn: "var(--orange)", bad: "var(--ember1)" };
  return (
    <div className="acc-body" style={{ padding: "2px 0 18px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        <span className="chip">{svcLabel(real.service)}</span>
        <span className="chip">{fourLabel(real.four)}</span>
        {(real.cookExtra || []).map((c) => <span key={c} className="chip">{c}</span>)}
      </div>
      <div className="grid cols-2" style={{ gap: 24, alignItems: "start" }}>
        <div>
          <div className="ate-lbl" style={{ marginBottom: 8 }}>Composants</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}><Icon name="wheat" size={15} style={{ color: "#fcb900" }} /><b style={{ flex: 1, fontSize: 12.5 }}>{emp ? emp.name : "—"}</b><span className="tnum" style={{ fontSize: 12.5 }}>{euro(empCost(emp))}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}><Icon name="pizza" size={15} style={{ color: "#7bb661" }} /><b style={{ flex: 1, fontSize: 12.5 }}>{garn ? garn.name : "—"}</b><span className="tnum" style={{ fontSize: 12.5 }}>{euro(garnCost(garn))}</span></div>
          {items.map((i) => <div key={i.key} style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--muted)", padding: "3px 0 3px 22px" }}><span>{i.emoji}</span><span style={{ flex: 1 }}>{i.label}</span><span>{num(i.qty)} g</span></div>)}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 9, fontWeight: 800, fontSize: 13 }}><span>Coût matière / pizza</span><span className="tnum" style={{ color: "var(--gold)" }}>{euro(cm)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6 }}><span className="hint">Prix conseillé (marge {recipe.margin_pct} %)</span><b className="tnum" style={{ color: "var(--ember1)", fontSize: 16 }}>{euro(price)}</b></div>
        </div>
        <div>
          <div className="ate-lbl" style={{ marginBottom: 8 }}>Axes d'amélioration</div>
          {axes.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: toneColor[a.tone], marginTop: 5, flexShrink: 0 }} />
              <div><b style={{ fontSize: 12.5 }}>{a.t}</b><div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{a.d}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecapRealisation({ recipe, onBack, onEdit, onDuplicate, onShare, onDelete, busy }) {
  const dpv = parseDP(recipe.dough_params);
  const real = dpv.real || {};
  const emp = real.emp, garn = real.garn;
  const cm = empCost(emp) + garnCost(garn);
  const price = cm * (1 + num(recipe.margin_pct) / 100);
  const items = garnitureItems((garn?.dough_params || {}).garn);
  const axes = realisationAxes({ service: real.service, doughType: emp?.type, garn: (garn?.dough_params || {}).garn });
  const toneColor = { ok: "#7bb661", warn: "var(--orange)", bad: "var(--ember1)" };
  const shared = recipe.visibility === "SHARED";
  return (
    <div className="print-area">
      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button className="btn ghost sm" onClick={onBack}><Icon name="chevron-left" size={14} /> Mes réalisations</button>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={() => window.print()}><Icon name="printer" size={14} /> Imprimer</button>
        <button className="btn primary sm" onClick={onEdit} disabled={busy}><Icon name="pencil" size={13} /> Modifier</button>
        <button className="btn ghost sm" onClick={onDuplicate} disabled={busy}><Icon name="plus" size={13} /> Dupliquer</button>
        <button className={"btn sm " + (shared ? "primary" : "ghost")} onClick={onShare} disabled={busy}><Icon name={shared ? "users" : "send"} size={13} /> {shared ? "Partagé" : "Partager"}</button>
        <button className="iconbtn del" title="Supprimer" onClick={onDelete} disabled={busy}><Icon name="trash" size={14} /></button>
      </div>
      <Card>
        <div className="eyebrow" style={{ color: "var(--ember1)" }}>Fiche réalisation</div>
        <h2 style={{ font: "800 26px/1.1 var(--font-d)", margin: "2px 0 4px" }}>{recipe.name}{shared && <span className="badge" style={{ marginLeft: 8, fontSize: 11, verticalAlign: "middle" }}>Partagé</span>}</h2>
        <div className="hint">{svcLabel(real.service)} · {fourLabel(real.four)}{(real.cookExtra || []).length ? ` · ${real.cookExtra.join("/")}` : ""}</div>

        <div className="grid cols-2" style={{ gap: 22, marginTop: 18, alignItems: "start" }}>
          <div>
            <div className="ate-lbl" style={{ marginBottom: 8 }}>Composants</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-soft)" }}><Icon name="wheat" size={15} style={{ color: "#fcb900" }} /><b style={{ flex: 1, fontSize: 13 }}>{emp ? emp.name : "—"}</b><span className="tnum">{euro(empCost(emp))}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-soft)" }}><Icon name="pizza" size={15} style={{ color: "#7bb661" }} /><b style={{ flex: 1, fontSize: 13 }}>{garn ? garn.name : "—"}</b><span className="tnum">{euro(garnCost(garn))}</span></div>
            {items.map((i) => <div key={i.key} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted)", padding: "3px 0 3px 22px" }}><span>{i.emoji}</span><span style={{ flex: 1 }}>{i.label}</span><span>{num(i.qty)} g</span></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 800 }}><span>Coût matière / pizza</span><span className="tnum" style={{ color: "var(--gold)" }}>{euro(cm)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6 }}><span className="hint">Prix conseillé (marge {recipe.margin_pct} %)</span><b className="tnum" style={{ color: "var(--ember1)", fontSize: 18 }}>{euro(price)}</b></div>
          </div>
          <div>
            <div className="ate-lbl" style={{ marginBottom: 8 }}>Axes d'amélioration</div>
            {axes.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: toneColor[a.tone], marginTop: 5, flexShrink: 0 }} />
                <div><b style={{ fontSize: 13 }}>{a.t}</b><div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{a.d}</div></div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
