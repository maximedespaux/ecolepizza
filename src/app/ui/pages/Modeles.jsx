import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTemplates, saveTemplate, resetTemplate, deleteTemplate, reorderTemplates,
  getConditionCatalog, getConditions, createCondition, deleteCondition, getFieldValues,
  getEquivalences, createEquivalence, deleteEquivalence,
  getOrganisation, updateOrganisation,
  getEmargementTemplates, createEmargementTemplate, updateEmargementTemplate, deleteEmargementTemplate } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

const DOC_TYPES = [
  "PROGRAMME", "FICHE_SEMAINE", "TEST_POSITIONNEMENT", "DEVIS", "CONTRAT", "CONVENTION",
  "CONVOCATION", "INVITATION", "DROIT_IMAGE", "EMARGEMENT", "ATTESTATION_HYGIENE",
  "CERTIFICAT_REALISATION", "CGV", "EVALUATION_FINANCEUR", "EVALUATION_MANAGEUR",
];

// Résumé lisible des conditions d'application. `condBySlug` = conditions
// personnalisées de l'organisme (slug -> { label }) pour afficher leur intitulé.
function condLabel(a = {}, condBySlug = {}) {
  const parts = [];
  if (a.financing) parts.push(a.financing === "PROFESSIONNEL" ? "Pro" : "Particulier");
  if (a.rs != null) parts.push(a.rs ? "Certifiante" : "Non certif.");
  if (a.hygiene != null) parts.push(a.hygiene ? "Hygiène" : "Sans hygiène");
  if (a.jours != null) parts.push(`${a.jours} j`);
  if (a.agefice != null) parts.push(a.agefice ? "AGEFICE" : "Hors AGEFICE");
  for (const slug of Array.isArray(a.conditions) ? a.conditions : []) {
    parts.push(condBySlug[slug]?.label || slug);
  }
  return parts.length ? parts.join(" · ") : "Toujours";
}

// Valeur lisible d'une condition personnalisée (pour la liste de gestion).
function condValueLabel(c) {
  if (c.op === "is_true") return "= Oui";
  if (c.op === "is_false") return "= Non";
  const v = Array.isArray(c.value) ? c.value.join(", ") : c.value;
  return `${c.op} ${v ?? ""}`.trim();
}

