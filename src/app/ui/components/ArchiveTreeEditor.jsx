import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.jsx";
import { cleItem, apercuFormation, clesCouvertes, normaliserTitre, transformerDossiers as transformer, placerDocument } from "../lib/arborescence.js";

/*
 * L'ARBORESCENCE D'ARCHIVAGE, DESSINÉE COMME ELLE SERA RANGÉE (2026-09-25).
 *
 * L'ÉDITEUR D'AVANT était un formulaire par dossier : un champ, deux listes déroulantes pleine
 * largeur, une case et deux boutons — mesuré au banc, cinq dossiers occupaient 1 480 px, et le
 * squelette {Année} / {Semaine} / {Code} remplissait un écran avant le premier document. L'aperçu,
 * à côté, redessinait le même arbre une seconde fois : on éditait à gauche ce qu'on lisait à droite.
 *
 * ICI, UN SEUL ARBRE, qui se lit comme l'explorateur de fichiers qu'il produira : un dossier par
 * ligne, ses champs en pastilles et leur valeur d'exemple à côté (« Année → 2026 »), ses documents
 * dessous. On le modifie EN PLACE — cliquer un nom le renomme, « ＋ Document » ouvre une liste qu'on
 * filtre en tapant, « ⋯ » porte le reste. Choisi pour une formation, l'aperçu barre dans ce même
 * arbre ce qu'elle n'a pas, et liste ce que l'arborescence ne nomme pas, avec de quoi le placer.
 *
 * UN DOCUMENT, UNE PLACE. L'archive le range au premier dossier qui le nomme ; le placer à deux
 * endroits laissait croire à deux copies. Le choisir là où il n'est pas le DÉPLACE.
 */

const uid = () => Math.random().toString(36).slice(2, 9);
const newFolder = (name = "") => ({ id: uid(), name, per_learner: false, items: [], children: [] });

// Un dossier sans nom empêche l'enregistrement (récursif).
export function treeHasEmptyName(tree) {
  const check = (folders) => (folders || []).some((f) => !String(f.name || "").trim() || check(f.children));
  return check(tree && tree.folders);
}

// Champs dynamiques (résolus à l'export) utilisables dans les noms de dossier.
const CHAMPS = [
  { t: "{Année}", nom: "Année", aide: "Année de la session" },
  { t: "{Semaine}", nom: "Semaine", aide: "Semaine de la session (S02…)" },
  { t: "{Code}", nom: "Code", aide: "Code de la formation" },
  { t: "{Formation}", nom: "Formation", aide: "Nom de la formation" },
  { t: "{Dates}", nom: "Dates", aide: "Dates de la session" },
  { t: "{Stagiaire}", nom: "Stagiaire", aide: "Nom du stagiaire" },
  { t: "{Entreprise}", nom: "Entreprise", aide: "Nom de l'entreprise" },
];
const CHAMP = Object.fromEntries(CHAMPS.map((c) => [c.t, c]));

const exemples = (formation) => ({
  "{Année}": "2026", "{Semaine}": "S29", "{Code}": (formation && formation.code) || "NIV1",
  "{Formation}": (formation && formation.title) || "Formation", "{Dates}": "13-07→17-07",
  "{Stagiaire}": "DUPONT Jean", "{Entreprise}": "Pizza Napoli SARL",
});
const resoudre = (nom, ex) => String(nom || "").replace(/\{[^}]+\}/g, (m) => (ex[m] != null ? ex[m] : m));
/* Le nom tel que l'écran le lit : « {Année} › {Semaine} » devient « Année › Semaine ». */
const nomLisible = (nom) => String(nom || "").replace(/\{([^}]+)\}/g, "$1").trim() || "(sans nom)";

/** Le nom d'un dossier, ses champs en pastilles. */
function NomDossier({ nom }) {
  const parts = String(nom || "").split(/(\{[^}]+\})/g).filter(Boolean);
  if (!parts.length) return <span className="arbo-sans-nom">Dossier sans nom</span>;
  return parts.map((p, i) => (CHAMP[p]
    ? <span key={i} className="arbo-champ" title={CHAMP[p].aide}>{CHAMP[p].nom}</span>
    : <span key={i}>{p}</span>));
}

const iconeDossier = (d) => (d.per_learner ? "user" : /\{Entreprise\}/.test(d.name || "") ? "building" : "folder");
const iconeDoc = (it) => (it.type === "quiz" ? "help" : it.group ? "copy" : "file-text");

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
const itemDe = (o) => (o.group ? { type: o.type, group: o.group, members: o.members, label: o.label }
  : o.type === "quiz" ? { type: "quiz", titre: o.titre, label: o.label }
  : { type: o.type, ref: o.ref, label: o.label });

