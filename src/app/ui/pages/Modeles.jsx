import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icon.jsx";
import { useNavigate } from "react-router-dom";
import { getTemplates, saveTemplate, deleteTemplate, resetTemplate, duplicateTemplate, renameTemplate, reorderTemplates,
  getConditionCatalog, getConditions, createCondition, updateCondition, deleteCondition, getFieldValues,
  getEquivalences, createEquivalence, updateEquivalence, deleteEquivalence,
  getEmargementTemplates, createEmargementTemplate, updateEmargementTemplate, deleteEmargementTemplate,
  reorderEmargementTemplates } from "../api/apiClient.js";
import { EMARG_DEFAULTS } from "./EmargementEditor.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import FieldSettingsPanel from "../components/FieldSettingsPanel.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import MenuActions from "../components/MenuActions.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

// Types proposés à la saisie. La liste n'est qu'une aide : le champ reste libre, un organisme
// peut définir son propre type. FACTURE / ACOMPTE / AVOIR y figurent désormais — ils
// existaient déjà côté facturation (invoice.type) mais n'étaient proposés nulle part ici,
// donc aucun modèle ne pouvait leur être associé.
const DOC_TYPES = [
  "PROGRAMME", "FICHE_SEMAINE", "TEST_POSITIONNEMENT", "DEVIS", "CONTRAT", "CONVENTION",
  "CONVOCATION", "INVITATION", "DROIT_IMAGE", "EMARGEMENT", "ATTESTATION_HYGIENE",
  "CERTIFICAT_REALISATION", "CGV", "EVALUATION_FINANCEUR", "EVALUATION_MANAGEUR",
  "FACTURE", "ACOMPTE", "AVOIR",
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
  if (c.op === "is_not_empty") return "est renseigné";
  if (c.op === "is_empty") return "est vide";
  const v = Array.isArray(c.value) ? c.value.join(", ") : c.value;
  return `${c.op} ${v ?? ""}`.trim();
}

/* ---- Cellules calculées du tableau des étapes ------------------------------------------
   Elles étaient écrites en fonctions immédiates DANS le rendu — vingt lignes de logique au
   milieu d'une cellule, qu'il fallait dérouler mentalement pour savoir ce que la colonne
   affichait. Nommées et sorties, elles se lisent, et le tableau redevient une liste de
   colonnes. */

/** Une feuille d'émargement n'est pas un document : elle ne se signe ni ne se rédige pareil. */
const estEmarg = (t) => t.kind === "emargement";

const LBL_SIGNATAIRE = { ORG: "Org", STAGIAIRE: "Stagiaire", ENTREPRISE: "Entreprise", EXTERNAL: "Externe" };

/** Qui signe. Pour un émargement, ce sont des PICTOGRAMMES : la liste des présents varie. */
function cellSignature(t) {
  if (estEmarg(t)) {
    return (
      <span title="Stagiaire, et formateur/intervenant si activés" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="user" size={14} />
        {t.config?.show_formateurs ? <Icon name="graduation" size={14} /> : null}
        {t.config?.show_intervenants ? <Icon name="users" size={14} /> : null}
      </span>
    );
  }
  // `signers` est la forme actuelle ; les trois booléens sont l'ancienne, encore en base.
  const roles = Array.isArray(t.signers) ? t.signers
    : [...(t.signable ? ["ORG"] : []), ...(t.stagiaire_sign ? ["STAGIAIRE"] : []), ...(t.company_sign ? ["ENTREPRISE"] : [])];
  if (!roles.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {roles.map((r) => <Badge key={r} tone={r === "ORG" ? "a" : "b"}>{LBL_SIGNATAIRE[r] || r}</Badge>)}
    </span>
  );
}

