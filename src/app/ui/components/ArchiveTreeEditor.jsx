import { useState } from "react";

const uid = () => Math.random().toString(36).slice(2, 9);
const newFolder = () => ({ id: uid(), name: "", per_learner: false, items: [], children: [] });

// Un dossier sans nom empêche l'enregistrement (récursif).
export function treeHasEmptyName(tree) {
  const check = (folders) => (folders || []).some((f) => !String(f.name || "").trim() || check(f.children));
  return check(tree && tree.folders);
}

// Remplace {champ} par sa valeur d'exemple pour l'aperçu.
const fillTokens = (name, sample) => String(name || "").replace(/\{[^}]+\}/g, (m) => (sample && sample[m] != null ? sample[m] : m));

// Aperçu (récursif) d'un dossier rendu.
function PreviewFolder({ folder, sample, depth }) {
  const name = fillTokens(folder.name, sample) || "(sans nom)";
  return (
    <div>
      <div style={{ paddingLeft: depth * 16 }}>
        📁 {name}{folder.per_learner ? <span style={{ color: "var(--dim)" }}> · un par stagiaire</span> : null}
      </div>
      {(folder.items || []).map((it) => (
        <div key={it.ref} style={{ paddingLeft: (depth + 1) * 16, color: "var(--muted)" }}>{it.type === "quiz" ? "❓" : "📄"} {it.label}</div>
      ))}
      {(folder.children || []).map((c) => <PreviewFolder key={c.id} folder={c} sample={sample} depth={depth + 1} />)}
    </div>
  );
}

// Aperçu en temps réel de l'arborescence rendue (champs remplacés par des exemples).
export function ArchiveTreePreview({ tree, code = "NIV1", title = "Formation" }) {
  const sample = {
    "{Année}": "2026", "{Semaine}": "S29", "{Code}": code || "NIV1",
    "{Formation}": title || "Formation", "{Dates}": "13/07→17/07", "{Stagiaire}": "DUPONT Jean",
  };
  const folders = tree?.folders || [];
  return (
    <div style={{ fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.7 }}>
      {folders.length === 0
        ? <span className="hint">L'aperçu apparaîtra ici.</span>
        : folders.map((f) => <PreviewFolder key={f.id} folder={f} sample={sample} depth={0} />)}
    </div>
  );
}

// Squelette standard : Année > Semaine > Code formation > (dossier par stagiaire).
const standardTree = () => ({
  folders: [{
    id: uid(), name: "{Année}", per_learner: false, items: [], children: [{
      id: uid(), name: "{Semaine}", per_learner: false, items: [], children: [{
        id: uid(), name: "{Code}", per_learner: false, items: [], children: [
          { id: uid(), name: "{Stagiaire}", per_learner: true, items: [], children: [] },
        ],
      }],
    }],
  }],
});

// Champs dynamiques (résolus à l'export) utilisables dans les noms de dossier.
const TOKENS = [
  { t: "{Année}", label: "Année de la session" },
  { t: "{Semaine}", label: "Semaine (n°)" },
  { t: "{Code}", label: "Code formation" },
  { t: "{Formation}", label: "Nom de la formation" },
  { t: "{Dates}", label: "Dates de la session" },
  { t: "{Stagiaire}", label: "Nom du stagiaire" },
];

