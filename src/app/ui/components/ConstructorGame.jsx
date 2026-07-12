import { useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";

/**
 * Le Constructeur de pizza — jeu d'ordonnancement : remettre les étapes de la
 * recette (empâtement → cuisson) dans le bon ordre. Tape une étape pour la placer,
 * retape-la pour la retirer, puis « Vérifier ». Score → étoiles + XP.
 *
 * ⚠️ Démo : étapes d'exemple (méthode simplifiée) — à caler sur les manuels.
 */
const RECIPE = [
  { t: "Peser les ingrédients", e: "⚖️" },
  { t: "Frasage (farine + eau)", e: "💧" },
  { t: "Pétrissage", e: "🤲" },
  { t: "Pointage (fermentation en masse)", e: "🫧" },
  { t: "Boulage (former les pâtons)", e: "⚪" },
  { t: "Apprêt (maturation)", e: "⏳" },
  { t: "Façonnage du disque", e: "🍥" },
  { t: "Garniture", e: "🍅" },
  { t: "Cuisson", e: "🔥" },
];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export default function ConstructorGame({ onClose, onFinish }) {
  const order = useMemo(() => shuffle(RECIPE.map((_, i) => i)), []);   // ordre d'affichage du vivier
  const [placed, setPlaced] = useState([]);                            // indices posés, dans l'ordre du joueur
  const [checked, setChecked] = useState(false);

  const pool = order.filter((i) => !placed.includes(i));
  const N = RECIPE.length;
  const correct = placed.filter((idx, pos) => idx === pos).length;
  const stars = checked ? (correct === N ? 3 : correct >= N - 2 ? 2 : correct >= Math.ceil(N / 2) ? 1 : 0) : 0;

  const place = (i) => { if (!checked) setPlaced((p) => [...p, i]); };
  const unplace = (i) => { if (!checked) setPlaced((p) => p.filter((x) => x !== i)); };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>🍕 Le Constructeur de pizza</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          <p className="sub" style={{ marginTop: 0 }}>Remets les étapes dans le bon ordre — de l'empâtement à la cuisson.</p>

          {/* Séquence du joueur */}
          <div className="cg-seq">
            {Array.from({ length: N }, (_, pos) => {
              const idx = placed[pos];
              const ok = checked && idx === pos;
              const ko = checked && idx != null && idx !== pos;
              return (
                <div key={pos} className={"cg-slot" + (idx == null ? " empty" : "") + (ok ? " ok" : "") + (ko ? " ko" : "")}
                  onClick={() => idx != null && unplace(idx)} title={idx != null && !checked ? "Retirer" : undefined}>
                  <span className="cg-num">{pos + 1}</span>
                  {idx != null ? <span><span className="cg-e">{RECIPE[idx].e}</span> {RECIPE[idx].t}</span> : <span className="cg-ph">…</span>}
                  {checked && idx != null && <span style={{ marginLeft: "auto" }}>{ok ? "✅" : `→ ${pos + 1}. ${RECIPE[pos].t}`}</span>}
                </div>
              );
            })}
          </div>

          {/* Vivier */}
          {!checked && pool.length > 0 && (
            <>
              <div className="hint" style={{ margin: "12px 0 6px" }}>Étapes à placer :</div>
              <div className="cg-pool">
                {pool.map((i) => (
                  <button key={i} className="cg-chip" onClick={() => place(i)}><span className="cg-e">{RECIPE[i].e}</span> {RECIPE[i].t}</button>
                ))}
              </div>
            </>
          )}

          {checked && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <div style={{ fontSize: 26, letterSpacing: 4 }}>{[0, 1, 2].map((s) => <span key={s} style={{ opacity: s < stars ? 1 : 0.25 }}>⭐</span>)}</div>
              <p style={{ fontWeight: 700, margin: "4px 0 0" }}>{correct}/{N} étapes bien placées</p>
              <p className="hint" style={{ marginTop: 2 }}>{stars >= 2 ? "Belle recette !" : "Regarde le bon ordre ci-dessus et retente."}</p>
            </div>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
          {!checked
            ? <button className="btn primary" disabled={placed.length !== N} onClick={() => setChecked(true)}>Vérifier</button>
            : <button className="btn primary" onClick={() => onFinish(stars)}>Valider (+{correct * 10} XP)</button>}
        </div>
      </div>
    </div>
  );
}
