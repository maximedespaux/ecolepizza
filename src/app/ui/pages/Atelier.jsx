import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import { Icon } from "../components/Icon.jsx";
import { getMyFormations } from "../api/apiClient.js";

// Typologies de pizza. `methods` = empâtements autorisés. Teglia & Pala = spécialisations.
const PRESETS = [
  { nom: "Classique", ic: "pizza", methods: ["Direct", "Biga", "Poolish"], hydra: 60, sel: 2.5, huile: 0, levure: 0.5, paton: 250, desc: "Cornicione léger ; direct, ou indirect (biga/poolish) au Niveau II." },
  { nom: "Contemporaine", ic: "pizza", methods: ["Biga", "Poolish"], hydra: 75, sel: 2.8, huile: 0, levure: 0.3, paton: 270, desc: "Cornicione plus haut & dense — se fait souvent en empâtement indirect (biga/poolish)." },
  { nom: "Napolitaine", ic: "flame", methods: ["Direct"], hydra: 62, sel: 2.8, huile: 0, levure: 0.2, paton: 250, desc: "Empâtement direct uniquement, cuisson à très haute température." },
  { nom: "Teglia", ic: "package", methods: ["Direct", "Biga", "Poolish"], hydra: 80, sel: 2.5, huile: 2, levure: 0.3, paton: 300, spe: true, desc: "En plaque rectangulaire (al taglio), souvent avec un filet d'huile." },
  { nom: "Pala", ic: "package", methods: ["Direct", "Biga", "Poolish"], hydra: 78, sel: 2.5, huile: 1.5, levure: 0.3, paton: 300, spe: true, desc: "Rectangulaire, cuite sur pierre, servie sur pelle." },
];
const INDIRECT = ["Biga", "Poolish"]; // empâtements indirects → prérequis Niveau II
const g = (n) => (n >= 1000 ? (n / 1000).toFixed(2) + " kg" : Math.round(n) + " g");

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

