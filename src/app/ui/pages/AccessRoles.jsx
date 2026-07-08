import { useEffect, useState } from "react";
import { getAccessProfiles, createAccessProfile, updateAccessProfile, deleteAccessProfile } from "../api/apiClient.js";
import { GRANTABLE_NAV } from "../lib/nav.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";

function AccessRoles() {
  const [roles, setRoles] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // rôle édité ou { _new:true }

  async function load() {
    try { const { data } = await getAccessProfiles(); setRoles(data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function onDelete(r) {
    if (!window.confirm(`Supprimer le rôle « ${r.name} » ? (les membres déjà configurés ne changent pas)`)) return;
    try { await deleteAccessProfile(r.id); setStatus({ type: "success", message: "Rôle supprimé." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const pageCount = (nav) => Object.keys(nav || {}).length;

  return (
    <>
      <PageHead
        eyebrow="Configuration"
        title="Rôles d'accès"
        lead="Créez des rôles réutilisables (ensembles de pages accessibles, en lecture ou modification). Appliquez-les ensuite à un membre depuis Équipe & accès."
        actions={<button className="btn primary" onClick={() => setEditing({ _new: true, name: "", nav_access: {} })}>＋ Nouveau rôle</button>}
      />
      <StatusMessage status={status} />

      <Card title={`Rôles (${roles.length})`}>
        {roles.length === 0 ? (
          <EmptyState icon="👥">Aucun rôle. Créez-en un puis appliquez-le à vos membres.</EmptyState>
        ) : (
          <div className="tablewrap" style={{ border: "none" }}>
            <table>
              <thead><tr><th>Rôle</th><th>Pages accordées</th><th></th></tr></thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name}</b></td>
                    <td><Badge tone="n">{pageCount(r.nav_access)} page(s)</Badge></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn sm ghost" onClick={() => setEditing({ ...r })}>Éditer</button>{" "}
                      <button className="iconbtn del" title="Supprimer" onClick={() => onDelete(r)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <RoleModal role={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setStatus({ type: "success", message: "Rôle enregistré." }); load(); }}
          onError={(m) => setStatus({ type: "error", message: m })} />
      )}
    </>
  );
}

function RoleModal({ role, onClose, onSaved, onError }) {
  const isNew = !!role._new;
  const [name, setName] = useState(role.name || "");
  const [modes, setModes] = useState({ ...(role.nav_access || {}) });
  const [saving, setSaving] = useState(false);

  const granted = (to) => Object.prototype.hasOwnProperty.call(modes, to);
  const toggle = (to) => setModes((p) => { const n = { ...p }; if (granted(to)) delete n[to]; else n[to] = "write"; return n; });
  const setMode = (to, mode) => setModes((p) => ({ ...p, [to]: mode }));

  async function save() {
    if (!name.trim()) { onError("Nom du rôle requis."); return; }
    setSaving(true);
    try {
      if (isNew) await createAccessProfile({ name, nav_access: modes });
      else await updateAccessProfile(role.id, { name, nav_access: modes });
      onSaved();
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>{isNew ? "Nouveau rôle" : "Modifier le rôle"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button></div>
        <div className="mbody">
          <Field label="Nom du rôle" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Comptable, Assistant…" />
          <p className="sub" style={{ margin: "6px 0 10px" }}>Cochez les pages accessibles, puis <b>Modifier</b> ou <b>Lecture</b>.</p>
          {GRANTABLE_NAV.map((g) => (
            <div key={g.grp} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>{g.grp}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {g.items.map((it) => {
                  const on = granted(it.to); const mode = modes[it.to];
                  return (
                    <div key={it.to} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, cursor: "pointer" }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(it.to)} />
                        <span style={{ width: 20, textAlign: "center" }}>{it.ic}</span> {it.label}
                      </label>
                      {on && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" className={"btn sm " + (mode !== "read" ? "primary" : "ghost")} onClick={() => setMode(it.to, "write")}>Modifier</button>
                          <button type="button" className={"btn sm " + (mode === "read" ? "primary" : "ghost")} onClick={() => setMode(it.to, "read")}>Lecture</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

export default AccessRoles;
