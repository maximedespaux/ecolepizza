import { useEffect, useMemo, useState } from "react";
import { getFieldSettings, saveFieldSettings } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

const TYPE_LABEL = { text: "Texte", number: "Nombre", bool: "Oui / Non", enum: "Liste" };

// Réglage des champs du dossier utilisables comme conditions (Modeles → Conditions).
// Découverts automatiquement dans la base ; on choisit lesquels activer.
function ChampsDossier() {
  const [fields, setFields] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    try { const { data } = await getFieldSettings(); setFields(data || []); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const setField = (key, patch) =>
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  // Regroupé par table (rubrique), filtré par la recherche.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (f) => !needle || f.label.toLowerCase().includes(needle) || f.column.toLowerCase().includes(needle);
    const by = {};
    for (const f of fields) {
      if (!match(f)) continue;
      (by[f.tableLabel] ||= []).push(f);
    }
    return Object.entries(by);
  }, [fields, q]);

  const enabledCount = fields.filter((f) => f.enabled).length;

  async function save() {
    setSaving(true);
    try {
      await saveFieldSettings(fields.map((f) => ({
        table: f.table, column: f.column, enabled: f.enabled, label: f.label || null,
      })));
      setStatus({ type: "success", message: "Champs enregistrés." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <>
      <PageHead
        eyebrow="Configuration"
        title="Champs du dossier"
        lead="Choisissez les informations du dossier (stagiaire, formation, inscription…) utilisables comme conditions. Cochez un champ pour le rendre disponible dans Modèles de documents → Conditions. Vous pouvez renommer l'intitulé affiché."
        actions={<button className="btn primary" disabled={saving} onClick={save}>Enregistrer</button>}
      />
      <StatusMessage status={status} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 12px" }}>
        <input className="inp" style={{ maxWidth: 320 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un champ…" />
        <span className="hint">{enabledCount} champ(s) activé(s) sur {fields.length}</span>
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
                    <td>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={f.enabled} onChange={(e) => setField(f.key, { enabled: e.target.checked })} />
                      </label>
                    </td>
                    <td>
                      <input className="inp" value={f.label} onChange={(e) => setField(f.key, { label: e.target.value })} />
                    </td>
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

export default ChampsDossier;