function Atelier() {
  const [presetName, setPresetName] = useState("Classique");
  const [method, setMethod] = useState("Direct");
  const [autolyse, setAutolyse] = useState(false);
  const [mode, setMode] = useState("patons"); // "patons" | "farine"
  const [nb, setNb] = useState(6);
  const [paton, setPaton] = useState(250);
  const [flourKg, setFlourKg] = useState(10); // mode « par farine »
  const [hydra, setHydra] = useState(60);
  const [sel, setSel] = useState(2.5);
  const [huile, setHuile] = useState(0);
  const [levure, setLevure] = useState(0.5);
  const [niv2, setNiv2] = useState(false);
  const [spe, setSpe] = useState(false);

  useEffect(() => {
    getMyFormations().then((r) => {
      const fs = (r.data || []).filter((f) => f.enrolled).map((f) => `${f.program_title} ${f.program_code}`);
      setNiv2(fs.some((t) => /niveau ii|emp[aâ]tement/i.test(t)));
      setSpe(fs.some((t) => /teglia|pala|sp[ée]cialis/i.test(t)));
    }).catch(() => {});
  }, []);

  const preset = PRESETS.find((p) => p.nom === presetName) || PRESETS[0];
  const methodLocked = (m) => INDIRECT.includes(m) && !niv2;

  function applyPreset(p) {
    if (p.spe && !spe) return;
    setPresetName(p.nom); setHydra(p.hydra); setSel(p.sel); setHuile(p.huile); setLevure(p.levure); setPaton(p.paton);
    setMethod(p.methods.find((m) => !methodLocked(m)) || p.methods[0]);
  }

  // Pourcentage boulanger : tout par rapport à la farine.
  const addPct = 1 + (hydra + sel + huile + levure) / 100;
  const total = mode === "patons" ? nb * paton : Math.max(0, flourKg) * 1000 * addPct;
  const farine = total / addPct;
  const eau = farine * hydra / 100, selG = farine * sel / 100, huileG = farine * huile / 100, levureG = farine * levure / 100;
  const nbPatons = Math.floor(total / (paton || 1));
  const reste = total - nbPatons * (paton || 0);

  const ing = [
    { k: "Farine", ic: "wheat", v: farine, pct: "100 %", color: "#fcb900" },
    { k: "Eau", ic: "droplet", v: eau, pct: `${hydra} %`, color: "#3aa0e0" },
    { k: "Sel", ic: "salt", v: selG, pct: `${sel} %`, color: "#c9cede" },
    ...(huile > 0 ? [{ k: "Huile", ic: "oil", v: huileG, pct: `${huile} %`, color: "#7bb661" }] : []),
    { k: "Levure", ic: "yeast", v: levureG, pct: `${levure} %`, color: "#ff6900" },
  ];

  return (
    <>
      <PageHead eyebrow="Outils · atelier" title="Calculateur de pâte"
        lead="Choisis un style et un empâtement, calcule par pâtons ou à partir de ta farine : les quantités se calculent en pourcentage boulanger (tout par rapport au poids de farine)." />

      <div className="grid cols-2">
        <div className="card">
          {/* Typologies */}
          <div className="ate-lbl">Typologie de pizza</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {PRESETS.map((p) => {
              const locked = p.spe && !spe;
              return (
                <button key={p.nom} onClick={() => applyPreset(p)} disabled={locked}
                  className={`btn sm ${presetName === p.nom ? "primary" : "ghost"}`}
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
            {preset.methods.map((m) => {
              const locked = methodLocked(m);
              return (
                <button key={m} onClick={() => !locked && setMethod(m)} disabled={locked}
                  className={`btn sm ${method === m ? "primary" : "ghost"}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: locked ? 0.5 : 1 }}
                  title={locked ? "Débloqué au Niveau II (empâtements indirects)" : m}>
                  {locked && <Icon name="lock" size={12} />}{m}
                </button>
              );
            })}
            <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 3px" }} />
            <button onClick={() => setAutolyse((a) => !a)} className={`btn sm ${autolyse ? "primary" : "ghost"}`}
              title="Repos farine + eau avant pétrissage (facultatif)">
              <Icon name={autolyse ? "check" : "plus"} size={13} /> Autolyse
            </button>
          </div>
          <p className="hint" style={{ margin: "0 0 16px" }}>Direct &amp; Autolyse → Niveau I · Biga &amp; Poolish (indirects) → Niveau II</p>

          {/* Mode de calcul */}
          <div className="ate-lbl">Calculer</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button className={`btn sm ${mode === "patons" ? "primary" : "ghost"}`} onClick={() => setMode("patons")}>Par pâtons</button>
            <button className={`btn sm ${mode === "farine" ? "primary" : "ghost"}`} onClick={() => setMode("farine")}>Par farine</button>
          </div>

          {mode === "patons" ? (
            <>
              <Slider label="Nombre de pâtons" val={nb} min={1} max={40} step={1} set={setNb} suffix=" pâtons" />
              <Slider label="Poids par pâton" val={paton} min={150} max={400} step={5} set={setPaton} suffix=" g" />
            </>
          ) : (
            <>
              <div className="field"><label>Farine disponible (kg)</label>
                <input className="inp" type="number" min="0" step="0.5" value={flourKg} onChange={(e) => setFlourKg(Number(e.target.value))} /></div>
              <Slider label="Poids par pâton" val={paton} min={150} max={400} step={5} set={setPaton} suffix=" g" />
            </>
          )}
          <Slider label="Hydratation" val={hydra} min={50} max={90} step={1} set={setHydra} suffix=" %" />
          <Slider label="Sel" val={sel} min={0} max={4} step={0.1} set={setSel} suffix=" %" />
          <Slider label="Huile (facultatif)" val={huile} min={0} max={6} step={0.5} set={setHuile} suffix=" %" />
          <Slider label="Levure" val={levure} min={0} max={2} step={0.05} set={setLevure} suffix=" %" />
        </div>

        {/* Résultat par étapes */}
        <div className="card dough-result">
          <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>
            {preset.nom} · empâtement {method.toLowerCase()}{autolyse ? " + autolyse" : ""}
          </div>
          <div style={{ font: "800 24px/1.1 var(--font-d)", margin: "4px 0 2px" }}>{g(total)} de pâte</div>
          <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12, marginBottom: 12 }}>
            {mode === "patons"
              ? `${nb} pâtons de ${paton} g`
              : `${nbPatons} pâtons de ${paton} g${reste > 5 ? ` · reste ${g(reste)}` : ""}`}
          </div>
          <div className="dough-bar" title="Proportions de l'empâtement">
            {ing.map((i) => <span key={i.k} style={{ width: `${total ? (i.v / total) * 100 : 0}%`, background: i.color }} />)}
          </div>

          {autolyse && (
            <p style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)", background: "rgba(255,255,255,.08)", borderRadius: 8, padding: "8px 10px", margin: "0 0 10px" }}>
              <b>Autolyse</b> — mélange la farine et l'eau, laisse reposer 30–60 min, puis ajoute sel & levure.
            </p>
          )}

          {ing.map((i, idx) => (
            <div key={i.k} className="dough-line">
              <span className="ate-step">{idx + 1}</span>
              <span style={{ color: i.color, display: "inline-flex" }}><Icon name={i.ic} size={17} /></span>
              <b style={{ flex: 1, fontSize: 13 }}>{i.k}</b>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{i.pct}</span>
              <b className="tnum" style={{ width: 90, textAlign: "right" }}>{g(i.v)}</b>
            </div>
          ))}
          <p style={{ color: "rgba(255,255,255,.6)", fontSize: 11, marginTop: 14, marginBottom: 0 }}>
            Pourcentage boulanger : tout est calculé par rapport au poids de farine.
          </p>
        </div>
      </div>
    </>
  );
}

export default Atelier;
