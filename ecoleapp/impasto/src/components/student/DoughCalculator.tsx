"use client";
import { useMemo, useState } from "react";

interface Preset { nom: string; icon: string; hydra: number; sel: number; levure: number; paton: number }
const PRESETS: Preset[] = [
  { nom: "Napolitaine", icon: "🌋", hydra: 65, sel: 2.8, levure: 0.2, paton: 250 },
  { nom: "Classique", icon: "🍕", hydra: 60, sel: 2.5, levure: 0.5, paton: 250 },
  { nom: "In Teglia", icon: "🟫", hydra: 80, sel: 2.5, levure: 0.3, paton: 300 },
  { nom: "Contemporaine", icon: "🧪", hydra: 75, sel: 2.6, levure: 0.25, paton: 270 },
];

const g = (n: number) => (n >= 1000 ? (n / 1000).toFixed(2) + " kg" : Math.round(n) + " g");

export default function DoughCalculator() {
  const [nb, setNb] = useState(6);
  const [paton, setPaton] = useState(250);
  const [hydra, setHydra] = useState(65);
  const [sel, setSel] = useState(2.8);
  const [levure, setLevure] = useState(0.2);
  const [preset, setPreset] = useState("Napolitaine");

  const applyPreset = (p: Preset) => { setPreset(p.nom); setHydra(p.hydra); setSel(p.sel); setLevure(p.levure); setPaton(p.paton); };

  const r = useMemo(() => {
    const total = nb * paton;
    const farine = total / (1 + hydra / 100 + sel / 100 + levure / 100);
    return { total, farine, eau: farine * hydra / 100, sel: farine * sel / 100, levure: farine * levure / 100 };
  }, [nb, paton, hydra, sel, levure]);

  const Row = ({ label, val, unit, min, max, step, set, suffix }: { label: string; val: number; unit: string; min: number; max: number; step: number; set: (n: number) => void; suffix?: string }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="font-mono text-sm text-navy font-bold">{val}{suffix ?? unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(Number(e.target.value))}
        className="w-full accent-[color:var(--ember1)]" />
    </div>
  );

  const ing = [
    { k: "Farine", v: r.farine, icon: "🌾", pct: "100 %" },
    { k: "Eau", v: r.eau, icon: "💧", pct: `${hydra} %` },
    { k: "Sel", v: r.sel, icon: "🧂", pct: `${sel} %` },
    { k: "Levure", v: r.levure, icon: "🫧", pct: `${levure} %` },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.nom} onClick={() => applyPreset(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${preset === p.nom ? "bg-navy text-white border-transparent" : "bg-surface-2 text-ink border-line hover:border-navy"}`}>
              {p.icon} {p.nom}
            </button>
          ))}
        </div>
        <Row label="Nombre de pâtons" val={nb} unit="" min={1} max={40} step={1} set={setNb} suffix=" pâtons" />
        <Row label="Poids par pâton" val={paton} unit=" g" min={150} max={400} step={5} set={setPaton} />
        <Row label="Hydratation" val={hydra} unit=" %" min={50} max={90} step={1} set={setHydra} />
        <Row label="Sel" val={sel} unit=" %" min={0} max={4} step={0.1} set={setSel} />
        <Row label="Levure" val={levure} unit=" %" min={0} max={2} step={0.05} set={setLevure} />
      </div>

      <div className="rounded-2xl p-5 text-white bg-[linear-gradient(135deg,var(--navy),var(--navy-dark))]">
        <div className="text-[11px] font-bold uppercase tracking-widest text-white/70">Votre empâtement</div>
        <div className="font-display text-2xl font-extrabold mt-1">{g(r.total)} de pâte</div>
        <div className="text-white/70 text-xs mb-4">{nb} pâtons de {paton} g</div>
        <div className="space-y-2.5">
          {ing.map((i) => (
            <div key={i.k} className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5">
              <span className="text-lg">{i.icon}</span>
              <span className="flex-1 font-semibold text-sm">{i.k}</span>
              <span className="text-xs text-white/60">{i.pct}</span>
              <span className="font-mono font-bold text-base w-24 text-right">{g(i.v)}</span>
            </div>
          ))}
        </div>
        <p className="text-white/60 text-[11px] mt-4">Pourcentage boulanger : tout est calculé par rapport au poids de farine.</p>
      </div>
    </div>
  );
}
