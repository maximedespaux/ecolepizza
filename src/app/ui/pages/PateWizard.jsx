import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import BuilderHub from "../components/BuilderHub.jsx";
import DoughBar from "../components/DoughBar.jsx";
import { Paton, doughLook, flourColor } from "../components/LivePizza.jsx";
import WizDock from "../components/WizDock.jsx";
import IntroGuide, { GUIDE_KEY } from "../components/IntroGuide.jsx";
import { Icon } from "../components/Icon.jsx";
import SaveToast from "../components/SaveToast.jsx";
import WGauge from "../components/WGauge.jsx";
import { euro } from "../lib/format.js";
import { getMyRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe, getMyFormations } from "../api/apiClient.js";
import {
  num, PRESETS, NEEDS_LABEL, INDIRECT, INDIRECT_WMIN, W_MIN, W_MAX,
  hydraMinForW, maxTotalForW, wUsage, NAPO_SPECS, napoSpecOf, DP_DEFAULT,
  gfmt, LEVURE_TYPES, recoLevureFull, yeastLabel, ADJONCTIONS, SUBSTITUTIONS, subOf, TIPOS, tipoOf,
  LEVURE_STORAGE, levStorageOf, compWaterPct, computeBuild, tempFarine,
} from "../lib/dough.js";

/**
 * Assistant « Créer un empâtement » — calculateur pas-à-pas branché sur lib/dough.js.
 * « Ouvrir » depuis Mes empâtements ouvre une FICHE DE PROGRESSION (récap lecture seule + déroulé
 * imprimable), pas le quiz — le quiz est réservé à la création/modification.
 */
const STEPS = [
  { key: "typo", n: 1, label: "Typologie", ic: "pizza", q: "Quelle typologie ?" },
  { key: "qty", n: 2, label: "Quantité", ic: "package", q: "Combien de pizzas ?" },
  { key: "farine", n: 3, label: "Farine", ic: "wheat", q: "Force, type & mélanges" },
  { key: "hydra", n: 4, label: "Hydratation", ic: "droplet", q: "Hydratation" },
  { key: "levure", n: 5, label: "Levure", ic: "yeast", q: "Levure & stockage" },
  { key: "temp", n: 6, label: "Coulage", ic: "thermometer", opt: true, q: "Coulage & pétrissage" },
];
// Défaut = 1 unité de calcul (= 1 kg de farine ≈ 6 pâtons), l'unité de référence du manuel.
const NEW = () => ({ id: null, kind: "PATE", name: "", servings: 6, paton_g: 250, flour_price: 1.2, visibility: "PRIVATE", dough_params: { ...DP_DEFAULT, mode: "farine", flourKg: 1 } });
const parseDP = (v) => { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return {}; } };
const subsArr = (d) => (Array.isArray(d.substitutions) ? d.substitutions : (d.substitution ? [d.substitution] : []));

