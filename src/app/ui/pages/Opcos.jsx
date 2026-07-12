import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { getOpcos, createOpco, updateOpco, deleteOpco } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";

function Opcos() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // opco en édition, ou { _new:true }

  async function load() {
    try { const { data } = await getOpcos(); setItems(data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function onDelete(o) {
    if (!window.confirm(`Supprimer « ${o.name} » du référentiel ?`)) return;
    try { await deleteOpco(o.id); setStatus({ type: "success", message: "OPCO supprimé." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  return (
    <>
      <PageHead
        eyebrow="Configuration"
        title="OPCO / financeurs"
        lead="Référentiel des OPCO et financeurs (coordonnées nationales), utilisé dans les fiches stagiaires et entreprises. Pré-rempli ; à vérifier et compléter."
        actions={<button className="btn primary" onClick={() => setEditing({ _new: true, active: 1, triggers_assiduite: 0 })}>＋ Nouvel OPCO</button>}
      />
      <StatusMessage status={status} />

      <Card title={`OPCO / financeurs (${items.length})`}>
        {items.length === 0 ? (
          <EmptyState icon="€">Aucun OPCO.</EmptyState>
        ) : (
          <div className="tablewrap" style={{ border: "none" }}>
            <table>
              <thead><tr><th>Nom</th><th>Ville</th><th>Contact</th><th>Assiduité</th><th></th></tr></thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} style={{ opacity: o.active ? 1 : 0.5 }}>
                    <td><b>{o.name}</b>{o.code && <span className="mono" style={{ display: "block", fontSize: 11, color: "var(--dim)" }}>{o.code}</span>}</td>
                    <td style={{ fontSize: 13 }}>{[o.zip_code, o.town].filter(Boolean).join(" ") || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>
                      {o.phone || ""}{o.phone && (o.email || o.website) ? " · " : ""}{o.email || o.website || ""}
                    </td>
                    <td>{o.triggers_assiduite ? <Badge tone="a">Attestation</Badge> : <span className="hint">—</span>}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn sm ghost" onClick={() => setEditing({ ...o })}>Éditer</button>{" "}
                      <button className="iconbtn del" title="Supprimer" onClick={() => onDelete(o)}><Icon name="trash" size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <OpcoModal
          opco={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setStatus({ type: "success", message: "OPCO enregistré." }); load(); }}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
      )}
    </>
  );
}

function OpcoModal({ opco, onClose, onSaved, onError }) {
  const isNew = !!opco._new;
  const [f, setF] = useState({
    code: opco.code || "", name: opco.name || "", address: opco.address || "",
    zip_code: opco.zip_code || "", town: opco.town || "", email: opco.email || "",
    phone: opco.phone || "", website: opco.website || "",
    triggers_assiduite: !!opco.triggers_assiduite, active: opco.active == null ? true : !!opco.active,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) { onError("Nom requis."); return; }
    setSaving(true);
    try {
      if (isNew) await createOpco(f); else await updateOpco(opco.id, f);
      onSaved();
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>{isNew ? "Nouvel OPCO" : "Modifier l'OPCO"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button></div>
        <div className="mbody">
          <div className="row2">
            <Field label="Nom" value={f.name} onChange={set("name")} />
            <Field label="Code" value={f.code} onChange={set("code")} />
          </div>
          <Field label="Adresse" value={f.address} onChange={set("address")} />
          <div className="row3">
            <Field label="Code postal" value={f.zip_code} onChange={set("zip_code")} />
            <Field label="Ville" value={f.town} onChange={set("town")} />
            <Field label="Téléphone" value={f.phone} onChange={set("phone")} />
          </div>
          <div className="row2">
            <Field label="Email" type="email" value={f.email} onChange={set("email")} />
            <Field label="Site web" value={f.website} onChange={set("website")} />
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={f.triggers_assiduite} onChange={(e) => setF((p) => ({ ...p, triggers_assiduite: e.target.checked }))} /> Déclenche l'attestation d'assiduité
            </label>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={f.active} onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))} /> Actif
            </label>
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

export default Opcos;