function Modeles() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // étape en cours d'édition (ou {} pour nouveau)
  const [drag, setDrag] = useState(null);        // index de la ligne déplacée
  const [conditions, setConditions] = useState([]);   // conditions personnalisées de l'organisme
  const [catalog, setCatalog] = useState({ fields: [], operators: {} });
  const [view, setView] = useState("documents");      // onglet : "documents" | "conditions"
  const condBySlug = Object.fromEntries(conditions.map((c) => [c.slug, c]));

  async function load() {
    try { const { data } = await getTemplates(); setItems([...data].sort((a, b) => a.sort_order - b.sort_order)); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function loadConditions() {
    try { const { data } = await getConditions(); setConditions(data || []); } catch { /* silencieux */ }
  }
  useEffect(() => { load(); loadConditions(); getConditionCatalog().then((r) => setCatalog(r.data)).catch(() => {}); }, []);

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


  // Supprime DÉFINITIVEMENT le document (étape ajoutée = ligne effacée ;
  // étape du socle = masquée par un « tombstone »). Irréversible.
  async function onDelete(t) {
    const socle = t.is_default
      ? "\n\nCe document fait partie du socle : il sera masqué définitivement (vous pourrez le recréer manuellement)."
      : "";
    if (!window.confirm(`Supprimer DÉFINITIVEMENT le document « ${t.label} » ?\nCette action est irréversible.${socle}`)) return;
    setBusy(t.slug);
    try {
      await deleteTemplate(t.slug);
      setStatus({ type: "success", message: "Document supprimé définitivement." });
      await load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setBusy(null); }
  }

  return (
    <>
      <PageHead
        eyebrow="Système"
        title="Modèles & workflow documentaire"
        lead="Composez le jeu de documents de vos dossiers : intitulé, signature, conditions d'application. Glissez une ligne (poignée ⠿) pour changer l'ordre. Cliquez sur « Éditer » pour construire le document dans l'éditeur intégré et y glisser les champs (nom, prix, dates…) qui se remplissent automatiquement."
        actions={view === "documents"
          ? <button className="btn primary" onClick={() => setEditing({ _new: true, sort_order: Math.max(0, ...items.map((i) => i.sort_order || 0)) + 10, applies_when: {} })}>＋ Ajouter un document</button>
          : null}
      />
      <StatusMessage status={status} />

      <div className="tabs" role="tablist" style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border-soft)" }}>
        <button type="button" role="tab" className={"tab" + (view === "documents" ? " on" : "")} onClick={() => setView("documents")}>
          Documents ({items.length})
        </button>
        <button type="button" role="tab" className={"tab" + (view === "conditions" ? " on" : "")} onClick={() => setView("conditions")}>
          Conditions ({conditions.length})
        </button>
        <button type="button" role="tab" className={"tab" + (view === "equivalences" ? " on" : "")} onClick={() => setView("equivalences")}>
          Équivalences
        </button>
        <button type="button" role="tab" className={"tab" + (view === "emargement" ? " on" : "")} onClick={() => setView("emargement")}>
          Feuilles d'émargement
        </button>
      </div>

      {view === "documents" && (
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
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{condLabel(t.applies_when, condBySlug)}</td>
                  <td>
                    {t.has_body
                      ? <Badge tone="g">Créé</Badge>
                      : <span style={{ color: "var(--dim)", fontSize: 12 }}>à créer</span>}
                  </td>
                  <td>
                    <div className="tpl-actions">
                      <button className="btn sm primary" title="Ouvrir l'éditeur de document"
                        onClick={() => navigate(`/modeles/${t.slug}/editeur`)}>Éditer</button>
                      <button className="btn sm ghost" title="Réglages de l'étape" onClick={() => setEditing({ ...t })}>⚙</button>
                      <button className="btn sm ghost danger"
                        title="Supprimer définitivement"
                        disabled={busy === t.slug}
                        onClick={() => onDelete(t)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {view === "conditions" && (
        <ConditionsPanel
          conditions={conditions}
          catalog={catalog}
          onChanged={loadConditions}
          onStatus={setStatus}
        />
      )}

      {view === "equivalences" && <EquivalencesPanel onStatus={setStatus} />}

      {view === "emargement" && <EmargementConfigPanel onStatus={setStatus} />}

      {editing && (
        <StepModal
          step={editing}
          conditions={conditions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setStatus({ type: "success", message: "Étape enregistrée." }); load(); }}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
      )}
    </>
  );
}

// Espace de gestion des conditions personnalisées : liste + création (champ réel du
// dossier + opérateur + valeur) + suppression.
function ConditionsPanel({ conditions, catalog, onChanged, onStatus }) {
  const fields = catalog.fields || [];
  const operators = catalog.operators || {};
  const [field, setField] = useState("");
  const [op, setOp] = useState("");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]); // valeurs existantes pour ce champ

  const curField = fields.find((f) => f.key === field);
  const ops = curField ? (operators[curField.type] || []) : [];
  const needsValue = op && op !== "is_true" && op !== "is_false";

  function pickField(k) {
    setField(k);
    const f = fields.find((x) => x.key === k);
    const first = (operators[f?.type] || [])[0];
    setOp(first ? first.value : "");
    setValue("");
    setSuggestions([]);
    // Charge les valeurs déjà présentes en base pour proposer une liste.
    if (k && f && f.type === "text") getFieldValues(k).then((r) => setSuggestions(r.data || [])).catch(() => {});
  }

  async function add() {
    if (!label.trim()) { onStatus({ type: "error", message: "Donnez un intitulé à la condition." }); return; }
    if (!field || !op) { onStatus({ type: "error", message: "Choisissez un champ et un opérateur." }); return; }
    setSaving(true);
    try {
      await createCondition({ label: label.trim(), field, op, value: needsValue ? value : null });
      setLabel(""); setField(""); setOp(""); setValue("");
      onStatus({ type: "success", message: "Condition créée." });
      onChanged();
    } catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  async function remove(c) {
    if (!window.confirm(`Supprimer la condition « ${c.label} » ? Les documents qui l'utilisent redeviendront sans cette condition.`)) return;
    try { await deleteCondition(c.id); onStatus({ type: "success", message: "Condition supprimée." }); onChanged(); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }

  const fieldLabel = (k) => fields.find((f) => f.key === k)?.label || k;

  return (
    <Card title={`Conditions personnalisées (${conditions.length})`}>
      <p className="hint" style={{ marginTop: 0 }}>
        Créez des conditions basées sur les infos réelles du dossier (stagiaire, formation, financement).
        Elles deviennent cochables sur chaque document (bouton ✎) : un document ne s'applique alors qu'aux dossiers qui les remplissent toutes.
      </p>

      {conditions.length > 0 && (
        <div className="tablewrap" style={{ border: "none", marginBottom: 12 }}>
          <table>
            <thead><tr><th>Intitulé</th><th>Champ</th><th>Règle</th><th></th></tr></thead>
            <tbody>
              {conditions.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.label}</b></td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{fieldLabel(c.field)}</td>
                  <td style={{ fontSize: 12 }} className="mono">{condValueLabel(c)}</td>
                  <td><button className="btn sm ghost danger" title="Supprimer" onClick={() => remove(c)}>🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row2" style={{ alignItems: "end" }}>
        <div className="field"><label>Intitulé</label>
          <input className="inp" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Stagiaire mineur" /></div>
        <div className="field"><label>Champ du dossier</label>
          <select value={field} onChange={(e) => pickField(e.target.value)}>
            <option value="">Choisir…</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select></div>
      </div>
      <div className="row2" style={{ alignItems: "end" }}>
        <div className="field"><label>Opérateur</label>
          <select value={op} onChange={(e) => setOp(e.target.value)} disabled={!field}>
            {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
        <div className="field"><label>Valeur</label>
          {!needsValue ? (
            <input className="inp" value="" disabled placeholder="—" />
          ) : curField?.type === "enum" ? (
            <select value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Choisir…</option>
              {(curField.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : curField?.type === "text" ? (
            <>
              <input className="inp" list="cond-values" value={value} onChange={(e) => setValue(e.target.value)}
                placeholder={op === "in" ? "valeurs séparées par des virgules" : (suggestions.length ? "choisir ou saisir…" : "")} />
              <datalist id="cond-values">{suggestions.map((v) => <option key={v} value={v} />)}</datalist>
            </>
          ) : (
            <input className="inp" type="number" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={op === "in" ? "valeurs séparées par des virgules" : ""} />
          )}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={saving} onClick={add}>＋ Ajouter la condition</button>
      </div>
    </Card>
  );
}

function StepModal({ step, conditions = [], onClose, onSaved, onError }) {
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
    conditions: Array.isArray(a.conditions) ? a.conditions : [],
  });
  const toggleCond = (slug) => setForm((p) => ({
    ...p,
    conditions: p.conditions.includes(slug) ? p.conditions.filter((s) => s !== slug) : [...p.conditions, slug],
  }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const chk = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked }));

  async function save() {
    const slug = isNew ? form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : step.slug;
    if (!slug) { onError("Identifiant (slug) requis."); return; }
    if (!form.label.trim()) { onError("Intitulé requis."); return; }
    const applies_when = {};
    if (form.conditions.length) applies_when.conditions = form.conditions;
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

          {conditions.length > 0 ? (
            <>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "10px 0 4px" }}>
                Conditions personnalisées
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {conditions.map((c) => (
                  <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                    <input type="checkbox" checked={form.conditions.includes(c.slug)} onChange={() => toggleCond(c.slug)} />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="hint" style={{ margin: "4px 0 0" }}>
                Cochez uniquement les conditions <b>requises</b> (elles doivent toutes être remplies). Une condition <b>non cochée est ignorée</b> :
                le document s'applique quelle que soit sa valeur (ex. cocher « Financeur Particulier » sans cocher « Hygiène » = Particulier, avec ou sans hygiène).
              </p>
            </>
          ) : (
            <p className="hint" style={{ margin: "6px 0 0" }}>
              Aucune condition définie. Créez des conditions dans l'onglet « Conditions » pour restreindre l'application de ce document.
            </p>
          )}

          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={form.signable} onChange={chk("signable")} /> À signer</label>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={form.stagiaire_sign} onChange={chk("stagiaire_sign")} /> Signé par le stagiaire</label>
            <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={form.active} onChange={chk("active")} /> Actif</label>
          </div>
          <p className="sub" style={{ marginTop: 10 }}>Après enregistrement, utilisez « Éditer » sur la ligne pour composer le document.</p>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

// Équivalences : ensembles de documents alternatifs (« OU »), choisis par condition.
function EquivalencesPanel({ onStatus }) {
  const [equivalences, setEquivalences] = useState([]);
  const [docs, setDocs] = useState([]);
  const [picked, setPicked] = useState([]);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try { const { data } = await getEquivalences(); setEquivalences(data.equivalences || []); setDocs(data.docs || []); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const toggle = (slug) => setPicked((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));

  async function create() {
    if (picked.length < 2) { onStatus({ type: "error", message: "Sélectionnez au moins deux documents." }); return; }
    setSaving(true);
    try {
      await createEquivalence({ label: label.trim() || null, members: picked });
      setPicked([]); setLabel("");
      onStatus({ type: "success", message: "Équivalence créée." });
      load();
    } catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }
  async function remove(e) {
    if (!window.confirm(`Supprimer l'équivalence « ${e.label} » ?`)) return;
    try { await deleteEquivalence(e.id); onStatus({ type: "success", message: "Équivalence supprimée." }); load(); }
    catch (err) { onStatus({ type: "error", message: err.message }); }
  }

  return (
    <Card title={`Équivalences (${equivalences.length})`}>
      <p className="hint" style={{ marginTop: 0 }}>
        Regroupez des documents <b>alternatifs</b> (« OU ») : à un même point, un dossier n'en reçoit qu'un, choisi selon la <b>condition</b>
        propre de chaque document (Financement, RS, Hygiène…). Les documents d'une équivalence doivent avoir des conditions différentes.
      </p>

      {equivalences.length > 0 && (
        <div className="tablewrap" style={{ border: "none", marginBottom: 12 }}>
          <table>
            <thead><tr><th>Intitulé</th><th>Documents (OU)</th><th></th></tr></thead>
            <tbody>
              {equivalences.map((e) => (
                <tr key={e.key}>
                  <td><b>{e.label}</b>{e.is_default && <span className="hint" style={{ marginLeft: 6 }}>défaut</span>}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{(e.memberLabels || e.members).join(" / ")}</td>
                  <td>{!e.is_default && <button type="button" className="btn sm ghost danger" onClick={() => remove(e)}>🗑</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="field"><label>Nouvelle équivalence — cochez les documents alternatifs</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {docs.length === 0 ? <span className="hint">Aucun document.</span> : docs.map((d) => (
            <label key={d.slug} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, border: "1px solid var(--border-soft)", borderRadius: 8, padding: "5px 9px", cursor: "pointer" }}>
              <input type="checkbox" checked={picked.includes(d.slug)} onChange={() => toggle(d.slug)} /> {d.label}
            </label>
          ))}
        </div>
      </div>
      <div className="row2" style={{ alignItems: "end" }}>
        <div className="field"><label>Intitulé (optionnel)</label>
          <input className="inp" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Contrat / Convention" /></div>
        <div><button type="button" className="btn primary" disabled={saving || picked.length < 2} onClick={create}>＋ Créer l'équivalence</button></div>
      </div>
    </Card>
  );
}

// Config par défaut (miroir de DEFAULT_EMARG_CONFIG côté serveur).
const EMARG_DEFAULTS = {
  orientation: "landscape", title: "Feuille d'émargement", accent: "#c0392b", show_logo: false,
  show_duration: true, show_horaires: true, show_lieu: true, header_note: "",
  slots: ["MATIN", "APRES_MIDI", "EXAMEN", "DISTANCIEL"],
  show_formateurs: true, show_intervenants: true, density: "normal", sig_height: 30, margin_mm: 10,
  footer_left: "", footer_caption: "Signature et cachet de l'organisme de formation", show_stamp: true,
};
const SLOT_ORDER = ["MATIN", "APRES_MIDI", "EXAMEN", "DISTANCIEL"];
const SLOT_LABEL = { MATIN: "Matin", APRES_MIDI: "Après-midi", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };
const DENSITY_PX = { compact: { base: 8.5, name: 8.5, sub: 7.5, row: 30 }, normal: { base: 9, name: 9.5, sub: 8, row: 38 }, large: { base: 10.5, name: 11, sub: 9, row: 46 } };

// Onglet « Feuilles d'émargement » : gestion de plusieurs modèles + aperçu live.
function EmargementConfigPanel({ onStatus }) {
  const [templates, setTemplates] = useState([]);
  const [selId, setSelId] = useState(null);
  const [org, setOrg] = useState({ legal_name: "Organisme de formation", town: "Ville", address: "", zip_code: "", logo_image: null });
  const [cfg, setCfg] = useState(EMARG_DEFAULTS);
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadOrg() {
    return getOrganisation().then((r) => {
      const d = r.data || {};
      setOrg({ legal_name: d.legal_name || "Organisme de formation", town: d.town || "Ville", address: d.address || "", zip_code: d.zip_code || "", logo_image: d.logo_image || null });
    }).catch(() => {});
  }
  function loadTemplates(keepSel) {
    return getEmargementTemplates().then((r) => {
      const list = r.data || [];
      setTemplates(list);
      const keep = keepSel && list.find((t) => t.id === keepSel);
      const sel = keep || list[0];
      if (sel) selectTemplate(sel);
      else { setSelId(null); }
    }).catch((e) => onStatus({ type: "error", message: e.message }));
  }
  function selectTemplate(t) {
    setSelId(t.id); setName(t.name); setCfg({ ...EMARG_DEFAULTS, ...(t.config || {}) }); setDirty(false);
  }
  useEffect(() => { loadOrg(); loadTemplates(); }, []);

  const set = (k) => (e) => { setCfg((p) => ({ ...p, [k]: e.target.value })); setDirty(true); };
  const setChk = (k) => (e) => { setCfg((p) => ({ ...p, [k]: e.target.checked })); setDirty(true); };
  const toggleSlot = (s) => { setCfg((p) => ({ ...p, slots: SLOT_ORDER.filter((x) => x === s ? !p.slots.includes(s) : p.slots.includes(x)) })); setDirty(true); };

  async function createNew() {
    const nm = window.prompt("Nom du modèle d'émargement :", "Nouvelle feuille");
    if (!nm) return;
    setBusy(true);
    try { const r = await createEmargementTemplate({ name: nm, config: EMARG_DEFAULTS }); await loadTemplates(r.data?.id); onStatus({ type: "success", message: "Modèle créé." }); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!selId) return;
    setSaving(true);
    try { await updateEmargementTemplate(selId, { name, config: cfg }); setDirty(false); await loadTemplates(selId);
      onStatus({ type: "success", message: "Modèle enregistré. Ajoutez-le au parcours d'une formation puis régénérez l'émargement." }); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!selId) return;
    if (!window.confirm(`Supprimer le modèle « ${name} » ? Il sera retiré des parcours qui l'utilisent.`)) return;
    setBusy(true);
    try { await deleteEmargementTemplate(selId); onStatus({ type: "success", message: "Modèle supprimé." }); await loadTemplates(); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
    finally { setBusy(false); }
  }
  async function toggleActive(t) {
    try { await updateEmargementTemplate(t.id, { active: !t.active }); await loadTemplates(selId); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }
  // Logo organisme (partagé par tous les modèles) : upload data URL.
  function onLogo(e) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { onStatus({ type: "error", message: "Logo trop lourd (max 1,5 Mo)." }); return; }
    const rd = new FileReader();
    rd.onload = async () => {
      try { await updateOrganisation({ logo_image: rd.result }); setOrg((p) => ({ ...p, logo_image: rd.result })); onStatus({ type: "success", message: "Logo enregistré." }); }
      catch (err) { onStatus({ type: "error", message: err.message }); }
    };
    rd.readAsDataURL(f);
  }
  async function removeLogo() {
    try { await updateOrganisation({ logo_image: "" }); setOrg((p) => ({ ...p, logo_image: null })); }
    catch (err) { onStatus({ type: "error", message: err.message }); }
  }

  const Toggle = ({ k, label }) => (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
      <input type="checkbox" checked={!!cfg[k]} onChange={setChk(k)} /> {label}
    </label>
  );

  return (
    <>
      <Card title={`Modèles d'émargement (${templates.length})`}
        more={<button className="btn sm primary" onClick={createNew} disabled={busy}>＋ Nouveau modèle</button>}>
        {templates.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Aucun modèle. Créez-en un : il deviendra attribuable dans le parcours documentaire d'une formation, comme les autres documents.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {templates.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border-soft)",
                borderRadius: 8, padding: "4px 8px", background: t.id === selId ? "var(--bg-soft, #f3f4f7)" : "transparent" }}>
                <button className="btn sm ghost" style={{ fontWeight: t.id === selId ? 700 : 500 }} onClick={() => selectTemplate(t)}>
                  {t.name}{!t.active ? " (inactif)" : ""}
                </button>
                <label title="Actif" style={{ display: "flex", alignItems: "center" }}>
                  <input type="checkbox" checked={!!t.active} onChange={() => toggleActive(t)} />
                </label>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selId && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start", marginTop: 14 }}>
          <Card title="Mise en page">
            <div className="field"><label>Nom du modèle</label>
              <input className="inp" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></div>

            <div className="field"><label>Orientation</label>
              <select value={cfg.orientation} onChange={set("orientation")}>
                <option value="landscape">Paysage</option>
                <option value="portrait">Portrait</option>
              </select></div>

            <div className="field"><label>Titre</label>
              <input className="inp" value={cfg.title} onChange={set("title")} placeholder="Feuille d'émargement" /></div>

            <div className="field"><label>Couleur d'accent (titre + filet)</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : "#c0392b"} onChange={set("accent")}
                  style={{ width: 46, height: 34, padding: 2, border: "1px solid var(--border-soft)", borderRadius: 8, cursor: "pointer" }} />
                <span className="mono" style={{ fontSize: 12 }}>{cfg.accent}</span>
              </div></div>

            <div className="field"><label>Logo de l'organisme</label>
              <div style={{ display: "grid", gap: 8 }}>
                <Toggle k="show_logo" label="Afficher le logo dans l'en-tête" />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {org.logo_image ? <img src={org.logo_image} alt="logo" style={{ height: 34, maxWidth: 120, objectFit: "contain", border: "1px solid var(--border-soft)", borderRadius: 6, padding: 2 }} /> : <span className="sub" style={{ fontSize: 12 }}>Aucun logo</span>}
                  <label className="btn sm ghost" style={{ cursor: "pointer" }}>
                    {org.logo_image ? "Remplacer" : "Ajouter"} <input type="file" accept="image/*" onChange={onLogo} style={{ display: "none" }} />
                  </label>
                  {org.logo_image ? <button className="btn sm ghost" onClick={removeLogo}>Retirer</button> : null}
                </div>
              </div></div>

            <div className="field"><label>En-tête</label>
              <div style={{ display: "grid", gap: 8 }}>
                <Toggle k="show_duration" label="Afficher la durée (jours · heures)" />
                <Toggle k="show_horaires" label="Afficher les horaires de la formation" />
                <Toggle k="show_lieu" label="Afficher le lieu (adresse organisme)" />
              </div></div>

            <div className="field"><label>Note d'en-tête (optionnel)</label>
              <textarea className="inp" rows={2} value={cfg.header_note} onChange={set("header_note")}
                placeholder="Ligne libre ajoutée sous les infos (ex. mention de financement)…" /></div>

            <div className="field"><label>Colonnes (demi-journées)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {SLOT_ORDER.map((s) => (
                  <label key={s} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
                    <input type="checkbox" checked={cfg.slots.includes(s)} onChange={() => toggleSlot(s)} /> {SLOT_LABEL[s]}
                  </label>
                ))}
              </div></div>

            <div className="field"><label>Lignes de signature</label>
              <div style={{ display: "grid", gap: 8 }}>
                <Toggle k="show_formateurs" label="Ligne(s) formateur(s)" />
                <Toggle k="show_intervenants" label="Ligne(s) intervenant(s) externe(s)" />
              </div></div>

            <div className="row2">
              <div className="field"><label>Densité</label>
                <select value={cfg.density} onChange={set("density")}>
                  <option value="compact">Compacte</option>
                  <option value="normal">Normale</option>
                  <option value="large">Aérée</option>
                </select></div>
              <div className="field"><label>Marge de page : {cfg.margin_mm} mm</label>
                <input type="range" min="4" max="25" value={cfg.margin_mm}
                  onChange={(e) => { setCfg((p) => ({ ...p, margin_mm: parseInt(e.target.value, 10) })); setDirty(true); }} style={{ width: "100%" }} /></div>
            </div>

            <div className="field"><label>Hauteur des signatures : {cfg.sig_height} px</label>
              <input type="range" min="16" max="60" value={cfg.sig_height}
                onChange={(e) => { setCfg((p) => ({ ...p, sig_height: parseInt(e.target.value, 10) })); setDirty(true); }} style={{ width: "100%" }} /></div>

            <div className="field"><label>Pied de page — mention gauche (optionnel)</label>
              <input className="inp" value={cfg.footer_left} onChange={set("footer_left")}
                placeholder="Par défaut : « Fait à {ville}, le {date} »" /></div>

            <div className="field"><label>Pied de page — légende du cachet</label>
              <input className="inp" value={cfg.footer_caption} onChange={set("footer_caption")}
                placeholder="Signature et cachet de l'organisme de formation" /></div>

            <div className="field">
              <Toggle k="show_stamp" label="Intégrer la signature/cachet enregistré(e) de l'organisme" />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button className="btn primary" onClick={save} disabled={saving || !dirty}>{saving ? "…" : "Enregistrer"}</button>
              <button className="btn ghost" onClick={() => setCfg((p) => ({ ...EMARG_DEFAULTS, slots: [...EMARG_DEFAULTS.slots] }))} disabled={saving}>Réinitialiser la mise en page</button>
              <button className="btn ghost" style={{ marginLeft: "auto", color: "#c0392b" }} onClick={remove} disabled={busy}>Supprimer</button>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              Les colonnes s'adaptent au nombre de jours de la formation. Ce modèle apparaît dans le parcours documentaire d'une formation (onglet Parcours) : ajoutez-le comme un document. Après l'avoir rattaché, cliquez sur « Générer le document » dans l'émargement d'une session.
            </p>
          </Card>

          <Card title="Aperçu">
            <EmargementPreview cfg={cfg} org={org} />
          </Card>
        </div>
      )}
    </>
  );
}

// Aperçu HTML mimant le rendu PDF avec des données d'exemple (orientation, colonnes, densité…).
function EmargementPreview({ cfg, org }) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : "#c0392b";
  const dens = DENSITY_PX[cfg.density] || DENSITY_PX.normal;
  const orgAddr = [org.address, [org.zip_code, org.town].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const today = new Date().toLocaleDateString("fr-FR");

  // Jours d'exemple × demi-journées activées en config.
  const exDays = [{ label: "Lun. 06/07" }, { label: "Mar. 07/07" }];
  const activeSlots = SLOT_ORDER.filter((s) => cfg.slots.includes(s)).filter((s) => s === "MATIN" || s === "APRES_MIDI"); // l'exemple n'a que matin/après-midi
  const shownSlots = activeSlots.length ? activeSlots : ["MATIN"];
  const cols = exDays.flatMap((d) => shownSlots.map((s) => ({ d: d.label, s })));

  const cell = (i, on) => on ? (
    <td key={i} style={{ border: "1px solid #cfd2d8", height: dens.row }}>
      {i % 2 === 0
        ? <span style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive", fontSize: Math.max(11, cfg.sig_height * 0.5), color: "#2b2f45" }}>Signé</span>
        : <span style={{ display: "block", borderBottom: "1px dotted #b9bcc4", width: "70%", margin: `${Math.round(dens.row / 2 - 5)}px auto 0` }} />}
    </td>
  ) : <td key={i} style={{ border: "1px solid #cfd2d8", background: "#f4f4f6" }} />;

  const rows = [{ name: "DESPAUX Guillaume", sub: "Stagiaire", on: () => true }];
  if (cfg.show_formateurs) rows.push({ name: "DESPAUX Jean-Jacques", sub: "Formateur", on: () => true });
  if (cfg.show_intervenants) rows.push({ name: "MARTIN Sophie", sub: "Hygiène (HACCP)", on: (i) => i >= shownSlots.length });

  const maxW = cfg.orientation === "portrait" ? 460 : 720;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ background: "#fff", color: "#1e2140", padding: 16, border: "1px solid var(--border-soft)", borderRadius: 8,
        fontFamily: "'Helvetica Neue',Arial,sans-serif", fontSize: dens.base + 1, maxWidth: maxW, width: "100%" }}>
        <div style={{ position: "relative", borderBottom: `2px solid ${accent}`, paddingBottom: 8, marginBottom: 10 }}>
          {cfg.show_logo && org.logo_image ? <img src={org.logo_image} alt="" style={{ position: "absolute", top: 0, right: 0, maxHeight: 44, maxWidth: 140, objectFit: "contain" }} /> : null}
          <div style={{ fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: accent }}>{cfg.title || "Feuille d'émargement"}</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>{org.legal_name}</div>
          <div style={{ color: "#444", lineHeight: 1.5, marginTop: 3 }}>
            Intitulé de l'action de formation : <b>Pizzaïolo Niveau I</b> (NIV1)<br />
            Date(s) : <b>du 06/07/2026 au 07/07/2026</b> — Semaine 28/2026{cfg.show_duration ? " · Durée : 2 jours · 14 h" : ""}<br />
            {cfg.show_horaires ? <>Horaires : 9h00 – 12h30 / 13h30 – 17h00<br /></> : null}
            {cfg.header_note ? <>{cfg.header_note}<br /></> : null}
            {cfg.show_lieu && orgAddr ? `Lieu : ${orgAddr}` : null}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: 130, textAlign: "left", border: "1px solid #cfd2d8", background: "#f5f3f0", textTransform: "uppercase", fontSize: dens.base, color: "#555", padding: "3px 4px" }}>Nom et prénom</th>
              {exDays.map((d) => (
                <th key={d.label} colSpan={shownSlots.length} style={{ border: "1px solid #cfd2d8", background: "#f5f3f0", textTransform: "uppercase", fontSize: dens.base, color: "#555", padding: "3px 4px" }}>{d.label}</th>
              ))}
            </tr>
            <tr>
              {cols.map((c, i) => (
                <th key={i} style={{ border: "1px solid #cfd2d8", background: "#f5f3f0", fontSize: dens.base, color: "#555", padding: "3px 4px" }}>{SLOT_LABEL[c.s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                <td style={{ border: "1px solid #cfd2d8", textAlign: "left", fontWeight: 600, fontSize: dens.name, padding: "3px 4px" }}>
                  {r.name}<div style={{ fontWeight: 400, fontSize: dens.sub, color: "#8a8f99" }}>{r.sub}</div>
                </td>
                {cols.map((c, i) => r.on(i) ? cell(i, true) : <td key={i} style={{ border: "1px solid #cfd2d8", background: "#f4f4f6" }} />)}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>{cfg.footer_left ? cfg.footer_left : `Fait à ${org.town}, le ${today}`}</div>
          <div style={{ textAlign: "center" }}>
            {cfg.show_stamp ? <div style={{ width: 120, height: 34, border: "1px dashed #cbd0d8", borderRadius: 4, margin: "0 auto 2px", display: "grid", placeItems: "center", color: "#aab", fontSize: 9 }}>cachet</div> : null}
            {cfg.footer_caption ? <div style={{ fontSize: 9, color: "#555" }}>{cfg.footer_caption}</div> : null}
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)" }}>Aperçu {cfg.orientation === "portrait" ? "portrait" : "paysage"} · marge {cfg.margin_mm} mm</div>
      </div>
    </div>
  );
}

export default Modeles;
