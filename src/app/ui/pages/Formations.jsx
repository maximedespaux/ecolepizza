import { useEffect, useState } from "react";
import { getFormations, updateFormation, reorderFormations } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { euro, colorOf } from "../lib/format.js";
import { LEVELS } from "../lib/levels.js";

function Formations() {
  const [programs, setPrograms] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // formation en cours d'édition
  const [drag, setDrag] = useState(null);        // index de la ligne déplacée

  async function load() {
    try {
      const response = await getFormations();
      setPrograms(response.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }
  useEffect(() => { load(); }, []);

  // Glisser-déposer : réordonne localement puis persiste.
  function onDrop(toIdx) {
    if (drag === null || drag === toIdx) { setDrag(null); return; }
    const next = [...programs];
    const [moved] = next.splice(drag, 1);
    next.splice(toIdx, 0, moved);
    setPrograms(next);
    setDrag(null);
    reorderFormations(next.map((p) => p.id)).catch((e) => { setStatus({ type: "error", message: e.message }); load(); });
  }

  function onSaved() {
    setEditing(null);
    setStatus({ type: "success", message: "Formation mise à jour." });
    load();
  }

  return (
    <>
      <PageHead eyebrow="Catalogue" title="Formations" lead="Les programmes proposés par l'École Pizza. Glissez une ligne (poignée ⠿) pour réorganiser l'ordre ; cliquez « Modifier » pour éditer le contenu pédagogique et le niveau." />
      <StatusMessage status={status} />

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Code</th>
              <th>Intitulé</th>
              <th>Jours</th>
              <th>Heures</th>
              <th>Prix</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {programs.map((p, i) => (
              <tr key={p.id}
                className={"drag-row" + (drag === i ? " dragging" : "")}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                onDragEnd={() => setDrag(null)}
              >
                <td className="drag-handle" title="Glisser pour réorganiser">⠿</td>
                <td>
                  <span className="badge n mono" style={{ color: "#fff", background: colorOf(p.code), borderColor: "transparent" }}>{p.code}</span>
                </td>
                <td><b>{p.title}</b></td>
                <td>{p.days}</td>
                <td>{p.hours}</td>
                <td className="mono">{euro(p.price)}</td>
                <td>{p.rs_code ? <Badge tone="b">Certifiante</Badge> : p.hygiene ? <Badge tone="a">Hygiène</Badge> : null}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn sm ghost" onClick={() => setEditing(p)}>✎ Modifier</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <FormationModal
          program={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
      )}
    </>
  );
}

// Champs éditables (miroir des colonnes du tableau fourni).
const FIELDS = [
  "code", "title", "level", "days", "hours", "price",
  "audience", "objective_general", "objectives", "duration_detail", "program_detail",
  "rs_code", "hygiene", "active",
];

function FormationModal({ program, onClose, onSaved, onError }) {
  const [form, setForm] = useState(() => {
    const f = {};
    for (const k of FIELDS) f[k] = program[k] ?? (k === "hygiene" || k === "active" ? 0 : "");
    return f;
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setChk = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked ? 1 : 0 }));

  async function save() {
    if (!String(form.title).trim()) { onError("L'intitulé est requis."); return; }
    setSaving(true);
    try {
      await updateFormation(program.id, form);
      onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>Modifier — <span className="mono" style={{ color: colorOf(program.code) }}>{program.code}</span></h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12 }}>
            <div className="field"><label>Code</label>
              <input className="inp mono" value={form.code} onChange={set("code")} placeholder="NIV1, RS7404…" /></div>
            <div className="field"><label>Titre</label>
              <input className="inp" value={form.title} onChange={set("title")} /></div>
            <div className="field"><label>Niveau (couleur carte)</label>
              <select value={form.level || ""} onChange={set("level")}>
                <option value="">— Non défini —</option>
                {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <div className="field"><label>Durée (jours)</label>
              <input className="inp" type="number" min="0" value={form.days} onChange={set("days")} /></div>
            <div className="field"><label>Nombre d'heures</label>
              <input className="inp" type="number" min="0" value={form.hours} onChange={set("hours")} /></div>
            <div className="field"><label>Montant net (€)</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.price} onChange={set("price")} /></div>
          </div>

          <div className="field"><label>Public</label>
            <textarea className="inp" rows={2} value={form.audience} onChange={set("audience")} /></div>

          <div className="field"><label>Objectif général (ObjectifG)</label>
            <textarea className="inp" rows={3} value={form.objective_general} onChange={set("objective_general")} /></div>

          <div className="field"><label>Objectifs pédagogiques</label>
            <textarea className="inp" rows={8} value={form.objectives} onChange={set("objectives")} /></div>

          <div className="field"><label>Détail des horaires (DuréeDétail)</label>
            <textarea className="inp" rows={4} value={form.duration_detail} onChange={set("duration_detail")} /></div>

          <div className="field"><label>Déroulé (programme jour par jour)</label>
            <textarea className="inp" rows={12} value={form.program_detail} onChange={set("program_detail")} /></div>

          <div className="row2" style={{ alignItems: "center" }}>
            <div className="field"><label>Code RS (certifiante)</label>
              <input className="inp" value={form.rs_code} onChange={set("rs_code")} placeholder="RS7404 (laisser vide sinon)" /></div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", paddingTop: 18 }}>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={!!form.hygiene} onChange={setChk("hygiene")} /> Hygiène
              </label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={!!form.active} onChange={setChk("active")} /> Active
              </label>
            </div>
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Formations;
