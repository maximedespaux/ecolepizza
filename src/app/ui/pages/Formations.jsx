import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { getFormations, createFormation, updateFormation, deleteFormation, reorderFormations, getFormationSteps, saveFormationSteps, getFormation, saveArchiveTree, getEquivalences, createEquivalence, updateEquivalence, deleteEquivalence, getConditions } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import ArchiveTreeEditor, { treeHasEmptyName, ArchiveTreePreview } from "../components/ArchiveTreeEditor.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import HelpDot from "../components/HelpDot.jsx";
import GrilleEvaluation from "../components/GrilleEvaluation.jsx";
import { euro, colorOf } from "../lib/format.js";
import { setBadgeColors } from "../lib/levels.js";
import { useReordonner, deplacerDans } from "../lib/useReordonner.js";

function Formations() {
  const [programs, setPrograms] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // formation en cours d'édition

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

  // Glisser (souris ou doigt, cf. lib/useReordonner.js) : réordonne localement puis persiste.
  const glisser = useReordonner((de, vers) => {
    const next = deplacerDans(programs, de, vers);
    setPrograms(next);
    reorderFormations(next.map((p) => p.id)).catch((e) => { setStatus({ type: "error", message: e.message }); load(); });
  });

  function onSaved(msg) {
    setEditing(null);
    setStatus({ type: "success", message: msg || "Formation enregistrée." });
    load();
  }

  async function onDelete(p) {
    if (!window.confirm(`Supprimer définitivement la formation « ${p.code}, ${p.title} » ?\nCette action est irréversible.`)) return;
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
        /* Le glissé est porté par la LIGNE : `rowProps` le rend au `<tr>` tel quel. En mode carte
           la ligne devient une carte — et reste déplaçable, au doigt par sa poignée. */
        rowProps={(p, i) => ({
          ...glisser.proprietes(i),
          className: "drag-row" + (glisser.saisi === i ? " dragging" : "")
            + (glisser.saisi !== null && glisser.vise === i && glisser.saisi !== i ? " drop-cible" : ""),
        })}
        vide={<EmptyState icon="graduation" title="Aucune formation"
          text="Crée tes formations : elles servent de base aux sessions, aux dossiers et aux mondes de Pizza Quest." />}
        cols={[
          /* `poignee` et plus `sansCarte` : sur téléphone la liste passe en cartes, et la poignée
             y disparaissait — or c'est la SEULE prise du doigt, la carte entière servant à faire
             défiler la page. Elle se pose en haut à droite de la carte (cf. `.dt-poignee`). */
          { k: "poignee", t: "", poignee: true, th: { width: 30 },
            cell: (p, i) => <span className="drag-handle" {...glisser.poignee(i)} title="Glisser pour réorganiser" aria-hidden="true">⠿</span> },
          { k: "code", t: "Code",
            cell: (p) => <span className="badge n mono" style={{ color: "#fff", background: p.color || colorOf(p.code), borderColor: "transparent" }}>{p.code}</span> },
          { k: "title", t: "Intitulé", principal: true,
            cell: (p) => (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <b>{p.title}</b>
                {/* Un choix « OU » mal conditionné ne se voyait qu'en tentant d'y toucher. Il
                    produit pourtant le mauvais document, ou aucun, en silence — le genre de
                    défaut qu'on découvre le jour où un stagiaire reçoit le devis d'un autre.
                    La pastille dit QU'IL Y EN A ; le détail est dans le parcours, là où on le
                    corrige. */}
                {p.alertes_conditions > 0 && (
                  <span className="pastille-alerte"
                    title={`${p.alertes_conditions} choix « OU » mal conditionné${p.alertes_conditions > 1 ? "s" : ""}, ouvrez « Parcours documentaire »`}>
                    ! {p.alertes_conditions > 1 ? p.alertes_conditions : ""}
                  </span>
                )}
              </span>
            ) },
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
  "audience", "prerequisites", "objective_general", "objectives", "duration_detail", "program_detail",
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
  const [conditions, setConditions] = useState([]); // conditions perso (pour conditionner une pièce en « OU »)
  const [tab, setTab] = useState("infos"); // "infos" | "parcours" | "archives" | "evaluation"
  const [archKind, setArchKind] = useState("stagiaire"); // arborescence : "stagiaire" | "entreprise"
  const [parcoursKind, setParcoursKind] = useState("stagiaire"); // parcours : "stagiaire" | "entreprise"
  const [evalRole, setEvalRole] = useState("FORMATEUR"); // grille affichée : formateur ou jury
  /* PLUSIEURS GRILLES CÔTÉ FORMATEUR (2026-09-23) : « Évaluation pratique — pâte », « — four ».
     La liste vient de l'enfant, qui la reçoit avec la grille qu'il charge ; `grilleId` vaut
     `null` (la première), un identifiant, ou « nouvelle » tant qu'elle n'est pas enregistrée. */
  const [grilles, setGrilles] = useState([]);
  const [grilleId, setGrilleId] = useState(null);
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
  useEffect(() => { getConditions().then((r) => setConditions(r.data || [])).catch(() => {}); }, []);

  // Ajoute un document comme variante « OU » à un jalon (crée/étend l'équivalence).
  const [refusOu, setRefusOu] = useState(null); // pourquoi une variante « OU » a été refusée

  /* RETIRER une variante du groupe. Il n'y avait aucun moyen de le faire : on pouvait ajouter,
     jamais enlever. Or un groupe hérité peut contenir un document qu'on ne veut plus — voire
     qu'on ne VOIT pas, comme un document de groupe (`company_level`), filtré du flux du parcours
     et pourtant membre à part entière. Il bloquait alors l'ajout d'une variante légitime, sans
     qu'on puisse ni le constater ni le retirer. */
  async function removeOuVariant(slug) {
    setRefusOu(null);
    try {
      const g = eqMap.get(slug);
      const eq = g ? equivs.find((e) => e.key === g.group) : null;
      if (!eq || !eq.id) return false;
      const restants = (eq.members || []).filter((m) => m !== slug);
      // Un groupe « OU » à moins de deux membres n'a plus d'objet : on le dissout.
      if (restants.length < 2) await deleteEquivalence(eq.id);
      else await updateEquivalence(eq.id, { members: restants });
      await reloadEq();
      return true;
    } catch (e) { setRefusOu(e.message); onError(e.message); return false; }
  }

  async function addOuVariant(jalonSlugs, addSlug) {
    if (!addSlug || jalonSlugs.includes(addSlug)) return;
    setRefusOu(null);
    try {
      const g = eqMap.get(jalonSlugs[0]);
      const eq = g ? equivs.find((e) => e.key === g.group) : null;
      if (eq && !eq.is_default && String(eq.id)) {
        const members = [...new Set([...(eq.members || jalonSlugs), addSlug])];
        // `ajoute` : le serveur peut alors dire lequel était DÉJÀ dans le groupe et lequel on
        // vient de choisir. Sans lui, le refus opposait deux documents sans dire qui était qui.
        await updateEquivalence(eq.id, { members, ajoute: addSlug });
      } else {
        await createEquivalence({ members: [...new Set([...jalonSlugs, addSlug])], ajoute: addSlug });
      }
      setSteps((ss) => ss.map((s) => (s.slug === addSlug ? { ...s, active: true } : s))); // activer la variante ajoutée
      await reloadEq();
      return true;
    } catch (e) {
      /* LE REFUS S'AFFICHE DANS LE PANNEAU, pas seulement en haut de la fenêtre. Le clic a lieu
         tout en bas d'une modale qui défile : un message posé en tête passait inaperçu, et
         l'utilisateur concluait que « rien ne se passe ». Il reste AUSSI en haut — c'est là que
         se lisent les autres statuts de cette page. */
      setRefusOu(e.message);
      onError(e.message);
      return false;
    }
  }

  /* LE « OU » DES PIÈCES A ÉTÉ RETIRÉ (2026-09-09) : `grouperPiece` / `degrouperPiece`
     vivaient ici. Une pièce est désormais une étape exigée, point. La condition par pièce
     (`applies_when`) reste : c'est elle qui dit « seulement si… », sans rendre les autres
     pièces facultatives par effet de bord. Cf. api/lib/groupesPieces.js. */
  const setPieceCondition = (slug, aw) => setSteps((ss) => ss.map((s) => (s.slug === slug ? { ...s, applies_when: aw } : s)));
  // Retirer une variante d'un choix : pièce → dégroupe (local) ; document → équivalence d'organisme.
  const retirerVariante = (slug) => {
    const st = steps.find((s) => s.slug === slug);
    return removeOuVariant(slug);
  };

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
        /* `avertissement` : le serveur signale ici les champs qu'un repli a dû écarter faute de
           migration jouée. Sans ce relais, l'écran annoncerait « créée » alors qu'une partie de la
           saisie a été jetée en route — c'est exactement ce qui a fait croire que les prérequis
           ne s'enregistraient pas. */
        const rc = await createFormation(form);
        onSaved(rc?.avertissement ? `Formation créée. ${rc.avertissement}` : "Formation créée.");
      } else {
        const ru = await updateFormation(program.id, form);
        // Les pièces emportent leur seule condition (applies_when) : elles n'ont plus de « OU ».
        // Les documents, eux, gèrent le leur par les équivalences d'organisme, pas ici.
        await saveFormationSteps(program.id, steps.map((s) => (s.doc_type === "PIECE"
          // Plus de `or_group` : une pièce n'a plus de « OU ». Le serveur l'ignore de toute façon
            // (lib/groupesPieces.js) ; ne pas l'envoyer évite d'entretenir une valeur morte.
            ? { slug: s.slug, active: s.active, applies_when: s.applies_when || null }
          : { slug: s.slug, active: s.active })), breakSlug || null, companySteps, companyBreakSlug || null);
        await saveArchiveTree(program.id, archiveTree, companyArchiveTree).catch(() => {}); // tolère l'absence de migration
        onSaved(ru?.avertissement ? `Formation mise à jour. ${ru.avertissement}` : "Formation mise à jour.");
      }
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay">
      <div className="modal wide">
        <div className="mhead">
          <h3>{isNew ? "Nouvelle formation" : <>Modifier, <span className="mono" style={{ color: effColor }}>{program.code}</span></>}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        {/* `tabs-defilantes` : sur téléphone, les quatre onglets restent sur une ligne et défilent
            au lieu de se replier sur trois lignes et de sortir de la fenêtre (cf. app.css). */}
        <div className="tabs tabs-defilantes" role="tablist">
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
          {/* LA GRILLE EST PROPRE À LA FORMATION, et c'est tout l'objet : on ne note pas un
              CAP hygiène comme un perfectionnement au four à bois. C'est aussi pourquoi elle
              vit ici, à côté du parcours documentaire, et non dans un réglage d'organisme. */}
          {!isNew && (
            <button type="button" role="tab" className={"tab" + (tab === "evaluation" ? " on" : "")} onClick={() => setTab("evaluation")}>
              Évaluation pratique
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

          {/* `alignItems: end` : sur téléphone, « Nombre d'heures » et « Montant net (€) » passent
              sur deux lignes et « Durée (jours) » non — les trois champs se décalaient en escalier. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, alignItems: "end" }}>
            <div className="field"><label>Durée (jours)</label>
              <input className="inp" type="number" min="0" value={form.days} onChange={set("days")} /></div>
            <div className="field"><label>Nombre d'heures</label>
              <input className="inp" type="number" min="0" value={form.hours} onChange={set("hours")} /></div>
            <div className="field"><label>Montant net (€)</label>
              <input className="inp" type="number" min="0" step="0.01" value={form.price} onChange={set("price")} /></div>
          </div>

          <div className="field"><label>Horaires (affiché sur la feuille d'émargement)<HelpDot text={"Une ligne par horaire, utile si les journées n'ont pas les mêmes horaires.\n\nEx. :\n9h00 - 12h30 / 13h30 - 17h00\nJour 5 : 9h00 - 12h00"} /></label>
            <textarea className="inp" rows={3} value={form.horaires} onChange={set("horaires")} placeholder={"9h00 - 12h30 / 13h30 - 17h00\nJour 5 : 9h00 - 12h00"} /></div>

          <div className="field"><label>Public</label>
            <textarea className="inp" rows={2} value={form.audience} onChange={set("audience")} /></div>

          {/* PRÉREQUIS, distinct de « Public » : celui-ci dit à QUI la formation s'adresse,
              celui-là ce qu'il faut DÉJÀ savoir ou posséder pour y entrer. Qualiopi les contrôle
              séparément, et le jeton {Prérequis} les reprend tels quels sur le programme. */}
          <div className="field"><label>Prérequis (jeton {"{Prérequis}"})</label>
            <textarea className="inp" rows={3} value={form.prerequisites} onChange={set("prerequisites")}
              placeholder={"Savoir lire et écrire le français.\nAucun diplôme exigé."} /></div>

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
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", alignItems: "center", paddingTop: 18 }}>
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
                  breakSlug={breakSlug} onSetBreak={setBreakSlug} onAddOu={addOuVariant}
                  refusOu={refusOu} onEffacerRefus={() => setRefusOu(null)}
                  eqDe={(slug) => { const g = eqMap.get(slug); return g ? equivs.find((e) => e.key === g.group) : null; }}
                  onRetirerOu={retirerVariante}
                  onSetPieceCondition={setPieceCondition} conditions={conditions} />
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
                  {/* En classes et non en style : sur un écran étroit, l'aperçu passe SOUS l'éditeur
                      (cf. `.fm-archives` dans app.css). À deux colonnes sur un téléphone, il
                      coupait chaque nom de dossier au bout de dix caractères. */}
                  <div className="fm-archives">
                    <ArchiveTreeEditor tree={curTree} onChange={setCurTree} eqMap={eqMap} docs={docs} />
                    <div className="fm-archives-apercu">
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--dim)", marginBottom: 8 }}>Aperçu, {isEntArch ? "entreprise" : "stagiaire"}</div>
                      <ArchiveTreePreview tree={curTree} code={form.code} title={form.title} />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* MONTÉ SEULEMENT QUAND ON L'OUVRE, à la différence des autres onglets qu'un
              `display:none` garde en vie. La grille s'enregistre par son PROPRE bouton, sans
              passer par « Enregistrer » ci-dessous : la garder montée en permanence
              chargerait la grille de chaque formation qu'on ouvre, pour rien. */}
          {tab === "evaluation" && !isNew && (
            <>
              {/* DEUX GRILLES, DEUX ACTES. Le formateur note en continu pendant le stage ; le
                  jury évalue le jour de l'examen, sur d'autres critères et avec d'autres
                  règles. Une formation a besoin des deux en même temps. */}
              <div className="seg" style={{ marginBottom: 12 }}>
                <button type="button" className={"seg-btn" + (evalRole === "FORMATEUR" ? " on" : "")} onClick={() => { setEvalRole("FORMATEUR"); setGrilleId(null); }}>Notation du formateur</button>
                <button type="button" className={"seg-btn" + (evalRole === "JURY" ? " on" : "")} onClick={() => setEvalRole("JURY")}>Grille du jury</button>
              </div>
              {/* UNE FORMATION PEUT AVOIR PLUSIEURS GRILLES DE FORMATEUR, et c'est ce qu'on
                  choisit ici. On ne note pas le travail de la pâte comme la conduite du four :
                  deux grilles, deux séries d'exercices, deux seuils, deux résultats.
                  LE JURY N'EN A QU'UNE : il délibère une fois, sur un procès-verbal. */}
              {/* SUR SA PROPRE LIGNE : `.seg` est en `inline-flex`, si bien que les deux sélecteurs
                  se suivaient sur une seule ligne et se lisaient comme UN choix de quatre —
                  « Notation du formateur | Grille du jury | — pâte | — four ». Ce sont deux
                  questions différentes : de QUI est la grille, puis LAQUELLE. */}
              {evalRole === "FORMATEUR" && (grilles.length > 1 || grilleId === "nouvelle") && (
                <div className="seg" style={{ display: "flex", width: "fit-content", maxWidth: "100%", marginBottom: 12, flexWrap: "wrap" }}>
                  {grilles.map((g) => (
                    <button type="button" key={g.id}
                      className={"seg-btn" + ((grilleId ? g.id === grilleId : g.id === grilles[0]?.id) ? " on" : "")}
                      onClick={() => setGrilleId(g.id)}>{g.label || "Sans titre"}</button>
                  ))}
                  {grilleId === "nouvelle" && <button type="button" className="seg-btn on">Nouvelle grille</button>}
                </div>
              )}
              {evalRole === "FORMATEUR" && grilleId !== "nouvelle" && (
                <p className="hint" style={{ margin: "-4px 0 12px" }}>
                  <button type="button" className="btn ghost sm" onClick={() => setGrilleId("nouvelle")}>
                    <Icon name="plus" size={14} /> Ajouter une grille
                  </button>
                  {grilles.length > 1 && <> · Cette formation en a <b>{grilles.length}</b>, chacune avec son intitulé et son seuil.</>}
                </p>
              )}
              {/* `key` : changer de rôle doit REMONTER le composant, sinon l'état de la grille
                  précédente (compétences, exercices) resterait affiché le temps du chargement —
                  et un « Enregistrer » à ce moment-là écrirait la mauvaise grille. */}
              <GrilleEvaluation key={`${evalRole}-${grilleId || "premiere"}`} programId={program.id}
                programTitle={form.title} role={evalRole} grilleId={evalRole === "FORMATEUR" ? grilleId : null}
                onGrilles={(liste, id) => {
                  setGrilles(liste);
                  /* La grille tout juste créée cesse d'être « nouvelle » : on la désigne par son
                     identifiant, sinon « Enregistrer » une seconde fois en créerait une autre. */
                  setGrilleId((v) => (v === "nouvelle" && id ? id : (v && liste.some((g) => g.id === v) ? v : null)));
                }} />
            </>
          )}
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
// Valeur du <select> de condition d'une pièce, depuis/vers son applies_when. Une seule condition
// par pièce (financement OU une condition perso) : suffit à « identité si Pro, justificatif sinon ».
function condValue(aw) {
  const a = aw || {};
  if (a.financing) return `fin:${a.financing}`;
  if (Array.isArray(a.conditions) && a.conditions.length) return `cond:${a.conditions[0]}`;
  return "";
}
function condFromValue(v) {
  if (!v) return {};
  if (v.startsWith("fin:")) return { financing: v.slice(4) };
  if (v.startsWith("cond:")) return { conditions: [v.slice(5)] };
  return {};
}

function groupMilestones(steps, eqMap) {
  const groupOf = (s) => {
    if (eqMap && eqMap.get(s.slug)) return eqMap.get(s.slug).group; // documents : équivalences d'organisme
    // Les pièces ne se groupent plus : une pièce = une étape, exigée. Cf. lib/groupesPieces.js.
    return null;
  };
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
  /* Une pièce à fournir ne se SIGNE pas, elle se dépose : les badges de signature n'auraient
     aucun sens ici. Le badge dit combien de fichiers sont attendus — c'est l'information qui
     manque le plus au stagiaire (« recto ET verso » se lit dans « 2 fichiers »). */
  if (s.doc_type === "PIECE") return s.fichiers_attendus > 1 ? `${s.fichiers_attendus} fichiers` : "à fournir";
  /* Une remise ne se signe pas davantage : elle se dépose puis s'ACCUSE. Le badge dit le geste
     attendu du stagiaire, qui n'est ni signer ni fournir. */
  if (s.doc_type === "REMISE") return "à remettre";
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
function ParcoursFlow({ steps, eqMap, onToggle, onReorder, breakSlug, onSetBreak, onAddOu, refusOu, onEffacerRefus, eqDe, onRetirerOu, onSetPieceCondition, conditions }) {
  // Les documents de GROUPE (🏢 company_level) ne font PAS partie du parcours du
  // dossier : ils se gèrent uniquement dans « À l'arrivée via une entreprise ».
  const included = steps.filter((s) => s.active && !s.company_level);
  const available = steps.filter((s) => !s.active && !s.company_level);
  // Tout ce qui n'est pas affiché ici (docs de groupe + étapes inactives) est
  // préservé tel quel lors d'un réordonnancement.
  const rest = steps.filter((s) => !(s.active && !s.company_level));
  const groups = groupMilestones(included, eqMap);
  // Ordre inclus + reste (groupe / inactifs) conservé tel quel.
  const glisser = useReordonner((de, vers) => {
    onReorder([...deplacerDans(groups, de, vers).flatMap((g) => g.steps), ...rest]);
  });
  const [adding, setAdding] = useState(false);
  const [ouFor, setOuFor] = useState(null); // slug de tête du jalon dont on ajoute une variante
  const [chercheDoc, setChercheDoc] = useState("");
  const addRef = useRef(null);

  useEffect(() => {
    if (!adding) return;
    const close = (e) => { if (addRef.current && !addRef.current.contains(e.target)) setAdding(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [adding]);

  /* Les alertes de conditions, RÉUNIES EN TÊTE du parcours. Elles pourraient tenir dans une
     info-bulle sur chaque jalon, mais une info-bulle ne se lit que si on la cherche — et
     personne ne survole un jalon qu'il croit correct. Le texte est donc posé là où on ouvre le
     parcours, avec le repère « ! » sur le jalon concerné pour faire le lien. */
  const alertes = [];
  const vus = new Set();
  for (const g of groups) {
    for (const st of g.steps) {
      if (st.alerte && !vus.has(st.alerte.groupe)) { vus.add(st.alerte.groupe); alertes.push({ ...st.alerte, jalon: g.steps[0].label }); }
    }
  }

  return (
    <div className="parcours compact" ref={addRef}>
      {alertes.length > 0 && (
        <div className="alerte-conditions">
          <div className="alerte-conditions-t">
            <Icon name="alert-triangle" size={15} />
            {alertes.length === 1 ? "Un choix « OU » mal conditionné" : `${alertes.length} choix « OU » mal conditionnés`}
          </div>
          {alertes.map((a, i) => (
            <p key={i}><b>{a.jalon}</b>, {a.texte}</p>
          ))}
        </div>
      )}
      <div className="parcours-flow">
        {groups.map((g, i) => {
          // Slug de rupture porté par ce jalon = dernière étape du groupe.
          const gBreakSlug = g.steps[g.steps.length - 1].slug;
          const brkHere = !!breakSlug && breakSlug === gBreakSlug;
          const canBreak = typeof onSetBreak === "function";
          return (
          <div className="pf-wrap" key={g.steps[0].slug}>
            <div className={"pf-node" + (glisser.saisi === i ? " drag" : "")
              + (glisser.saisi !== null && glisser.vise === i && glisser.saisi !== i ? " cible" : "")}
              {...glisser.proprietes(i)}>
              <span className="pf-grip" {...glisser.poignee(i)} title="Glisser pour réordonner le jalon">⠿</span>
              {g.steps.some((st) => st.alerte) && (
                <span className="pastille-alerte pf-alerte" title={g.steps.find((st) => st.alerte).alerte.texte}>!</span>
              )}
              {g.steps.map((s, j) => (
                <div key={s.slug}>
                  {j > 0 && <div className="pf-or">OU</div>}
                  <div className="pf-variante">
                    <span className="pf-label">{s.label}</span>
                    {stepBadge(s) && <span className="pf-badge">{stepBadge(s)}</span>}
                    <button type="button" className="pf-x" title="Retirer cette étape" onClick={() => onToggle(s.slug)}><Icon name="x" size={13} /></button>
                  </div>
                  {/* Pièce en « OU » : quel dossier fournit CELLE-CI. « Par défaut » = la variante
                      demandée quand aucune autre du groupe ne s'applique (au moins une doit le rester). */}
                  {s.doc_type === "PIECE" && g.steps.length > 1 && typeof onSetPieceCondition === "function" && (
                    <select className="inp pf-cond" style={{ marginTop: 4, fontSize: 11, padding: "2px 4px", width: "100%" }}
                      title="Ce dossier ne se voit demander cette pièce que si la condition est remplie."
                      value={condValue(s.applies_when)}
                      onChange={(e) => onSetPieceCondition(s.slug, condFromValue(e.target.value))}>
                      <option value="">Par défaut (sinon)</option>
                      <option value="fin:PROFESSIONNEL">Si financeur : professionnel</option>
                      <option value="fin:PARTICULIER">Si financeur : particulier</option>
                      {(conditions || []).map((c) => (
                        <option key={c.slug} value={`cond:${c.slug}`}>Si : {c.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              {/* Ajouter une variante « OU » à ce jalon (regroupe via équivalence).
                  LE MENU FLOTTANT A ÉTÉ RETIRÉ : il vivait dans `.parcours-flow`, qui défile en
                  `overflow:auto`. Mesuré — il s'arrêtait pile au bord du conteneur (708 px des
                  deux côtés), donc rogné, et il partait sur le côté dès qu'on faisait défiler le
                  parcours. Dix-huit documents tenaient dans une boîte de 220 px, sans recherche.
                  Le bouton ouvre désormais LE MÊME panneau que « Ajouter une étape », posé sous
                  le flux : même geste, même endroit où regarder, et toute la largeur disponible. */}
              {typeof onAddOu === "function" && !g.steps[0].quiz_id && g.steps[0].doc_type !== "EMARGEMENT"
                  /* Ni sur une PIÈCE : elles n'ont plus de « OU », les deux sont exigées. */
                  && g.steps[0].doc_type !== "PIECE" && (
                <button type="button" className={"pf-or-add" + (ouFor === g.steps[0].slug ? " on" : "")}
                  onClick={() => { setAdding(false); setChercheDoc(""); onEffacerRefus?.(); setOuFor(ouFor === g.steps[0].slug ? null : g.steps[0].slug); }}
                  title="Ajouter une variante « OU » (choisie par condition)">＋ OU</button>
              )}
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
        <button type="button" className={"pf-add" + (adding ? " on" : "")}
          onClick={() => { setOuFor(null); setChercheDoc(""); setAdding((a) => !a); }}>
          ＋ Ajouter une étape
        </button>
      </div>

      {/* UN SEUL PANNEAU pour les deux gestes — ajouter une étape, ou une variante « OU ».
          Ils choisissent la même chose dans la même liste ; deux surfaces différentes obligeaient
          à apprendre deux fois. Le titre dit lequel des deux est en cours. */}
      {(adding || ouFor) && (() => {
        const jalon = ouFor ? groups.find((g) => g.steps[0].slug === ouFor) : null;
        // Variante d'une PIÈCE : on ne propose que d'AUTRES pièces (jamais un document, dont le
        // « OU » relève des équivalences d'organisme). Variante d'un DOCUMENT : le référentiel
        // documentaire, hors QCM / émargement / pièces / docs déjà dans le jalon. « Ajouter » (hors
        // jalon) ne propose que ce qui n'est pas encore dans le parcours.
        /* Un jalon ne peut plus être une pièce : le « OU » leur a été retiré. Le vivier d'une
           variante ne contient donc que des documents ; les pièces restent proposées par
           « Ajouter une étape », comme étapes à part entière. */
        const pool = jalon
          ? steps.filter((s) => !s.quiz_id && !s.company_level && s.doc_type !== "EMARGEMENT"
              && s.doc_type !== "PIECE" && s.doc_type !== "REMISE"
              && !jalon.steps.some((x) => x.slug === s.slug))
          : available;
        const t = chercheDoc.trim().toLowerCase();
        const filtre = (l) => (!t ? l : l.filter((s) =>
          [s.label, s.doc_type, s.slug].some((v) => String(v || "").toLowerCase().includes(t))));
        const isQuiz = (s) => s.doc_type === "QCM" || !!s.quiz_id;
        /* QUATRE natures d'étape, donc quatre groupes. Ranger une pièce à fournir parmi les
           « Documents » tromperait : ceux-là, l'école les PRODUIT ; celle-ci, le stagiaire
           l'envoie. Une REMISE (migration 160) n'y a pas sa place non plus, et pour une raison
           voisine : l'école la transmet sans l'avoir produite, et c'est le stagiaire qui en
           accuse réception. Elle s'y est retrouvée le temps d'un déploiement — « OPCO » apparut
           entre « Diplôme » et « Facture Boutique Stagiaire », trois natures confondues sous une
           seule étiquette. C'est le SENS qui change, pas seulement le mot. */
        const isPiece = (s) => s.doc_type === "PIECE";
        const isRemise = (s) => s.doc_type === "REMISE";
        const docs = filtre(pool.filter((s) => !isQuiz(s) && !isPiece(s) && !isRemise(s)));
        const quizzes = filtre(pool.filter(isQuiz));
        const pieces = filtre(pool.filter(isPiece));
        const remises = filtre(pool.filter(isRemise));
        /* Le panneau ne se referme QUE si l'ajout a abouti. Il se fermait d'office, si bien
           qu'un refus faisait disparaître la surface où le motif devait s'afficher : on voyait
           le panneau se fermer et rien d'autre — d'où « je ne peux pas, sans savoir pourquoi ».
           Une activation d'étape, elle, ne peut pas échouer : on ferme aussitôt. */
        const choisir = async (s) => {
          if (!jalon) { onToggle(s.slug); setAdding(false); setOuFor(null); setChercheDoc(""); return; }
          const ok = await onAddOu(jalon.steps.map((x) => x.slug), s.slug);
          if (ok) { setAdding(false); setOuFor(null); setChercheDoc(""); }
        };
        const item = (s) => (
          <button type="button" key={s.slug} className="pf-add-item" onClick={() => choisir(s)}>
            <span className="pf-label">{s.label}</span>
            {stepBadge(s) && <span className="pf-badge">{stepBadge(s)}</span>}
          </button>
        );
        return (
          <div className="pf-add-panel">
            <div className="pf-add-head">
              <div className="pf-add-title" style={{ margin: 0 }}>
                {jalon ? <>Variante « OU » de <b style={{ textTransform: "none" }}>{jalon.steps[0].label}</b></> : "Ajouter une étape"}
              </div>
              <button type="button" className="iconbtn" aria-label="Fermer"
                onClick={() => { setAdding(false); setOuFor(null); setChercheDoc(""); }}><Icon name="x" size={14} /></button>
            </div>
            {/* Le référentiel compte vingt-deux documents : sans recherche, on parcourt une
                liste. Même champ que partout ailleurs dans l'application. */}
            {pool.length > 6 && (
              <span className="gs-search" style={{ margin: "0 0 10px" }}>
                <Icon name="search" size={14} />
                <input value={chercheDoc} onChange={(e) => setChercheDoc(e.target.value)} autoFocus
                  aria-label="Rechercher un document" placeholder="Rechercher un document…" />
                {chercheDoc && <button className="gs-clear" aria-label="Effacer" onClick={() => setChercheDoc("")}><Icon name="x" size={13} /></button>}
              </span>
            )}
            {/* CE QUI EST DÉJÀ DANS LE CHOIX. Un jalon n'affiche que ses variantes visibles dans
                le flux : un document de GROUPE en fait partie sans jamais s'y montrer, et on
                pouvait donc se voir refuser un ajout à cause d'un membre qu'aucun écran ne
                nommait. La composition réelle est ici, et chaque membre peut en sortir. */}
            {jalon && (() => {
              const eq = eqDe?.(jalon.steps[0].slug);
              const membres = (eq?.members || jalon.steps.map((x) => x.slug))
                .map((sl) => steps.find((x) => x.slug === sl) || { slug: sl, label: sl, _absent: true });
              if (membres.length < 2) return null;
              return (
                <div className="pf-membres">
                  <span className="hint" style={{ marginRight: 4 }}>Déjà dans ce choix :</span>
                  {membres.map((m) => (
                    <span key={m.slug} className={"pf-membre" + (m._absent ? " absent" : "")}>
                      {m.label}
                      {m.company_level && <span className="hint"> · document de groupe</span>}
                      {m._absent && <span className="hint"> · n'existe plus</span>}
                      <button type="button" className="pf-membre-x" title={`Retirer « ${m.label} » de ce choix`}
                        aria-label={`Retirer ${m.label} de ce choix`}
                        onClick={() => onRetirerOu?.(m.slug)}><Icon name="x" size={11} /></button>
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Le refus, à hauteur du clic. Il nomme les deux documents et la condition qu'ils
                partagent : « rien ne permettrait de choisir entre les deux au moment de produire
                le document » est une raison, « échec » n'en est pas une. */}
            {refusOu && (
              <div className="status err" style={{ margin: "0 0 10px" }}>{refusOu}</div>
            )}
            {pool.length === 0 ? (
              <div className="pf-add-empty">
                {jalon ? "Aucun autre document à proposer en variante."
                  : "Toutes les étapes disponibles sont déjà dans le parcours."}
              </div>
            ) : (docs.length === 0 && quizzes.length === 0) ? (
              // Pas une impasse : on dit ce qui a été cherché, et comment en sortir.
              <div className="pf-add-empty">Aucun document ne correspond à « {chercheDoc.trim()} ».{" "}
                <button type="button" className="lien-nu" onClick={() => setChercheDoc("")}>Tout afficher</button></div>
            ) : (
              <>
                <div className="pf-add-title">Documents{docs.length ? ` (${docs.length})` : ""}</div>
                {docs.length === 0
                  ? <div className="pf-add-empty">Aucun document.</div>
                  : <div className="pf-add-grid">{docs.map(item)}</div>}
                {/* Les pièces ne s'affichent plus QU'EN AJOUT LIBRE (hors jalon) : elles n'ont plus
                    de « OU », donc ne peuvent plus être la variante de quoi que ce soit. Chacune est
                    une étape à part entière, exigée. */}
                {!jalon && (
                  <>
                    <div className="pf-add-title" style={{ marginTop: 12 }}>
                      Pièces à fournir par le stagiaire{pieces.length ? ` (${pieces.length})` : ""}
                    </div>
                    {pieces.length === 0
                      ? <div className="pf-add-empty">Aucune pièce au référentiel. Elles se créent dans Paramètres → Pièces justificatives.</div>
                      : <div className="pf-add-grid">{pieces.map(item)}</div>}
                  </>
                )}
                {/* Une remise n'a pas de « OU » non plus : c'est une étape à part entière,
                    proposée en ajout libre seulement. */}
                {!jalon && (
                  <>
                    <div className="pf-add-title" style={{ marginTop: 12 }}>
                      Documents remis au stagiaire{remises.length ? ` (${remises.length})` : ""}
                    </div>
                    {remises.length === 0
                      ? <div className="pf-add-empty">Aucune remise au référentiel. Elles se créent dans Modèles de documents.</div>
                      : <div className="pf-add-grid">{remises.map(item)}</div>}
                  </>
                )}
                {!jalon && (
                  <>
                    <div className="pf-add-title" style={{ marginTop: 12 }}>QCM{quizzes.length ? ` (${quizzes.length})` : ""}</div>
                    {quizzes.length === 0
                      ? <div className="pf-add-empty">Aucun QCM disponible.</div>
                      : <div className="pf-add-grid">{quizzes.map(item)}</div>}
                  </>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// Section « À l'arrivée via une entreprise » : sous-parcours d'intake entreprise.
// Liste ORDONNÉE (glisser pour réordonner) de documents de GROUPE (🏢) et/ou
// STAGIAIRE choisis parmi les étapes actives du parcours. Repère visuel côté fiche
// entreprise ; n'altère pas le parcours principal.
function CompanySection({ steps, value, onChange, onToggleActive, breakSlug, onSetBreak }) {
  const [adding, setAdding] = useState(false);
  const ref = useRef(null);
  const bySlug = new Map(steps.map((s) => [s.slug, s]));
  /* AUCUN FILTRE SUR `active`, NI ICI NI DANS LES ÉLIGIBLES — et ce n'est pas un relâchement.
     Cette section N'EST PAS un réordonnancement du parcours du dossier : pour une arrivée par
     entreprise, elle le REMPLACE (`companyParcours` → `if (ent.steps) steps = ent.steps`). Le
     serveur mappe donc ses slugs sur TOUTES les étapes candidates, sans regarder `active` —
     il le fait depuis toujours. Seul cet écran l'interdisait.

     CE QUE LE VERROU COÛTAIT. Pour qu'un document n'existe QUE sur le chemin entreprise — une
     convention de formation professionnelle, un accord de prise en charge — il fallait
     l'activer dans le parcours du dossier, ce qui l'ajoutait du même coup aux arrivées
     individuelles. L'exact contraire du besoin. Un document choisi ici SANS être actif est
     désormais « entreprise seulement », et c'est le seul moyen de l'exprimer. */
  const chosen = value.map((sl) => bySlug.get(sl)).filter(Boolean);
  const eligible = steps.filter((s) => !value.includes(s.slug));
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
    /* ON N'ACTIVE PLUS RIEN À L'AJOUT. Activer un document de groupe était sans effet utile —
       `companyParcours` ne regarde pas `active` — et activer un document stagiaire l'aurait
       ajouté aux arrivées individuelles, ce qu'on cherche justement à éviter. La section
       entreprise décide pour elle-même. */
    onChange([...value.filter((x) => x !== slug), slug]);
    setAdding(false);
  };
  const remove = (slug) => {
    const s = bySlug.get(slug);
    onChange(value.filter((x) => x !== slug));
    if (slug === breakSlug) onSetBreak?.(null); // l'étape portait le point d'accès → on le retire
    if (s && s.company_level && s.active) onToggleActive?.(slug); // doc de groupe : n'existe qu'ici → désactiver
  };
  const glisser = useReordonner((de, vers) => {
    const order = deplacerDans(chosen.map((s) => s.slug), de, vers);
    const extra = value.filter((sl) => !order.includes(sl)); // slugs non résolus conservés
    onChange([...order, ...extra]);
  });
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
        Parcours quand une <b>entreprise</b> inscrit ses stagiaires : il <b>remplace</b> celui du dossier. Un document
        absent du parcours du dossier n'existera donc que par ce chemin — c'est ainsi qu'on réserve une convention
        professionnelle aux arrivées par entreprise. Glissez pour réordonner ·{" "}
        <b style={{ color: "var(--ember1)" }}>🚧</b> = accès émargement (les documents à gauche doivent être signés).
      </p>
      <div className="parcours-flow">
        {chosen.map((s, i) => (
          <div className="pf-wrap" key={s.slug}>
            <div className={"pf-node" + (glisser.saisi === i ? " drag" : "")
              + (glisser.saisi !== null && glisser.vise === i && glisser.saisi !== i ? " cible" : "")}
              {...glisser.proprietes(i)}>
              <span className="pf-grip" {...glisser.poignee(i)} title="Glisser pour réordonner">⠿</span>
              <div className="pf-variante">
                <span className="pf-label">{s.label}</span>
                {badge(s)}
                {/* SANS CE REPÈRE, ON NE COMPRENDRAIT PAS pourquoi l'étape est absente de
                    l'autre onglet. Un document choisi ici et inactif dans le parcours du
                    dossier n'existe QUE pour les stagiaires inscrits par une entreprise —
                    c'est une propriété qu'il faut lire, pas déduire. */}
                {!s.active && !s.company_level && (
                  <span className="pf-badge" title="Absent du parcours du dossier : ce document n'existe que pour une arrivée par entreprise"
                    style={{ background: "var(--surface2)", color: "var(--muted)", fontStyle: "italic" }}>
                    entreprise seulement
                  </span>
                )}
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
        {/* `setOuFor` ET `setChercheDoc` ÉTAIENT APPELÉS ICI, et ils appartiennent à
            `ParcoursFlow` — un AUTRE composant de premier niveau. Le gestionnaire levait donc
            une `ReferenceError` avant d'atteindre `setAdding` : le panneau ne s'ouvrait jamais,
            et l'onglet « À l'arrivée via une entreprise » paraissait n'avoir aucun document à
            proposer. Deux cent trois erreurs dans la console d'un seul écran, et rien de visible.
            `esbuild` ne détecte pas les références non définies (CLAUDE.md § 2.4) ; le script
            `lint` du projet, lui, est mort — ESLint est installé SANS configuration.
            Cette section n'a ni recherche ni « OU » : il n'y a rien à réinitialiser. */}
        <button type="button" className={"pf-add" + (adding ? " on" : "")}
          onClick={() => setAdding((a) => !a)}>
          ＋ Ajouter une étape
        </button>
      </div>

      {chosen.length === 0 && <p className="hint" style={{ marginTop: -6 }}>Aucun document dans la section entreprise.</p>}

      {adding && (
        <div className="pf-add-panel">
          {eligible.length === 0 ? (
            <>
              <div className="pf-add-title">Étapes disponibles</div>
              <div className="pf-add-empty">Aucun document disponible, activez-le d'abord dans « Parcours du dossier ».</div>
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