export default function PateWizard() {
  const nav = useNavigate();
  const [r, setR] = useState(NEW);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState("hub"); // hub | create | mine
  const [detail, setDetail] = useState(null); // fiche récap d'un build sauvé (lecture seule)
  const [expanded, setExpanded] = useState(null); // id de l'empâtement déplié dans la liste
  const [resultTab, setResultTab] = useState("compo"); // compo | cout
  const [saved, setSaved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [enregistre, setEnregistre] = useState(0); // compteur : rejoue la confirmation à chaque succès
  const [echec, setEchec] = useState(0);
  const [niv2, setNiv2] = useState(false);
  const [napo, setNapo] = useState(false);
  const [spe, setSpe] = useState(false);
  const [guide, setGuide] = useState(false); // false | "general" (hub) | "empatement" (outil)
  const closeGuide = () => { if (guide === "general") { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* ignore */ } } setGuide(false); };

  const reload = () => getMyRecipes().then((res) => setSaved((res.data || []).filter((s) => s.kind === "PATE"))).catch(() => {});
  useEffect(() => { reload(); }, []);
  useEffect(() => { if (!localStorage.getItem(GUIDE_KEY)) setGuide("general"); }, []);
  useEffect(() => {
    getMyFormations().then((res) => {
      const fs = (res.data || []).filter((f) => f.enrolled).map((f) => `${f.program_title} ${f.program_code}`.toLowerCase());
      const has = (re) => fs.some((t) => re.test(t));
      setNiv2(has(/niveau\s+ii|expert/)); setNapo(has(/napolit/)); setSpe(has(/teglia|pala/));
    }).catch(() => {});
  }, []);

  const dp = r.dough_params;
  const setDP = (k, v) => setR((p) => ({ ...p, dough_params: { ...p.dough_params, [k]: v } }));
  const access = { niv2, napo, spe };
  const presetLocked = (p) => !!(p.needs && !access[p.needs]);
  const curPreset = PRESETS.find((p) => p.nom === dp.preset) || PRESETS[0];
  const isNapo = curPreset.nom === "Napolitaine";
  const napoSpec = isNapo ? napoSpecOf(dp.napoSpec) : null;
  const napoLevFixed = !!(napoSpec && napoSpec.levure != null);
  const isSpe = curPreset.needs === "spe";
  const wv = num(dp.w) || 225;
  const indirectSel = INDIRECT.includes(dp.method);
  const wLo = napoSpec ? napoSpec.wMin : Math.max(W_MIN, curPreset.wMin || W_MIN, indirectSel ? INDIRECT_WMIN : 0);
  const wHi = napoSpec ? napoSpec.wMax : Math.min(W_MAX, curPreset.wMax || W_MAX);
  // Le COULAGE reste calé sur le W ; l'absorption des farines/produits est complétée en EAU DE BASSINAGE
  // (compW), au-delà du plafond de coulage (les produits — pas le gluten — boivent cette eau).
  const compW = napoSpec ? 0 : compWaterPct(dp);
  const recoMin = napoSpec ? napoSpec.hydraMin : (isSpe ? 62 : hydraMinForW(wv));
  const maxTotal = napoSpec ? napoSpec.hydraMax : (isSpe ? (curPreset.hydraMax || 80) : maxTotalForW(wv));
  const totalHydra = +(num(dp.hydra) + num(dp.bassinage) + compW).toFixed(1);
  const bassMax = Math.max(0, +(maxTotal - num(dp.hydra)).toFixed(1));
  const flourTemp = tempFarine(dp.flourTemp);
  const eauCoulage = Math.round(50 - 2 * flourTemp);
  const yeastType = dp.yeastType || "fraiche";
  const levStorage = dp.levStorage || "ambiante";
  const levReco = napoLevFixed ? napoSpec.levure : recoLevureFull(flourTemp, yeastType, levStorage);

  // Handlers typologie / W / hydratation / levure.
  function applyNapoSpec(spec) {
    setR((p) => { const d = p.dough_params; const lev = spec.levure != null ? spec.levure : recoLevureFull(tempFarine(d.flourTemp), d.yeastType || "fraiche", d.levStorage || "ambiante");
      return { ...p, paton_g: spec.paton, dough_params: { ...d, preset: "Napolitaine", napoSpec: spec.key, method: "Direct", w: spec.w, hydra: spec.hydra, hydraAuto: true, bassinage: 0, sel: spec.sel, huile: 0, levure: lev, ambH: spec.ambH ?? "", ambT: spec.ambT ?? "", ctrlH: spec.ctrlH ?? "", ctrlT: spec.ctrlT ?? "" } }; });
  }
  function applyPreset(pr) {
    if (presetLocked(pr)) return;
    if (pr.nom === "Napolitaine") { applyNapoSpec(napoSpecOf("ecole")); return; }
    // Le plafond de coulage dépend du W seul (l'eau des farines qui boivent part en bassinage, manuel p.32).
    setR((p) => { const d = p.dough_params; const sp = pr.needs === "spe"; const mt = sp ? (pr.hydraMax || 80) : maxTotalForW(pr.w); const hydra = Math.min(pr.hydra, mt);
      return { ...p, paton_g: pr.paton, dough_params: { ...d, preset: pr.nom, napoSpec: "", w: pr.w, hydra, hydraAuto: true, bassinage: Math.min(num(d.bassinage), Math.max(0, mt - hydra)), sel: pr.sel, huile: pr.huile, levure: recoLevureFull(tempFarine(d.flourTemp), d.yeastType || "fraiche", d.levStorage || "ambiante"), method: pr.methods.find((m) => !(INDIRECT.includes(m) && !niv2)) || pr.methods[0] } }; });
  }
  const setW = (w) => setR((p) => { const d = p.dough_params; const pr = PRESETS.find((x) => x.nom === d.preset) || PRESETS[0]; const sp = d.preset === "Napolitaine" ? napoSpecOf(d.napoSpec) : null; const isSp = pr.needs === "spe";
    const mt = sp ? sp.hydraMax : (isSp ? (pr.hydraMax || 80) : maxTotalForW(w)); const rm = sp ? sp.hydraMin : (isSp ? 62 : hydraMinForW(w));
    // L'hydratation SUIT le W tant que le stagiaire ne l'a pas réglée à la main (drapeau hydraAuto) :
    // elle monte ET redescend avec le W. Réglée à la main, on la conserve, recadrée dans [min, plafond].
    const hydra = d.hydraAuto !== false ? rm : Math.min(Math.max(num(d.hydra), rm), mt);
    return { ...p, dough_params: { ...d, w, hydra, bassinage: Math.min(num(d.bassinage), Math.max(0, mt - hydra)) } }; });
  // Régler l'hydratation à la main la « détache » du W (hydraAuto=false) : elle ne suivra plus le curseur W.
  const setHydra = (v) => setR((p) => ({ ...p, dough_params: { ...p.dough_params, hydra: v, hydraAuto: false, bassinage: Math.min(num(p.dough_params.bassinage), Math.max(0, maxTotal - v)) } }));
  const dpNapoFixed = (d) => d.preset === "Napolitaine" && d.napoSpec && d.napoSpec !== "ecole";
  // Levure = table du manuel selon la T° de la FARINE × facteur de stockage (recoLevureFull).
  const relev = (d, patch) => ({ ...d, ...patch, ...(dpNapoFixed(d) ? {} : { levure: recoLevureFull(tempFarine(patch.flourTemp ?? d.flourTemp), patch.yeastType ?? d.yeastType ?? "fraiche", patch.levStorage ?? d.levStorage ?? "ambiante") }) });
  const setYeastType = (t) => setR((p) => ({ ...p, dough_params: relev(p.dough_params, { yeastType: t }) }));
  const setLevStorage = (k) => setR((p) => ({ ...p, dough_params: relev(p.dough_params, { levStorage: k }) }));
  const setFlourTemp = (v) => setR((p) => ({ ...p, dough_params: relev(p.dough_params, { flourTemp: v }) }));
  const removeOil = () => setR((p) => { const d = p.dough_params; return { ...p, dough_params: { ...d, huile: 0, bassinage: Math.min(num(d.bassinage) + num(d.huile), Math.max(0, maxTotal - num(d.hydra))) } }; });
  const restoreOil = () => setDP("huile", curPreset.huile);
  const toggleAutolyse = () => setDP("autolyse", !dp.autolyse);

  // Substitutions (multiples) — normalisées en tableau, l'ancien format {substitution} est migré.
  const setSubs = (fn) => setR((p) => { const d = p.dough_params; return { ...p, dough_params: { ...d, substitution: undefined, substitutions: fn(subsArr(d)) } }; });
  const setTipo = (k) => setDP("tipo", k);
  const addSub = (key) => setSubs((cur) => (cur.some((x) => x.key === key) ? cur : [...cur, { key, pct: Math.min(10, subOf(key).max) }]));
  const setSubPct = (key, v) => setSubs((cur) => cur.map((x) => (x.key === key ? { ...x, pct: v } : x)));
  const removeSub = (key) => setSubs((cur) => cur.filter((x) => x.key !== key));
  // Adjonctions (multiples).
  const setAdj = (fn) => setR((p) => { const d = p.dough_params; return { ...p, dough_params: { ...d, adjonctions: fn(d.adjonctions || []) } }; });
  const addAdj = (key) => setAdj((cur) => (cur.some((a) => a.key === key) ? cur : [...cur, { key, pct: (ADJONCTIONS.find((x) => x.key === key) || {}).def || 5 }]));
  const setAdjPct = (key, v) => setAdj((cur) => cur.map((a) => (a.key === key ? { ...a, pct: v } : a)));
  const removeAdj = (key) => setAdj((cur) => cur.filter((a) => a.key !== key));

  // Décomposition, coût & fermentation — calcul partagé (computeBuild) avec la fiche récap.
  const patonG = Math.max(1, num(r.paton_g));
  const { dpMode, totalDough, effNb, reste, subTotal, subBassReco, dough, prices, costLines, totalCost, costPerPaton, costPerKg, ferment } = computeBuild(r);
  const setPrice = (k, v) => { if (k === "farine") setR((p) => ({ ...p, flour_price: v })); else setR((p) => ({ ...p, dough_params: { ...p.dough_params, prices: { ...(p.dough_params.prices || {}), [k]: v } } })); };
  const curSubs = subsArr(dp);
  const curAdj = dp.adjonctions || [];
  // Aspect de la pâte : type + substitutions + adjonctions qui se voient (son, graines, charbon).
  const look = doughLook(tipoOf(dp.tipo) && tipoOf(dp.tipo).water, curSubs, curAdj);

  async function persist({ asNew = false, overrides = {} } = {}) {
    setBusy(true);
    const merged = { ...r, ...overrides };
    const payload = { ...merged, kind: "PATE", type: dp.preset,
      name: ((overrides.name ?? r.name) || "").trim() || `${dp.preset} maison`,
      servings: dpMode === "farine" ? Math.max(1, effNb) : merged.servings, dough_params: dp };
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
  // Reconstitue un « recipe » complet à partir d'un enregistrement (params désérialisés).
  const recipeOf = (s) => ({ ...NEW(), ...s, dough_params: { ...DP_DEFAULT, ...parseDP(s.dough_params) } });
  // « Ouvrir » = fiche récap en lecture seule (PAS le quiz).
  const showDetail = (s) => setDetail(recipeOf(s));
  // « Modifier » = rouvre directement l'empâtement dans l'assistant pas-à-pas.
  const editBuild = (s) => { setR(recipeOf(s)); setDetail(null); setTab("create"); setStep(0); setResultTab("compo"); };
  function editFromDetail() { if (!detail) return; setR(detail); setDetail(null); setTab("create"); setStep(0); setResultTab("compo"); }
  async function persistDetail(patch = {}, asNew = false) {
    if (!detail) return; setBusy(true);
    const d = { ...detail, ...patch };
    const payload = { ...d, kind: "PATE", type: d.dough_params.preset, name: (d.name || "").trim() || `${d.dough_params.preset} maison` };
    try {
      if (asNew) { await createRecipe({ ...payload, id: undefined, name: `${payload.name} (copie)`, visibility: "PRIVATE" }); setDetail(null); }
      else { await updateRecipe(d.id, payload); setDetail(d); }
      reload();
    } catch { /* ignore */ } finally { setBusy(false); }
  }
  async function remove(id) { if (!window.confirm("Supprimer cet empâtement ?")) return; try { await deleteRecipe(id); if (r.id === id) setR(NEW()); if (detail?.id === id) setDetail(null); reload(); } catch { /* ignore */ } }
  const reset = () => { setR(NEW()); setStep(0); setResultTab("compo"); };
  /**
   * Enregistrement depuis la fin des étapes.
   *
   * Il n'y a plus de `window.prompt` pour réclamer un nom : annuler cette invite — ou
   * simplement avoir un navigateur qui les bloque — faisait sortir la fonction EN SILENCE.
   * On cliquait « Enregistrer », rien ne se passait, et rien n'expliquait pourquoi.
   *
   * Le prompt était de toute façon redondant : `persist()` calcule déjà le nom de repli
   * « <typologie> maison », qui est précisément ce que le champ affiche en filigrane. On
   * enregistre donc directement, et on inscrit ce nom dans le champ pour que le stagiaire
   * VOIE sous quel nom sa fiche a été rangée.
   */
  function saveBuild({ asNew = false, ...overrides } = {}) {
    const nom = (overrides.name ?? r.name ?? "").trim() || `${dp.preset} maison`;
    overrides.name = nom;
    setR((p) => ({ ...p, name: nom }));
    persist({ asNew, overrides });
  }
  const shared = r.visibility === "SHARED";
  const cur = STEPS[step];
  const ghostWhite = { background: "transparent", color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.35)" };

  return (
    <>
      <PageHead eyebrow="Outils · empâtements" title="Mes empâtements"
        lead="Crée ta pâte pas-à-pas : on te guide et tout est calculé (force, hydratation, levure, coût). Enregistre-la pour la réutiliser dans une réalisation." />
      <IntroGuide open={!!guide} page={guide && guide !== "general" ? guide : null} onClose={closeGuide} />

      {detail ? (
        <RecapFiche recipe={detail} busy={busy} onBack={() => setDetail(null)} onEdit={editFromDetail}
          onDuplicate={() => persistDetail({}, true)}
          onShare={() => persistDetail({ visibility: detail.visibility === "SHARED" ? "PRIVATE" : "SHARED" })}
          onDelete={() => remove(detail.id)} />
      ) : tab === "hub" ? (
        <>
          <button className="btn ghost sm" onClick={() => setGuide("general")} style={{ marginBottom: 14 }}><Icon name="book-open" size={14} /> Comment ça marche&nbsp;?</button>
          <BuilderHub cards={[
            { title: "Créer un empâtement", desc: "L'assistant pas-à-pas te guide et calcule tout : force, hydratation, levure, coût.", icon: "plus", color: "#dc3e37", onClick: () => { reset(); setTab("create"); } },
            { title: "Mes empâtements", badge: saved.length || "0", desc: "Consulter la fiche (déroulé imprimable), modifier ou partager tes empâtements.", icon: "history", color: "#3aa0e0", onClick: () => setTab("mine") },
          ]} />
        </>
      ) : (<>
      <div className="kind-seg" style={{ marginBottom: 18 }}>
        <button className="kind-btn" onClick={() => setTab("hub")}><Icon name="chevron-left" size={15} /> Accueil</button>
        <button className={"kind-btn" + (tab === "create" ? " on" : "")} onClick={() => setTab("create")}><Icon name="plus" size={15} /> Créer un empâtement</button>
        <button className={"kind-btn" + (tab === "mine" ? " on" : "")} onClick={() => setTab("mine")}><Icon name="history" size={15} /> Mes empâtements{saved.length ? ` (${saved.length})` : ""}</button>
        <button className="btn ghost sm" onClick={() => setGuide("empatement")} style={{ marginLeft: "auto" }} title="Aide sur cet outil"><Icon name="book-open" size={13} /> Aide</button>
      </div>

      {tab === "create" ? (
        <div className="wiz-layout">
          {/* Colonne gauche : l'assistant pas-à-pas */}
          <Card>
            <div className="wiz-steps">
              {STEPS.map((s, i) => (
                <button key={s.key} className={"wiz-dot" + (i === step ? " on" : "") + (i < step ? " done" : "")} onClick={() => setStep(i)} title={s.label}>
                  <span className="wiz-dot-n">{i < step ? <Icon name="check" size={13} /> : s.n}</span>
                  <span className="wiz-dot-l">{s.label}</span>
                </button>
              ))}
            </div>

            <div className="wiz-q"><Icon name={cur.ic} size={18} /> <b>{cur.q}</b></div>

            {cur.key === "typo" && (
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PRESETS.map((p) => { const locked = presetLocked(p); const tag = p.needs === "niv2" ? " · Niv II" : p.needs ? " · Spé" : "";
                    return <button key={p.nom} onClick={() => applyPreset(p)} disabled={locked} title={locked ? `Débloqué avec ${NEEDS_LABEL[p.needs]}` : p.desc}
                      className={`btn ${dp.preset === p.nom ? "primary" : "ghost"}`} style={{ opacity: locked ? 0.5 : 1 }}><Icon name={locked ? "lock" : p.ic} size={15} /> {p.nom}{tag}</button>; })}
                </div>
                {isNapo && (
                  <div style={{ marginTop: 14 }}>
                    <div className="ate-lbl" style={{ marginBottom: 8 }}>Cahier des charges</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {NAPO_SPECS.map((s) => <button key={s.key} onClick={() => applyNapoSpec(s)} title={s.src} className={`btn sm ${dp.napoSpec === s.key ? "primary" : "ghost"}`}>{s.label}</button>)}
                    </div>
                    {napoSpec && <p className="hint" style={{ margin: "8px 0 0" }}>{napoSpec.cuisson || "Recettes du manuel"} · {napoSpec.src}</p>}
                  </div>
                )}
                <p className="hint" style={{ margin: "12px 0 0" }}>{curPreset.desc}</p>
              </div>
            )}

            {cur.key === "qty" && (
              <div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <button className={`btn sm ${dpMode === "farine" ? "primary" : "ghost"}`} onClick={() => setDP("mode", "farine")}>Unités de calcul</button>
                  <button className={`btn sm ${dpMode === "patons" ? "primary" : "ghost"}`} onClick={() => setDP("mode", "patons")}>Pâtons</button>
                </div>
                <div className="grid cols-2" style={{ gap: 12 }}>
                  {dpMode === "farine"
                    ? <div className="field" style={{ marginBottom: 0 }}><label>Unités de calcul <span style={{ fontWeight: 400, color: "var(--muted)" }}>(1 = 1 kg de farine)</span></label><input className="inp" type="number" min="1" step="1" value={dp.flourKg ?? 1} onChange={(e) => setDP("flourKg", Number(e.target.value))} /></div>
                    : <div className="field" style={{ marginBottom: 0 }}><label>Nombre de pâtons</label><input className="inp" type="number" min="1" value={r.servings} onChange={(e) => setR((p) => ({ ...p, servings: e.target.value }))} /></div>}
                  <div className="field" style={{ marginBottom: 0 }}><label>Poids d'un pâton (g)</label><input className="inp" type="number" min="100" value={r.paton_g} onChange={(e) => setR((p) => ({ ...p, paton_g: e.target.value }))} /></div>
                </div>
                <p className="hint" style={{ margin: "10px 0 0" }}>{dpMode === "farine"
                  ? <>1 unité = 1 kg de farine → <b style={{ color: "var(--text)" }}>{effNb} pâtons de {patonG} g</b>{reste > 5 ? ` (reste ${gfmt(reste)})` : ""}.</>
                  : "Pourcentage boulanger : tout est calculé en % de la farine."}</p>
              </div>
            )}

            {cur.key === "farine" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <b style={{ font: "800 28px/1 var(--font-d)", color: "var(--ember1)" }}>W {wv}</b>
                    <span className="hint" style={{ textAlign: "right", maxWidth: 190 }}>{wUsage(wv)}</span>
                  </div>
                  <input type="range" min={wLo} max={wHi} step={5} value={Math.min(Math.max(wv, wLo), wHi)} onChange={(e) => setW(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--ember1)" }} />
                  {/* La bande d'usages remplace les deux nombres de bornes : elle porte la même
                      information et montre en plus à quelle famille de méthode on se situe. */}
                  <WGauge value={wv} min={wLo} max={wHi} />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <b style={{ font: "800 19px/1 var(--font-d)", color: "var(--text)" }}>{tipoOf(dp.tipo) ? `${tipoOf(dp.tipo).fr} · Tipo ${tipoOf(dp.tipo).it}` : "Type de farine"}</b>
                    <span className="hint" style={{ textAlign: "right" }}>{tipoOf(dp.tipo) ? tipoOf(dp.tipo).name : "France ↔ Italie"}</span>
                  </div>
                  {/* Cartes plutôt qu'un <select> : la pastille montre la couleur réelle de la
                      farine, donc le stagiaire VOIT que le type monte → ça fonce → plus de son
                      → plus d'eau de bassinage. Le menu déroulant cachait toute la leçon. */}
                  <div className="tipo-row">
                    {TIPOS.map((t) => (
                      <button key={t.key} type="button" aria-pressed={dp.tipo === t.key}
                        className={"tipo-card" + (dp.tipo === t.key ? " on" : "")}
                        onClick={() => setTipo(dp.tipo === t.key ? "" : t.key)}
                        title={`${t.fr} · Tipo ${t.it}, ${t.name}${t.water ? ` (+${t.water} % de bassinage)` : ""}`}>
                        <span className="tipo-dot" style={{ background: flourColor(t.water) }} />
                        <span className="tipo-it">Tipo {t.it}</span>
                        <span className="tipo-fr">{t.fr}</span>
                        <span className="tipo-nm">{t.name}</span>
                        {t.water > 0 && <span className="tipo-w">+{t.water} % eau</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="ate-lbl" style={{ marginBottom: 6 }}>Substitution <span className="hint" style={{ fontWeight: 400 }}>(farines de blé ou céréales, plusieurs possibles)</span></div>
                  {curSubs.map((x) => { const m = subOf(x.key); return (
                    <div key={x.key} className="mix-row">
                      <b style={{ width: 120, fontSize: 12.5, flexShrink: 0 }}>{m.label}</b>
                      <input type="range" min={5} max={m.max} step={5} value={num(x.pct)} onChange={(e) => setSubPct(x.key, Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ember1)" }} />
                      <span className="chiffres" style={{ width: 40, textAlign: "right", fontWeight: 700, fontSize: 12.5 }}>{x.pct} %</span>
                      <button className="iconbtn del" title="Retirer" onClick={() => removeSub(x.key)}><Icon name="x" size={13} /></button>
                    </div>
                  ); })}
                  <select className="inp" value="" onChange={(e) => { if (e.target.value) addSub(e.target.value); }} style={{ marginTop: curSubs.length ? 6 : 0 }}>
                    <option value="">+ Ajouter une farine…</option>
                    <optgroup label="Farines de blé">
                      {SUBSTITUTIONS.filter((s) => s.wheat && !curSubs.some((x) => x.key === s.key)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </optgroup>
                    <optgroup label="Autres farines">
                      {SUBSTITUTIONS.filter((s) => !s.wheat && !curSubs.some((x) => x.key === s.key)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </optgroup>
                  </select>
                  {compW > 0 && <p className="hint" style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--orange)" }}>Ces farines boivent plus d'eau → <b>+{compW} %</b> d'eau de bassinage ajoutés automatiquement (le coulage reste calé sur le W).</p>}
                </div>

                <div>
                  <div className="ate-lbl" style={{ marginBottom: 6 }}>Adjonctions <span className="hint" style={{ fontWeight: 400 }}>(ajoutées au pétrissage)</span></div>
                  {curAdj.map((a) => { const m = ADJONCTIONS.find((x) => x.key === a.key) || {}; return (
                    <div key={a.key} className="mix-row">
                      <b style={{ width: 104, fontSize: 12.5, flexShrink: 0 }}>{m.label}</b>
                      <input type="range" min={m.min} max={m.max} step={1} value={num(a.pct)} onChange={(e) => setAdjPct(a.key, Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ember1)" }} />
                      <span className="chiffres" style={{ width: 40, textAlign: "right", fontWeight: 700, fontSize: 12.5 }}>{a.pct} %</span>
                      <button className="iconbtn del" title="Retirer" onClick={() => removeAdj(a.key)}><Icon name="x" size={13} /></button>
                    </div>
                  ); })}
                  <select className="inp" value="" onChange={(e) => { if (e.target.value) addAdj(e.target.value); }} style={{ marginTop: curAdj.length ? 6 : 0 }}>
                    <option value="">+ Ajouter une adjonction…</option>
                    {ADJONCTIONS.filter((a) => !curAdj.some((x) => x.key === a.key)).map((a) => <option key={a.key} value={a.key}>{a.label} ({a.min}-{a.max} %)</option>)}
                  </select>
                </div>

                <div style={{ padding: "11px 13px", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!dp.autolyse} onChange={toggleAutolyse} style={{ width: 16, height: 16, accentColor: "var(--ember1)" }} /> Autolyse <span className="hint" style={{ fontWeight: 400 }}>· méthode</span>
                  </label>
                  <p className="hint" style={{ margin: "4px 0 0", fontSize: 11.5 }}>Repos farine + eau (≈ 40 mn) avant d'ajouter levure, sel et huile → pâte plus extensible. Le protocole (déroulé) s'adapte automatiquement.</p>
                </div>
              </div>
            )}

            {cur.key === "hydra" && (
              <div>
                <HydraStep val={num(dp.hydra)} recoMin={recoMin} recoMax={maxTotal} confirmed={napoLevFixed} set={setHydra} />
                {!napoLevFixed && bassMax > 0 && (
                  <Slider label={`Eau de bassinage (facultatif · max ${bassMax} %)`} val={Math.min(num(dp.bassinage), bassMax)} min={0} max={bassMax} step={0.5} set={(v) => setDP("bassinage", v)} />
                )}
                {/* Le détail « = coulage X % + bassinage Y % » répétait les deux curseurs situés
                    juste au-dessus. Ne reste que ce qu'ils ne disent pas : le total et son plafond. */}
                <p className="hint" style={{ margin: "6px 0 0" }}>Hydratation totale <b style={{ color: "var(--green)" }}>{totalHydra} %</b>{napoLevFixed ? " · cahier" : ` · plafond ${maxTotal} % pour un W ${wv}`}.</p>
                {!isNapo && (
                  <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={num(dp.huile) === 0} onChange={(e) => (e.target.checked ? removeOil() : restoreOil())} style={{ width: 16, height: 16, accentColor: "var(--ember1)" }} />
                      Sans huile d'olive (compensée par l'eau)
                    </label>
                    <p className="hint" style={{ margin: "4px 0 0", fontSize: 11.5 }}>L'huile ({curPreset.huile} %) maintient le pâton dans le temps : au froid, ce corps gras fige et forme une pellicule qui l'empêche de « tomber » trop vite.</p>
                  </div>
                )}
              </div>
            )}

            {cur.key === "levure" && (
              <div>
                {!napoLevFixed && (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {LEVURE_TYPES.map((y) => <button key={y.k} onClick={() => setYeastType(y.k)} className={`btn ${yeastType === y.k ? "primary" : "ghost"}`}>{y.label}</button>)}
                    </div>
                    <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
                      <FlourTempField dp={dp} set={setFlourTemp} />
                      <div>
                        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Stockage</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {LEVURE_STORAGE.map((s) => <button key={s.key} onClick={() => setLevStorage(s.key)} className={`btn sm ${levStorage === s.key ? "primary" : "ghost"}`}>{s.label}</button>)}
                        </div>
                      </div>
                    </div>
                    <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
                      {levStorage === "froid" ? (<>
                        <div className="field" style={{ marginBottom: 0 }}><label>Température chambre (°C)</label><input className="inp" type="number" value={dp.ctrlT ?? ""} placeholder="3 à 4" onChange={(e) => setDP("ctrlT", e.target.value)} /></div>
                        <div className="field" style={{ marginBottom: 0 }}><label>Temps (h)</label><input className="inp" type="number" min="0" value={dp.ctrlH ?? ""} placeholder="ex. 24" onChange={(e) => setDP("ctrlH", e.target.value)} /></div>
                      </>) : (<>
                        <div className="field" style={{ marginBottom: 0 }}><label>Température ambiante (°C)</label><input className="inp" type="number" value={dp.ambT ?? ""} placeholder="≈ 22" onChange={(e) => setDP("ambT", e.target.value)} /></div>
                        <div className="field" style={{ marginBottom: 0 }}><label>Temps (h)</label><input className="inp" type="number" min="0" value={dp.ambH ?? ""} placeholder="ex. 4" onChange={(e) => setDP("ambH", e.target.value)} /></div>
                      </>)}
                    </div>
                  </>
                )}
                <div style={{ font: "800 22px/1 var(--font-d)", color: "var(--green)" }}>{levReco} %</div>
                <p className="hint" style={{ margin: "8px 0 0", fontSize: 12 }}>{napoLevFixed
                  ? <>Cahier <b>{napoSpec.label}</b>, {napoSpec.levureNote}</>
                  : <><b>{+(levReco * 10).toFixed(1)} g</b>/kg · {yeastLabel(yeastType).toLowerCase()} · manuel p.21 (farine {flourTemp} °C).</>}</p>
              </div>
            )}

            {cur.key === "temp" && (
              <div>
                <div className="grid cols-2" style={{ gap: 12, alignItems: "stretch" }}>
                  <FlourTempField dp={dp} set={setFlourTemp} />
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 1, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)" }}>
                    <span className="hint" style={{ fontSize: 11 }}>Eau de coulage <span style={{ opacity: .7 }}>(TB 50)</span></span>
                    <b className="chiffres" style={{ fontSize: 19, color: eauCoulage < 4 ? "var(--blue)" : "var(--text)" }}>{eauCoulage} °C</b>
                  </div>
                </div>
                <p className="hint" style={{ margin: "10px 0 0" }}>Formule du manuel : eau de coulage = 50 − (2 × T° farine). Vise une pâte à ≈ 23-25 °C. {eauCoulage < 2 && <span style={{ color: "var(--ember1)" }}>Farine trop chaude, mets-en une partie au frais la veille.</span>}</p>
              </div>
            )}


            {step < STEPS.length - 1 ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20 }}>
                <button className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><Icon name="chevron-left" size={15} /> Retour</button>
                <button className="btn primary" onClick={() => setStep((s) => s + 1)}>{cur.opt ? "Passer" : "Suivant"} <Icon name="chevron-right" size={15} /></button>
              </div>
            ) : (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-soft)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, marginBottom: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={dp.shareCost !== false} onChange={(e) => setDP("shareCost", e.target.checked)} style={{ width: 15, height: 15, accentColor: "var(--ember1)" }} />
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

            <WizDock title={`${gfmt(totalDough)} de pâte`} sub={`${effNb} pâtons de ${patonG} g · ${totalHydra} % · W ${wv}`}
              visual={<Paton hydra={totalHydra} w={wv} patonG={patonG} look={look} />} />
          </Card>

          {/* Colonne droite : le résultat en direct (Composition / Coût) */}
          <div className="card dough-result wiz-side" id="wiz-result">
            <div className="field" style={{ marginBottom: 8 }}>
              <label style={{ color: "rgba(255,255,255,.8)" }}>Nom de l'empâtement</label>
              <input className="inp" value={r.name} onChange={(e) => setR((p) => ({ ...p, name: e.target.value }))} placeholder={`${dp.preset} maison`} />
            </div>
            {r.id && <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Icon name="pencil" size={12} /> Fiche déjà enregistrée, « Enregistrer » la met à jour.</div>}

            <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>{curPreset.nom}{napoSpec ? ` · ${napoSpec.label}` : ""} · {String(dp.method).toLowerCase()}{dp.autolyse ? " · autolyse" : ""} · W {wv}</div>
            <div style={{ font: "800 24px/1.1 var(--font-d)", margin: "4px 0 2px" }}>{gfmt(totalDough)} de pâte</div>
            <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12, marginBottom: 12 }}>{dpMode === "farine" ? "≈ " : ""}{effNb} pâtons de {patonG} g · hydratation {totalHydra} %</div>

            {/* Le pâton en direct : il s'affaisse quand on hydrate, s'alvéole quand le W monte,
                se pique de son avec les farines complètes. Les réglages deviennent visibles. */}
            <div style={{ margin: "2px 0 14px" }}>
              <Paton hydra={totalHydra} w={wv} patonG={patonG} nb={effNb} look={look} />
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[["compo", "Composition"], ["cout", "Coût"]].map(([k, lb]) => (
                <button key={k} className="btn sm" onClick={() => setResultTab(k)}
                  style={resultTab === k ? { background: "rgba(255,255,255,.18)", color: "#fff", borderColor: "transparent" } : { background: "transparent", ...ghostWhite }}>{lb}</button>
              ))}
            </div>

            {resultTab === "compo" ? (
              <>
                <DoughBar items={dough} total={totalDough} />
                {dough.map((i, idx) => (
                  <div key={i.k} className="dough-line">
                    <span className="ate-step">{idx + 1}</span>
                    <span style={{ color: i.color, display: "inline-flex" }}><Icon name={i.ic} size={17} /></span>
                    <b style={{ flex: 1, fontSize: 13 }}>{i.k}</b>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{i.pct}</span>
                    <b className="chiffres" style={{ width: 90, textAlign: "right" }}>{gfmt(i.v)}</b>
                  </div>
                ))}
                {ferment.length > 0 && <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.15)", fontSize: 11.5, color: "rgba(255,255,255,.75)", display: "flex", alignItems: "center", gap: 6 }}><Icon name="clock" size={13} /> Fermentation : {ferment.join(" + ")}</div>}
              </>
            ) : (
              <>
                {/* « estime le coût matière de la pâte » redisait l'onglet « Coût » et la ligne
                    « Total matière » plus bas. Ne reste que l'unité des champs saisissables. */}
                <p className="hint" style={{ color: "rgba(255,255,255,.7)", marginTop: 0, fontSize: 11.5 }}>Tarifs en €/kg, modifiables.</p>
                {costLines.map((l) => (
                  <div key={l.k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
                    <b style={{ flex: 1, fontSize: 13 }}>{l.label}</b>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.55)", width: 62, textAlign: "right" }}>{gfmt(l.g)}</span>
                    <input className="inp" type="number" step="0.1" min="0" value={prices[l.k]} onChange={(e) => setPrice(l.k, Number(e.target.value))} style={{ width: 62 }} title={`Prix ${l.label} €/kg`} />
                    <b className="tnum" style={{ width: 58, textAlign: "right" }}>{euro(l.eur)}</b>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <div style={{ flex: 1, padding: "9px 11px", background: "rgba(255,255,255,.08)", borderRadius: 10 }}>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.6)" }}>Coût / pâton</div>
                    <b className="tnum" style={{ fontSize: 18, color: "var(--gold)" }}>{euro(costPerPaton)}</b>
                  </div>
                  <div style={{ flex: 1, padding: "9px 11px", background: "rgba(255,255,255,.08)", borderRadius: 10 }}>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.6)" }}>Coût / kg de pâte</div>
                    <b className="tnum" style={{ fontSize: 18, color: "var(--gold)" }}>{euro(costPerKg)}</b>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12, color: "rgba(255,255,255,.7)" }}><span>Total matière ({gfmt(totalDough)})</span><b className="tnum" style={{ color: "#fff" }}>{euro(totalCost)}</b></div>
              </>
            )}
          </div>
        </div>
      ) : (
        <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes empâtements enregistrés</span>}>
          {saved.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Aucun empâtement enregistré. Crée-en un depuis l'onglet « Créer un empâtement ».</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {saved.map((s) => {
                const isOpen = expanded === s.id;
                return (
                  <div key={s.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", flexWrap: "wrap" }}>
                      <span className="fiche-tag">Empâtement</span>
                      <b style={{ flex: 1, minWidth: 120, fontSize: 15 }}>{s.name}{s.visibility === "SHARED" && <span className="badge" style={{ marginLeft: 8, fontSize: 10.5, verticalAlign: "middle" }}>Partagé</span>}</b>
                      <button className={"btn sm " + (isOpen ? "primary" : "ghost")} onClick={() => setExpanded(isOpen ? null : s.id)}><Icon name={isOpen ? "chevron-up" : "chevron-down"} size={13} /> Détails</button>
                      <button className="btn sm ghost" onClick={() => showDetail(s)}><Icon name="book-open" size={13} /> Ouvrir</button>
                      <button className="btn sm ghost" onClick={() => editBuild(s)}><Icon name="pencil" size={13} /> Modifier</button>
                      <button className="iconbtn del" title="Supprimer" onClick={() => remove(s.id)}><Icon name="trash" size={14} /></button>
                    </div>
                    {isOpen && <BuildDetails recipe={recipeOf(s)} />}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
      </>)}
      <SaveToast signal={enregistre} label={`Empâtement enregistré : ${r.name || "sans nom"}`} />
      <SaveToast signal={echec} label="Enregistrement impossible, réessayez" tone="err" />
    </>
  );
}

// Fiche de progression — récap lecture seule d'un empâtement sauvé (composition + coût + déroulé),
// imprimable. Ouvre depuis « Mes empâtements » ; « Modifier » renvoie au quiz.
/**
 * Composition de l'empâtement : la barre puis le détail ligne à ligne.
 *
 * Écrite une seule fois : la fiche complète et le dépliant de la liste l'affichaient chacune
 * avec son propre balisage, à quelques pixels près. Deux copies d'un même tableau finissent
 * toujours par diverger — l'une gagne une colonne que l'autre n'a pas.
 * `dense` ne change que l'échelle, pour le dépliant.
 */
/**
 * Déroulé des étapes — même liste numérotée dans la fiche et dans le dépliant.
 * Deuxième bloc à n'exister qu'une fois, pour la même raison que [CompositionList].
 */
/**
 * Température de la farine — saisie une seule fois, à deux endroits.
 *
 * L'étape « Levure » et l'étape « Coulage » demandent toutes deux cette valeur (elle pilote la
 * dose de levure ET l'eau de coulage), et chacune bornait son champ à sa façon : max 40 ici,
 * max 35 là. Même donnée, deux plafonds — donc un champ unique, borné une fois.
 */
function FlourTempField({ dp, set }) {
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>Température de la farine (°C)</label>
      <input className="inp" type="number" min="0" max="40" value={dp.flourTemp ?? 17} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );
}

function StepsList({ build, dense }) {
  return (
    <>
      <div className="ate-lbl" style={{ marginBottom: dense ? 8 : 12 }}>Déroulé des étapes</div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: dense ? 10 : 11 }}>
        {build.steps.map((s, idx) => (
          <li key={idx} style={{ display: "flex", gap: dense ? 10 : 12, breakInside: "avoid" }}>
            <span style={{ width: dense ? 22 : 24, height: dense ? 22 : 24, borderRadius: "50%", background: "var(--grad-ember)", color: "#fff", display: "grid", placeItems: "center", fontSize: dense ? 11 : 12, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</span>
            <div><b style={{ fontSize: dense ? 12.5 : 13.5 }}>{s.t}</b><div style={{ fontSize: dense ? 12 : 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{s.d}</div></div>
          </li>
        ))}
      </ol>
    </>
  );
}

function CompositionList({ build, dense }) {
  return (
    <>
      <div className="ate-lbl" style={{ marginBottom: 8 }}>
        Composition <span className="hint" style={{ fontWeight: 400 }}>({gfmt(build.totalDough)})</span>
      </div>
      <DoughBar items={build.dough} total={build.totalDough} />
      {build.dough.map((i) => (
        <div key={i.k} style={{ display: "flex", alignItems: "center", gap: 8, padding: dense ? "5px 0" : "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
          <span style={{ color: i.color, display: "inline-flex" }}><Icon name={i.ic} size={dense ? 15 : 16} /></span>
          <b style={{ flex: 1, fontSize: dense ? 12.5 : 13 }}>{i.k}</b>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{i.pct}</span>
          <b className="chiffres" style={{ width: 78, textAlign: "right" }}>{gfmt(i.v)}</b>
        </div>
      ))}
    </>
  );
}

function RecapFiche({ recipe, onBack, onEdit, onDuplicate, onShare, onDelete, busy }) {
  const B = computeBuild(recipe);
  const dp = B.dp;
  const shared = recipe.visibility === "SHARED";
  return (
    <div className="print-area">
      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button className="btn ghost sm" onClick={onBack}><Icon name="chevron-left" size={14} /> Mes empâtements</button>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={() => window.print()}><Icon name="printer" size={14} /> Imprimer</button>
        <button className="btn primary sm" onClick={onEdit} disabled={busy}><Icon name="pencil" size={13} /> Modifier</button>
        <button className="btn ghost sm" onClick={onDuplicate} disabled={busy}><Icon name="plus" size={13} /> Dupliquer</button>
        <button className={"btn sm " + (shared ? "primary" : "ghost")} onClick={onShare} disabled={busy}><Icon name={shared ? "users" : "send"} size={13} /> {shared ? "Partagé" : "Partager"}</button>
        <button className="iconbtn del" title="Supprimer" onClick={onDelete} disabled={busy}><Icon name="trash" size={14} /></button>
      </div>

      <Card>
        <div className="eyebrow" style={{ color: "var(--ember1)" }}>Fiche de progression · empâtement</div>
        <h2 style={{ font: "800 26px/1.1 var(--font-d)", margin: "2px 0 4px" }}>{recipe.name}{shared && <span className="badge" style={{ marginLeft: 8, fontSize: 11, verticalAlign: "middle" }}>Partagé</span>}</h2>
        <div className="hint">{B.preset.nom}{B.napoSpec ? ` · ${B.napoSpec.label}` : ""} · {String(dp.method).toLowerCase()}{dp.autolyse ? " · autolyse" : ""} · W {B.w} · {B.hydraTotal} % hydratation · {B.effNb} pâtons de {B.patonG} g</div>

        <div className="grid cols-2" style={{ gap: 22, marginTop: 18, alignItems: "start" }}>
          <div>
            <CompositionList build={B} />
          </div>
          <div>
            <div className="ate-lbl" style={{ marginBottom: 8 }}>Coût matière</div>
            {B.costLines.map((l) => (
              <div key={l.k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <b style={{ flex: 1, fontSize: 13 }}>{l.label}</b>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{gfmt(l.g)} × {euro(B.prices[l.k])}</span>
                <b className="tnum" style={{ width: 56, textAlign: "right" }}>{euro(l.eur)}</b>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1, padding: "8px 10px", background: "var(--surface2)", borderRadius: 8 }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Coût / pâton</div><b className="tnum" style={{ fontSize: 16, color: "var(--gold)" }}>{euro(B.costPerPaton)}</b></div>
              <div style={{ flex: 1, padding: "8px 10px", background: "var(--surface2)", borderRadius: 8 }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Coût / kg</div><b className="tnum" style={{ fontSize: 16, color: "var(--gold)" }}>{euro(B.costPerKg)}</b></div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <StepsList build={B} />
        </div>
      </Card>
    </div>
  );
}

// Détails dépliables d'un empâtement dans la liste (« Mes empâtements ») : méta + composition
// + déroulé, en lecture seule et compact. Le coût détaillé reste sur la fiche (« Ouvrir »).
function BuildDetails({ recipe }) {
  const B = computeBuild(recipe);
  const dp = B.dp;
  const chips = [`W ${B.w}`, `${B.hydraTotal} % hydratation`, String(dp.method || "direct").toLowerCase() + (dp.autolyse ? " · autolyse" : ""), `${B.effNb} pâtons de ${B.patonG} g`];
  return (
    <div className="acc-body" style={{ padding: "2px 0 18px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {B.preset && <span className="chip">{B.preset.nom}{B.napoSpec ? ` · ${B.napoSpec.label}` : ""}</span>}
        {chips.map((c) => <span key={c} className="chip">{c}</span>)}
      </div>
      <div className="grid cols-2" style={{ gap: 24, alignItems: "start" }}>
        <div>
          <CompositionList build={B} dense />
        </div>
        <div>
          <StepsList build={B} dense />
        </div>
      </div>
    </div>
  );
}

// Curseur générique (bassinage).
function Slider({ label, val, min, max, step, set }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <b style={{ fontSize: 13 }}>{label}</b>
        <span className="chiffres" style={{ fontWeight: 700, color: "var(--blue)" }}>{val} %</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--ember1)" }} />
    </div>
  );
}

// Bloc de stockage/fermentation : température + temps.
function StorageBlock({ label, ic, temp, time, setTemp, setTime, phT }) {
  return (
    <div style={{ padding: "11px 13px", border: "1px solid var(--border-soft)", borderRadius: 10, marginBottom: 10 }}>
      <b style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}><Icon name={ic} size={14} /> {label}</b>
      <div className="grid cols-2" style={{ gap: 10, marginTop: 9 }}>
        <div className="field" style={{ marginBottom: 0 }}><label>Température (°C)</label><input className="inp" type="number" value={temp ?? ""} onChange={(e) => setTemp(e.target.value)} placeholder={phT} /></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Temps (h)</label><input className="inp" type="number" min="0" value={time ?? ""} onChange={(e) => setTime(e.target.value)} placeholder="ex. 24" /></div>
      </div>
    </div>
  );
}

// Curseur d'hydratation : plage recommandée [min ; plafond]. Vert dans la plage, ambre en dessous,
// rouge au-dessus ; borné à la plage si un cahier napolitain fixe les valeurs (confirmed).
function HydraStep({ val, recoMin, recoMax, confirmed, set }) {
  const min = confirmed ? recoMin : 45, max = recoMax;
  const below = val < recoMin, above = val > recoMax, ok = !below && !above;
  const c = confirmed || ok ? "var(--green)" : above ? "var(--ember1)" : "var(--gold)";
  const pctN = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <b style={{ fontSize: 13 }}>Hydratation de coulage</b>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={"hydra-badge " + (confirmed || ok ? "ok" : above ? "high" : "low")}>{(confirmed || ok) && <Icon name="check" size={12} />} {confirmed ? "Confirmé" : ok ? "Recommandé" : above ? "Au-dessus du seuil" : "Sous le minimum"}</span>
          <span className="chiffres" style={{ fontWeight: 800, color: c, fontSize: 15 }}>{val} %</span>
        </span>
      </div>
      <div className="hydra-track">
        {confirmed ? <span className="hydra-zone" style={{ left: 0, right: 0 }} /> : <>
          <span className="hydra-zone" style={{ left: `${pctN(recoMin)}%`, right: `${100 - pctN(recoMax)}%` }} />
          <span className="hydra-mark" style={{ left: `${pctN(recoMin)}%` }} /><span className="hydra-mark hi" style={{ left: `${pctN(recoMax)}%` }} />
        </>}
      </div>
      <input type="range" min={min} max={max} step={1} value={Math.min(Math.max(val, min), max)} onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: c }} />
      <p className="hint" style={{ margin: "3px 0 0", fontSize: 11.5 }}>Plage recommandée <b style={{ color: "var(--green)" }}>{recoMin}–{recoMax} %</b>{confirmed ? " (cahier)" : ""}.</p>
    </div>
  );
}
