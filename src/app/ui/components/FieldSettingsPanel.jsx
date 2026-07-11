import { useEffect, useMemo, useState } from "react";
import { getFieldSettings, saveFieldSettings } from "../api/apiClient.js";
import Card from "./Card.jsx";
import StatusMessage from "./StatusMessage.jsx";

const TYPE_LABEL = { text: "Texte", number: "Nombre", bool: "Oui / Non", enum: "Liste" };

// Gestion des champs du dossier (découverts en base) : activer/renommer.
// Réutilisé par la page dédiée et par l'éditeur de document (« Champs documents »).
export default function FieldSettingsPanel({ onStatus }) {
  const [fields, setFields] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const report = (s) => { setStatus(s); onStatus?.(s); };

  async function load() {
    try { const { data } = await getFieldSettings(); setFields(data || []); }
    catch (e) { report({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const setField = (key, patch) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (f) => !needle || f.label.toLowerCase().includes(needle) || f.column.toLowerCase().includes(needle);
    const by = {};
    for (const f of fields) { if (!match(f)) continue; (by[f.tableLabel] ||= []).push(f); }
    return Object.entries(by);
  }, [fields, q]);

  const enabledCount = fields.filter((f) => f.enabled).length;

  async function save() {
    setSaving(true);
    try {
      await saveFieldSettings(fields.map((f) => ({ table: f.table, column: f.column, enabled: f.enabled, label: f.label || null })));
      report({ type: "success", message: "Champs enregistrés." });
    } catch (e) { report({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <>
      {!onStatus && <StatusMessage status={status} />}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 12px" }}>
        <input className="inp" style={{ maxWidth: 320 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un champ…" />
        <span className="hint">{enabledCount} champ(s) activé(s) sur {fields.length}</span>
        <button className="btn primary" style={{ marginLeft: "auto" }} disabled={saving} onClick={save}>{saving ? "…" : "Enregistrer"}</button>
      </div>

      {groups.map(([tableLabel, list]) => (
        <Card key={tableLabel} title={tableLabel}>
          <div className="tablewrap" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Activé</th>
                  <th>Intitulé affiché</th>
                  <th>Colonne</th>
                  <th style={{ width: 110 }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.key} style={{ opacity: f.enabled ? 1 : 0.6 }}>
                    <td><input type="checkbox" checked={f.enabled} onChange={(e) => setField(f.key, { enabled: e.target.checked })} /></td>
                    <td><input className="inp" value={f.label} onChange={(e) => setField(f.key, { label: e.target.value })} /></td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--dim)" }}>{f.column}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{TYPE_LABEL[f.type] || f.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {fields.length === 0 && (
        <Card><p className="hint">Aucun champ disponible. Vérifiez que la migration des champs du dossier est appliquée.</p></Card>
      )}
    </>
  );
}
