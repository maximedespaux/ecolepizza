import { useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { tempStatus, fmtNum } from "../lib/hygiene.js";

/**
 * Tournée des températures — la saisie éclair. Au lieu d'un formulaire par frigo, TOUS les points
 * de contrôle sur un écran : on tape la valeur, le vert/rouge tombe en direct, et un seul bouton
 * enregistre toute la tournée. Entrée = ligne suivante, comme sur une calculette.
 *
 * Props-piloté (equipment + onSave) : réutilisable et démontrable avec des données d'exemple.
 */
function seuilTxt(eq) {
  const u = eq.unit || "°C";
  if (eq.target_min != null && eq.target_max != null) return `${fmtNum(eq.target_min)} à ${fmtNum(eq.target_max)} ${u}`;
  if (eq.target_max != null) return `≤ ${fmtNum(eq.target_max)} ${u}`;
  if (eq.target_min != null) return `≥ ${fmtNum(eq.target_min)} ${u}`;
  return "sans seuil";
}

export default function TempRound({ equipment = [], busy = false, lastByEquip = {}, onSave }) {
  const [vals, setVals] = useState({});
  const refs = useRef([]);
  const set = (id, v) => setVals((s) => ({ ...s, [id]: v }));
  const filled = Object.entries(vals).filter(([, v]) => String(v).trim() !== "");
  const focusNext = (i) => { for (let j = i + 1; j < equipment.length; j++) { if (refs.current[j]) { refs.current[j].focus(); return; } } };

  const save = () => {
    const readings = filled.map(([equipment_id, value_num]) => ({ equipment_id, value_num }));
    if (readings.length && onSave) onSave(readings);
    setVals({});
  };

  return (
    <div className="hs-round">
      <div className="hs-round-head">
        <Icon name="thermometer" size={17} />
        <span>Tournée du jour — saisissez, on enregistre tout d'un coup.</span>
      </div>
      <ul className="hs-round-list">
        {equipment.map((eq, i) => {
          const raw = vals[eq.id] ?? "";
          const st = tempStatus(raw, eq);
          const last = lastByEquip[eq.id];
          return (
            <li key={eq.id} className={`hs-round-row ${st ? st.toLowerCase() : ""}`}>
              <span className="hs-round-name">
                <b>{eq.name}</b>
                <span className="hs-round-seuil">
                  cible {seuilTxt(eq)}{last != null && <> · dernier {fmtNum(last)} °C</>}
                </span>
              </span>
              <span className="hs-round-field">
                <input
                  ref={(el) => (refs.current[i] = el)}
                  type="number" inputMode="decimal" step="0.1"
                  className="hs-round-input" value={raw} placeholder="—"
                  aria-label={`Température ${eq.name}`}
                  onChange={(e) => set(eq.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNext(i); } }}
                />
                <span className="hs-round-unit">{eq.unit || "°C"}</span>
                {st && <Icon name={st === "CONFORME" ? "check-circle" : "alert-triangle"} size={17} />}
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn primary hs-round-save" disabled={busy || !filled.length} onClick={save}>
        <Icon name="check" size={16} /> Enregistrer la tournée{filled.length ? ` (${filled.length})` : ""}
      </button>
    </div>
  );
}
