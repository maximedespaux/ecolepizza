import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useNavigate } from "react-router-dom";
import { getTemplates, saveTemplate, resetTemplate, deleteTemplate, reorderTemplates,
  getConditionCatalog, getConditions, createCondition, deleteCondition, getFieldValues,
  getEquivalences, createEquivalence, deleteEquivalence,
  getEmargementTemplates, createEmargementTemplate, updateEmargementTemplate, deleteEmargementTemplate,
  reorderEmargementTemplates } from "../api/apiClient.js";
import { EMARG_DEFAULTS } from "./EmargementEditor.jsx";
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
  const [emargItems, setEmargItems] = useState([]); // modèles de feuille d'émargement
  const [view, setView] = useState("documents");      // onglet : "documents" | "conditions"
  const condBySlug = Object.fromEntries(conditions.map((c) => [c.slug, c]));

  async function load() {
    try { const { data } = await getTemplates(); setItems([...data].sort((a, b) => a.sort_order - b.sort_order)); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function loadEmarg() {
    try {
      const { data } = await getEmargementTemplates();
      setEmargItems((data || []).map((t) => ({
        ...t, kind: "emargement", doc_type: "EMARGEMENT", label: t.name,
        signable: true, stagiaire_sign: true, has_body: true, applies_when: t.applies_when || {},
      })));
    } catch { /* table peut-être absente (migration) */ }
  }
  async function loadConditions() {
    try { const { data } = await getConditions(); setConditions(data || []); } catch { /* silencieux */ }
  }
  useEffect(() => { load(); loadEmarg(); loadConditions(); getConditionCatalog().then((r) => setCatalog(r.data)).catch(() => {}); }, []);

  // Liste affichée : documents classiques + modèles d'émargement, triés par ordre.
  const allItems = [...items.map((t) => ({ ...t, kind: t.kind || "document" })), ...emargItems]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Clé unique d'une ligne (documents + émargement mélangés).
  const keyOf = (t) => (t.kind === "emargement" ? `e:${t.id}` : `d:${t.slug}`);

  // Glisser-déposer sur la liste fusionnée : réordonne globalement et persiste
  // le sort_order des deux types (documents + feuilles d'émargement).
  function onDrop(target) {
    if (!drag || keyOf(target) === drag) { setDrag(null); return; }
    const ordered = [...allItems];
    const from = ordered.findIndex((t) => keyOf(t) === drag);
    const to = ordered.findIndex((t) => keyOf(t) === keyOf(target));
    if (from < 0 || to < 0) { setDrag(null); return; }
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    const withOrder = ordered.map((t, i) => ({ ...t, sort_order: (i + 1) * 10 }));
    // Applique le nouvel ordre localement (allItems se recalcule via items/emargItems).
    setItems((prev) => prev.map((d) => { const u = withOrder.find((x) => x.kind !== "emargement" && x.slug === d.slug); return u ? { ...d, sort_order: u.sort_order } : d; }));
    setEmargItems((prev) => prev.map((e) => { const u = withOrder.find((x) => x.kind === "emargement" && x.id === e.id); return u ? { ...e, sort_order: u.sort_order } : e; }));
    setDrag(null);
    const docOrders = withOrder.filter((t) => t.kind !== "emargement").map((t) => ({ slug: t.slug, sort_order: t.sort_order }));
    const emargOrders = withOrder.filter((t) => t.kind === "emargement").map((t) => ({ id: t.id, sort_order: t.sort_order }));
    Promise.all([
      docOrders.length ? reorderTemplates(docOrders) : null,
      emargOrders.length ? reorderEmargementTemplates(emargOrders) : null,
    ]).catch((e) => { setStatus({ type: "error", message: e.message }); load(); loadEmarg(); });
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

  // Suppression d'un modèle de feuille d'émargement.
  async function onDeleteEmarg(t) {
    if (!window.confirm(`Supprimer le modèle de feuille d'émargement « ${t.name} » ?\nIl sera retiré des parcours qui l'utilisent.`)) return;
    setBusy(t.id);
    try {
      await deleteEmargementTemplate(t.id);
      setStatus({ type: "success", message: "Feuille d'émargement supprimée." });
      await loadEmarg();
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
          ? <button className="btn primary" onClick={() => setEditing({ _new: true, kind: "document", sort_order: Math.max(0, ...allItems.map((i) => i.sort_order || 0)) + 10, applies_when: {} })}>＋ Ajouter un document</button>
          : null}
      />
      <StatusMessage status={status} />

      <div className="tabs" role="tablist" style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border-soft)" }}>
        <button type="button" role="tab" className={"tab" + (view === "documents" ? " on" : "")} onClick={() => setView("documents")}>
          Documents ({allItems.length})
        </button>
        <button type="button" role="tab" className={"tab" + (view === "conditions" ? " on" : "")} onClick={() => setView("conditions")}>
          Conditions ({conditions.length})
        </button>
        <button type="button" role="tab" className={"tab" + (view === "equivalences" ? " on" : "")} onClick={() => setView("equivalences")}>
          Équivalences
        </button>
      </div>

      {view === "documents" && (
      <Card title={`Étapes (${allItems.length})`}>
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
              {allItems.map((t) => {
                const isEmarg = t.kind === "emargement";
                return (
                <tr key={keyOf(t)}
                  className={"drag-row" + (drag === keyOf(t) ? " dragging" : "")}
                  style={{ opacity: t.active ? 1 : 0.5 }}
                  draggable
                  onDragStart={() => setDrag(keyOf(t))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(t)}
                  onDragEnd={() => setDrag(null)}
                >
                  <td className="drag-handle" title="Glisser pour réordonner">⠿</td>
                  <td>
                    <b>{t.label}</b>
                    <span style={{ display: "block", fontSize: 11, color: "var(--dim)" }} className="mono">{t.slug}{!t.active && " · inactif"}</span>
                  </td>
                  <td>{isEmarg ? <Badge tone="a">Émargement</Badge> : <span className="mono" style={{ fontSize: 12 }}>{t.doc_type || "—"}</span>}</td>
                  <td style={{ fontSize: 12 }}>
                    {isEmarg
                      ? <span title="Stagiaire, et formateur/intervenant si activés">👤{t.config?.show_formateurs ? " 🧑‍🏫" : ""}{t.config?.show_intervenants ? " 👥" : ""}</span>
                      : <>{t.signable ? <Badge tone="b">Signé</Badge> : <span style={{ color: "var(--dim)" }}>—</span>}{t.stagiaire_sign ? " 👤" : ""}</>}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{condLabel(t.applies_when, condBySlug)}</td>
                  <td>
                    {isEmarg
                      ? <Badge tone="g">Mise en page</Badge>
                      : (t.has_body ? <Badge tone="g">Créé</Badge> : <span style={{ color: "var(--dim)", fontSize: 12 }}>à créer</span>)}
                  </td>
                  <td>
                    <div className="tpl-actions">
                      <button className="btn sm primary" title={isEmarg ? "Éditer la mise en page" : "Ouvrir l'éditeur de document"}
                        onClick={() => navigate(isEmarg ? `/modeles/emargement/${t.id}` : `/modeles/${t.slug}/editeur`)}>Éditer</button>
                      <button className="btn sm ghost" title="Réglages" onClick={() => setEditing({ ...t })}><Icon name="settings" size={15} /></button>
                      <button className="btn sm ghost danger"
                        title="Supprimer définitivement"
                        disabled={busy === (isEmarg ? t.id : t.slug)}
                        onClick={() => isEmarg ? onDeleteEmarg(t) : onDelete(t)}><Icon name="trash" size={15} /></button>
                    </div>
                  </td>
                </tr>
                );
              })}
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

      {editing && (
        <StepModal
          step={editing}
          conditions={conditions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setStatus({ type: "success", message: "Étape enregistrée." }); load(); loadEmarg(); }}
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
                  <td><button className="btn sm ghost danger" title="Supprimer" onClick={() => remove(c)}><Icon name="trash" size={15} /></button></td>
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
  const [kind, setKind] = useState(step.kind || "document"); // "document" | "emargement"
  const isEmarg = kind === "emargement";
  const [form, setForm] = useState({
    slug: step.slug || "",
    label: step.label || step.name || "",
    doc_type: step.doc_type || "",
    sort_order: step.sort_order ?? 100,
    signable: !!step.signable,
    stagiaire_sign: !!step.stagiaire_sign,
    sign_formateur: !!(step.config && step.config.show_formateurs),
    sign_intervenant: !!(step.config && step.config.show_intervenants),
    sign_organization: !!(step.config && step.config.show_organization),
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
    if (!form.label.trim()) { onError("Intitulé requis."); return; }
    const applies_when = {};
    if (form.conditions.length) applies_when.conditions = form.conditions;
    setSaving(true);
    try {
      if (isEmarg) {
        // La mise en page détaillée s'édite ensuite via « Éditer ». Ici : nom, conditions, signataires, actif.
        const baseCfg = step.config || EMARG_DEFAULTS;
        const config = { ...baseCfg, show_formateurs: form.sign_formateur, show_intervenants: form.sign_intervenant, show_organization: form.sign_organization };
        if (isNew) await createEmargementTemplate({ name: form.label, applies_when, config });
        else await updateEmargementTemplate(step.id, { name: form.label, applies_when, active: form.active, config });
      } else {
        const slug = isNew ? form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : step.slug;
        if (!slug) { onError("Identifiant (slug) requis."); setSaving(false); return; }
        await saveTemplate(slug, {
          label: form.label, doc_type: form.doc_type || null, sort_order: Number(form.sort_order) || 100,
          signable: form.signable, stagiaire_sign: form.stagiaire_sign, active: form.active, applies_when,
        });
      }
      onSaved();
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{isNew ? "Nouveau document" : (isEmarg ? "Réglages de la feuille d'émargement" : "Modifier l'étape")}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          {isNew && (
            <div className="field"><label>Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="document">Document</option>
                <option value="emargement">Feuille d'émargement</option>
              </select>
            </div>
          )}
          {isNew && !isEmarg && (
            <div className="field"><label>Identifiant (slug)</label>
              <input className="inp mono" value={form.slug} onChange={set("slug")} placeholder="ex. attestation-tva" />
            </div>
          )}
          <div className="field"><label>Intitulé</label>
            <input className="inp" value={form.label} onChange={set("label")} placeholder={isEmarg ? "ex. Feuille d'émargement 5 jours" : "ex. Attestation de TVA"} /></div>
          {!isEmarg && (
            <div className="field"><label>Type de document</label>
              <input className="inp" list="doctypes" value={form.doc_type} onChange={set("doc_type")} placeholder="DEVIS, CONTRAT…" />
              <datalist id="doctypes">{DOC_TYPES.map((d) => <option key={d} value={d} />)}</datalist>
            </div>
          )}

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

          {isEmarg ? (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14, opacity: 0.7 }}>
                <input type="checkbox" checked readOnly /> Signé par le stagiaire</label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={form.sign_formateur} onChange={chk("sign_formateur")} /> Signé par le(s) formateur(s)</label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={form.sign_intervenant} onChange={chk("sign_intervenant")} /> Signé par le(s) intervenant(s) externe(s)</label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={form.sign_organization} onChange={chk("sign_organization")} /> Signé par l'organisme</label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={form.active} onChange={chk("active")} /> Actif</label>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={form.signable} onChange={chk("signable")} /> À signer</label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={form.stagiaire_sign} onChange={chk("stagiaire_sign")} /> Signé par le stagiaire</label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={form.active} onChange={chk("active")} /> Actif</label>
            </div>
          )}
          <p className="sub" style={{ marginTop: 10 }}>
            {isEmarg
              ? "Après enregistrement, utilisez « Éditer » sur la ligne pour la mise en page (orientation, colonnes, logo…)."
              : "Après enregistrement, utilisez « Éditer » sur la ligne pour composer le document."}
          </p>
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
                  <td>{!e.is_default && <button type="button" className="btn sm ghost danger" onClick={() => remove(e)}><Icon name="trash" size={15} /></button>}</td>
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

export default Modeles;
