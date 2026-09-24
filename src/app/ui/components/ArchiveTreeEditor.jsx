import { Icon } from "./Icon.jsx";
import { cleItem, apercuFormation } from "../lib/arborescence.js";

const uid = () => Math.random().toString(36).slice(2, 9);
const newFolder = () => ({ id: uid(), name: "", per_learner: false, items: [], children: [] });

// Un dossier sans nom empêche l'enregistrement (récursif).
export function treeHasEmptyName(tree) {
  const check = (folders) => (folders || []).some((f) => !String(f.name || "").trim() || check(f.children));
  return check(tree && tree.folders);
}

// Remplace {champ} par sa valeur d'exemple pour l'aperçu.
const fillTokens = (name, sample) => String(name || "").replace(/\{[^}]+\}/g, (m) => (sample && sample[m] != null ? sample[m] : m));

/* Aperçu (récursif) d'un dossier rendu. Pour une formation donnée, un document qu'elle n'a pas est
   GRISÉ, pas caché : c'est une place de l'arborescence commune, simplement sautée pour elle. */
function PreviewFolder({ folder, sample, depth, concerne, code }) {
  const name = fillTokens(folder.name, sample) || "(sans nom)";
  return (
    <div>
      <div style={{ paddingLeft: depth * 16 }}>
        <Icon name="folder" size={13} style={{ verticalAlign: "text-bottom" }} /> {name}{folder.per_learner ? <span style={{ color: "var(--dim)" }}> · un par stagiaire</span> : null}
      </div>
      {(folder.items || []).map((it) => {
        const saute = concerne && !concerne(it);
        return (
          <div key={cleItem(it)} className={saute ? "arbo-saute" : undefined}
            style={{ paddingLeft: (depth + 1) * 16, color: saute ? "var(--dim)" : "var(--muted)" }}
            title={saute ? `Pas dans le parcours de ${code} : sauté pour cette formation` : undefined}>
            {itemIcon(it.type)} {it.label}{it.group ? " (le variant du dossier)" : ""}
          </div>
        );
      })}
      {(folder.children || []).map((c) => <PreviewFolder key={c.id} folder={c} sample={sample} depth={depth + 1} concerne={concerne} code={code} />)}
    </div>
  );
}

/**
 * Aperçu en temps réel de l'arborescence rendue (champs remplacés par des exemples).
 * `formation` ({ code, title, documents }) : l'aperçu POUR elle — ce qui lui est sauté, grisé, et
 * ce que l'arborescence ne nomme pas, listé dessous. `palette` (clé → libellé) nomme ces derniers ;
 * `groupes` (clé de « OU » → membres d'aujourd'hui) dit ce qu'un « OU » couvre.
 */