/* « RS7404 » ou « 5 formations » : qui a ce document. Rien quand toutes l'ont — c'est le cas
   courant, et le répéter partout n'apprend rien. */
function pourQui(formations, nbFormations) {
  const f = formations || [];
  if (!f.length || (nbFormations && f.length >= nbFormations)) return "";
  return f.length > 3 ? `${f.length} formations` : f.join(", ");
}

/* ─── Les opérations sur l'arbre, par identifiant de dossier ────────────────────────────────── */
const trouver = (folders, id) => {
  for (const f of folders || []) { if (f.id === id) return f; const s = trouver(f.children, id); if (s) return s; }
  return null;
};
const compter = (f) => (f.items || []).length + (f.children || []).reduce((n, c) => n + compter(c), 0);

/* ─── Une bulle (liste, menu), rendue dans un PORTAIL ───────────────────────────────────────────
   Même raison que MenuActions : dans la fenêtre, un ancêtre animé garde un `transform` qui ferait
   d'un `position:fixed` le prisonnier de la fenêtre. Et au-dessus d'elle : la fenêtre est à 100. */
function Bulle({ ancre, onClose, children, className = "" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!ancre) return;
    const r = ancre.getBoundingClientRect();
    const gauche = Math.max(8, Math.min(r.left, window.innerWidth - 340));
    setPos(r.bottom > window.innerHeight * 0.6
      ? { bottom: Math.round(window.innerHeight - r.top + 4), left: Math.round(gauche) }
      : { top: Math.round(r.bottom + 4), left: Math.round(gauche) });
  }, [ancre]);
  useEffect(() => {
    const dehors = (e) => { if (!ref.current?.contains(e.target) && !ancre?.contains(e.target)) onClose(); };
    const clavier = (e) => { if (e.key === "Escape") onClose(); };
    // Défiler DANS la bulle (une longue liste) ne la ferme pas ; défiler la page, si.
    const defile = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", clavier);
    window.addEventListener("scroll", defile, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", clavier);
      window.removeEventListener("scroll", defile, true);
      window.removeEventListener("resize", onClose);
    };
  }, [ancre, onClose]);
  if (!pos) return null;
  return createPortal(<div ref={ref} className={`arbo-bulle ${className}`} style={pos}>{children}</div>, document.body);
}

/* La liste des documents à placer : on tape pour filtrer. Ce qui est déjà ailleurs se DÉPLACE ici ;
   ce qu'un choix « OU » contient déjà se dit, et ne se place pas une seconde fois. */