// Un dossier de l'arborescence + ses documents attribués + ses sous-dossiers.
function FolderNode({ folder, docs, depth, onChange, onDelete }) {
  const set = (patch) => onChange({ ...folder, ...patch });
  const items = folder.items || [];
  const children = folder.children || [];

  function addItem(slug) {
    const d = docs.find((x) => x.slug === slug);
    if (!d || items.some((it) => it.ref === slug)) return;
    set({ items: [...items, { ref: d.slug, label: d.label, type: d.quiz_id ? "quiz" : "model" }] });
  }

  return (
    <div style={{ marginLeft: depth ? 16 : 0, borderLeft: depth ? "1px solid var(--border-soft)" : "none", paddingLeft: depth ? 12 : 0, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>📁</span>
        <input className="inp" style={{ maxWidth: 220, borderColor: String(folder.name || "").trim() ? undefined : "var(--ember1, #c0392b)" }}
          value={folder.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nom du dossier ou {champ}" />
        <select value="" title="Insérer un champ dynamique" onChange={(e) => { if (e.target.value) set({ name: (folder.name || "") + e.target.value }); }}>
          <option value="">＋ champ…</option>
          {TOKENS.map((k) => <option key={k.t} value={k.t}>{k.label}</option>)}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
          <input type="checkbox" checked={!!folder.per_learner} onChange={(e) => set({ per_learner: e.target.checked })} /> un dossier par stagiaire
        </label>
        <button type="button" className="btn sm ghost" onClick={() => set({ children: [...children, newFolder()] })}>＋ Sous-dossier</button>
        <button type="button" className="btn sm ghost danger" onClick={onDelete}>Supprimer</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "6px 0 2px" }}>
        {items.map((it, i) => (
          <span key={it.ref} className="pill" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {it.type === "quiz" ? "❓" : "📄"} {it.label}
            <button type="button" className="pf-x" title="Retirer" onClick={() => set({ items: items.filter((_, j) => j !== i) })}>✕</button>
          </span>
        ))}
        <select value="" onChange={(e) => addItem(e.target.value)}>
          <option value="">＋ Attribuer un document…</option>
          {docs.filter((d) => !items.some((it) => it.ref === d.slug)).map((d) => (
            <option key={d.slug} value={d.slug}>{d.label}</option>
          ))}
        </select>
      </div>

      {children.map((c) => (
        <FolderNode key={c.id} folder={c} docs={docs} depth={depth + 1}
          onChange={(nc) => set({ children: children.map((x) => (x.id === c.id ? nc : x)) })}
          onDelete={() => set({ children: children.filter((x) => x.id !== c.id) })} />
      ))}
    </div>
  );
}

// Éditeur d'arborescence d'archivage. `docs` = documents disponibles (modèles + QCM
// de la formation) ; `tree` = { folders:[...] } ; `onChange(tree)`.
export default function ArchiveTreeEditor({ tree, docs = [], onChange }) {
  const folders = tree?.folders || [];
  const setFolders = (f) => onChange({ folders: f });

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Vous composez l'<b>arborescence complète</b> de l'archive, depuis la racine : les dossiers de premier niveau sont créés à la racine
        de l'export. Utilisez les champs dynamiques pour les niveaux variables (année, semaine…) et cochez « un dossier par stagiaire »
        pour un dossier répété par apprenant. Chaque dossier peut recevoir des documents (modèles &amp; QCM).
      </p>
      <p className="hint" style={{ marginTop: 0, fontSize: 12 }}>
        Champs dynamiques (remplacés à l'export) : {TOKENS.map((k) => <code key={k.t} style={{ marginRight: 6 }}>{k.t}</code>)}
      </p>
      {folders.length === 0 && (
        <div style={{ margin: "8px 0" }}>
          <p className="hint">Aucun dossier. Partez d'une structure standard ou créez la vôtre.</p>
          <button type="button" className="btn sm ghost" onClick={() => onChange(standardTree())}>
            Insérer la structure standard (Année / Semaine / Code / Stagiaire)
          </button>
        </div>
      )}
      {folders.map((f) => (
        <FolderNode key={f.id} folder={f} docs={docs} depth={0}
          onChange={(nf) => setFolders(folders.map((x) => (x.id === f.id ? nf : x)))}
          onDelete={() => setFolders(folders.filter((x) => x.id !== f.id))} />
      ))}
      <button type="button" className="btn sm primary" style={{ marginTop: 12 }} onClick={() => setFolders([...folders, newFolder()])}>
        ＋ Ajouter un dossier
      </button>
    </div>
  );
}