export function ArchiveTreePreview({ tree, code = "NIV1", title = "Formation", formation = null, palette = null, groupes = null }) {
  const sample = {
    "{Année}": "2026", "{Semaine}": "S29", "{Code}": (formation && formation.code) || code || "NIV1",
    "{Formation}": (formation && formation.title) || title || "Formation", "{Dates}": "13-07→17-07", "{Stagiaire}": "DUPONT Jean",
    "{Entreprise}": "Pizza Napoli SARL",
  };
  const folders = tree?.folders || [];
  const ap = formation ? apercuFormation(tree, formation.documents, groupes) : null;
  return (
    <div style={{ fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.7 }}>
      {/* UNE LÉGENDE, PAS UNE MENTION PAR LIGNE : répété sur chaque document sauté, « sauté pour … »
          repliait les noms longs sur trois lignes et noyait ceux qui, eux, seront rangés. */}
      {ap && folders.length > 0 && (
        <div className="arbo-legende">Barré : pas dans le parcours de {formation.code}, sauté pour elle.</div>
      )}
      {folders.length === 0
        ? <span className="hint">L'aperçu apparaîtra ici.</span>
        : folders.map((f) => <PreviewFolder key={f.id} folder={f} sample={sample} depth={0} concerne={ap && ap.concerne} code={formation && formation.code} />)}
      {/* CE QUE L'ARBORESCENCE NE NOMME PAS N'EST PAS PERDU — il ira dans le dossier du stagiaire —,
          mais mieux vaut le savoir avant de remettre l'archive à un contrôleur. */}
      {ap && ap.nonPlaces.length > 0 && (
        <div className="arbo-non-places">
          <b>{ap.nonPlaces.length} document{ap.nonPlaces.length > 1 ? "s" : ""} de {formation.code} que l'arborescence ne nomme pas</b>
          <span> — ils iront dans le dossier du stagiaire :</span>
          <ul>{ap.nonPlaces.map((c) => <li key={c}>{(palette && palette.get(c)) || c}</li>)}</ul>
        </div>
      )}
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
  { t: "{Entreprise}", label: "Nom de l'entreprise" },
];

/* Construit la liste des documents attribuables, depuis la palette de TOUTES les formations :
   - un QCM y figure UNE fois, par son titre — chaque formation range le sien à cette place ;
   - les variantes « OU » (même ÉQUIVALENCE, cf. Modèles → Équivalences) fusionnent en UNE option,
     résolue au bon variant par dossier à l'export.
   Chaque option garde la liste des formations qui ont le document. */
function buildOptions(docs, eqMap) {
  const groupKeyOf = (d) => (d.slug && eqMap && eqMap.get(d.slug) ? eqMap.get(d.slug).group : null);
  const options = [];
  const done = new Set();
  const union = (listes) => [...new Set(listes.flat())];
  for (const d of docs) {
    if (d.titre_qcm) {
      options.push({ key: d.cle, type: "quiz", titre: d.titre_qcm, label: d.label, company_level: false, formations: d.formations || [] });
      continue;
    }
    const gk = groupKeyOf(d);
    const members = gk ? docs.filter((x) => groupKeyOf(x) === gk) : [d];
    if (gk && members.length > 1) {
      if (done.has(gk)) continue;
      done.add(gk);
      options.push({
        key: `ou:${gk}`, group: gk, members: members.map((m) => m.slug),
        label: members.map((m) => m.label).join(" / "), type: "model",
        company_level: members.some((m) => m.company_level),
        formations: union(members.map((m) => m.formations || [])),
      });
    } else {
      options.push({ key: `ref:${d.slug}`, ref: d.slug, label: d.label, type: "model", company_level: !!d.company_level, formations: d.formations || [] });
    }
  }
  return options;
}
const itemIcon = (t) => <Icon name={t === "quiz" ? "help" : "file-text"} size={13} style={{ verticalAlign: "text-bottom" }} />;

/* « Devis RS7404 — RS7404 » : un document que toutes les formations n'ont pas dit lesquelles l'ont.
   Au-delà de quatre, un compte : la liste ne sert plus à lire. */
function pourQui(o, nbFormations) {
  const f = o.formations || [];
  if (!f.length || f.length >= nbFormations) return "";
  return f.length > 4 ? ` — ${f.length} formations` : ` — ${f.join(", ")}`;
}

// Un dossier de l'arborescence + ses documents attribués + ses sous-dossiers.
function FolderNode({ folder, options, depth, onChange, onDelete, nbFormations }) {
  const set = (patch) => onChange({ ...folder, ...patch });
  const items = folder.items || [];
  const children = folder.children || [];

  function addItem(key) {
    const o = options.find((x) => x.key === key);
    if (!o || items.some((it) => cleItem(it) === o.key)) return;
    const item = o.group ? { type: o.type, group: o.group, members: o.members, label: o.label }
      : o.type === "quiz" ? { type: "quiz", titre: o.titre, label: o.label }
      : { type: o.type, ref: o.ref, label: o.label };
    set({ items: [...items, item] });
  }

  return (
    <div style={{ marginLeft: depth ? 16 : 0, borderLeft: depth ? "1px solid var(--border-soft)" : "none", paddingLeft: depth ? 12 : 0, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", color: "var(--muted)" }}><Icon name="folder" size={16} /></span>
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
          <span key={cleItem(it)} className="pill" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            title={it.group ? "Choix « OU » : le bon variant est retenu selon le dossier"
              : it.type === "quiz" ? "QCM : chaque formation range ici le sien, de ce titre" : undefined}>
            {itemIcon(it.type)} {it.label}{it.group ? " (OU)" : ""}
            <button type="button" className="pf-x" title="Retirer" onClick={() => set({ items: items.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
          </span>
        ))}
        <select value="" onChange={(e) => addItem(e.target.value)}>
          <option value="">＋ Attribuer un document…</option>
          {/* 🏢 = document de GROUPE (une seule signature collective) — repère utile côté
              archivage entreprise, où documents de groupe et de stagiaires cohabitent. */}
          {options.filter((o) => !items.some((it) => cleItem(it) === o.key)).map((o) => (
            <option key={o.key} value={o.key}>{o.company_level ? "🏢 " : ""}{o.label}{pourQui(o, nbFormations)}</option>
          ))}
        </select>
      </div>

      {children.map((c) => (
        <FolderNode key={c.id} folder={c} options={options} depth={depth + 1} nbFormations={nbFormations}
          onChange={(nc) => set({ children: children.map((x) => (x.id === c.id ? nc : x)) })}
          onDelete={() => set({ children: children.filter((x) => x.id !== c.id) })} />
      ))}
    </div>
  );
}

/* Éditeur de l'arborescence d'archivage COMMUNE à toutes les formations. `docs` = la palette
   (GET /formations/arborescence : modèles, pièces, QCM par titre, avec leurs formations) ;
   `tree` = { folders:[...] } ; `onChange(tree)` ; `nbFormations` pour dire qui a quoi. */
export default function ArchiveTreeEditor({ tree, docs = [], eqMap, onChange, nbFormations = 0 }) {
  const folders = tree?.folders || [];
  const options = buildOptions(docs, eqMap);
  const setFolders = (f) => onChange({ folders: f });

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Vous composez l'<b>arborescence complète</b> de l'archive, depuis la racine, <b>une fois pour toutes les formations</b> :
        un document qu'une formation n'a pas y est simplement sauté pour elle. Utilisez les champs dynamiques pour les niveaux
        variables (année, semaine…) et cochez « un dossier par stagiaire » pour un dossier répété par apprenant. Un QCM se place
        par son titre : chaque formation y range le sien.
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
        <FolderNode key={f.id} folder={f} options={options} depth={0} nbFormations={nbFormations}
          onChange={(nf) => setFolders(folders.map((x) => (x.id === f.id ? nf : x)))}
          onDelete={() => setFolders(folders.filter((x) => x.id !== f.id))} />
      ))}
      <button type="button" className="btn sm primary" style={{ marginTop: 12 }} onClick={() => setFolders([...folders, newFolder()])}>
        ＋ Ajouter un dossier
      </button>
    </div>
  );
}