function ChoixDocument({ options, placeDe, dossierId, nbFormations, onChoisir, onClose }) {
  const [q, setQ] = useState("");
  const champ = useRef(null);
  useEffect(() => { champ.current?.focus(); }, []);
  const n = normaliserTitre(q);
  const vus = options.filter((o) => !n || normaliserTitre(o.label).includes(n));
  const groupes = [
    ["Documents", vus.filter((o) => o.type !== "quiz" && !o.group)],
    ["Choix « OU »", vus.filter((o) => o.group)],
    ["QCM", vus.filter((o) => o.type === "quiz")],
  ].filter(([, l]) => l.length);
  return (
    <>
      <div className="arbo-bulle-recherche">
        <Icon name="search" size={14} aria-hidden="true" />
        <input ref={champ} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un document…"
          aria-label="Chercher un document" onKeyDown={(e) => {
            if (e.key === "Enter" && vus.length === 1) { onChoisir(vus[0]); onClose(); }
          }} />
      </div>
      <div className="arbo-bulle-liste" role="listbox" aria-label="Documents à placer">
        {groupes.length === 0 && <p className="arbo-bulle-vide">Aucun document ne correspond.</p>}
        {groupes.map(([titre, liste]) => (
          <div key={titre}>
            <div className="arbo-bulle-t">{titre}</div>
            {liste.map((o) => {
              const ou = placeDe.get(o.key);
              const ici = ou && ou.id === dossierId;
              const couvert = !ou && o.ref && placeDe.get(`ref:${o.ref}`); // compris dans un « OU » placé
              const qui = pourQui(o.formations, nbFormations);
              return (
                <button key={o.key} type="button" role="option" aria-selected={!!ici} disabled={ici || !!couvert}
                  className={"arbo-opt" + (ou ? " place" : "")}
                  onClick={() => { onChoisir(o); onClose(); }}
                  title={couvert ? `Déjà rangé par le choix « OU » placé dans « ${couvert.chemin.map((d) => nomLisible(d.name)).join(" › ")} »` : undefined}>
                  <Icon name={iconeDoc(o)} size={14} aria-hidden="true" />
                  <span className="arbo-opt-l">{o.company_level ? "🏢 " : ""}{o.label}</span>
                  {ici ? <span className="arbo-opt-ou">déjà ici</span>
                    : ou ? <span className="arbo-opt-ou">déplacer depuis « {nomLisible(ou.chemin[ou.chemin.length - 1].name)} »</span>
                    : couvert ? <span className="arbo-opt-ou">dans un « OU »</span>
                    : qui ? <span className="arbo-opt-qui">{qui}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── Un dossier ────────────────────────────────────────────────────────────────────────────── */
function Dossier({ d, ctx, profondeur }) {
  const { lectureSeule, ex, concerne, formation, options, placeDe, nbFormations, op, enEdition, setEnEdition } = ctx;
  const [bulle, setBulle] = useState(null); // { genre: "doc" | "menu", ancre }
  const edite = !lectureSeule && enEdition === d.id;
  const champ = useRef(null);
  useEffect(() => { if (edite) champ.current?.focus(); }, [edite]);
  const exemple = resoudre(d.name, ex);
  const vide = !(d.items || []).length && !(d.children || []).length;
  const fermer = () => setBulle(null);

  function inserer(t) {
    const el = champ.current;
    const nom = d.name || "";
    const i = el ? el.selectionStart ?? nom.length : nom.length;
    op.renommer(d.id, nom.slice(0, i) + t + nom.slice(el ? el.selectionEnd ?? i : i));
    requestAnimationFrame(() => { el?.focus(); const p = i + t.length; el?.setSelectionRange(p, p); });
  }

  return (
    <li className="arbo-noeud">
      <div className={"arbo-ligne" + (edite ? " edite" : "") + (!String(d.name || "").trim() ? " sans-nom" : "")}>
        <Icon name={iconeDossier(d)} size={16} className="arbo-ic-dossier" aria-hidden="true" />
        {edite ? (
          <div className="arbo-renommer">
            <input ref={champ} className="inp" value={d.name} placeholder="Nom du dossier"
              aria-label="Nom du dossier" onChange={(e) => op.renommer(d.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEnEdition(null); }} />
            <div className="arbo-champs-insert" aria-label="Insérer un champ">
              {CHAMPS.map((c) => (
                <button key={c.t} type="button" className="arbo-champ bouton" title={c.aide}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => inserer(c.t)}>＋ {c.nom}</button>
              ))}
              <button type="button" className="btn sm primary" onClick={() => setEnEdition(null)}>OK</button>
            </div>
          </div>
        ) : (
          <>
            {lectureSeule ? (
              <span className="arbo-nom"><NomDossier nom={d.name} /></span>
            ) : (
              <button type="button" className="arbo-nom" onClick={() => setEnEdition(d.id)} title="Renommer">
                <NomDossier nom={d.name} />
              </button>
            )}
            {/[{]/.test(d.name || "") && exemple.trim() && <span className="arbo-exemple">→ {exemple}</span>}
            {d.per_learner && <span className="arbo-tag">un par stagiaire</span>}
            {!lectureSeule && (
              <span className="arbo-actions">
                <button type="button" className="arbo-act" onClick={(e) => setBulle({ genre: "doc", ancre: e.currentTarget })}
                  aria-label={`Placer un document dans ${nomLisible(d.name)}`}>
                  <Icon name="plus" size={13} /> Document
                </button>
                <button type="button" className="arbo-act seul" onClick={(e) => setBulle({ genre: "menu", ancre: e.currentTarget })}
                  aria-label={`Autres actions pour ${nomLisible(d.name)}`}>
                  <Icon name="menu" size={14} />
                </button>
              </span>
            )}
          </>
        )}
      </div>

      {((d.items || []).length > 0 || (d.children || []).length > 0 || (!lectureSeule && vide)) && (
        <ul className="arbo-ul">
          {(d.items || []).map((it) => {
            const cle = cleItem(it);
            const saute = concerne && !concerne(it);
            const opt = options.find((o) => o.key === cle);
            const qui = opt ? pourQui(opt.formations, nbFormations) : "";
            return (
              <li key={cle} className={"arbo-doc" + (saute ? " saute" : "")}
                title={saute ? `Pas dans le parcours de ${formation.code} : sauté pour cette formation` : undefined}>
                <Icon name={iconeDoc(it)} size={14} className={"arbo-ic-doc" + (it.type === "quiz" ? " qcm" : it.group ? " ou" : "")} aria-hidden="true" />
                <span className="arbo-doc-l">{it.label}</span>
                {it.group && <span className="arbo-tag ou" title="Choix « OU » : le bon variant est retenu selon le dossier">OU</span>}
                {qui && <span className="arbo-doc-qui">{qui}</span>}
                {!lectureSeule && (
                  <button type="button" className="arbo-retirer" onClick={() => op.retirerDoc(d.id, cle)}
                    aria-label={`Retirer ${it.label} de ${nomLisible(d.name)}`} title="Retirer de ce dossier">
                    <Icon name="x" size={12} />
                  </button>
                )}
              </li>
            );
          })}
          {!lectureSeule && vide && (
            <li className="arbo-vide">Dossier vide — <button type="button" className="lien-nu" onClick={(e) => setBulle({ genre: "doc", ancre: e.currentTarget })}>placer un document</button></li>
          )}
          {(d.children || []).map((c) => <Dossier key={c.id} d={c} ctx={ctx} profondeur={profondeur + 1} />)}
        </ul>
      )}

      {bulle && bulle.genre === "doc" && (
        <Bulle ancre={bulle.ancre} onClose={fermer} className="large">
          <ChoixDocument options={options} placeDe={placeDe} dossierId={d.id} nbFormations={nbFormations}
            onChoisir={(o) => op.placer(d.id, o)} onClose={fermer} />
        </Bulle>
      )}
      {bulle && bulle.genre === "menu" && (
        <Bulle ancre={bulle.ancre} onClose={fermer} className="menu">
          <button type="button" onClick={() => { fermer(); setEnEdition(d.id); }}><Icon name="pencil" size={14} /> Renommer</button>
          <button type="button" onClick={() => { fermer(); op.ajouterEnfant(d.id); }}><Icon name="folder" size={14} /> Ajouter un sous-dossier</button>
          <button type="button" role="menuitemcheckbox" aria-checked={!!d.per_learner}
            onClick={() => { fermer(); op.basculerParStagiaire(d.id); }}>
            <Icon name={d.per_learner ? "check" : "user"} size={14} /> {d.per_learner ? "Un dossier par stagiaire : oui" : "Un dossier par stagiaire"}
          </button>
          <button type="button" className="danger" onClick={() => { fermer(); op.supprimer(d.id); }}>
            <Icon name="trash" size={14} /> Supprimer le dossier
          </button>
        </Bulle>
      )}
    </li>
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

/**
 * L'arborescence commune — à modifier (`onChange`) ou à lire (`lectureSeule`).
 *   `docs`      la palette (GET /formations/arborescence) : modèles, pièces, QCM par titre, et qui les a ;
 *   `formation` ({ code, title, documents }) : l'aperçu POUR elle — barré ce qu'elle n'a pas, et la
 *               liste de ce que l'arborescence ne nomme pas ;
 *   `groupes`   les « OU » d'aujourd'hui (clé → membres), `palette` (clé → libellé).
 */
export default function ArchiveTreeEditor({ tree, docs = [], eqMap, onChange, nbFormations = 0, formation = null,
  palette = null, groupes = null, lectureSeule = false }) {
  const folders = useMemo(() => tree?.folders || [], [tree]);
  const [enEdition, setEnEdition] = useState(null);
  const options = useMemo(() => buildOptions(docs, eqMap), [docs, eqMap]);
  const ex = exemples(formation);
  const ap = formation ? apercuFormation(tree, formation.documents, groupes) : null;

  /* Où chaque document est déjà rangé (clé → dossier et chemin) — et ce qu'un « OU » placé couvre. */
  const placeDe = useMemo(() => {
    const m = new Map();
    const parcourir = (fs, chemin) => (fs || []).forEach((f) => {
      const ici = [...chemin, f];
      for (const it of f.items || []) {
        const k = cleItem(it);
        if (k && !m.has(k)) m.set(k, { id: f.id, chemin: ici });
        if (it.group) for (const c of clesCouvertes(it, groupes)) if (!m.has(c)) m.set(c, { id: f.id, chemin: ici, via: k });
      }
      parcourir(f.children, ici);
    });
    parcourir(folders, []);
    return m;
  }, [folders, groupes]);

  const set = (fs) => onChange({ folders: fs });
  const op = {
    renommer: (id, name) => set(transformer(folders, (f) => (f.id === id ? { ...f, name } : f))),
    basculerParStagiaire: (id) => set(transformer(folders, (f) => (f.id === id ? { ...f, per_learner: !f.per_learner } : f))),
    ajouterEnfant: (id) => {
      const n = newFolder();
      set(transformer(folders, (f) => (f.id === id ? { ...f, children: [...(f.children || []), n] } : f)));
      setEnEdition(n.id);
    },
    supprimer: (id) => {
      const f = trouver(folders, id);
      const n = f ? compter(f) : 0;
      if (n && !window.confirm(`Supprimer « ${nomLisible(f.name)} » et ce qu'il contient (${n} élément${n > 1 ? "s" : ""}) ?`)) return;
      set(transformer(folders, (x) => (x.id === id ? null : x)));
    },
    retirerDoc: (id, cle) => set(transformer(folders, (f) => (f.id === id ? { ...f, items: (f.items || []).filter((it) => cleItem(it) !== cle) } : f))),
    // Placer, c'est aussi DÉPLACER : une place par document (lib/arborescence.js).
    placer: (id, o) => set(placerDocument(folders, id, itemDe(o), groupes)),
  };
  const ctx = { lectureSeule, ex, concerne: ap && ap.concerne, formation, options, placeDe, nbFormations, op, enEdition, setEnEdition };

  /* Où placer un document que l'arborescence ne nomme pas : chaque dossier, par son chemin lisible. */
  const cheminsDossiers = useMemo(() => {
    const out = [];
    const parcourir = (fs, chemin) => (fs || []).forEach((f) => {
      const ici = [...chemin, nomLisible(f.name)];
      out.push({ id: f.id, libelle: ici.join(" › ") + (f.per_learner ? " (un par stagiaire)" : "") });
      parcourir(f.children, ici);
    });
    parcourir(folders, []);
    return out;
  }, [folders]);

  return (
    <div className={"arbo" + (lectureSeule ? " lecture" : "")}>
      {folders.length === 0 ? (
        <div className="arbo-rien">
          <p>Aucun dossier pour l'instant.</p>
          {!lectureSeule && (
            <button type="button" className="btn sm" onClick={() => onChange(standardTree())}>
              Partir de la structure standard (Année › Semaine › Code › Stagiaire)
            </button>
          )}
        </div>
      ) : (
        <ul className="arbo-ul racine">
          {folders.map((f) => <Dossier key={f.id} d={f} ctx={ctx} profondeur={0} />)}
        </ul>
      )}
      {!lectureSeule && (
        <button type="button" className="btn sm ghost arbo-racine" onClick={() => { const n = newFolder(); set([...folders, n]); setEnEdition(n.id); }}>
          <Icon name="plus" size={13} /> Dossier à la racine
        </button>
      )}

      {/* CE QUE L'ARBORESCENCE NE NOMME PAS N'EST PAS PERDU — il ira dans le dossier du stagiaire —,
          mais mieux vaut le savoir, et le placer d'ici, avant de remettre une archive à un contrôleur. */}
      {ap && ap.nonPlaces.length > 0 && (
        <div className="arbo-non-places">
          <div className="arbo-non-places-t">
            <Icon name="info" size={15} aria-hidden="true" />
            <span><b>{ap.nonPlaces.length} document{ap.nonPlaces.length > 1 ? "s" : ""} de {formation.code}</b> ne {ap.nonPlaces.length > 1 ? "sont" : "est"} nommé{ap.nonPlaces.length > 1 ? "s" : ""} nulle part : {ap.nonPlaces.length > 1 ? "ils iront" : "il ira"} dans le dossier du stagiaire.</span>
          </div>
          <ul>
            {ap.nonPlaces.map((c) => {
              const o = options.find((x) => x.key === c || (x.group && clesCouvertes(itemDe(x), groupes).includes(c)));
              return (
                <li key={c}>
                  <Icon name={c.startsWith("qcm:") ? "help" : "file-text"} size={14} aria-hidden="true" />
                  <span className="arbo-doc-l">{(palette && palette.get(c)) || c}</span>
                  {!lectureSeule && o && cheminsDossiers.length > 0 && (
                    <select value="" aria-label={`Placer ${(palette && palette.get(c)) || c}`}
                      onChange={(e) => { if (e.target.value) op.placer(e.target.value, o); }}>
                      <option value="">Placer dans…</option>
                      {cheminsDossiers.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** L'arborescence en LECTURE (l'onglet d'une formation) : le même dessin, sans rien à modifier. */
export function ArchiveTreePreview(props) {
  return <ArchiveTreeEditor {...props} lectureSeule onChange={() => {}} />;
}
