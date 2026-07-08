import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTemplates, saveTemplate, resetTemplate, reorderTemplates } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

const DOC_TYPES = [
  "PROGRAMME", "FICHE_SEMAINE", "TEST_POSITIONNEMENT", "DEVIS", "CONTRAT", "CONVENTION",
  "CONVOCATION", "INVITATION", "DROIT_IMAGE", "EMARGEMENT", "ATTESTATION_HYGIENE",
  "CERTIFICAT_REALISATION", "CGV", "EVALUATION_FINANCEUR", "EVALUATION_MANAGEUR",
];

// Résumé lisible des conditions d'application.
function condLabel(a = {}) {
  const parts = [];
  if (a.financing) parts.push(a.financing === "PROFESSIONNEL" ? "Pro" : "Particulier");
  if (a.rs != null) parts.push(a.rs ? "Certifiante" : "Non certif.");
  if (a.hygiene != null) parts.push(a.hygiene ? "Hygiène" : "Sans hygiène");
  if (a.jours != null) parts.push(`${a.jours} j`);
  return parts.length ? parts.join(" · ") : "Toujours";
}

function Modeles() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // étape en cours d'édition (ou {} pour nouveau)
  const [drag, setDrag] = useState(null);        // index de la ligne déplacée

  async function load() {
    try { const { data } = await getTemplates(); setItems([...data].sort((a, b) => a.sort_order - b.sort_order)); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  // Glisser-déposer : réordonne localement puis persiste l'ordre complet.
  function onDrop(toIdx) {
    if (drag === null || drag === toIdx) { setDrag(null); return; }
    const next = [...items];
    const [moved] = next.splice(drag, 1);
    next.splice(toIdx, 0, moved);
    setItems(next);
    setDrag(null);
    reorderTemplates(next.map((t) => t.slug)).catch((e) => { setStatus({ type: "error", message: e.message }); load(); });
  }

  async function onReset(slug) {
    if (!window.confirm("Vider ce modèle ? Le contenu créé dans l'éditeur sera supprimé.")) return;
    setBusy(slug);
    try { await resetTemplate(slug); setStatus({ type: "success", message: "Modèle vidé." }); await load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setBusy(null); }
  }

  return (
    <>
      <PageHead
        eyebrow="Système"
        title="Modèles & workflow documentaire"
        lead="Composez le jeu de documents de vos dossiers : intitulé, signature, conditions d'application. Glissez une ligne (poignée ⠿) pour changer l'ordre. Cliquez sur « Éditer » pour construire le document dans l'éditeur intégré et y glisser les champs (nom, prix, dates…) qui se remplissent automatiquement."
        actions={<button className="btn primary" onClick={() => setEditing({ _new: true, sort_order: Math.max(0, ...items.map((i) => i.sort_order || 0)) + 10, applies_when: {} })}>＋ Ajouter un document</button>}
      />
      <StatusMessage status={status} />

      <Card title={`Étapes (${items.length})`}>
        <div className="tablewrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Document</th>
                <th>Type</th>
                <th>Signature</th>
                <th>Conditions</th>
                <th>État</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((t, i) => (
                <tr key={t.slug}
                  className={"drag-row" + (drag === i ? " dragging" : "")}
                  style={{ opacity: t.active ? 1 : 0.5 }}
                  draggable
                  onDragStart={() => setDrag(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  onDragEnd={() => setDrag(null)}
                >
                  <td className="drag-handle" title="Glisser pour réordonner">⠿</td>
                  <td>
                    <b>{t.label}</b>
                    <span style={{ display: "block", fontSize: 11, color: "var(--dim)" }} className="mono">{t.slug}{!t.active && " · inactif"}</span>
                  </td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{t.doc_type || "—"}</span></td>
                  <td style={{ fontSize: 12 }}>
                    {t.signable ? <Badge tone="b">Signé</Badge> : <span style={{ color: "var(--dim)" }}>—</span>}
                    {t.stagiaire_sign ? " 👤" : ""}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{condLabel(t.applies_when)}</td>
                  <td>
                    {t.has_body
                      ? <Badge tone="g">Créé</Badge>
                      : <span style={{ color: "var(--dim)", fontSize: 12 }}>à créer</span>}
                  </td>
                  <td>
                    <div className="tpl-actions">
                      <button className="btn sm primary" title="Ouvrir l'éditeur de document"
                        onClick={() => navigate(`/modeles/${t.slug}/editeur`)}>🖋 Éditer</button>
                      <button className="btn sm ghost" title="Réglages de l'étape" onClick={() => setEditing({ ...t })}>✎</button>
                      {t.has_body ? (
                        <button className="btn sm ghost" title="Vider le modèle" disabled={busy === t.slug} onClick={() => onReset(t.slug)}>🗑</button>
                      ) : <span className="slot" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <StepModal
          step={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setStatus({ type: "success", message: "Étape enregistrée." }); load(); }}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
      )}
    </>
  );
}

function StepModal({ step, onClose, onSaved, onError }) {
  const isNew = !!step._new;
  const a = step.applies_when || {};
  const [form, setForm] = useState({
    slug: step.slug || "",
    label: step.label || "",
    doc_type: step.doc_type || "",
    sort_order: step.sort_order ?? 100,
    signable: !!step.signable,
    stagiaire_sign: !!step.stagiaire_sign,
    active: step.active == null ? true : !!step.active,
    financing: a.financing || "",
    rs: a.rs == null ? "" : String(a.rs),
    hygiene: a.hygiene == null ? "" : String(a.hygiene),
    jours: a.jours == null ? "" : String(a.jours),
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const chk = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked }));

  async function save() {
    const slug = isNew ? form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : step.slug;
    if (!slug) { onError("Identifiant (slug) requis."); return; }
    if (!form.label.trim()) { onError("Intitulé requis."); return; }
    const applies_when = {};
    if (form.financing) applies_when.financing = form.financing;
    if (form.rs !== "") applies_when.rs = form.rs === "true";
    if (form.hygiene !== "") applies_when.hygiene = form.hygiene === "true";
    if (form.jours !== "") applies_when.jours = Number(form.jours);
    setSaving(true);
    try {
      await saveTemplate(slug, {
        label: form.label, doc_type: form.doc_type || null, sort_order: Number(form.sort_order) || 100,
        signable: form.signable, stagiaire_sign: form.stagiaire_sign, active: form.active, applies_when,
      });
      onSaved();
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{isNew ? "Nouveau document" : "Modifier l'étape"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          {isNew && (
            <div className="field"><label>Identifiant (slug)</label>
              <input className="inp mono" value={form.slug} onChange={set("slug")} placeholder="ex. attestation-tva" />
            </div>
          )}
          <div className="field"><label>Intitulé</label>
            <input className="inp" value={form.label} onChange={set("label")} placeholder="ex. Attestation de TVA" /></div>
          <div className="field"><label>Type de document</label>
            <input className="inp" list="doctypes" value={form.doc_type} onChange={set("doc_type")} placeholder="DEVIS, CONTRAT…" />
            <datalist id="doctypes">{DOC_TYPES.map((d) => <option key={d} value={d} />)}</datalist>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "6px 0 4px" }}>Conditions d'application</label>
          <div className="row2">
            <div className="field"><label>Financement</label>
              <select value={form.financing} onChange={set("financing")}>
                <option value="">Peu importe</option>
                <option value="PARTICULIER">Particulier</option>
                <option value="PROFESSIONNEL">Professionnel</option>
              </select></div>
            <div className="field"><label>Certifiante (RS)</label>
              <select value={form.rs} onChange={set("rs")}>
                <option value="">Peu importe</option>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select></div>
          </div>
          <div className="row2">
            <div className="field"><label>Hygiène</label>
              <select value={form.hygiene} onChange={set("hygiene")}>
                <option value="">Peu importe</option>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select></div>
            <div className="field"><label>Durée (jours)</label>
              <input className="inp" type="number" value={form.jours} onChange={set("jours")} placeholder="peu importe" /></div>
          </div>

          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={form.signable} onChange={chk("signable")} /> À signer</label>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={form.stagiaire_sign} onChange={chk("stagiaire_sign")} /> Signé par le stagiaire</label>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={form.active} onChange={chk("active")} /> Actif</label>
          </div>
          <p className="sub" style={{ marginTop: 10 }}>Après enregistrement, utilisez « 🖋 Éditer » sur la ligne pour composer le document.</p>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

export default Modeles;
