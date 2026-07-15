import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { getFormations, createFormation, updateFormation, deleteFormation, reorderFormations, getFormationSteps, saveFormationSteps, getFormation, saveArchiveTree, getEquivalences, createEquivalence, updateEquivalence } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import ArchiveTreeEditor, { treeHasEmptyName, ArchiveTreePreview } from "../components/ArchiveTreeEditor.jsx";
import Badge from "../components/Badge.jsx";
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

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Code</th>
              <th>Intitulé</th>
              <th>Jours</th>
              <th>Heures</th>
              <th>Prix</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {programs.map((p, i) => (
              <tr key={p.id}
                className={"drag-row" + (drag === i ? " dragging" : "")}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                onDragEnd={() => setDrag(null)}
              >
                <td className="drag-handle" title="Glisser pour réorganiser">⠿</td>
                <td>
                  <span className="badge n mono" style={{ color: "#fff", background: p.color || colorOf(p.code), borderColor: "transparent" }}>{p.code}</span>
                </td>
                <td><b>{p.title}</b></td>
                <td>{p.days}</td>
                <td>{p.hours}</td>
                <td className="mono">{euro(p.price)}</td>
                <td>{p.rs_code ? <Badge tone="b">Certifiante</Badge> : p.hygiene ? <Badge tone="a">Hygiène</Badge> : null}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn sm ghost" onClick={() => setEditing(p)}>Modifier</button>{" "}
                  <button className="btn sm ghost danger" title="Supprimer la formation" onClick={() => onDelete(p)}><Icon name="trash" size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
        await saveFormationSteps(program.id, steps.map((s) => ({ slug: s.slug, active: s.active })), breakSlug || null, companySteps);
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
                Composez l'enchaînement des documents du dossier : <b>＋ Ajouter une étape</b> pour en insérer une, <b>✕</b> pour la retirer. Les variantes d'un même jalon (ex. <b>Devis particulier</b> / <b>Devis entreprise</b>) s'affichent comme un choix « OU » : chaque dossier n'en suit qu'une, selon son financement. Les documents de groupe (🏢 « Document entreprise ») apparaissent dans la même liste. Glissez un bloc pour réordonner ; les QCM rattachés sont proposés à l'ajout.
                <br />Clique sur une <b style={{ color: "var(--ember1)" }}>flèche 🚧</b> entre deux jalons pour placer le <b>point d'accès à l'émargement</b> : le stagiaire ne pourra émarger qu'après avoir signé tous ses documents situés avant ce point.
              </p>
              {steps.length === 0 ? (
                <p className="hint">Aucun document candidat.</p>
              ) : (
                <ParcoursFlow steps={steps} eqMap={eqMap} onToggle={toggleStep} onReorder={setSteps}
                  breakSlug={breakSlug} onSetBreak={setBreakSlug} onAddOu={addOuVariant} />
              )}
            </>
          ) : (
            <CompanySection steps={steps} value={companySteps} onChange={setCompanySteps} />
          )}
          </div>

          <div style={{ display: tab === "archives" ? "block" : "none" }}>
            {(() => {
              const isEntArch = archKind === "entreprise";
              const curTree = isEntArch ? companyArchiveTree : archiveTree;
              const setCurTree = isEntArch ? setCompanyArchiveTree : setArchiveTree;
              const docs = isEntArch
                ? steps.filter((s) => s.active && s.company_level).map((s) => ({ slug: s.slug, label: s.label, quiz_id: s.quiz_id }))
                : [
                    ...steps.filter((s) => s.active && !s.company_level).map((s) => ({ slug: s.slug, label: s.label, quiz_id: s.quiz_id })),
                    // Documents « système » assemblés à partir des signatures (si la formation utilise l'émargement).
                    ...(form.needs_emargement ? [{ slug: "sys:emargement", label: "Feuille d'émargement (stagiaire + formateur(s) + intervenant(s))", system: true }] : []),
                  ];
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
  const included = steps.filter((s) => s.active);
  const available = steps.filter((s) => !s.active);
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
    onReorder([...ng.flatMap((g) => g.steps), ...available]); // ordre inclus + disponibles conservés
  }

  return (
    <div className="parcours" ref={addRef}>
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
                const cand = steps.filter((s) => !s.quiz_id && s.doc_type !== "EMARGEMENT" && !g.steps.some((x) => x.slug === s.slug));
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
function CompanySection({ steps, value, onChange }) {
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(null);
  const ref = useRef(null);
  const bySlug = new Map(steps.map((s) => [s.slug, s]));
  const chosen = value.map((sl) => bySlug.get(sl)).filter((s) => s && s.active);
  const eligible = steps.filter((s) => s.active && !s.quiz_id && s.doc_type !== "EMARGEMENT" && !value.includes(s.slug));
  const isGroup = (s) => !!s.company_level;

  useEffect(() => {
    if (!adding) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setAdding(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [adding]);

  const add = (slug) => { onChange([...value.filter((x) => x !== slug), slug]); setAdding(false); };
  const remove = (slug) => onChange(value.filter((x) => x !== slug));
  function drop(to) {
    if (drag === null || drag === to) { setDrag(null); return; }
    const order = chosen.map((s) => s.slug);
    const [m] = order.splice(drag, 1);
    order.splice(to, 0, m);
    const extra = value.filter((sl) => !order.includes(sl)); // slugs non résolus conservés
    onChange([...order, ...extra]);
    setDrag(null);
  }
  const badge = (s, short) => (
    <span className="pf-badge" style={{ background: isGroup(s) ? "var(--ember1,#c0392b)" : "var(--surface2)", color: isGroup(s) ? "#fff" : "var(--text)" }}>
      {isGroup(s) ? (short ? "🏢" : "🏢 Groupe") : (short ? "S" : "Stagiaire")}
    </span>
  );

  return (
    <div ref={ref}>
      <p className="hint" style={{ marginTop: 0 }}>
        Documents traités quand une <b>entreprise</b> inscrit ses stagiaires : ajoutez ici les documents de <b>groupe</b> (🏢) <b>et</b> les documents <b>stagiaire</b> concernés. Cette section sert de repère sur la fiche entreprise ; elle n'enlève rien au parcours ci-dessus.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {chosen.length === 0 && <span className="hint">Aucun document dans la section entreprise.</span>}
        {chosen.map((s, i) => (
          <div key={s.slug} className="pf-opt" draggable
            onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(i)} onDragEnd={() => setDrag(null)}
            style={{ opacity: drag === i ? 0.5 : 1, cursor: "grab" }}>
            {badge(s)}
            <span className="pf-label">{s.label}</span>
            <button type="button" className="pf-x" title="Retirer de la section entreprise" onClick={() => remove(s.slug)}><Icon name="x" size={13} /></button>
          </div>
        ))}
        <div style={{ position: "relative" }}>
          <button type="button" className={"pf-add" + (adding ? " on" : "")} onClick={() => setAdding((a) => !a)}>＋ Ajouter</button>
          {adding && (
            <div className="cat-pop" style={{ position: "absolute", left: 0, top: "100%", zIndex: 6, marginTop: 4, minWidth: 240, maxHeight: 260, overflowY: "auto" }}>
              {eligible.length === 0 ? <div className="pf-add-empty" style={{ padding: 8 }}>Aucun document disponible (activez-le d'abord dans le parcours).</div>
                : eligible.map((s) => (
                  <button key={s.slug} type="button" className="cat-opt" onClick={() => add(s.slug)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {badge(s, true)}<b>{s.label}</b>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Formations;
