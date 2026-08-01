import { useEffect, useState } from "react";
import { getAccessProfiles, createAccessProfile, updateAccessProfile, deleteAccessProfile, upsertSystemRole } from "../api/apiClient.js";
import { GRANTABLE_NAV, EXTRA_ACCESS, PAGE_CAPS, BUILTIN_ROLES, builtinRoleAccess, ROLE_COLORS } from "../lib/nav.js";

const Dot = ({ color }) => <span style={{ width: 12, height: 12, borderRadius: 3, background: color || "#999", display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />;
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";

function AccessRoles() {
  const [roles, setRoles] = useState([]);
  const [sysOverrides, setSysOverrides] = useState({});
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // rôle édité ou { _new:true } / { _system:'CODE' }

  async function load() {
    try { const r = await getAccessProfiles(); setRoles(r.data || []); setSysOverrides(r.systemOverrides || {}); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function onDelete(r) {
    if (!window.confirm(`Supprimer le rôle « ${r.name} » ? (les membres déjà configurés ne changent pas)`)) return;
    try { await deleteAccessProfile(r.id); setStatus({ type: "success", message: "Rôle supprimé." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const pageCount = (nav) => Object.keys(nav || {}).filter((k) => k.startsWith("/")).length;

  return (
    <>
      <PageHead
        eyebrow="Configuration"
        title="Rôles d'accès"
        lead="Créez des rôles réutilisables (ensembles de pages accessibles, en lecture ou modification). Appliquez-les ensuite à un membre depuis Équipe & accès."
        actions={<button className="btn primary" onClick={() => setEditing({ _new: true, name: "", nav_access: {} })}>＋ Nouveau rôle</button>}
      />
      <StatusMessage status={status} />

      <Card title="Rôles système">
        <p className="sub" style={{ marginTop: 0 }}>Rôles intégrés (non modifiables). Cliquez « Dupliquer » pour créer un rôle personnalisé à partir de leur accès.</p>
        <DataTable
          rows={BUILTIN_ROLES}
          rowKey={(b) => b.role}
          cols={[
            { k: "role", t: "Rôle", principal: true,
              cell: (b) => {
                const ov = sysOverrides[b.role];
                const col = (ov && ov.color) || b.color;
                return <><Dot color={col} /><b>{b.name}</b> <Badge tone="n">système</Badge>{ov && <Badge tone="a">personnalisé</Badge>}</>;
              } },
            { k: "pages", t: "Pages accordées",
              cell: (b) => {
                const ov = sysOverrides[b.role];
                const acc = ov ? (ov.nav_access || {}) : builtinRoleAccess(b.role);
                return <Badge tone="b">{Object.keys(acc).length} page(s)</Badge>;
              } },
            { k: "actions", t: "", actions: true, td: { textAlign: "right", whiteSpace: "nowrap" },
              cell: (b) => {
                const ov = sysOverrides[b.role];
                const acc = ov ? (ov.nav_access || {}) : builtinRoleAccess(b.role);
                const col = (ov && ov.color) || b.color;
                return (
                  <>
                    <button className="btn sm ghost" onClick={() => setEditing({ _system: b.role, name: b.name, color: col, nav_access: acc })}>Modifier</button>{" "}
                    <button className="btn sm ghost" onClick={() => setEditing({ _new: true, name: `${b.name} (copie)`, color: col, nav_access: acc })}>Dupliquer</button>
                  </>
                );
              } },
          ]}
        />
      </Card>

      <Card title={`Rôles personnalisés (${roles.length})`}>
        {roles.length === 0 ? (
          <EmptyState icon="team">Aucun rôle personnalisé. Créez-en un ou dupliquez un rôle système.</EmptyState>
        ) : (
          <DataTable
            rows={roles}
            rowKey={(r) => r.id}
            cols={[
              { k: "role", t: "Rôle", principal: true, cell: (r) => <><Dot color={r.color} /><b>{r.name}</b></> },
              { k: "pages", t: "Pages accordées", cell: (r) => <Badge tone="n">{pageCount(r.nav_access)} page(s)</Badge> },
              { k: "actions", t: "", actions: true, td: { textAlign: "right", whiteSpace: "nowrap" },
                cell: (r) => (
                  <>
                    <button className="btn sm ghost" onClick={() => setEditing({ ...r })}>Éditer</button>{" "}
                    <button className="iconbtn del" title="Supprimer" aria-label={`Supprimer le rôle ${r.name}`} onClick={() => onDelete(r)}><Icon name="trash" size={15} /></button>
                  </>
                ) },
            ]}
          />
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
  const isSystem = !!role._system;
  const [name, setName] = useState(role.name || "");
  const [color, setColor] = useState(role.color || ROLE_COLORS[0]);
  const [modes, setModes] = useState({ ...(role.nav_access || {}) });
  const [saving, setSaving] = useState(false);

  const granted = (to) => Object.prototype.hasOwnProperty.call(modes, to);
  // Retirer une page retire SA capacité — même raison que dans Équipe & accès : elle
  // survivrait à l'écran qu'elle sert, et `peutModerer` ne regarde QUE la capacité.
  const toggle = (to) => setModes((p) => {
    const n = { ...p };
    if (granted(to)) { delete n[to]; if (PAGE_CAPS[to]) delete n[PAGE_CAPS[to].cap]; }
    else n[to] = "write";
    return n;
  });
  const setMode = (to, mode) => setModes((p) => ({ ...p, [to]: mode }));

  async function save() {
    if (!isSystem && !name.trim()) { onError("Nom du rôle requis."); return; }
    setSaving(true);
    try {
      if (isSystem) await upsertSystemRole(role._system, { color, nav_access: modes });
      else if (isNew) await createAccessProfile({ name, color, nav_access: modes });
      else await updateAccessProfile(role.id, { name, color, nav_access: modes });
      onSaved();
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>{isSystem ? `Rôle système — ${name}` : isNew ? "Nouveau rôle" : "Modifier le rôle"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button></div>
        <div className="mbody">
          {isSystem ? (
            <p className="sub" style={{ marginTop: 0 }}>Personnalisation du rôle système <b>{name}</b> pour votre organisme (couleur + accès menu par défaut).</p>
          ) : (
            <Field label="Nom du rôle" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Comptable, Assistant…" />
          )}
          <div className="field">
            <label>Couleur</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ROLE_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} title={c}
                  style={{ width: 26, height: 26, borderRadius: 7, background: c, cursor: "pointer",
                    border: color === c ? "3px solid var(--text)" : "2px solid var(--border-soft)" }} />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                style={{ width: 34, height: 30, padding: 0, border: "1px solid var(--border-soft)", borderRadius: 7, background: "none", cursor: "pointer" }} title="Couleur personnalisée" />
            </div>
          </div>
          <p className="sub" style={{ margin: "6px 0 10px" }}>Cochez les pages accessibles, puis <b>Modifier</b> ou <b>Lecture</b>.</p>
          {GRANTABLE_NAV.map((g) => (
            <div key={g.grp} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>{g.grp}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {g.items.map((it) => {
                  const on = granted(it.to);
                  const mode = modes[it.to];
                  // Même règle que dans Équipe & accès : une page peut porter une CAPACITÉ au
                  // lieu d'un mode. Voir `PAGE_CAPS` — le pourquoi y est écrit une seule fois.
                  const pc = PAGE_CAPS[it.to];
                  const capOffice = !!pc && pc.defaultRoles.includes(role._system);
                  const capOn = !!pc && (capOffice || granted(pc.cap));
                  return (
                    <div key={it.to} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, cursor: "pointer" }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(it.to)} />
                        <span style={{ width: 20, display: "inline-grid", placeItems: "center" }}><Icon name={it.ic} size={16} /></span> {it.label}
                      </label>
                      {on && (pc ? (
                        <button type="button" className={"btn sm " + (capOn ? "primary" : "ghost")}
                          disabled={capOffice} onClick={() => toggle(pc.cap)}
                          title={capOffice ? "Accordé d'office à ce rôle." : pc.hint}>
                          <Icon name="shield" size={13} /> {pc.label}{capOn ? " : oui" : " : non"}
                        </button>
                      ) : (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" className={"btn sm " + (mode !== "read" ? "primary" : "ghost")}
                            onClick={() => setMode(it.to, "write")}>Modifier</button>
                          <button type="button" className={"btn sm " + (mode === "read" ? "primary" : "ghost")}
                            onClick={() => setMode(it.to, "read")}>Lecture</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>Accès supplémentaires</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {EXTRA_ACCESS.map((it) => {
                const byDefault = !!it.defaultRoles?.includes(role._system);
                const on = byDefault || granted(it.to);
                return (
                  <label key={it.to} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: byDefault ? "default" : "pointer" }}>
                    <input type="checkbox" checked={on} disabled={byDefault} onChange={() => toggle(it.to)} style={{ marginTop: 3 }} />
                    <span style={{ width: 20, display: "inline-grid", placeItems: "center", marginTop: 1 }}><Icon name={it.ic} size={16} /></span>
                    <span>{it.label}
                      <span className="hint" style={{ display: "block", fontWeight: 400, marginTop: 1 }}>{byDefault ? "Accordé d'office à ce rôle. " : ""}{it.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
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
