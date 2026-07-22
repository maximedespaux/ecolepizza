import { Icon } from "./Icon.jsx";
import { FREQUENCIES, fmtDateTime } from "../lib/hygiene.js";

/**
 * Plan de nettoyage en cases à cocher — comme une to-do. Un tap = fait (daté et signé
 * automatiquement), un second tap = j'annule. Pas de formulaire à remplir.
 *
 * `doneMap` : { [taskId]: entry } pour les tâches déjà cochées aujourd'hui (l'entrée sert à
 * l'annulation et à afficher l'heure).
 */
export default function CleaningChecklist({ tasks = [], doneMap = {}, busy = false, onToggle }) {
  const done = tasks.filter((t) => doneMap[t.id]).length;
  return (
    <div className="hs-clean">
      <div className="hs-round-head">
        <Icon name="spray-can" size={17} />
        <span>Cochez au fur et à mesure — {done}/{tasks.length} fait{done > 1 ? "s" : ""} aujourd'hui.</span>
      </div>
      <ul className="hs-clean-list">
        {tasks.map((t) => {
          const entry = doneMap[t.id];
          const isDone = !!entry;
          return (
            <li key={t.id} className={`hs-task ${isDone ? "done" : ""}`}>
              <button type="button" className="hs-task-btn" disabled={busy} onClick={() => onToggle?.(t, isDone, entry)}>
                <span className="hs-task-box">{isDone && <Icon name="check" size={15} />}</span>
                <span className="hs-task-main">
                  <b>{t.task}</b>
                  <span className="hs-task-sub">
                    {t.zone} · {FREQUENCIES[t.frequency] || t.frequency}{t.product ? ` · ${t.product}` : ""}
                  </span>
                </span>
                {isDone
                  ? <span className="hs-task-tag">✓ {fmtDateTime(entry.occurred_at)?.split(" ").pop()}</span>
                  : <span className="hs-task-go">à faire</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
