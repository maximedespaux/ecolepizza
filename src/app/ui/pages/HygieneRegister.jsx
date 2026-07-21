import { useEffect, useMemo, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import HygieneRefPanel from "../components/HygieneRefPanel.jsx";
import TempRound from "../components/TempRound.jsx";
import CleaningChecklist from "../components/CleaningChecklist.jsx";
import { Icon } from "../components/Icon.jsx";
import {
  registerByKey, STATUS_META, EQUIP_TYPES, tempStatus, HUILE_POLAIRES_MAX,
  refroidStatus, remiseStatus, REFROID_TEMP_MAX, REMISE_TEMP_MIN,
  fmtDateTime, fmtDate,
} from "../lib/hygiene.js";
import {
  getHygieneEntries, addHygieneEntry, updateHygieneEntry, deleteHygieneEntry,
  getHygieneEquipment, getHygieneTasks, getHygienePresets, addHygienePreset,
} from "../api/apiClient.js";

// ── Helpers de date pour les <input> ───────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toInputDateTime = (v) => { if (!v) return ""; const d = new Date(v); if (isNaN(d.getTime())) return ""; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toInputDate = (v) => { if (!v) return ""; const d = new Date(v); if (isNaN(d.getTime())) return ""; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Valeur initiale d'un champ (création). On garde TOUT en chaîne : vider un nombre reste possible.
function initialValues(cfg) {
  const v = {};
  for (const f of cfg.fields) {
    if (f.type === "datetime") v[f.name] = nowLocal();
    else if (f.type === "checkbox") v[f.name] = false;
    else if (f.type === "select") v[f.name] = f.default || (f.options?.[0]?.[0] ?? "");
    else v[f.name] = "";
  }
  return v;
}

// Reconstruit les valeurs d'un formulaire à partir d'une entrée existante (édition).
function valuesFromEntry(cfg, e) {
  const v = {};
  for (const f of cfg.fields) {
    const raw = f.name.startsWith("meta:") ? e.meta?.[f.name.slice(5)] : e[f.name];
    if (f.type === "datetime") v[f.name] = toInputDateTime(raw) || nowLocal();
    else if (f.type === "date") v[f.name] = toInputDate(raw);
    else if (f.type === "checkbox") v[f.name] = !!raw;
    else v[f.name] = raw == null ? "" : String(raw);
  }
  return v;
}

// Assemble le payload API depuis les valeurs du formulaire.
function buildPayload(cfg, values, equipList) {
  const entry = { register: cfg.register, meta: {} };
  for (const f of cfg.fields) {
    const val = values[f.name];
    const target = f.name.startsWith("meta:") ? (k) => (entry.meta[k] = f.type === "checkbox" ? !!val : val) : null;
    if (target) target(f.name.slice(5));
    else entry[f.name] = f.type === "checkbox" ? !!val : val;
    if (f.type === "number" && f.name === "value_num" && f.unit) entry.unit = f.unit;
  }
  // Statut : figé (nettoyage), auto (température, huile), ou laissé au champ « status ».
  if (cfg.fixedStatus) entry.status = cfg.fixedStatus;
  else if (cfg.autoStatus === "temperature") {
    const eq = equipList.find((x) => x.id === entry.equipment_id);
    entry.status = tempStatus(entry.value_num, eq);
  } else if (cfg.autoStatus === "oil") {
    const n = Number(String(entry.value_num).replace(",", "."));
    entry.status = entry.value_num !== "" && Number.isFinite(n)
      ? (n <= HUILE_POLAIRES_MAX ? "CONFORME" : "NON_CONFORME")
      : (entry.meta.change ? "CONFORME" : null);
  } else if (cfg.autoStatus === "refroid") {
    entry.status = refroidStatus(entry.value_num, entry.meta.duree_min);
  } else if (cfg.autoStatus === "remise") {
    entry.status = remiseStatus(entry.value_num);
  }
  return entry;
}

export default function HygieneRegister() {
  const { slug } = useParams();
  const cfg = registerByKey(slug);

  const [entries, setEntries] = useState([]);
  const [equip, setEquip] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [presets, setPresets] = useState([]); // fournisseurs + produits fréquents (autocomplétion)
  const [values, setValues] = useState(() => (cfg ? initialValues(cfg) : {}));
  const [editing, setEditing] = useState(null); // id en cours d'édition
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [migration, setMigration] = useState(false);

  const refMode = cfg?.needsEquipment ? "equipment" : cfg?.needsTask ? "task" : null;
  const usesPresets = !!cfg?.fields?.some((f) => f.type === "preset");
  const pickList = useMemo(() => {
    if (!cfg?.needsEquipment) return equip;
    return cfg.equipmentTypes ? equip.filter((e) => cfg.equipmentTypes.includes(e.type)) : equip;
  }, [cfg, equip]);
  const suppliers = useMemo(() => presets.filter((p) => p.kind === "SUPPLIER"), [presets]);
  const products = useMemo(() => presets.filter((p) => p.kind === "PRODUCT"), [presets]);

  const loadEntries = () =>
    getHygieneEntries({ register: cfg.register })
      .then((r) => { setEntries(r.data || []); setMigration(!!r.migration); })
      .catch((e) => setStatus({ type: "error", message: e.message }));
  const loadRefs = () => {
    if (cfg?.needsEquipment) getHygieneEquipment().then((r) => setEquip(r.data || [])).catch(() => {});
    if (cfg?.needsTask) getHygieneTasks().then((r) => setTasks(r.data || [])).catch(() => {});
    if (usesPresets) getHygienePresets().then((r) => setPresets(r.data || [])).catch(() => {});
  };

  useEffect(() => {
    if (!cfg) return;
    setValues(initialValues(cfg));
    setEditing(null);
    setStatus(null);
    setShowRef(false);
    loadEntries();
    loadRefs();
    // eslint-disable-next-line
  }, [slug]);

  if (!cfg) return <Navigate to="/hygiene" replace />;

  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));
  const resetForm = () => { setValues(initialValues(cfg)); setEditing(null); };

  // Saisie d'un champ, avec autofill : choisir un produit connu (préréglage) remplit sa DLC
  // secondaire (+ sa nature) tout seul — le paramétrage tue la question répétée.
  const handleField = (f, v) => {
    setValues((s) => {
      const next = { ...s, [f.name]: v };
      if (f.type === "preset" && f.preset === "PRODUCT" && f.autofillDlc) {
        const p = products.find((x) => x.label.toLowerCase() === String(v).trim().toLowerCase());
        if (p) {
          if (p.dlc_days != null && cfg.fields.some((ff) => ff.name === "due_at")) {
            const d = new Date(); d.setDate(d.getDate() + Number(p.dlc_days));
            next.due_at = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
          if (p.meta?.type && cfg.fields.some((ff) => ff.name === "meta:type")) next["meta:type"] = p.meta.type;
        }
      }
      return next;
    });
  };

  // Aperçu de conformité en direct (température / huile) sous le champ valeur.
  const livePreview = () => {
    if (cfg.autoStatus === "temperature") {
      const eq = pickList.find((x) => x.id === values.equipment_id);
      const st = tempStatus(values.value_num, eq);
      if (!st) return null;
      return st === "CONFORME"
        ? { tone: "ok", text: "Dans la zone — conforme" }
        : { tone: "bad", text: `Hors zone — ${seuilPhrase(eq)}` };
    }
    if (cfg.autoStatus === "oil") {
      const n = Number(String(values.value_num).replace(",", "."));
      if (values.value_num === "" || !Number.isFinite(n)) return null;
      return n <= HUILE_POLAIRES_MAX
        ? { tone: "ok", text: `≤ ${HUILE_POLAIRES_MAX} % — conforme` }
        : { tone: "bad", text: `> ${HUILE_POLAIRES_MAX} % — huile à changer` };
    }
    if (cfg.autoStatus === "refroid") {
      const st = refroidStatus(values.value_num, values["meta:duree_min"]);
      if (!st) return null;
      return st === "CONFORME"
        ? { tone: "ok", text: `≤ ${REFROID_TEMP_MAX} °C en moins de 2 h — conforme` }
        : { tone: "bad", text: "Hors cible — refroidissement trop lent ou trop chaud" };
    }
    if (cfg.autoStatus === "remise") {
      const st = remiseStatus(values.value_num);
      if (!st) return null;
      return st === "CONFORME"
        ? { tone: "ok", text: `≥ ${REMISE_TEMP_MIN} °C — conforme` }
        : { tone: "bad", text: `< ${REMISE_TEMP_MIN} °C — insuffisant` };
    }
    return null;
  };

  function validate() {
    for (const f of cfg.fields) {
      if (f.required && !String(values[f.name] ?? "").trim()) return `« ${f.label} » est requis.`;
    }
    if (cfg.needsEquipment && !values.equipment_id) return "Choisissez un point de contrôle.";
    if (cfg.needsTask && !values.task_id) return "Choisissez une tâche.";
    return null;
  }

  // Apprentissage silencieux : mémorise les nouvelles valeurs saisies dans les champs preset
  // (fournisseur, produit) pour les proposer la prochaine fois. Best-effort — n'échoue jamais.
  async function learnPresets(vals) {
    const jobs = [];
    for (const f of cfg.fields) {
      if (f.type !== "preset") continue;
      const v = String(vals[f.name] ?? "").trim();
      if (!v) continue;
      const list = f.preset === "SUPPLIER" ? suppliers : products;
      if (list.some((p) => p.label.toLowerCase() === v.toLowerCase())) continue;
      jobs.push(addHygienePreset({ kind: f.preset, label: v }));
    }
    if (!jobs.length) return;
    try { await Promise.all(jobs); const r = await getHygienePresets(); setPresets(r.data || []); }
    catch { /* best-effort : l'apprentissage ne doit jamais bloquer une saisie */ }
  }

  async function submit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setStatus({ type: "error", message: err }); return; }
    setBusy(true); setStatus(null);
    try {
      const payload = buildPayload(cfg, values, pickList);
      if (editing) await updateHygieneEntry(editing, payload);
      else await addHygieneEntry(payload);
      if (usesPresets && !editing) learnPresets(values); // sans await : ne ralentit pas l'enregistrement
      resetForm();
      await loadEntries();
      setStatus({ type: "success", message: editing ? "Entrée modifiée." : "Enregistré." });
    } catch (err2) {
      setStatus({ type: "error", message: err2.message });
    } finally { setBusy(false); }
  }

  function startEdit(entry) {
    setEditing(entry.id);
    setValues(valuesFromEntry(cfg, entry));
    setStatus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id) {
    if (!window.confirm("Supprimer cette entrée du registre ?")) return;
    try { await deleteHygieneEntry(id); await loadEntries(); if (editing === id) resetForm(); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  // Bascule ouverte/résolue d'une non-conformité en un tap.
  async function toggleResolved(entry) {
    try {
      await updateHygieneEntry(entry.id, { status: entry.status === "OUVERT" ? "RESOLU" : "OUVERT" });
      await loadEntries();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  // ── Flux éclair ────────────────────────────────────────────────────────────────────────────
  // Saisie groupée des températures : une entrée par relevé, statut calculé, le tout d'un coup.
  async function saveRound(readings) {
    setBusy(true); setStatus(null);
    try {
      await Promise.all(readings.map((r) => {
        const eq = pickList.find((x) => x.id === r.equipment_id);
        return addHygieneEntry({
          register: "TEMPERATURE", equipment_id: r.equipment_id, value_num: r.value_num,
          unit: eq?.unit || "°C", status: tempStatus(r.value_num, eq), occurred_at: new Date().toISOString(),
        });
      }));
      await loadEntries();
      setStatus({ type: "success", message: `${readings.length} relevé${readings.length > 1 ? "s" : ""} enregistré${readings.length > 1 ? "s" : ""}.` });
    } catch (err) { setStatus({ type: "error", message: err.message }); }
    finally { setBusy(false); }
  }

  // Cocher / décocher une tâche de nettoyage du jour.
  async function toggleCleaning(task, isDone, entry) {
    setBusy(true); setStatus(null);
    try {
      if (isDone && entry) await deleteHygieneEntry(entry.id);
      else await addHygieneEntry({ register: "CLEANING", task_id: task.id, status: "FAIT", occurred_at: new Date().toISOString() });
      await loadEntries();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
    finally { setBusy(false); }
  }

  // Tâches déjà cochées aujourd'hui (pour la checklist) + dernier relevé par équipement (tournée).
  const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const doneMap = useMemo(() => {
    const m = {}; const t0 = startOfDay();
    for (const e of entries) if (e.task_id && !m[e.task_id] && new Date(e.occurred_at) >= t0) m[e.task_id] = e;
    return m;
  }, [entries]);
  const lastByEquip = useMemo(() => {
    const m = {};
    for (const e of entries) if (e.equipment_id && m[e.equipment_id] == null && e.value_num != null) m[e.equipment_id] = e.value_num;
    return m;
  }, [entries]);

  // Saisie rapide active ? (sauf en édition d'une entrée précise, et seulement si le référentiel est prêt)
  const showBatch = !editing && cfg.batchMode &&
    (cfg.batchMode === "temperature" ? pickList.length > 0 : tasks.length > 0);

  return (
    <div>
      <PageHead
        eyebrow={<Link to="/hygiene" className="hs-back"><Icon name="chevron-left" size={14} /> Maîtrise sanitaire</Link>}
        title={cfg.title}
        lead={cfg.intro}
      />

      {migration && (
        <div className="status" style={{ background: "var(--amber-bg)", color: "var(--text)" }}>
          Cet outil sera actif dès que la base sera mise à jour (migration 103). Vous pouvez déjà le découvrir.
        </div>
      )}

      {/* Référentiel requis mais vide : on invite à le configurer d'abord. */}
      {refMode && ((cfg.needsEquipment && pickList.length === 0) || (cfg.needsTask && tasks.length === 0)) && !showRef && (
        <Card className="hs-config-cta">
          <div>
            <b>{cfg.needsEquipment ? "Aucun point de contrôle défini." : "Aucune tâche de nettoyage définie."}</b>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {cfg.needsEquipment ? "Ajoutez vos équipements pour commencer à relever." : "Créez votre plan de nettoyage pour commencer à cocher."}
            </p>
          </div>
          <button className="btn primary sm" onClick={() => setShowRef(true)}><Icon name="settings" size={15} /> Configurer</button>
        </Card>
      )}

      {/* Saisie éclair (tournée de températures / checklist nettoyage) ou formulaire classique */}
      {showBatch ? (
        <Card className="hs-form-card" title={nouvLabel(cfg)}
          more={refMode && (
            <button className="btn ghost sm" onClick={() => setShowRef((s) => !s)}>
              <Icon name="settings" size={15} /> {cfg.needsEquipment ? "Points de contrôle" : "Plan de nettoyage"}
            </button>
          )}>
          {cfg.batchMode === "temperature"
            ? <TempRound equipment={pickList} lastByEquip={lastByEquip} busy={busy} onSave={saveRound} />
            : <CleaningChecklist tasks={tasks} doneMap={doneMap} busy={busy} onToggle={toggleCleaning} />}
          <StatusMessage status={status} />
        </Card>
      ) : (
        <Card className="hs-form-card" title={editing ? "Modifier l'entrée" : nouvLabel(cfg)}
          more={editing && <button className="btn ghost sm" onClick={resetForm}><Icon name="x" size={14} /> Annuler</button>}>
          <form onSubmit={submit} className="hs-form">
            {cfg.fields.map((f) => {
              if (f.showIf && !f.showIf(values)) return null;
              return (
                <FieldRenderer key={f.name} f={f} value={values[f.name]} onChange={(v) => handleField(f, v)}
                  equip={pickList} tasks={tasks} suppliers={suppliers} products={products}
                  preview={f.name === "value_num" ? livePreview() : null} />
              );
            })}
            <div className="hs-form-actions">
              {refMode && !editing && (
                <button type="button" className="btn ghost sm" onClick={() => setShowRef((s) => !s)}>
                  <Icon name="settings" size={15} /> {cfg.needsEquipment ? "Points de contrôle" : "Plan de nettoyage"}
                </button>
              )}
              <button type="submit" className="btn primary" disabled={busy}>
                <Icon name={editing ? "check" : "plus"} size={16} /> {editing ? "Enregistrer" : "Ajouter au registre"}
              </button>
            </div>
            <StatusMessage status={status} />
          </form>
        </Card>
      )}

      {/* Panneau référentiel (déroulant) */}
      {showRef && refMode && (
        <Card title={cfg.needsEquipment ? "Mes points de contrôle" : "Mon plan de nettoyage"}
          more={<button className="btn ghost sm" onClick={() => setShowRef(false)}><Icon name="chevron-up" size={14} /> Replier</button>}>
          <HygieneRefPanel mode={refMode} onChanged={loadRefs} />
        </Card>
      )}

      {/* Journal */}
      <Card title="Historique" more={<span className="chip">{entries.length}</span>}>
        {entries.length === 0 ? (
          <EmptyState icon={cfg.icon}>
            <b>Registre vide.</b><br />La première entrée apparaîtra ici.
          </EmptyState>
        ) : (
          <ul className="hs-log">
            {entries.map((e) => (
              <EntryRow key={e.id} cfg={cfg} entry={e}
                onEdit={() => startEdit(e)} onRemove={() => remove(e.id)}
                onToggle={cfg.register === "NONCONF" ? () => toggleResolved(e) : null} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Rendu d'un champ ────────────────────────────────────────────────────────────────────────────
function FieldRenderer({ f, value, onChange, equip, tasks, suppliers = [], products = [], preview }) {
  const label = (
    <label>
      {f.label}{f.optional && <span className="field-opt"> (optionnel)</span>}
    </label>
  );
  let control;
  if (f.type === "preset") {
    // Champ libre AVEC autocomplétion des valeurs déjà enregistrées (fournisseurs / produits).
    const opts = f.preset === "SUPPLIER" ? suppliers : products;
    const listId = `dl-${f.name}`;
    control = (
      <>
        <input className="inp" type="text" list={listId} value={value} autoFocus={f.autofocus}
          placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} />
        <datalist id={listId}>{opts.map((o) => <option key={o.id} value={o.label} />)}</datalist>
      </>
    );
  } else if (f.type === "equipment") {
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choisir —</option>
        {equip.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    );
  } else if (f.type === "task") {
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choisir —</option>
        {tasks.map((x) => <option key={x.id} value={x.id}>{x.zone} — {x.task}</option>)}
      </select>
    );
  } else if (f.type === "select") {
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
  } else if (f.type === "textarea") {
    control = <textarea rows={2} value={value} placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === "checkbox") {
    return (
      <div className="field hs-check">
        <label><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}</label>
      </div>
    );
  } else if (f.type === "number") {
    control = (
      <div className="hs-num">
        <input className="inp" type="number" inputMode="decimal" step={f.step || "any"} value={value}
          autoFocus={f.autofocus} placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} />
        {f.unit && <span className="hs-unit">{f.unit}</span>}
      </div>
    );
  } else if (f.type === "datetime") {
    control = <input className="inp" type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === "date") {
    control = <input className="inp" type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
  } else {
    control = <input className="inp" type="text" value={value} autoFocus={f.autofocus} placeholder={f.placeholder || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className="field">
      {label}
      {control}
      {preview && <div className={`hs-preview ${preview.tone}`}><Icon name={preview.tone === "ok" ? "check-circle" : "alert-triangle"} size={14} /> {preview.text}</div>}
      {f.help && <div className="hs-help">{f.help}</div>}
    </div>
  );
}

// ── Ligne du journal ────────────────────────────────────────────────────────────────────────────
function EntryRow({ cfg, entry, onEdit, onRemove, onToggle }) {
  const sm = entry.status ? STATUS_META[entry.status] : null;
  const val = cfg.value?.(entry);
  const secondary = cfg.secondary?.(entry);
  const badge = cfg.badge?.(entry);
  const dueSoon = entry.due_at && new Date(entry.due_at).getTime() <= Date.now() + 3 * 864e5;
  return (
    <li className="hs-log-row">
      <div className="hs-log-main">
        <div className="hs-log-top">
          <b>{cfg.primary(entry)}</b>
          {val && <span className="hs-log-val">{val}</span>}
          {sm && <span className={`hs-badge ${sm.tone}`}>{sm.label}</span>}
        </div>
        <div className="hs-log-sub">
          <span>{fmtDateTime(entry.occurred_at)}</span>
          {secondary && <span>· {secondary}</span>}
          {badge && <span className={`hs-due ${dueSoon ? "soon" : ""}`}>· {badge}</span>}
        </div>
        {entry.corrective && <div className="hs-log-corr"><Icon name="shield" size={13} /> {entry.corrective}</div>}
        {entry.note && <div className="hs-log-note">{entry.note}</div>}
      </div>
      <div className="hs-log-actions">
        {onToggle && (
          <button className="icon-btn" onClick={onToggle} title={entry.status === "OUVERT" ? "Marquer résolue" : "Rouvrir"} aria-label="Basculer le statut">
            <Icon name={entry.status === "OUVERT" ? "check-circle" : "refresh"} size={16} />
          </button>
        )}
        {cfg.printable && (
          <button className="icon-btn" onClick={() => printLabel(entry)} title="Imprimer l'étiquette" aria-label="Imprimer">
            <Icon name="printer" size={16} />
          </button>
        )}
        <button className="icon-btn" onClick={onEdit} title="Modifier" aria-label="Modifier"><Icon name="pencil" size={15} /></button>
        <button className="icon-btn danger" onClick={onRemove} title="Supprimer" aria-label="Supprimer"><Icon name="trash" size={15} /></button>
      </div>
    </li>
  );
}

function seuilPhrase(eq) {
  if (!eq) return "hors zone";
  const u = eq.unit || "°C";
  if (eq.target_min != null && eq.target_max != null) return `attendu ${fmt(eq.target_min)} à ${fmt(eq.target_max)} ${u}`;
  if (eq.target_max != null) return `attendu ≤ ${fmt(eq.target_max)} ${u}`;
  if (eq.target_min != null) return `attendu ≥ ${fmt(eq.target_min)} ${u}`;
  return "hors zone";
}
const fmt = (n) => { const v = Number(n); return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","); };

// Étiquette imprimable (DLC secondaire). Fenêtre autonome — impression locale, rien n'est envoyé.
function printLabel(e) {
  const w = window.open("", "_blank", "width=420,height=320");
  if (!w) return;
  const nature = { OUVERTURE: "Ouvert le", DECONGELATION: "Décongelé le", FABRICATION: "Fabriqué le" }[e.meta?.type] || "Le";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Étiquette</title>
    <style>
      *{box-sizing:border-box;margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
      body{padding:14px}
      .lab{border:2px solid #111;border-radius:10px;padding:14px 16px;width:100%}
      .p{font-size:22px;font-weight:800;margin-bottom:8px}
      .r{display:flex;justify-content:space-between;font-size:14px;padding:3px 0;border-top:1px dashed #999}
      .dlc{font-size:20px;font-weight:800;color:#c00}
      @media print{body{padding:0}}
    </style></head><body onload="window.print()">
    <div class="lab">
      <div class="p">${esc(e.title || "Produit")}</div>
      <div class="r"><span>${nature}</span><b>${fmtDate(e.occurred_at)}</b></div>
      <div class="r"><span>À consommer avant</span><span class="dlc">${fmtDate(e.due_at)}</span></div>
      ${e.meta?.lot ? `<div class="r"><span>Lot</span><b>${esc(e.meta.lot)}</b></div>` : ""}
    </div></body></html>`);
  w.document.close();
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function nouvLabel(cfg) {
  return {
    TEMPERATURE: "Nouveau relevé", REFROIDISSEMENT: "Nouveau refroidissement", REMISE_TEMP: "Nouvelle remise en température",
    RECEPTION: "Nouvelle réception", CLEANING: "Cocher une tâche",
    LABEL: "Nouvelle étiquette", OIL: "Nouveau contrôle", NONCONF: "Nouvelle non-conformité",
    BIOWASTE: "Nouvelle pesée", EQUIPMENT: "Nouvelle intervention", AUDIT: "Nouvel audit",
  }[cfg.register] || "Nouvelle entrée";
}
