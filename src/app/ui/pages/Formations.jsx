import { useEffect, useRef, useState } from "react";
import { getFormations, createFormation, updateFormation, deleteFormation, reorderFormations, getFormationSteps, saveFormationSteps } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { euro, colorOf } from "../lib/format.js";
import { LEVELS, setBadgeColors } from "../lib/levels.js";

function Formations() {
  const [programs, setPrograms] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // formation en cours d'édition
  const [drag, setDrag] = useState(null);        // index de la ligne déplacée

  async function load() {
    try {
      const response = await getFormations();
      setPrograms(response.data);
      // Enregistre les couleurs personnalisées (badges cohérents partout).
      const map = {};
      for (const f of response.data || []) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      setBadgeColors(map);
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

  function onSaved(msg) {
    setEditing(null);
    setStatus({ type: "success", message: msg || "Formation enregistrée." });
    load();
  }

  async function onDelete(p) {
    if (!window.confirm(`Supprimer définitivement la formation « ${p.code} — ${p.title} » ?\nCette action est irréversible.`)) return;
    try {
      await deleteFormation(p.id);
      setStatus({ type: "success", message: "Formation supprimée." });
      load();
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    }
  }

  return (
    <>
      <PageHead eyebrow="Catalogue" title="Formations"
        lead="Les programmes proposés par l'École Pizza. Glissez une ligne (poignée ⠿) pour réorganiser l'ordre ; cliquez « Modifier » pour éditer le contenu pédagogique et le niveau."
        actions={<button className="btn primary" onClick={() => setEditing({ _new: true })}>＋ Nouvelle formation</button>}
      />
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
                  <span className="badge n mono" style={{ color: "#fff", background: p.color || colorOf(p.code), borderColor: "transparent" }}>{p.code}</span>
                </td>
                <td><b>{p.title}</b></td>
                <td>{p.days}</td>
                <td>{p.hours}</td>
                <td className="mono">{euro(p.price)}</td>
                <td>{p.rs_code ? <Badge tone="b">Certifiante</Badge> : p.hygiene ? <Badge tone="a">Hygiène</Badge> : null}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn sm ghost" onClick={() => setEditing(p)}>Modifier</button>{" "}
                  <button className="btn sm ghost danger" title="Supprimer la formation" onClick={() => onDelete(p)}>🗑</button>
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
  "code", "title", "level", "color", "days", "hours", "price",
  "audience", "objective_general", "objectives", "duration_detail", "program_detail",
  "rs_code", "hygiene", "active",
];

function FormationModal({ program, onClose, onSaved, onError }) {
  const isNew = !program.id;
  const [form, setForm] = useState(() => {
    const f = {};
    for (const k of FIELDS) f[k] = program[k] ?? (k === "active" ? 1 : k === "hygiene" ? 0 : "");
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState([]);
  const [tab, setTab] = useState("infos"); // "infos" | "parcours"
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setChk = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked ? 1 : 0 }));
  // Couleur effective du badge + valeur hexadécimale pour le sélecteur natif.
  const effColor = form.color || colorOf(form.code || "");
  const pickerHex = /^#[0-9a-fA-F]{6}$/.test(effColor) ? effColor : "#5b6079";

  useEffect(() => { if (program.id) getFormationSteps(program.id).then((r) => setSteps(r.data || [])).catch(() => {}); }, [program.id]);

  const toggleStep = (slug) => setSteps((ss) => ss.map((s) => (s.slug === slug ? { ...s, active: !s.active } : s)));

  async function save() {
    if (!String(form.code).trim()) { onError("Le code est requis."); return; }
    if (!String(form.title).trim()) { onError("L'intitulé est requis."); return; }
    setSaving(true);
    try {
      if (isNew) {
        await createFormation(form);
        onSaved("Formation créée.");
      } else {
        await updateFormation(program.id, form);
        await saveFormationSteps(program.id, steps.map((s) => ({ slug: s.slug, active: s.active })));
        onSaved("Formation mise à jour.");
      }
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
          <h3>{isNew ? "Nouvelle formation" : <>Modifier — <span className="mono" style={{ color: effColor }}>{program.code}</span></>}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="tabs" role="tablist" style={{ display: "flex", gap: 4, padding: "0 16px", borderBottom: "1px solid var(--border-soft)" }}>
          <button type="button" role="tab" className={"tab" + (tab === "infos" ? " on" : "")} onClick={() => setTab("infos")}>Informations</button>
          {!isNew && (
            <button type="button" role="tab" className={"tab" + (tab === "parcours" ? " on" : "")} onClick={() => setTab("parcours")}>
              Parcours documentaire{steps.length ? ` (${steps.filter((s) => s.active).length}/${steps.length})` : ""}
            </button>
          )}
        </div>
        <div className="mbody">
          <div style={{ display: tab === "infos" ? "block" : "none" }}>
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

          <div className="field">
            <label>Couleur du badge</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input type="color" value={pickerHex} onChange={set("color")}
                style={{ width: 46, height: 34, padding: 2, border: "1px solid var(--border-soft)", borderRadius: 8, cursor: "pointer" }} />
              <span className="badge n mono" style={{ background: effColor, color: "#fff", borderColor: "transparent" }}>{form.code || "CODE"}</span>
              {form.color
                ? <button type="button" className="btn sm ghost" onClick={() => setForm((p) => ({ ...p, color: "" }))}>Auto</button>
                : <span className="sub" style={{ fontSize: 12 }}>Auto (déduite du code / niveau)</span>}
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

          <div style={{ display: tab === "parcours" ? "block" : "none" }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Composez l'enchaînement des documents : <b>＋ Ajouter une étape</b> pour en insérer une, <b>✕</b> pour la retirer. Les variantes d'un même jalon (ex. <b>Devis particulier</b> / <b>Devis entreprise</b>) s'affichent comme un choix « OU » : chaque dossier n'en suit qu'une, selon son financement. Glissez un bloc pour réordonner. Les QCM rattachés sont proposés à l'ajout.
          </p>
          {steps.length === 0 ? (
            <p className="hint">Aucun document candidat.</p>
          ) : (
            <ParcoursFlow steps={steps} onToggle={toggleStep} onReorder={setSteps} />
          )}
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : isNew ? "Créer la formation" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Deux étapes sont des variantes « OU » du même jalon si elles relèvent du même
// type de document et ont des conditions incompatibles (jamais le même dossier).
function exclusiveVariants(a, b) {
  if (a.quiz_id || b.quiz_id) return false;
  if (!a.doc_type || a.doc_type !== b.doc_type) return false;
  const A = a.applies_when || {}, B = b.applies_when || {};
  const c = (k) => A[k] != null && B[k] != null && A[k] !== B[k];
  return c("financing") || c("rs") || c("hygiene") || c("jours");
}
// Regroupe les étapes ordonnées en jalons (chaque jalon = 1 ou plusieurs variantes).
function groupMilestones(steps) {
  const groups = [];
  for (const st of steps) {
    const g = groups.find((grp) => grp.steps.some((v) => exclusiveVariants(v, st)));
    if (g) g.steps.push(st); else groups.push({ steps: [st] });
  }
  return groups;
}
// Étiquette de jour d'un QCM : J2, ou J-3 (avant le début).
function dayTag(day) {
  const d = Number(day);
  if (!Number.isFinite(d)) return "QCM";
  return d < 0 ? `J${d}` : `J${d < 1 ? 1 : d}`;
}
// Petit badge de condition affiché sur une variante.
function stepBadge(s) {
  if (s.doc_type === "QCM" || s.quiz_id) return s.day != null && s.day !== "" ? dayTag(s.day) : "QCM";
  const a = s.applies_when || {};
  if (a.financing) return a.financing === "PROFESSIONNEL" ? "Pro" : "Particulier";
  if (a.rs === true) return "Certifiante";
  if (a.hygiene === true) return "Hygiène";
  if (a.jours != null) return `${a.jours} j`;
  if (s.stagiaire_sign) return "à signer";
  return null;
}

// Vue « parcours » : jalons enchaînés par des flèches, variantes empilées en « OU ».
// Les étapes incluses forment le flux (bouton ✕ pour retirer) ; un bouton
// « ＋ Ajouter une étape » propose les étapes disponibles (retirées).
function ParcoursFlow({ steps, onToggle, onReorder }) {
  const included = steps.filter((s) => s.active);
  const available = steps.filter((s) => !s.active);
  const groups = groupMilestones(included);
  const [gdrag, setGdrag] = useState(null);
  const [adding, setAdding] = useState(false);
  const addRef = useRef(null);

  useEffect(() => {
    if (!adding) return;
    const close = (e) => { if (addRef.current && !addRef.current.contains(e.target)) setAdding(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [adding]);

  function drop(to) {
    if (gdrag === null || gdrag === to) { setGdrag(null); return; }
    const ng = [...groups];
    const [m] = ng.splice(gdrag, 1);
    ng.splice(to, 0, m);
    setGdrag(null);
    onReorder([...ng.flatMap((g) => g.steps), ...available]); // ordre inclus + disponibles conservés
  }

  return (
    <div className="parcours" ref={addRef}>
      <div className="parcours-flow">
        {groups.map((g, i) => (
          <div className="pf-wrap" key={g.steps[0].slug}>
            <div className={"pf-node" + (gdrag === i ? " drag" : "")}
              draggable onDragStart={() => setGdrag(i)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)} onDragEnd={() => setGdrag(null)}>
              <span className="pf-grip" title="Glisser pour réordonner le jalon">⠿</span>
              {g.steps.map((s, j) => (
                <div key={s.slug}>
                  {j > 0 && <div className="pf-or">OU</div>}
                  <div className="pf-opt">
                    <span className="pf-label">{s.label}</span>
                    {stepBadge(s) && <span className="pf-badge">{stepBadge(s)}</span>}
                    <button type="button" className="pf-x" title="Retirer cette étape" onClick={() => onToggle(s.slug)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <span className="pf-arrow" aria-hidden="true">→</span>
          </div>
        ))}
        <button type="button" className={"pf-add" + (adding ? " on" : "")} onClick={() => setAdding((a) => !a)}>
          ＋ Ajouter une étape
        </button>
      </div>

      {/* Panneau des étapes disponibles (dans le flux : pas de débordement/clipping) */}
      {adding && (
        <div className="pf-add-panel">
          <div className="pf-add-title">Étapes disponibles</div>
          {available.length === 0 ? (
            <div className="pf-add-empty">Toutes les étapes disponibles sont déjà dans le parcours.</div>
          ) : (
            <div className="pf-add-grid">
              {available.map((s) => (
                <button type="button" key={s.slug} className="pf-add-item" onClick={() => { onToggle(s.slug); setAdding(false); }}>
                  <span className="pf-label">{s.label}</span>
                  {stepBadge(s) && <span className="pf-badge">{stepBadge(s)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Formations;
