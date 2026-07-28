import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { getFormations, createFormation, updateFormation, deleteFormation, reorderFormations, getFormationSteps, saveFormationSteps, getFormation, saveArchiveTree, getEquivalences, createEquivalence, updateEquivalence } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import ArchiveTreeEditor, { treeHasEmptyName, ArchiveTreePreview } from "../components/ArchiveTreeEditor.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import HelpDot from "../components/HelpDot.jsx";
import { euro, colorOf } from "../lib/format.js";
import { setBadgeColors } from "../lib/levels.js";

function Formations() {
  const [programs, setPrograms] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // formation en cours d'édition
  const [drag, setDrag] = useState(null);        // index de la ligne déplacée

  async function load() {
    try {
      const response = await getFormations();
      setPrograms(response.data);
      // Enregistre les couleurs personnalisées (badges cohérents partout).
      const map = {};
      for (const f of response.data || []) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      setBadgeColors(map);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }
  useEffect(() => { load(); }, []);

  // Glisser-déposer : réordonne localement puis persiste.
  function onDrop(toIdx) {
    if (drag === null || drag === toIdx) { setDrag(null); return; }
    const next = [...programs];
    const [moved] = next.splice(drag, 1);
    next.splice(toIdx, 0, moved);
    setPrograms(next);
    setDrag(null);
    reorderFormations(next.map((p) => p.id)).catch((e) => { setStatus({ type: "error", message: e.message }); load(); });
  }

  function onSaved(msg) {
    setEditing(null);
    setStatus({ type: "success", message: msg || "Formation enregistrée." });
    load();
  }

  async function onDelete(p) {
    if (!window.confirm(`Supprimer définitivement la formation « ${p.code} — ${p.title} » ?\nCette action est irréversible.`)) return;
    try {
      await deleteFormation(p.id);
      setStatus({ type: "success", message: "Formation supprimée." });
      load();
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    }
  }

  return (
    <>
      <PageHead eyebrow="Catalogue" title="Formations"
        lead="Les programmes proposés par l'École Pizza. Glissez une ligne (poignée ⠿) pour réorganiser l'ordre ; cliquez « Modifier » pour éditer le contenu pédagogique et le niveau."
        actions={<button className="btn primary" onClick={() => setEditing({ _new: true })}>＋ Nouvelle formation</button>}
      />
      <StatusMessage status={status} />

      <DataTable
        rows={programs}
        rowKey={(p) => p.id}
        /* Le glisser-déposer de réordonnancement est porté par la LIGNE : `rowProps` le rend
           au `<tr>` tel quel. En mode carte la ligne devient une carte — et reste donc
           déplaçable, ce qui est le comportement attendu. */
        rowProps={(p, i) => ({
          className: "drag-row" + (drag === i ? " dragging" : ""),
          draggable: true,
          onDragStart: () => setDrag(i),
          onDragOver: (e) => e.preventDefault(),
          onDrop: () => onDrop(i),
          onDragEnd: () => setDrag(null),
        })}
        vide={<EmptyState icon="graduation" title="Aucune formation"
          text="Crée tes formations : elles servent de base aux sessions, aux dossiers et aux mondes de Pizza Quest." />}
        cols={[
          { k: "poignee", t: "", sansCarte: true, th: { width: 30 },
            cell: () => <span className="drag-handle" title="Glisser pour réorganiser" aria-hidden="true">⠿</span> },
          { k: "code", t: "Code",
            cell: (p) => <span className="badge n mono" style={{ color: "#fff", background: p.color || colorOf(p.code), borderColor: "transparent" }}>{p.code}</span> },
          { k: "title", t: "Intitulé", principal: true, cell: (p) => <b>{p.title}</b> },
          { k: "days", t: "Jours", cell: (p) => p.days },
          { k: "hours", t: "Heures", cell: (p) => p.hours },
          { k: "price", t: "Prix", cell: (p) => <span className="mono">{euro(p.price)}</span> },
          { k: "nature", t: "Nature",
            cell: (p) => (p.rs_code ? <Badge tone="b">Certifiante</Badge> : p.hygiene ? <Badge tone="a">Hygiène</Badge> : null) },
          { k: "actions", t: "", actions: true, td: { textAlign: "right", whiteSpace: "nowrap" },
            cell: (p) => (
              <>
                <button className="btn sm ghost" onClick={() => setEditing(p)}>Modifier</button>{" "}
                <button className="btn sm ghost danger" title="Supprimer la formation" aria-label={`Supprimer ${p.title}`} onClick={() => onDelete(p)}><Icon name="trash" size={15} /></button>
              </>
            ) },
        ]}
      />

      {editing && (
        <FormationModal
          program={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
      )}
    </>
  );
}

// Champs éditables (miroir des colonnes du tableau fourni).
const FIELDS = [
  "code", "title", "level", "color", "days", "hours", "price",
  "audience", "objective_general", "objectives", "duration_detail", "program_detail",
  "horaires", "rs_code", "hygiene", "needs_emargement", "active",
];

function FormationModal({ program, onClose, onSaved, onError }) {
  const isNew = !program.id;
  const [form, setForm] = useState(() => {
    const f = {};
    for (const k of FIELDS) f[k] = program[k] ?? (k === "active" || k === "needs_emargement" ? 1 : k === "hygiene" ? 0 : "");
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState([]);
  const [breakSlug, setBreakSlug] = useState(null); // point d'accès émargement (slug avant la flèche)
  const [companySteps, setCompanySteps] = useState([]); // sous-parcours « arrivée via entreprise » (slugs ordonnés)
  const [companyBreakSlug, setCompanyBreakSlug] = useState(null); // point d'accès émargement du volet entreprise
  const [archiveTree, setArchiveTree] = useState({ folders: [] });
  const [companyArchiveTree, setCompanyArchiveTree] = useState({ folders: [] });
  const [eqMap, setEqMap] = useState(new Map()); // slug -> { group } (équivalences « OU »)
  const [equivs, setEquivs] = useState([]); // liste des équivalences (pour l'ajout de variantes OU)
  const [tab, setTab] = useState("infos"); // "infos" | "parcours" | "archives"
  const [archKind, setArchKind] = useState("stagiaire"); // arborescence : "stagiaire" | "entreprise"
  const [parcoursKind, setParcoursKind] = useState("stagiaire"); // parcours : "stagiaire" | "entreprise"
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setChk = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked ? 1 : 0 }));
  // Couleur effective du badge + valeur hexadécimale pour le sélecteur natif.
  const effColor = form.color || colorOf(form.code || "");
  const pickerHex = /^#[0-9a-fA-F]{6}$/.test(effColor) ? effColor : "#5b6079";

  useEffect(() => { if (program.id) getFormationSteps(program.id).then((r) => setSteps(r.data || [])).catch(() => {}); }, [program.id]);
  // Arborescence d'archivage enregistrée sur la formation.
  useEffect(() => {
    if (!program.id) return;
    getFormation(program.id).then((r) => {
      const parseTree = (raw) => {
        let t = { folders: [] };
        if (raw) { try { t = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { t = { folders: [] }; } }
        return t && t.folders ? t : { folders: [] };
      };
      setArchiveTree(parseTree(r.data?.archive_tree));
      setCompanyArchiveTree(parseTree(r.data?.company_archive_tree));
      if (r.data && r.data.needs_emargement != null) setForm((p) => ({ ...p, needs_emargement: r.data.needs_emargement ? 1 : 0 }));
      // horaires n'est pas renvoyé par la liste (getFormations) : on le charge ici.
      if (r.data && "horaires" in r.data) setForm((p) => ({ ...p, horaires: r.data.horaires || "" }));
      setBreakSlug(r.data?.emargement_break_slug || null);
      // Sous-parcours entreprise (JSON tableau de slugs, ou déjà tableau).
      let cs = r.data?.company_steps;
      if (typeof cs === "string") { try { cs = JSON.parse(cs); } catch { cs = []; } }
      setCompanySteps(Array.isArray(cs) ? cs : []);
      setCompanyBreakSlug(r.data?.company_break_slug || null);
    }).catch(() => {});
  }, [program.id]);
  // Équivalences « OU » (org) : map slug -> groupe + liste des équivalences.
  const reloadEq = () => getEquivalences().then((r) => {
    const list = r.data?.equivalences || [];
    const m = new Map();
    for (const e of list) for (const s of e.members) m.set(s, { group: e.key });
    setEqMap(m); setEquivs(list);
  }).catch(() => {});
  useEffect(() => { reloadEq(); }, []);

  // Ajoute un document comme variante « OU » à un jalon (crée/étend l'équivalence).
  async function addOuVariant(jalonSlugs, addSlug) {
    if (!addSlug || jalonSlugs.includes(addSlug)) return;
    try {
      const g = eqMap.get(jalonSlugs[0]);
      const eq = g ? equivs.find((e) => e.key === g.group) : null;
      if (eq && !eq.is_default && String(eq.id)) {
        const members = [...new Set([...(eq.members || jalonSlugs), addSlug])];
        await updateEquivalence(eq.id, { members });
      } else {
        await createEquivalence({ members: [...new Set([...jalonSlugs, addSlug])] });
      }
      setSteps((ss) => ss.map((s) => (s.slug === addSlug ? { ...s, active: true } : s))); // activer la variante ajoutée
      await reloadEq();
    } catch (e) { onError(e.message); }
  }

  // Activer / retirer une étape (le « OU » est déterminé par les équivalences).
  const toggleStep = (slug) => setSteps((ss) => ss.map((s) => (s.slug === slug ? { ...s, active: !s.active } : s)));

  async function save() {
    if (!String(form.code).trim()) { onError("Le code est requis."); return; }
    if (!String(form.title).trim()) { onError("L'intitulé est requis."); return; }
    if (!isNew && treeHasEmptyName(archiveTree)) {
      setTab("archives"); setArchKind("stagiaire");
      onError("Nommez tous les dossiers de l'arborescence d'archivage stagiaire avant d'enregistrer.");
      return;
    }
    if (!isNew && treeHasEmptyName(companyArchiveTree)) {
      setTab("archives"); setArchKind("entreprise");
      onError("Nommez tous les dossiers de l'arborescence d'archivage entreprise avant d'enregistrer.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await createFormation(form);
        onSaved("Formation créée.");
      } else {
        await updateFormation(program.id, form);
        await saveFormationSteps(program.id, steps.map((s) => ({ slug: s.slug, active: s.active })), breakSlug || null, companySteps, companyBreakSlug || null);
        await saveArchiveTree(program.id, archiveTree, companyArchiveTree).catch(() => {}); // tolère l'absence de migration
        onSaved("Formation mise à jour.");
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{isNew ? "Nouvelle formation" : <>Modifier — <span className="mono" style={{ color: effColor }}>{program.code}</span></>}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="tabs" role="tablist" style={{ display: "flex", gap: 4, padding: "0 16px", borderBottom: "1px solid var(--border-soft)" }}>
          <button type="button" role="tab" className={"tab" + (tab === "infos" ? " on" : "")} onClick={() => setTab("infos")}>Informations</button>
          {!isNew && (
            <button type="button" role="tab" className={"tab" + (tab === "parcours" ? " on" : "")} onClick={() => setTab("parcours")}>
              Parcours documentaire{steps.length ? ` (${steps.filter((s) => s.active).length}/${steps.length})` : ""}
            </button>
          )}
          {!isNew && (
            <button type="button" role="tab" className={"tab" + (tab === "archives" ? " on" : "")} onClick={() => setTab("archives")}>
              Arborescence d'archivage
            </button>
          )}
        </div>
        <div className="mbody">
          <div style={{ display: tab === "infos" ? "block" : "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <div className="field"><label>Code</label>
              <input className="inp mono" value={form.code} onChange={set("code")} placeholder="NIV1, RS7404…" /></div>
            <div className="field"><label>Titre</label>
              <input className="inp" value={form.title} onChange={set("title")} /></div>
          </div>

          <div className="field">
            <label>Couleur du badge</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input type="color" value={pickerHex} onChange={set("color")}
                style={{ width: 46, height: 34, padding: 2, border: "1px solid var(--border-soft)", borderRadius: 8, cursor: "pointer" }} />
              <span className="badge n mono" style={{ background: effColor, color: "#fff", borderColor: "transparent" }}>{form.code || "CODE"}</span>
              {form.color
                ? <button type="button" className="btn sm ghost" onClick={() => setForm((p) => ({ ...p, color: "" }))}>Auto</button>
                : <span className="sub" style={{ fontSize: 12 }}>Auto (déduite du code / niveau)</span>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <div className="field"><label>Durée (jours)</label>
              <input className="inp" type="number" min="0" value={form.days} onChange={set("days")} /></div>
            <div className="field"><label>Nombre d'heures</label>
              <input className="inp" type="number" min="0" value={form.hours} onChange={set("hours")} /></div>
            <div className="field"><label>Montant net (€)</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.price} onChange={set("price")} /></div>
          </div>

          <div className="field"><label>Horaires (affiché sur la feuille d'émargement)<HelpDot text={"Une ligne par horaire — utile si les journées n'ont pas les mêmes horaires.\n\nEx. :\n9h00 – 12h30 / 13h30 – 17h00\nJour 5 : 9h00 – 12h00"} /></label>
            <textarea className="inp" rows={3} value={form.horaires} onChange={set("horaires")} placeholder={"9h00 – 12h30 / 13h30 – 17h00\nJour 5 : 9h00 – 12h00"} /></div>

          <div className="field"><label>Public</label>
            <textarea className="inp" rows={2} value={form.audience} onChange={set("audience")} /></div>

          <div className="field"><label>Objectif général (ObjectifG)</label>
            <textarea className="inp" rows={3} value={form.objective_general} onChange={set("objective_general")} /></div>

          <div className="field"><label>Objectifs pédagogiques</label>
            <textarea className="inp" rows={8} value={form.objectives} onChange={set("objectives")} /></div>

          <div className="field"><label>Détail des horaires (DuréeDétail)</label>
            <textarea className="inp" rows={4} value={form.duration_detail} onChange={set("duration_detail")} /></div>

          <div className="field"><label>Déroulé (programme jour par jour)</label>
            <textarea className="inp" rows={12} value={form.program_detail} onChange={set("program_detail")} /></div>

          <div className="row2" style={{ alignItems: "center" }}>
            <div className="field"><label>Code RS (certifiante)</label>
              <input className="inp" value={form.rs_code} onChange={set("rs_code")} placeholder="RS7404 (laisser vide sinon)" /></div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", paddingTop: 18 }}>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={!!form.hygiene} onChange={setChk("hygiene")} /> Hygiène
              </label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={!!form.needs_emargement} onChange={setChk("needs_emargement")} /> Feuille d'émargement
              </label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={!!form.active} onChange={setChk("active")} /> Active
              </label>
            </div>
          </div>

          </div>

          <div style={{ display: tab === "parcours" ? "block" : "none" }}>
          <div className="seg" style={{ marginBottom: 12 }}>
            <button type="button" className={"seg-btn" + (parcoursKind === "stagiaire" ? " on" : "")} onClick={() => setParcoursKind("stagiaire")}>Parcours du dossier</button>
            <button type="button" className={"seg-btn" + (parcoursKind === "entreprise" ? " on" : "")} onClick={() => setParcoursKind("entreprise")}>À l'arrivée via une entreprise{companySteps.length ? ` (${companySteps.length})` : ""}</button>
          </div>

          {parcoursKind === "stagiaire" ? (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                Enchaînement des documents du dossier · variantes empilées = choix « OU » · <b style={{ color: "var(--ember1)" }}>🚧</b> = accès émargement · 🏢 se gèrent dans l'autre onglet.
              </p>
              {steps.length === 0 ? (
                <p className="hint">Aucun document candidat.</p>
              ) : (
                <ParcoursFlow steps={steps} eqMap={eqMap} onToggle={toggleStep} onReorder={setSteps}
                  breakSlug={breakSlug} onSetBreak={setBreakSlug} onAddOu={addOuVariant} />
              )}
            </>
          ) : (
            <CompanySection steps={steps} value={companySteps} onChange={setCompanySteps} onToggleActive={toggleStep}
              breakSlug={companyBreakSlug} onSetBreak={setCompanyBreakSlug} />
          )}
          </div>

          <div style={{ display: tab === "archives" ? "block" : "none" }}>
            {(() => {
              const isEntArch = archKind === "entreprise";
              const curTree = isEntArch ? companyArchiveTree : archiveTree;
              const setCurTree = isEntArch ? setCompanyArchiveTree : setArchiveTree;
              // Documents attribuables. Les feuilles d'émargement sont DÉJÀ présentes dans
              // `steps` (injectées depuis emargement_template, doc_type EMARGEMENT) : elles
              // apparaissent donc sous leur vrai nom, avec un slug qui existe réellement.
              // Archivage ENTREPRISE : l'inscription passant par une entreprise, tout document
              // signé peut lui être archivé — groupe (🏢) comme stagiaire → parcours actif entier.
              const toDoc = (s) => ({ slug: s.slug, label: s.label, quiz_id: s.quiz_id, company_level: !!s.company_level });
              const docs = isEntArch
                ? steps.filter((s) => s.active).map(toDoc)
                : steps.filter((s) => s.active && !s.company_level).map(toDoc);
              return (
                <>
                  <div className="seg" style={{ marginBottom: 12 }}>
                    <button type="button" className={"seg-btn" + (!isEntArch ? " on" : "")} onClick={() => setArchKind("stagiaire")}>Archivage stagiaire</button>
                    <button type="button" className={"seg-btn" + (isEntArch ? " on" : "")} onClick={() => setArchKind("entreprise")}>Archivage entreprise</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
                    <ArchiveTreeEditor tree={curTree} onChange={setCurTree} eqMap={eqMap} docs={docs} />
                    <div style={{ position: "sticky", top: 0, border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, background: "var(--surface3, #faf9f7)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--dim)", marginBottom: 8 }}>Aperçu — {isEntArch ? "entreprise" : "stagiaire"}</div>
                      <ArchiveTreePreview tree={curTree} code={form.code} title={form.title} />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : isNew ? "Créer la formation" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Regroupe les étapes en jalons « OU » d'après les ÉQUIVALENCES (org) : TOUTES les
// étapes d'une même équivalence forment UN SEUL jalon (nombre de variantes illimité),
// même si elles ne se suivent pas — le jalon apparaît à la position de la 1re variante.
// `eqMap` = slug -> { group }.
function groupMilestones(steps, eqMap) {
  const groupOf = (s) => (eqMap && eqMap.get(s.slug) ? eqMap.get(s.slug).group : null);
  const groups = [];
  const byGroup = new Map();
  for (const st of steps) {
    const g = groupOf(st);
    if (g && byGroup.has(g)) { byGroup.get(g).steps.push(st); continue; }
    const obj = { steps: [st] };
    if (g) byGroup.set(g, obj);
    groups.push(obj);
  }
  return groups;
}
// Étiquette de jour d'un QCM : J2, ou J-3 (avant le début).
function dayTag(day) {
  const d = Number(day);
  if (!Number.isFinite(d)) return "QCM";
  return d < 0 ? `J${d}` : `J${d < 1 ? 1 : d}`;
}
// Petit badge de condition affiché sur une variante.
function stepBadge(s) {
  if (s.doc_type === "QCM" || s.quiz_id) return s.day != null && s.day !== "" ? dayTag(s.day) : "QCM";
  const a = s.applies_when || {};
  if (a.financing) return a.financing === "PROFESSIONNEL" ? "Pro" : "Particulier";
  if (a.rs === true) return "Certifiante";
  if (a.hygiene === true) return "Hygiène";
  if (a.jours != null) return `${a.jours} j`;
  // « à signer » dès qu'une PARTIE doit signer (stagiaire, entreprise ou externe).
  const sg = Array.isArray(s.signers) ? s.signers : [];
  if (s.stagiaire_sign || s.company_sign || sg.includes("STAGIAIRE") || sg.includes("ENTREPRISE") || sg.includes("EXTERNAL")) return "à signer";
  return null;
}

// Vue « parcours » : jalons enchaînés par des flèches, variantes empilées en « OU ».
// Les étapes incluses forment le flux (bouton ✕ pour retirer) ; un bouton
// « ＋ Ajouter une étape » propose les étapes disponibles (retirées).
function ParcoursFlow({ steps, eqMap, onToggle, onReorder, breakSlug, onSetBreak, onAddOu }) {
  // Les documents de GROUPE (🏢 company_level) ne font PAS partie du parcours du
  // dossier : ils se gèrent uniquement dans « À l'arrivée via une entreprise ».
  const included = steps.filter((s) => s.active && !s.company_level);
  const available = steps.filter((s) => !s.active && !s.company_level);
  // Tout ce qui n'est pas affiché ici (docs de groupe + étapes inactives) est
  // préservé tel quel lors d'un réordonnancement.
  const rest = steps.filter((s) => !(s.active && !s.company_level));
  const groups = groupMilestones(included, eqMap);
  const [gdrag, setGdrag] = useState(null);
  const [adding, setAdding] = useState(false);
  const [ouFor, setOuFor] = useState(null); // slug de tête du jalon dont le menu « ＋ OU » est ouvert
  const addRef = useRef(null);

  useEffect(() => {
    if (!adding) return;
    const close = (e) => { if (addRef.current && !addRef.current.contains(e.target)) setAdding(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [adding]);

  function drop(to) {
    if (gdrag === null || gdrag === to) { setGdrag(null); return; }
    const ng = [...groups];
    const [m] = ng.splice(gdrag, 1);
    ng.splice(to, 0, m);
    setGdrag(null);
    onReorder([...ng.flatMap((g) => g.steps), ...rest]); // ordre inclus + reste (groupe/inactifs) conservé
  }

  return (
    <div className="parcours compact" ref={addRef}>
      <div className="parcours-flow">
        {groups.map((g, i) => {
          // Slug de rupture porté par ce jalon = dernière étape du groupe.
          const gBreakSlug = g.steps[g.steps.length - 1].slug;
          const brkHere = !!breakSlug && breakSlug === gBreakSlug;
          const canBreak = typeof onSetBreak === "function";
          return (
          <div className="pf-wrap" key={g.steps[0].slug}>
            <div className={"pf-node" + (gdrag === i ? " drag" : "")}
              draggable onDragStart={() => setGdrag(i)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)} onDragEnd={() => setGdrag(null)}>
              <span className="pf-grip" title="Glisser pour réordonner le jalon">⠿</span>
              {g.steps.map((s, j) => (
                <div key={s.slug}>
                  {j > 0 && <div className="pf-or">OU</div>}
                  <div className="pf-opt">
                    <span className="pf-label">{s.label}</span>
                    {stepBadge(s) && <span className="pf-badge">{stepBadge(s)}</span>}
                    <button type="button" className="pf-x" title="Retirer cette étape" onClick={() => onToggle(s.slug)}><Icon name="x" size={13} /></button>
                  </div>
                </div>
              ))}
              {/* Ajouter une variante « OU » à ce jalon (regroupe via équivalence). */}
              {typeof onAddOu === "function" && !g.steps[0].quiz_id && g.steps[0].doc_type !== "EMARGEMENT" && (() => {
                const head = g.steps[0].slug;
                const cand = steps.filter((s) => !s.quiz_id && !s.company_level && s.doc_type !== "EMARGEMENT" && !g.steps.some((x) => x.slug === s.slug));
                return (
                  <div style={{ position: "relative", marginTop: 6 }}>
                    <button type="button" className="pf-or-add" onClick={() => setOuFor(ouFor === head ? null : head)} title="Ajouter une variante « OU » (choisie par condition)">＋ OU</button>
                    {ouFor === head && (
                      <div className="cat-pop" style={{ position: "absolute", left: 0, top: "100%", zIndex: 6, marginTop: 4, minWidth: 200, maxHeight: 220, overflowY: "auto" }}>
                        {cand.length === 0 ? <div className="pf-add-empty" style={{ padding: 8 }}>Aucun autre document.</div>
                          : cand.map((s) => (
                            <button key={s.slug} type="button" className="cat-opt" onClick={() => { onAddOu(g.steps.map((x) => x.slug), s.slug); setOuFor(null); }}>
                              <b>{s.label}</b>{s.doc_type && <span className="hint"> · {s.doc_type}</span>}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            {canBreak ? (
              <button type="button" className={"pf-brk" + (brkHere ? " on" : "")}
                title={brkHere ? "Retirer le point d'accès émargement" : "Placer ici le point d'accès à l'émargement (documents à gauche requis)"}
                onClick={() => onSetBreak(brkHere ? null : gBreakSlug)}>
                <span className="pf-brk-arrow" aria-hidden="true">→</span>
                <span className="pf-brk-flag">🚧</span>
              </button>
            ) : (
              <span className="pf-arrow" aria-hidden="true">→</span>
            )}
          </div>
          );
        })}
        <button type="button" className={"pf-add" + (adding ? " on" : "")} onClick={() => setAdding((a) => !a)}>
          ＋ Ajouter une étape
        </button>
      </div>

      {/* Les variantes « OU » sont regroupées automatiquement selon les Équivalences. */}
      {adding && (
        <div className="pf-add-panel">
          {available.length === 0 ? (
            <>
              <div className="pf-add-title">Étapes disponibles</div>
              <div className="pf-add-empty">Toutes les étapes disponibles sont déjà dans le parcours.</div>
            </>
          ) : (
            (() => {
              const isQuiz = (s) => s.doc_type === "QCM" || !!s.quiz_id;
              const docs = available.filter((s) => !isQuiz(s));
              const quizzes = available.filter(isQuiz);
              const renderItem = (s) => (
                <button type="button" key={s.slug} className="pf-add-item" onClick={() => { onToggle(s.slug); setAdding(false); }}>
                  <span className="pf-label">{s.label}</span>
                  {stepBadge(s) && <span className="pf-badge">{stepBadge(s)}</span>}
                </button>
              );
              return (
                <>
                  <div className="pf-add-title">Documents{docs.length ? ` (${docs.length})` : ""}</div>
                  {docs.length === 0
                    ? <div className="pf-add-empty">Aucun document disponible.</div>
                    : <div className="pf-add-grid">{docs.map(renderItem)}</div>}
                  <div className="pf-add-title" style={{ marginTop: 12 }}>QCM{quizzes.length ? ` (${quizzes.length})` : ""}</div>
                  {quizzes.length === 0
                    ? <div className="pf-add-empty">Aucun QCM disponible.</div>
                    : <div className="pf-add-grid">{quizzes.map(renderItem)}</div>}
                </>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

// Section « À l'arrivée via une entreprise » : sous-parcours d'intake entreprise.
// Liste ORDONNÉE (glisser pour réordonner) de documents de GROUPE (🏢) et/ou
// STAGIAIRE choisis parmi les étapes actives du parcours. Repère visuel côté fiche
// entreprise ; n'altère pas le parcours principal.
function CompanySection({ steps, value, onChange, onToggleActive, breakSlug, onSetBreak }) {
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(null);
  const ref = useRef(null);
  const bySlug = new Map(steps.map((s) => [s.slug, s]));
  const chosen = value.map((sl) => bySlug.get(sl)).filter((s) => s && s.active);
  // Éligibles : documents de GROUPE (activables ici, qu'ils soient actifs ou non),
  // documents STAGIAIRE, QCM et feuilles d'émargement déjà actifs dans le parcours
  // du dossier (repère).
  const eligible = steps.filter((s) => !value.includes(s.slug) && (s.company_level ? true : s.active));
  const isGroup = (s) => !!s.company_level;
  const isQuiz = (s) => !!s.quiz_id || s.doc_type === "QCM";
  const isEmargement = (s) => s.doc_type === "EMARGEMENT";

  useEffect(() => {
    if (!adding) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setAdding(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [adding]);

  const add = (slug) => {
    const s = bySlug.get(slug);
    onChange([...value.filter((x) => x !== slug), slug]);
    if (s && s.company_level && !s.active) onToggleActive?.(slug); // doc de groupe : activer ici
    setAdding(false);
  };
  const remove = (slug) => {
    const s = bySlug.get(slug);
    onChange(value.filter((x) => x !== slug));
    if (slug === breakSlug) onSetBreak?.(null); // l'étape portait le point d'accès → on le retire
    if (s && s.company_level && s.active) onToggleActive?.(slug); // doc de groupe : n'existe qu'ici → désactiver
  };
  function drop(to) {
    if (drag === null || drag === to) { setDrag(null); return; }
    const order = chosen.map((s) => s.slug);
    const [m] = order.splice(drag, 1);
    order.splice(to, 0, m);
    const extra = value.filter((sl) => !order.includes(sl)); // slugs non résolus conservés
    onChange([...order, ...extra]);
    setDrag(null);
  }
  const badge = (s, short) => {
    const grp = isGroup(s), quiz = isQuiz(s);
    const text = isEmargement(s) ? (short ? "✍️" : "✍️ Émargement")
      : quiz ? (short ? "❓" : "❓ QCM")
        : grp ? (short ? "🏢" : "🏢 Groupe") : (short ? "S" : "Stagiaire");
    return (
      <span className="pf-badge" style={{ background: grp ? "var(--ember1,#c0392b)" : "var(--surface2)", color: grp ? "#fff" : "var(--text)" }}>
        {text}
      </span>
    );
  };

  return (
    <div className="parcours compact" ref={ref}>
      <p className="hint" style={{ marginTop: 0 }}>
        Parcours quand une <b>entreprise</b> inscrit ses stagiaires : documents de <b>groupe</b> (🏢) <b>et</b> stagiaire. Glissez pour réordonner ·{" "}
        <b style={{ color: "var(--ember1)" }}>🚧</b> = accès émargement (les documents à gauche doivent être signés).
      </p>
      <div className="parcours-flow">
        {chosen.map((s, i) => (
          <div className="pf-wrap" key={s.slug}>
            <div className={"pf-node" + (drag === i ? " drag" : "")}
              draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)} onDragEnd={() => setDrag(null)}>
              <span className="pf-grip" title="Glisser pour réordonner">⠿</span>
              <div className="pf-opt">
                <span className="pf-label">{s.label}</span>
                {badge(s)}
                <button type="button" className="pf-x" title="Retirer de la section entreprise" onClick={() => remove(s.slug)}><Icon name="x" size={13} /></button>
              </div>
            </div>
            {typeof onSetBreak === "function" ? (
              <button type="button" className={"pf-brk" + (breakSlug === s.slug ? " on" : "")}
                title={breakSlug === s.slug
                  ? "Retirer le point d'accès émargement (entreprise)"
                  : "Placer ici le point d'accès à l'émargement : les documents à gauche devront être signés"}
                onClick={() => onSetBreak(breakSlug === s.slug ? null : s.slug)}>
                <span className="pf-brk-arrow" aria-hidden="true">→</span>
                <span className="pf-brk-flag">🚧</span>
              </button>
            ) : (
              <span className="pf-arrow" aria-hidden="true">→</span>
            )}
          </div>
        ))}
        <button type="button" className={"pf-add" + (adding ? " on" : "")} onClick={() => setAdding((a) => !a)}>
          ＋ Ajouter une étape
        </button>
      </div>

      {chosen.length === 0 && <p className="hint" style={{ marginTop: -6 }}>Aucun document dans la section entreprise.</p>}

      {adding && (
        <div className="pf-add-panel">
          {eligible.length === 0 ? (
            <>
              <div className="pf-add-title">Étapes disponibles</div>
              <div className="pf-add-empty">Aucun document disponible — activez-le d'abord dans « Parcours du dossier ».</div>
            </>
          ) : (
            (() => {
              // Même découpage que « Parcours du dossier » : documents, QCM, puis émargement.
              const docs = eligible.filter((s) => !isQuiz(s) && !isEmargement(s));
              const quizzes = eligible.filter(isQuiz);
              const emargements = eligible.filter(isEmargement);
              const renderItem = (s) => (
                <button key={s.slug} type="button" className="pf-add-item" onClick={() => add(s.slug)}>
                  {badge(s, true)}<span>{s.label}</span>
                </button>
              );
              return (
                <>
                  <div className="pf-add-title">Documents{docs.length ? ` (${docs.length})` : ""}</div>
                  {docs.length === 0
                    ? <div className="pf-add-empty">Aucun document disponible.</div>
                    : <div className="pf-add-grid">{docs.map(renderItem)}</div>}
                  <div className="pf-add-title" style={{ marginTop: 12 }}>QCM{quizzes.length ? ` (${quizzes.length})` : ""}</div>
                  {quizzes.length === 0
                    ? <div className="pf-add-empty">Aucun QCM disponible.</div>
                    : <div className="pf-add-grid">{quizzes.map(renderItem)}</div>}
                  <div className="pf-add-title" style={{ marginTop: 12 }}>Émargement{emargements.length ? ` (${emargements.length})` : ""}</div>
                  {emargements.length === 0
                    ? <div className="pf-add-empty">Aucune feuille d'émargement disponible.</div>
                    : <div className="pf-add-grid">{emargements.map(renderItem)}</div>}
                </>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

export default Formations;
