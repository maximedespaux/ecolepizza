import { useMemo, useState } from "react";
import PageHead from "../components/PageHead.jsx";

const PRESETS = [
  { nom: "Napolitaine", icon: "🌋", hydra: 65, sel: 2.8, levure: 0.2, paton: 250 },
  { nom: "Classique", icon: "🍕", hydra: 60, sel: 2.5, levure: 0.5, paton: 250 },
  { nom: "In Teglia", icon: "🟫", hydra: 80, sel: 2.5, levure: 0.3, paton: 300 },
  { nom: "Contemporaine", icon: "🧪", hydra: 75, sel: 2.6, levure: 0.25, paton: 270 },
];

const g = (n) => (n >= 1000 ? (n / 1000).toFixed(2) + " kg" : Math.round(n) + " g");

function Slider({ label, val, unit, min, max, step, set, suffix }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <b style={{ fontSize: 13 }}>{label}</b>
        <span className="tnum" style={{ fontWeight: 700, color: "var(--blue)" }}>{val}{suffix ?? unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={(e) => set(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--ember1)" }} />
    </div>
  );
}

function Atelier() {
  const [nb, setNb] = useState(6);
  const [paton, setPaton] = useState(250);
  const [hydra, setHydra] = useState(65);
  const [sel, setSel] = useState(2.8);
  const [levure, setLevure] = useState(0.2);
  const [preset, setPreset] = useState("Napolitaine");

  const applyPreset = (p) => { setPreset(p.nom); setHydra(p.hydra); setSel(p.sel); setLevure(p.levure); setPaton(p.paton); };

  const r = useMemo(() => {
    const total = nb * paton;
    const farine = total / (1 + hydra / 100 + sel / 100 + levure / 100);
    return { total, farine, eau: (farine * hydra) / 100, sel: (farine * sel) / 100, levure: (farine * levure) / 100 };
  }, [nb, paton, hydra, sel, levure]);

  const ing = [
    { k: "Farine", v: r.farine, icon: "🌾", pct: "100 %" },
    { k: "Eau", v: r.eau, icon: "💧", pct: `${hydra} %` },
    { k: "Sel", v: r.sel, icon: "🧂", pct: `${sel} %` },
    { k: "Levure", v: r.levure, icon: "🫧", pct: `${levure} %` },
  ];

  return (
    <>
      <PageHead
        eyebrow="Atelier"
        title="Calculateur de pâte"
        lead="Choisissez un style, ajustez vos paramètres : les quantités se calculent en pourcentage boulanger (tout par rapport au poids de farine)."
      />
      <div className="grid cols-2">
        <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {PRESETS.map((p) => (
              <button key={p.nom} onClick={() => applyPreset(p)}
                className={`btn sm ${preset === p.nom ? "primary" : "ghost"}`}>
                {p.icon} {p.nom}
              </button>
            ))}
          </div>
          <Slider label="Nombre de pâtons" val={nb} unit="" min={1} max={40} step={1} set={setNb} suffix=" pâtons" />
          <Slider label="Poids par pâton" val={paton} unit=" g" min={150} max={400} step={5} set={setPaton} />
          <Slider label="Hydratation" val={hydra} unit=" %" min={50} max={90} step={1} set={setHydra} />
          <Slider label="Sel" val={sel} unit=" %" min={0} max={4} step={0.1} set={setSel} />
          <Slider label="Levure" val={levure} unit=" %" min={0} max={2} step={0.05} set={setLevure} />
        </div>

        <div className="card dough-result">
          <div className="eyebrow" style={{ color: "rgba(255,255,255,.7)" }}>Votre empâtement</div>
          <div style={{ font: "800 24px/1.1 var(--font-d)", margin: "4px 0 2px" }}>{g(r.total)} de pâte</div>
          <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12, marginBottom: 16 }}>{nb} pâtons de {paton} g</div>
          {ing.map((i) => (
            <div key={i.k} className="dough-line">
              <span style={{ fontSize: 18 }}>{i.icon}</span>
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