/** Le document a-t-il un corps ? Un émargement n'en a pas : il a une mise en page. */
function cellEtat(t) {
  if (estEmarg(t)) return <Badge tone="g">Mise en page</Badge>;
  return t.has_body ? <Badge tone="g">Créé</Badge> : <span className="hint">à créer</span>;
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
  const reloadCatalog = () => getConditionCatalog().then((r) => setCatalog(r.data)).catch(() => {});
  useEffect(() => { load(); loadEmarg(); loadConditions(); reloadCatalog(); }, []);

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


  /* Supprime DÉFINITIVEMENT le document, et sans retour possible dans les deux cas : étape
     AJOUTÉE, la ligne est effacée ; étape DU SOCLE (définie en code, donc ineffaçable), elle est
     masquée par un « tombstone » et quitte la liste pour de bon.
     Une bande « rétablir » a été essayée puis retirée : un document supprimé est supprimé, et une
     liste de regrets en pied d'écran ne fait qu'entretenir ce dont on a décidé de se passer.
     Reste « Revenir à l'origine » pour le cas voisin mais distinct : défaire une personnalisation
     sans perdre le document. */
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

  /* REVENIR AU MODÈLE D'ORIGINE. La route existait depuis toujours et aucun écran ne l'ouvrait :
     on pouvait personnaliser un document du socle, jamais défaire. La seule issue offerte était
     « Supprimer définitivement », qui pose un tombstone — le document disparaît au lieu de
     revenir à sa version livrée. Deux gestes très différents derrière un seul bouton.

     Réservé aux documents DU SOCLE (`is_default`) : un modèle créé de toutes pièces n'a pas de
     version d'origine où revenir, et « réinitialiser » y voudrait dire « supprimer ». */
  async function onReset(t) {
    if (!window.confirm(`Revenir à la version d'origine de « ${t.label} » ?\n\n`
      + 'Vos modifications de contenu et de réglages seront perdues. Le document reste dans la '
      + 'liste, c\'est « Supprimer » qui le retire.')) return;
    setBusy(t.slug);
    try {
      await resetTemplate(t.slug);
      setStatus({ type: "success", message: "Modèle revenu à sa version d'origine." });
      await load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setBusy(null); }
  }

  // Duplication d'un modèle de document (nouveau slug, copie du contenu + réglages).
  async function onDuplicate(t) {
    setBusy(t.slug);
    try {
      const r = await duplicateTemplate(t.slug);
      setStatus({ type: "success", message: "Modèle dupliqué." });
      await load();
      if (r?.data?.slug) navigate(`/modeles/${r.data.slug}/editeur`);
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
        // Cinq lignes de mode d'emploi devant un tableau dont chaque geste s'annonce lui-même :
        // la poignée se voit, « Éditer » est écrit sur son bouton. Ne reste que l'ORDRE, qui
        // est la seule chose que ce tableau signifie sans le dire.
        lead="Les documents partent dans l'ordre de cette liste, glissez une ligne pour le changer."
        actions={view === "documents"
          ? <button className="btn primary" onClick={() => setEditing({ _new: true, kind: "document", sort_order: Math.max(0, ...allItems.map((i) => i.sort_order || 0)) + 10, applies_when: {} })}>＋ Ajouter un document</button>
          : null}
      />
      <StatusMessage status={status} />

      <div className="tabs" role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-soft)" }}>
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
        {/* Les trois colonnes calculées le sont maintenant par des FONCTIONS NOMMÉES, hors
            du rendu. Elles étaient des fonctions immédiates de vingt lignes plantées au
            milieu du tableau : c'est ce qui rendait cette conversion risquée, et c'est aussi
            ce qui rendait la cellule illisible. */}
        <DataTable
          rows={allItems}
          rowKey={(t) => keyOf(t)}
          /* Le glisser-déposer est porté par la ligne : en carte, la carte reste déplaçable. */
          rowProps={(t) => ({
            className: "drag-row" + (drag === keyOf(t) ? " dragging" : ""),
            style: { opacity: t.active ? 1 : 0.5 },
            draggable: true,
            onDragStart: () => setDrag(keyOf(t)),
            onDragOver: (e) => e.preventDefault(),
            onDrop: () => onDrop(t),
            onDragEnd: () => setDrag(null),
          })}
          cols={[
            { k: "poignee", t: "", sansCarte: true, th: { width: 30 },
              cell: () => <span className="drag-handle" title="Glisser pour réordonner" aria-hidden="true">⠿</span> },
            { k: "doc", t: "Document", principal: true,
              cell: (t) => (
                <>
                  <b>{t.label}</b>
                  <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }} className="mono">{t.slug}{!t.active && " · inactif"}</span>
                </>
              ) },
            { k: "type", t: "Type",
              cell: (t) => (estEmarg(t) ? <Badge tone="a">Émargement</Badge> : <span className="mono" style={{ fontSize: 12 }}>{t.doc_type || null}</span>) },
            { k: "signature", t: "Signature", td: { fontSize: 12 }, cell: (t) => cellSignature(t) },
            { k: "conditions", t: "Conditions", td: { fontSize: 12, color: "var(--muted)" },
              cell: (t) => condLabel(t.applies_when, condBySlug) || null },
            { k: "etat", t: "État", cell: (t) => cellEtat(t) },
            { k: "actions", t: "", actions: true,
              cell: (t) => (
                /* « Éditer » reste seul en avant : c'est le geste de la page. Réglages,
                   duplication et suppression passent au menu — quatre commandes de même poids
                   sur vingt-deux lignes font quatre-vingt-seize boutons, et l'œil doit relire
                   la série entière à chaque ligne avant de viser. */
                <div className="tpl-actions">
                  <button className="btn sm primary" title={estEmarg(t) ? "Éditer la mise en page" : "Ouvrir l'éditeur de document"}
                    onClick={() => navigate(estEmarg(t) ? `/modeles/emargement/${t.id}` : `/modeles/${t.slug}/editeur`)}>Éditer</button>
                  <MenuActions label={`Autres actions pour ${t.label}`}>
                    <button type="button" onClick={() => setEditing({ ...t })}><Icon name="settings" size={15} /> Réglages</button>
                    {!estEmarg(t) && (
                      <button type="button" disabled={busy === t.slug} onClick={() => onDuplicate(t)}>
                        <Icon name="copy" size={15} /> Dupliquer
                      </button>
                    )}
                    {!estEmarg(t) && t.is_default && (
                      <button type="button" disabled={busy === t.slug} onClick={() => onReset(t)}>
                        <Icon name="history" size={15} /> Revenir à l'origine
                      </button>
                    )}
                    <button type="button" className="danger" disabled={busy === (estEmarg(t) ? t.id : t.slug)}
                      onClick={() => (estEmarg(t) ? onDeleteEmarg(t) : onDelete(t))}>
                      <Icon name="trash" size={15} /> Supprimer
                    </button>
                  </MenuActions>
                </div>
              ) },
          ]}
        />
      </Card>
      )}

      {view === "conditions" && (
        <ConditionsPanel
          conditions={conditions}
          catalog={catalog}
          onChanged={loadConditions}
          onCatalogChanged={reloadCatalog}
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
// Regroupe les champs du dossier par ORIGINE (table), avec un libellé lisible.
const FIELD_GROUPS = [
  ["learner", "Stagiaire"], ["enrollment", "Dossier"], ["training_program", "Formation"],
  ["training_session", "Session"], ["company", "Entreprise"], ["organization", "Organisme"],
  ["virtual", "Calculé"],
];
function groupFields(fields) {
  const byTable = {};
  for (const f of fields) { const t = f.table || "autre"; (byTable[t] = byTable[t] || []).push(f); }
  const out = FIELD_GROUPS.filter(([t]) => byTable[t]).map(([t, label]) => ({ label, items: byTable[t] }));
  // Tables non prévues (au cas où) : ajoutées à la fin sous leur clé.
  for (const t of Object.keys(byTable)) if (!FIELD_GROUPS.some(([k]) => k === t)) out.push({ label: t, items: byTable[t] });
  return out;
}

function ConditionsPanel({ conditions, catalog, onChanged, onCatalogChanged, onStatus }) {
  const fields = catalog.fields || [];
  const operators = catalog.operators || {};
  const fieldGroups = groupFields(fields);
  const [field, setField] = useState("");
  const [op, setOp] = useState("");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState(null); // condition en cours de modification (ou null)
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]); // valeurs existantes pour ce champ
  const formRef = useRef(null);
  const [showFields, setShowFields] = useState(false); // modale « Champs documents »
  const fieldsRef = useRef(null);
  const closeFields = () => { setShowFields(false); onCatalogChanged?.(); };

  const curField = fields.find((f) => f.key === field);
  const ops = curField ? (operators[curField.type] || []) : [];
  const needsValue = op && !["is_true", "is_false", "is_empty", "is_not_empty"].includes(op);

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

  function resetForm() { setEditingId(null); setLabel(""); setField(""); setOp(""); setValue(""); setSuggestions([]); }

  function startEdit(c) {
    setEditingId(c.id);
    setLabel(c.label || "");
    setField(c.field || "");
    const f = fields.find((x) => x.key === c.field);
    setOp(c.op || "");
    setValue(Array.isArray(c.value) ? c.value.join(", ") : (c.value ?? ""));
    setSuggestions([]);
    if (c.field && f && f.type === "text") getFieldValues(c.field).then((r) => setSuggestions(r.data || [])).catch(() => {});
    // Le formulaire est sous le tableau : on l'amène à l'écran pour montrer le remplissage.
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  async function save() {
    if (!label.trim()) { onStatus({ type: "error", message: "Donnez un intitulé à la condition." }); return; }
    if (!field || !op) { onStatus({ type: "error", message: "Choisissez un champ et un opérateur." }); return; }
    setSaving(true);
    try {
      const payload = { label: label.trim(), field, op, value: needsValue ? value : null };
      if (editingId) { await updateCondition(editingId, payload); onStatus({ type: "success", message: "Condition modifiée." }); }
      else { await createCondition(payload); onStatus({ type: "success", message: "Condition créée." }); }
      resetForm();
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
    <Card title={`Conditions personnalisées (${conditions.length})`}
      more={<button className="btn sm ghost" title="Gérer les champs du dossier (jeton / condition)" onClick={() => setShowFields(true)}><Icon name="settings" size={14} /> Champs documents</button>}>
      <p className="hint" style={{ marginTop: 0 }}>
        Créez des conditions basées sur les infos réelles du dossier (stagiaire, formation, financement).
        Elles deviennent cochables sur chaque document (bouton ✎) : un document ne s'applique alors qu'aux dossiers qui les remplissent toutes.
        Un champ doit être activé en <b>Condition</b> dans <b>Champs documents</b> pour apparaître ici.
      </p>

      {showFields && createPortal(
        <div className="overlay" onClick={closeFields}>
          <div className="modal" style={{ maxWidth: 760, width: "92%" }} onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>Champs documents</h3>
              <button className="x" onClick={closeFields} aria-label="Fermer">×</button>
            </div>
            <div className="mbody" style={{ maxHeight: "70vh", overflow: "auto" }}>
              <p className="sub" style={{ margin: "0 0 10px" }}>
                Activez chaque champ du dossier pour son usage : <b>🏷️ Jeton</b> (imprimé dans un document) et/ou <b>🔀 Condition</b> (test « ce document ne s'applique que si… »).
              </p>
              <FieldSettingsPanel ref={fieldsRef} onStatus={onStatus} />
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={closeFields}>Fermer</button>
              <button className="btn primary" onClick={async () => { await fieldsRef.current?.save(); onCatalogChanged?.(); }}>Enregistrer les champs</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {conditions.length > 0 && (
        <DataTable
          rows={conditions}
          rowKey={(c) => c.id}
          cols={[
            { k: "label", t: "Intitulé", principal: true, cell: (c) => <b>{c.label}</b> },
            { k: "field", t: "Champ", td: { fontSize: 12, color: "var(--muted)" }, cell: (c) => fieldLabel(c.field) },
            { k: "regle", t: "Règle", td: { fontSize: 12 }, cell: (c) => <span className="mono">{condValueLabel(c)}</span> },
            { k: "actions", t: "", actions: true,
              cell: (c) => (
                <>
                  <button className={"btn sm ghost" + (editingId === c.id ? " primary" : "")} title="Modifier" aria-label={`Modifier ${c.label}`} onClick={() => startEdit(c)}><Icon name="pencil" size={15} /></button>
                  <button className="btn sm ghost danger" title="Supprimer" aria-label={`Supprimer ${c.label}`} onClick={() => remove(c)}><Icon name="trash" size={15} /></button>
                </>
              ) },
          ]}
        />
      )}

      <div ref={formRef} style={editingId ? { border: "1px solid var(--ember1)", borderRadius: 12, padding: 12, background: "var(--surface2)" } : null}>
      {editingId && <p className="hint" style={{ margin: "0 0 8px", color: "var(--ember1)", fontWeight: 700 }}>✎ Modification de « {conditions.find((c) => c.id === editingId)?.label || label} »</p>}
      <div className="row2" style={{ alignItems: "end" }}>
        <div className="field"><label>Intitulé</label>
          <input className="inp" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Stagiaire mineur" /></div>
        <div className="field"><label>Champ du dossier</label>
          <select value={field} onChange={(e) => pickField(e.target.value)}>
            <option value="">Choisir…</option>
            {field && !fields.some((f) => f.key === field) && <option value={field}>{field} (champ désactivé)</option>}
            {fieldGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </optgroup>
            ))}
          </select></div>
      </div>
      <div className="row2" style={{ alignItems: "end" }}>
        <div className="field"><label>Opérateur</label>
          <select value={op} onChange={(e) => setOp(e.target.value)} disabled={!field}>
            {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
        <div className="field"><label>Valeur</label>
          {!needsValue ? (
            <input className="inp" value="" disabled placeholder="-" />
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
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button className="btn primary" disabled={saving} onClick={save}>{editingId ? "Enregistrer la condition" : "＋ Ajouter la condition"}</button>
        {editingId && <button className="btn ghost" disabled={saving} onClick={resetForm}>Annuler</button>}
      </div>
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
    // Nouveau modèle : liste de signataires (repli sur les anciens drapeaux).
    signers: Array.isArray(step.signers) ? step.signers : [
      ...(step.signable ? ["ORG"] : []),
      ...(step.stagiaire_sign ? ["STAGIAIRE"] : []),
      ...(step.company_sign ? ["ENTREPRISE"] : []),
    ],
    company_level: !!step.company_level,
    buyer_audience: step.buyer_audience || "", // "" = tous, "individual", "company" (modèles FACTURE)
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
  const hasSigner = (r) => (form.signers || []).includes(r);
  const toggleSigner = (r) => setForm((p) => ({ ...p, signers: hasSigner(r) ? p.signers.filter((x) => x !== r) : [...(p.signers || []), r] }));

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
        let slug = isNew ? form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : step.slug;
        if (!slug) { onError("Identifiant (slug) requis."); setSaving(false); return; }
        // Renommage d'un modèle EXISTANT (non-socle) : on répercute le slug PARTOUT (parcours,
        // factures, réglages…) avant d'enregistrer sous le nouvel identifiant.
        if (!isNew && !step.is_default) {
          const newSlug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
          if (newSlug && newSlug !== step.slug) {
            const r = await renameTemplate(step.slug, newSlug);
            slug = (r && r.slug) || newSlug;
          }
        }
        await saveTemplate(slug, {
          label: form.label, doc_type: form.doc_type || null, sort_order: Number(form.sort_order) || 100,
          signers: form.signers, company_level: form.company_level,
          buyer_audience: form.buyer_audience || null,
          active: form.active, applies_when,
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
          {/* Identifiant (slug) : saisi à la création, MODIFIABLE ensuite pour un modèle propre à
              l'organisme (ex. nettoyer le « -copie » d'une duplication). Le renommage répercute le
              slug partout où il est référencé. Les modèles du socle ne sont pas renommables. */}
          {!isEmarg && (isNew || !step.is_default) && (
            <div className="field"><label>Identifiant (slug)</label>
              <input className="inp mono" value={form.slug} onChange={set("slug")} placeholder="ex. attestation-tva" />
              {!isNew && (
                <p className="hint" style={{ margin: "4px 0 0", fontSize: 12 }}>
                  Le renommer met à jour toutes les références (parcours, factures, réglages, documents générés).
                </p>
              )}
            </div>
          )}
          {!isEmarg && !isNew && step.is_default && (
            <div className="field"><label>Identifiant (slug)</label>
              <input className="inp mono" value={step.slug} readOnly disabled />
              <p className="hint" style={{ margin: "4px 0 0", fontSize: 12 }}>
                Modèle du socle : identifiant non modifiable. Dupliquez-le pour repartir d'un slug libre.
              </p>
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
            <>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", margin: "10px 0 4px" }}>Signataires requis</label>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 4 }}>
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }} title="L'organisme de formation contresigne automatiquement (en dernier).">
                  <input type="checkbox" checked={hasSigner("ORG")} onChange={() => toggleSigner("ORG")} /> Organisme</label>
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                  <input type="checkbox" checked={hasSigner("STAGIAIRE")} onChange={() => toggleSigner("STAGIAIRE")} /> Stagiaire</label>
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }} title="Le représentant de l'entreprise signe (dossiers financés par une entreprise).">
                  <input type="checkbox" checked={hasSigner("ENTREPRISE")} onChange={() => toggleSigner("ENTREPRISE")} /> 🏢 Entreprise</label>
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }} title="Un signataire externe signe via un lien partageable (tuteur, financeur…).">
                  <input type="checkbox" checked={hasSigner("EXTERNAL")} onChange={() => toggleSigner("EXTERNAL")} /> Externe</label>
              </div>
              <p className="hint" style={{ margin: "0 0 8px" }}>L'<b>organisme signe en dernier</b> (contreseing automatique après les autres parties). Un document est « signé » quand tous ses signataires ont signé.</p>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 4 }}>
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                  <input type="checkbox" checked={form.active} onChange={chk("active")} /> Actif</label>
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }} title="Document produit une seule fois par entreprise + session, qui liste tous les stagiaires du groupe (jeton « Stagiaires »).">
                  <input type="checkbox" checked={form.company_level} onChange={chk("company_level")} /> 🏢 Document entreprise (groupe)</label>
              </div>
            </>
          )}
          {!isEmarg && form.company_level && (
            <p className="hint" style={{ margin: "8px 0 0" }}>
              Généré par <b>entreprise + OPCO + session</b>. Jeton <b>« Stagiaires »</b> = liste ; bloc <code>{"{#Stagiaires}…{/Stagiaires}"}</code> = ligne par stagiaire (palette <b>Groupe entreprise</b>).
            </p>
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
  const [editId, setEditId] = useState(null); // équivalence en cours de modification

  async function load() {
    try { const { data } = await getEquivalences(); setEquivalences(data.equivalences || []); setDocs(data.docs || []); }
    catch (e) { onStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const toggle = (slug) => setPicked((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));
  const startEdit = (e) => { setEditId(e.id); setPicked(e.members || []); setLabel(e.label || ""); };
  const cancelEdit = () => { setEditId(null); setPicked([]); setLabel(""); };

  async function create() {
    if (picked.length < 2) { onStatus({ type: "error", message: "Sélectionnez au moins deux documents." }); return; }
    setSaving(true);
    try {
      if (editId) await updateEquivalence(editId, { label: label.trim() || null, members: picked });
      else await createEquivalence({ label: label.trim() || null, members: picked });
      setPicked([]); setLabel(""); setEditId(null);
      onStatus({ type: "success", message: editId ? "Équivalence modifiée." : "Équivalence créée." });
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
        <DataTable
          rows={equivalences}
          rowKey={(e) => e.key}
          cols={[
            { k: "label", t: "Intitulé", principal: true,
              cell: (e) => <><b>{e.label}</b>{e.is_default && <span className="hint" style={{ marginLeft: 6 }}>défaut</span>}</> },
            { k: "membres", t: "Documents (OU)", td: { fontSize: 12, color: "var(--muted)" },
              cell: (e) => (e.memberLabels || e.members).join(" / ") },
            { k: "actions", t: "", actions: true,
              cell: (e) => (e.is_default ? null : (
                <>
                  <button type="button" className="btn sm ghost" title="Modifier (ajouter / retirer des variantes)" aria-label={`Modifier ${e.label}`} onClick={() => startEdit(e)}><Icon name="settings" size={15} /></button>
                  <button type="button" className="btn sm ghost danger" title="Supprimer" aria-label={`Supprimer ${e.label}`} onClick={() => remove(e)}><Icon name="trash" size={15} /></button>
                </>
              )) },
          ]}
        />
      )}

      <div className="field"><label>{editId ? "Modifier l'équivalence" : "Nouvelle équivalence"}, cochez les documents alternatifs (« OU », autant que vous voulez)</label>
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
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn primary" disabled={saving || picked.length < 2} onClick={create}>{editId ? "Enregistrer" : "＋ Créer l'équivalence"}</button>
          {editId && <button type="button" className="btn ghost" disabled={saving} onClick={cancelEdit}>Annuler</button>}
        </div>
      </div>
    </Card>
  );
}

export default Modeles;
