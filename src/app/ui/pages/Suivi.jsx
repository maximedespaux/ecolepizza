import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../components/Icon.jsx";
import { useNavigate } from "react-router-dom";
import {
  getSuivi, getArchives, downloadDocumentPdf,
  importArchives, archiveFileUrl, downloadArchiveFile, bulkDeleteArchives, getArchiveStockage, pieceFichierUrl } from "../api/apiClient.js";
import ProgressPct from "../components/ProgressPct.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { peutEcrire } from "../lib/nav.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Roadmap from "../components/Roadmap.jsx";
import { stepState, manquesParFormation, dossiersDuManque } from "../lib/etapes.js";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import { scoreBadge, colorOf, dateHeure } from "../lib/format.js";

/* Les états d'une PIÈCE ne sont pas ceux d'un document : elle n'est ni envoyée ni signée,
   elle est déposée puis vérifiée. Sans ces deux entrées, le coffre affichait « VALIDEE » brut
   en gris, au milieu de libellés soignés. */
const DOC_STATUS = { ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"], ARCHIVE: ["Archivé", "n"],
  VALIDEE: ["Validée", "g"], DEPOSEE: ["À vérifier", "a"] };
const SCORE_ORDER = { ROUGE: 0, ORANGE: 1, VERT: 2 };


const RM_TAG = { todo: "À faire", progress: "En cours", done: "Terminé" };

// Feuille de route agrégée d'une entreprise : une étape par document du parcours,
// avec le nombre de stagiaires ayant terminé cette étape.
function CompanyRoadmap({ steps }) {
  return (
    <div className="roadmap">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <div className="rm-step" key={s.type + i}>
            <div className="rm-rail">
              <span className={`rm-dot ${s.state}`}>{s.state === "done" ? <Icon name="check" size={14} /> : i + 1}</span>
              {!last && <span className={`rm-conn ${s.state === "done" ? "done" : ""}`} />}
            </div>
            <div className="rm-body">
              <b>{s.label}</b>
              <span className={`rm-tag ${s.state}`}>
                {s.company_level
                  ? `${RM_TAG[s.state]} · document de groupe (organisme + entreprise)`
                  : `${RM_TAG[s.state]} · ${s.done}/${s.total} stagiaire(s)${s.signable ? " · à signer" : ""}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Ligne d'un dossier stagiaire (repliable) : entête + feuille de route au clic.
function DossierRow({ d, isOpen, onToggle, navigate, nested }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", background: nested ? "var(--surface2)" : undefined }}>
      <button type="button" onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ transition: ".15s", transform: isOpen ? "rotate(90deg)" : "none", color: "var(--dim)" }}><Icon name="chevron-right" size={12} /></span>
        <span className="badge n mono" style={{ background: colorOf(d.program_code), color: "#fff", borderColor: "transparent" }}>{d.program_code}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b>{d.last_name} {d.first_name}</b>
          <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
            {d.program_title} · {d.done}/{d.total} étape(s){d.to_sign ? ` · ${d.signed}/${d.to_sign} signé(s)` : ""}
          </span>
        </span>
        <ProgressPct percent={d.percent} score={d.score} />
        <Badge tone={scoreBadge(d.score)}>{d.score}</Badge>
      </button>
      {isOpen && (
        <div style={{ padding: "12px 16px 14px 40px", borderTop: "1px solid var(--border-soft)" }}>
          <Roadmap steps={d.documents} />
          <button className="btn sm primary" style={{ marginTop: 6 }} onClick={() => navigate(`/stagiaires/${d.learner_id}`)}>
            Gérer &amp; envoyer les documents →
          </button>
        </div>
      )}
    </div>
  );
}

function Suivi() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("conformite");
  const [dossiers, setDossiers] = useState([]);
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState({});

  useEffect(() => {
    getSuivi().then((r) => setDossiers(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }, []);

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const count = (score) => dossiers.filter((d) => d.score === score).length;

  /* CE QUI MANQUE, nommé. Devant un auditeur, le taux ne sert à rien : ce qu'on demande, c'est
     LA PIÈCE ABSENTE. Un « 94 % » rassurant cache précisément les 6 % qu'il faut aller chercher,
     et la page les enfermait dans des lignes repliées qu'il fallait ouvrir une à une.
     On agrège donc par TYPE de document : c'est ainsi qu'on traite: on ne relance pas
     « le dossier Durand », on édite les douze conventions qui manquent. */
  const [manqueFiltre, setManqueFiltre] = useState(null);
  const manques = useMemo(() => manquesParFormation(dossiers), [dossiers]);

  /* LE CODE NE S'AFFICHE QUE S'IL DISTINGUE QUELQUE CHOSE. Sur un organisme qui n'a qu'une
     formation en cours, le répéter sur chaque carte est du bruit — et la couleur ne dirait rien
     non plus, puisqu'elle serait la même partout. */
  const plusieursFormations = useMemo(
    () => new Set(manques.map((m) => m.code)).size > 1, [manques]);

  // Cliquer un manque filtre la liste : la page se termine par un geste, pas par un constat.
  const dossiersVus = useMemo(() => dossiersDuManque(dossiers, manqueFiltre), [dossiers, manqueFiltre]);

  // Regroupe les dossiers par entreprise : un stagiaire ajouté par une entreprise
  // apparaît sous l'entreprise (complétion agrégée), les autres restent autonomes.
  // On préserve l'ordre de tri du backend (incomplets d'abord).
  const groups = useMemo(() => {
    const byCompany = new Map();
    const out = [];
    for (const d of dossiersVus) {
      if (d.company_id) {
        let g = byCompany.get(d.company_id);
        if (!g) {
          g = { type: "company", company_id: d.company_id, company_name: d.company_name || "Entreprise", members: [] };
          byCompany.set(d.company_id, g);
          out.push(g);
        }
        g.members.push(d);
      } else {
        out.push({ type: "solo", d });
      }
    }
    // Agrégats par entreprise : % = somme(étapes faites)/somme(étapes) ; score = pire membre.
    for (const g of out) {
      if (g.type !== "company") continue;
      const done = g.members.reduce((s, m) => s + (m.done || 0), 0);
      const total = g.members.reduce((s, m) => s + (m.total || 0), 0);
      g.percent = total ? Math.round((done / total) * 100) : 0;
      g.done = done; g.total = total;
      g.score = g.members.reduce((worst, m) =>
        SCORE_ORDER[m.score] < SCORE_ORDER[worst] ? m.score : worst, "VERT");
      // Feuille de route agrégée : gabarit = dossier au parcours le plus complet,
      // puis on compte, par étape, les stagiaires l'ayant terminée / en cours.
      const template = g.members.reduce((a, b) =>
        (b.documents?.length || 0) > (a.documents?.length || 0) ? b : a, g.members[0]);
      const stepMap = new Map();
      (template.documents || []).forEach((s) =>
        stepMap.set(s.type, { type: s.type, label: s.label, signable: !!s.stagiaireSign, company_level: !!s.company_level, done: 0, prog: 0, total: 0 }));
      for (const m of g.members) {
        for (const doc of (m.documents || [])) {
          const st = stepMap.get(doc.type);
          if (!st) continue;
          const s = stepState(doc);
          /* HORS DÉCOMPTE AVANT D'INCRÉMENTER LE TOTAL. Une remise « sans objet » (migration 161)
             sort des DEUX côtés de la fraction : la compter au dénominateur empêcherait le
             groupe d'atteindre cent pour cent dès qu'une seule personne est écartée. */
          if (s === "skip") continue;
          st.total++;
          if (s === "done") st.done++; else if (s === "progress") st.prog++;
        }
      }
      g.documents = [...stepMap.values()].map((st) => ({
        ...st,
        // Document de groupe : UNE signature partagée (organisme + entreprise), pas par
        // stagiaire → l'état est simplement signé / en cours / à faire.
        state: st.total && st.done === st.total ? "done" : (st.done || st.prog) ? "progress" : "todo",
      }));
    }
    return out;
  }, [dossiersVus]);

  return (
    <>
      <PageHead
        eyebrow="Qualiopi"
        title="Suivi de conformité"
        lead="Conformité des dossiers et coffre des documents signés."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button className={"btn sm " + (tab === "conformite" ? "primary" : "ghost")} onClick={() => setTab("conformite")}>Conformité</button>
            <button className={"btn sm " + (tab === "archives" ? "primary" : "ghost")} onClick={() => setTab("archives")}>Archives</button>
          </div>
        }
      />
      <StatusMessage status={status} />

      {tab === "conformite" ? (
        <>
          {/* LES MANQUES PASSENT DEVANT LES TAUX. La page ouvrait sur trois compteurs de
              dossiers ; on n'y voyait donc jamais CE QU'IL FAUT ALLER CHERCHER, enfermé dans
              des lignes repliées à ouvrir une à une. Chaque pièce absente est ici nommée,
              comptée, et filtre la liste au clic. */}
          {manques.length > 0 ? (
            <div className="manque">
              <div className="manque-t">
                Ce qui manque
                {manqueFiltre && (
                  <button type="button" className="btn sm ghost" onClick={() => setManqueFiltre(null)}>
                    <Icon name="x" size={12} /> Tout voir
                  </button>
                )}
              </div>
              <div className="manque-row">
                {manques.map((m) => {
                  const actif = manqueFiltre && manqueFiltre.cle === m.cle;
                  /* `--teinte` PLUTÔT QU'UN STYLE PAR PROPRIÉTÉ : la CSS s'en sert pour le
                     liseré, le chiffre, la bordure au survol ET le fond de l'état choisi. Une
                     variable posée ici les emmène tous les quatre, sans dupliquer les règles
                     en JavaScript — et sans couleur, la carte retombe sur le rouge d'origine.
                     La palette est celle de `colorOf` : même code couleur que les badges de
                     formation et l'arbre des archives, pour qu'une couleur veuille dire la
                     même chose partout dans l'application. */
                  const teinte = plusieursFormations && m.code ? colorOf(m.code) : null;
                  return (
                    <button key={m.cle} type="button" aria-pressed={!!actif}
                      className={"manque-i" + (actif ? " on" : "")}
                      style={teinte ? { "--teinte": teinte } : undefined}
                      aria-label={`${m.n} ${m.label}${m.code ? ` — formation ${m.code}` : ""}`}
                      onClick={() => setManqueFiltre((f) => (f && f.cle === m.cle ? null : m))}>
                      <b className="chiffres">{m.n}</b>
                      <span>{m.label}{plusieursFormations && m.code && <i>{m.code}</i>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : dossiers.length > 0 && (
            <div className="todo-calme">
              <Icon name="check-circle" size={17} aria-hidden="true" />
              Tous les dossiers sont complets, aucune pièce manquante à produire.
            </div>
          )}

          {/* Les compteurs descendent : ils résument, ils ne se traitent pas. */}
          <div className="compteurs">
            <span><b className="chiffres">{count("ROUGE")}</b> incomplet{count("ROUGE") > 1 ? "s" : ""}</span><i />
            <span><b className="chiffres">{count("ORANGE")}</b> en cours</span><i />
            <span><b className="chiffres">{count("VERT")}</b> complet{count("VERT") > 1 ? "s" : ""}</span>
          </div>

          <Card title={`Dossiers (${dossiersVus.length}${manqueFiltre ? ` sur ${dossiers.length}` : ""})`}>
            {dossiersVus.length === 0 ? (
              <EmptyState icon="clipboard-check">{dossiers.length === 0 ? "Aucun dossier à suivre." : "Aucun dossier ne manque cette pièce."}</EmptyState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {groups.map((g) => {
                  if (g.type === "solo") {
                    const d = g.d;
                    return (
                      <DossierRow key={d.enrollment_id} d={d} isOpen={!!open[d.enrollment_id]}
                        onToggle={() => toggle(d.enrollment_id)} navigate={navigate} />
                    );
                  }
                  // Groupe entreprise : entête agrégé + stagiaires imbriqués.
                  const ckey = `c:${g.company_id}`;
                  const cOpen = !!open[ckey];
                  return (
                    <div key={ckey} className="card" style={{ padding: 0, overflow: "hidden", borderColor: "var(--ember1, #c0392b)" }}>
                      <button type="button" onClick={() => toggle(ckey)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ transition: ".15s", transform: cOpen ? "rotate(90deg)" : "none", color: "var(--dim)" }}><Icon name="chevron-right" size={12} /></span>
                        <span style={{ width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", flexShrink: 0, background: "linear-gradient(135deg,#c0392b,#e0932e)", color: "#fff" }}><Icon name="building" size={15} /></span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{g.company_name}</b>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                            {g.members.length} stagiaire(s) · {g.done}/{g.total} étape(s)
                          </span>
                        </span>
                        <ProgressPct percent={g.percent} score={g.score} />
                        <Badge tone={scoreBadge(g.score)}>{g.score}</Badge>
                      </button>
                      {cOpen && (
                        <div style={{ padding: "10px 14px 14px 34px", borderTop: "1px solid var(--border-soft)", display: "flex", flexDirection: "column", gap: 8 }}>
                          {g.documents?.length > 0 && (
                            <div style={{ marginBottom: 4 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "var(--dim)", marginBottom: 6 }}>PARCOURS DU GROUPE</div>
                              <CompanyRoadmap steps={g.documents} />
                            </div>
                          )}
                          {g.members.map((d) => (
                            <DossierRow key={d.enrollment_id} d={d} isOpen={!!open[d.enrollment_id]}
                              onToggle={() => toggle(d.enrollment_id)} navigate={navigate} nested />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : (
        <ArchivesView
          onError={(m) => setStatus({ type: "error", message: m })}
          onInfo={(m) => setStatus({ type: "success", message: m })}
        />
      )}
    </>
  );
}

// Construit l'arbre année → semaine → formation → stagiaire → documents.
function buildTree(rows) {
  const years = {};
  for (const r of rows) {
    const y = r.year != null ? String(r.year) : "-";
    const wKey = r.week != null ? String(r.week) : "-";
    const fKey = r.program_code || "-";
    /* Feuille = stagiaire, ENTREPRISE pour un document de groupe (scope COMPANY), ou LA SESSION
       elle-même (scope SESSION, migration 157) — un contrat d'hygiène signé par un intervenant
       externe n'appartient à personne en particulier. Sans cette troisième feuille, il tombait
       sous un nom vide, entre deux stagiaires, et devenait introuvable.
       UNE SEULE FEUILLE PAR SEMAINE ET PAR FORMATION : la clé ne porte pas l'identifiant du
       document, sinon chaque contrat ferait son propre dossier à un élément. */
    const isCo = r.scope === "COMPANY";
    const isSess = r.scope === "SESSION";
    const lKey = isCo ? `co:${r.company_id || r.company_name || "?"}`
      : isSess ? "sess:documents"
      : (r.learner_id || `${r.last_name}${r.first_name}`);
    const Y = years[y] || (years[y] = { label: y, total: 0, weeks: {} });
    const W = Y.weeks[wKey] || (Y.weeks[wKey] = { week: r.week || 0, total: 0, formations: {} });
    const F = W.formations[fKey] || (W.formations[fKey] = { code: r.program_code || "-", title: r.program_title || "", total: 0, learners: {} });
    const L = F.learners[lKey] || (F.learners[lKey] = {
      name: isCo ? (r.company_name || "Entreprise")
        : isSess ? "Documents de session"
        : (`${r.last_name || ""} ${r.first_name || ""}`.trim() || "-"),
      learner_id: r.learner_id, company: isCo, session: isSess, docs: [],
    });
    L.docs.push(r);
    Y.total++; W.total++; F.total++;
  }
  const yr = Object.values(years).sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }));
  for (const Y of yr) {
    Y.weeksArr = Object.values(Y.weeks).sort((a, b) => b.week - a.week);
    for (const W of Y.weeksArr) {
      W.formationsArr = Object.values(W.formations).sort((a, b) => a.code.localeCompare(b.code));
      for (const F of W.formationsArr) F.learnersArr = Object.values(F.learners).sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  return yr;
}

function ArchivesView({ onError, onInfo }) {
  const { user } = useContext(UserContext);
  // Importer, classer, supprimer : /suivi côté serveur (cf. peutEcrire), pas une liste de rôles.
  const peutModifier = peutEcrire(user, "/suivi");
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [viewId, setViewId] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  /* CLASSEURS LIBRES. `cibleClasseur` est une ref et non un état : elle porte le classeur visé
     entre le clic et le retour du sélecteur de fichiers, deux instants qui ne doivent PAS
     provoquer de rendu — un rendu entre les deux refermerait le sélecteur. */
  const [nouveauClasseur, setNouveauClasseur] = useState("");
  const classeurRef = useRef(null);
  const cibleClasseur = useRef(null);

  function load() {
    getArchives().then((r) => setRows(r.data)).catch((e) => { setRows([]); onError?.(e.message); });
  }
  useEffect(() => { load(); }, []);

  async function onPick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const paths = files.map((f) => f.webkitRelativePath || f.name);
    setBusy(true);
    try {
      const { data } = await importArchives(files, paths);
      onInfo?.(messageImport(data));
      load();
    } catch (err) { onError?.(err.message); }
    finally { setBusy(false); }
  }

  /* DÉPÔT DANS UN CLASSEUR. Pas de `webkitdirectory` ici : on choisit des FICHIERS, pas une
     arborescence — un classeur n'a pas de structure à lire, c'est justement sa définition. */
  function deposerDans(nom) {
    cibleClasseur.current = nom;
    classeurRef.current?.click();
  }

  async function onPickClasseur(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const nom = cibleClasseur.current;
    cibleClasseur.current = null;
    if (!files.length || !nom) return;
    setBusy(true);
    try {
      const { data } = await importArchives(files, files.map((f) => f.name), nom);
      onInfo?.(`${messageImport(data)} Classeur « ${nom} ».`);
      setNouveauClasseur("");
      load();
    } catch (err) { onError?.(err.message); }
    finally { setBusy(false); }
  }

  /* LE COMPTE RENDU D'UN IMPORT, au même endroit pour les deux chemins — l'arbre des sessions
     et les classeurs. Il tenait dans `onPick`, et un classeur qui aurait recopié ses quinze
     lignes aurait fini par ne plus dire la même chose qu'elles.

     LES QUATRE CAS SE DISENT SÉPARÉMENT, et ce n'est pas du zèle : un fichier déjà là ne
     demande RIEN ; un non-PDF signale un lot mal préparé ; un fichier VIDE veut dire qu'il
     manque vraiment un document et qu'il faut aller rechercher l'original. Les fondre sous un
     seul « ignoré(s) » ferait chercher une erreur là où l'import a bien travaillé, ou croire
     que tout est passé alors qu'il manque une pièce. */
  function messageImport(data) {
    const parts = [`${data.imported} document(s) importé(s)`];
    /* ON NOMME. Un compte ne dit pas LEQUEL a été écarté — et c'est lequel qui compte quand on
       voulait remplacer une version par sa correction : il faut alors supprimer l'ancien avant
       de réimporter. Les cinq premiers suffisent à reconnaître le lot. */
    const nommer = (n, noms, texte) => {
      const cinq = (noms || []).slice(0, 5).join(", ");
      parts.push(`${n} ${texte}${cinq ? ` — ${cinq}${n > 5 ? "…" : ""}` : ""}`);
    };
    if (data.doublons) nommer(data.doublons, data.noms_doublons, "déjà présent(s), non réimporté(s)");
    if (data.skipped) parts.push(`${data.skipped} ignoré(s) (non PDF)`);
    if (data.vides) nommer(data.vides, data.noms_vides, "vide(s), non importé(s)");
    return `${parts.join(", ")}.`;
  }

  // Supprime définitivement un ensemble de documents (en base). `docs` = lignes
  // du coffre ; on sépare les PDF importés (archive) des documents générés (gen).
  async function deleteDocs(docs, what) {
    const archive_ids = docs.filter((d) => d.source === "archive").map((d) => d.doc_id);
    const document_ids = docs.filter((d) => d.source === "gen").map((d) => d.doc_id);
    const total = archive_ids.length + document_ids.length;
    /* LES PIÈCES NE SE SUPPRIMENT PAS D'ICI, et il faut le DIRE. Les compter en silence
       laisserait croire qu'un « supprimer tout le stagiaire » a tout emporté, alors que les
       scans d'identité resteraient en base — exactement l'inverse de ce qu'on croit avoir fait.
       Leur effacement appartient au dossier, où il passe par la purge prévue. */
    const pieces = docs.filter((d) => d.source === "piece").length;
    if (!total) {
      onError?.(pieces
        ? `Rien à supprimer ici : ${pieces} pièce(s) justificative(s), qui s'effacent depuis le dossier du stagiaire.`
        : "Aucun document à supprimer ici.");
      return false;
    }
    const detail = document_ids.length && archive_ids.length
      ? ` (${document_ids.length} généré(s), ${archive_ids.length} archivé(s))`
      : "";
    const garde = pieces ? `\n${pieces} pièce(s) justificative(s) ne seront PAS supprimées : elles s'effacent depuis le dossier du stagiaire.` : "";
    if (!window.confirm(`Supprimer définitivement ${total} document(s)${what ? `, ${what}` : ""}${detail} ?\nCette action est irréversible et les supprime de la base.${garde}`)) return false;
    try {
      const { deleted } = await bulkDeleteArchives(archive_ids, document_ids);
      onInfo?.(`${deleted} document(s) supprimé(s).`);
      load();
      return true;
    } catch (err) { onError?.(err.message); return false; }
  }
  const weekDocs = (W) => W.formationsArr.flatMap((F) => F.learnersArr.flatMap((L) => L.docs));
  const formationDocs = (F) => F.learnersArr.flatMap((L) => L.docs);
  // Bouton de suppression sur une ligne de regroupement (semaine / formation / stagiaire).
  const DelBtn = ({ onClick, title }) => (
    <button type="button" className="iconbtn del" title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      style={{ marginLeft: 8 }}><Icon name="trash" size={15} /></button>
  );

  /* UNE LIGNE DE DOCUMENT, EXTRAITE — parce que les classeurs affichent EXACTEMENT les mêmes.
     Recopier ces trente lignes, c'est garantir qu'un jour l'aperçu marchera dans l'arbre des
     sessions et pas dans les classeurs, ou que la garde sur les pièces ne sera corrigée que
     d'un côté. Le coffre a déjà payé ce genre de dette ailleurs. */
  const DocLigne = ({ d }) => {
    const [lab, tone] = DOC_STATUS[d.status] || [d.status, "n"];
    return (
      <div className="arch-doc">
        <span style={{ flex: 1, minWidth: 0 }}>
          <b>{d.title}</b>
          <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
            {d.source === "piece"
              ? (d.sent_at ? `déposée le ${dateHeure(d.sent_at)}` : "")
              : d.signed_at ? `signé le ${dateHeure(d.signed_at)}` : d.sent_at ? `envoyé le ${dateHeure(d.sent_at)}` : ""}
          </span>
        </span>
        <Badge tone={tone}>{lab}</Badge>
        <button className="iconbtn" title="Aperçu" aria-label={`Aperçu de ${d.title}`}
          onClick={() => d.source === "piece" ? window.open(pieceFichierUrl(d.doc_id), "_blank", "noopener")
            : d.source === "archive" ? window.open(archiveFileUrl(d.doc_id), "_blank", "noopener") : setViewId(d.doc_id)}><Icon name="eye" size={16} /></button>
        {/* NI TÉLÉCHARGEMENT NI SUPPRESSION SUR UNE PIÈCE. Le fichier n'est pas forcément un
            PDF (une photo de carte d'identité, le plus souvent) et s'ouvre déjà en ligne — d'où
            on l'enregistre. Surtout, l'effacer appartient au dossier, où il passe par la purge
            prévue : un scan d'identité supprimé doit l'être avec son dépôt, pas isolément
            depuis un coffre qui range par formation. */}
        {d.source !== "piece" && (
          <button className="iconbtn" title="Télécharger le PDF" aria-label={`Télécharger le PDF de ${d.title}`}
            onClick={() => d.source === "archive" ? downloadArchiveFile(d.doc_id, `${d.title}.pdf`) : downloadDocumentPdf(d.doc_id, `${d.title}.pdf`)}><Icon name="download" size={16} /></button>
        )}
        {peutModifier && d.source !== "piece" && (
          <button className="iconbtn del" title="Supprimer ce document" aria-label={`Supprimer ${d.title}`} onClick={() => deleteDocs([d], d.title)}><Icon name="trash" size={15} /></button>
        )}
      </div>
    );
  };


  /* UN CLASSEUR N'EST PAS UNE TABLE : comme l'année, la semaine et la formation, il existe
     parce que des documents s'y trouvent, et disparaît avec son dernier document. Rien à
     nettoyer, aucun dossier vide que personne n'ose supprimer. Le revers assumé : on ne crée
     pas un classeur à l'avance, on le nomme en y déposant. */
  const { tree, classeurs } = useMemo(() => {
    if (!rows) return { tree: [], classeurs: [] };
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => `${r.last_name} ${r.first_name} ${r.company_name || ""} ${r.program_code} ${r.program_title} ${r.title} ${r.dossier || ""}`.toLowerCase().includes(needle))
      : rows;
    const parNom = new Map();
    for (const r of filtered) {
      if (!r.dossier) continue;
      if (!parNom.has(r.dossier)) parNom.set(r.dossier, []);
      parNom.get(r.dossier).push(r);
    }
    return {
      tree: buildTree(filtered.filter((r) => !r.dossier)),
      classeurs: [...parNom.entries()]
        .map(([nom, docs]) => ({ nom, docs }))
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    };
  }, [rows, q]);

  if (rows === null) return <Card title="Archives"><p className="hint">Chargement…</p></Card>;

  return (
    <Card title={`Archives documentaires (${rows.length})`}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <input className="inp" placeholder="Rechercher un stagiaire, une entreprise, une formation, un document…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 460, flex: 1, minWidth: 220 }} />
        {peutModifier && (
          <>
            <input ref={fileRef} type="file" webkitdirectory="" directory="" multiple accept="application/pdf,.pdf"
              style={{ display: "none" }} onChange={onPick} />
            <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Import en cours…" : "Importer un dossier"}
            </button>
          </>
        )}
      </div>
      {peutModifier && (
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Dossier <b>année / semaine / formation / stagiaire</b> · PDF uniquement.
        </p>
      )}

      {peutModifier && (
        <input ref={classeurRef} type="file" multiple accept="application/pdf,.pdf"
          style={{ display: "none" }} onChange={onPickClasseur} />
      )}

      {/* CLASSEURS — ce qui n'appartient à aucune session. Placés AVANT l'arbre : ils sont peu
          nombreux et concernent l'organisme entier, quand l'arbre concerne les promotions. */}
      {(classeurs.length > 0 || peutModifier) && (
        <details className="arch" open={classeurs.length > 0} style={{ marginBottom: 14 }}>
          <summary className="arch-sum arch-y">
            Classeurs <span className="arch-count">{classeurs.reduce((n, c) => n + c.docs.length, 0)}</span>
          </summary>
          <div className="arch-in">
            {peutModifier && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 4px" }}>
                <input className="inp" placeholder="Nom du classeur — Assurances, Agréments…" value={nouveauClasseur}
                  onChange={(e) => setNouveauClasseur(e.target.value)} style={{ maxWidth: 300 }} maxLength={160}
                  onKeyDown={(e) => { if (e.key === "Enter" && nouveauClasseur.trim()) deposerDans(nouveauClasseur.trim()); }} />
                <button className="btn" disabled={busy || !nouveauClasseur.trim()}
                  onClick={() => deposerDans(nouveauClasseur.trim())}>
                  {busy ? "Dépôt en cours…" : "Créer et déposer des PDF…"}
                </button>
              </div>
            )}
            {classeurs.length === 0
              ? <p className="hint" style={{ marginTop: 4 }}>
                  Aucun classeur. Un classeur range ce qui n'appartient à aucune session —
                  attestation d'assurance, agrément, certificat Qualiopi. Il existe tant qu'il
                  contient un document.
                </p>
              : classeurs.map((C) => (
                <details key={C.nom}>
                  <summary className="arch-sum">
                    <Icon name="folder" size={13} style={{ marginRight: 5, verticalAlign: "-2px" }} />
                    {C.nom} <span className="arch-count">{C.docs.length}</span>
                    {peutModifier && (
                      <>
                        <button type="button" className="iconbtn" title={`Ajouter des PDF dans « ${C.nom} »`}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deposerDans(C.nom); }}
                          style={{ marginLeft: 8 }}><Icon name="plus" size={15} /></button>
                        <DelBtn title="Supprimer tout le classeur" onClick={() => deleteDocs(C.docs, `classeur « ${C.nom} »`)} />
                      </>
                    )}
                  </summary>
                  <div className="arch-docs">
                    {C.docs.map((d) => <DocLigne key={d.doc_id} d={d} />)}
                  </div>
                </details>
              ))}
          </div>
        </details>
      )}

      {peutModifier && <PanneauStockage onError={onError} onSupprime={(ids, quoi) => deleteDocs(
        ids.map((id) => ({ doc_id: id, source: "archive" })), quoi)} />}

      {tree.length === 0 ? (
        <EmptyState icon="folder">Aucun document partagé pour l'instant.</EmptyState>
      ) : (
        <div className="arch">
          {tree.map((Y) => (
            <details key={Y.label} open>
              <summary className="arch-sum arch-y">{Y.label} <span className="arch-count">{Y.total}</span></summary>
              <div className="arch-in">
                {Y.weeksArr.map((W) => (
                  <details key={W.week}>
                    <summary className="arch-sum">{W.week ? `Semaine ${W.week}` : "Sans session"} <span className="arch-count">{W.total}</span>
                      {peutModifier && <DelBtn title="Supprimer toute la semaine" onClick={() => deleteDocs(weekDocs(W), W.week ? `Semaine ${W.week}` : "Sans session")} />}
                    </summary>
                    <div className="arch-in">
                      {W.formationsArr.map((F) => (
                        <details key={F.code}>
                          <summary className="arch-sum">
                            <span className="badge n mono" style={{ background: colorOf(F.code), color: "#fff", borderColor: "transparent" }}>{F.code}</span>
                            {" "}{F.title} <span className="arch-count">{F.total}</span>
                            {peutModifier && <DelBtn title="Supprimer toute la formation" onClick={() => deleteDocs(formationDocs(F), F.title)} />}
                          </summary>
                          <div className="arch-in">
                            {F.learnersArr.map((L) => (
                              <details key={L.learner_id || L.name}>
                                <summary className="arch-sum">
                                  {L.company && <Icon name="building" size={13} style={{ marginRight: 5, verticalAlign: "-2px", color: "var(--ember1, #c0392b)" }} />}
                                  {L.session && <Icon name="calendar" size={13} style={{ marginRight: 5, verticalAlign: "-2px", color: "var(--dim)" }} />}
                                  {L.name} <span className="arch-count">{L.docs.length}</span>
                                  {peutModifier && <DelBtn title={L.company ? "Supprimer cette entreprise" : L.session ? "Supprimer ces documents de session" : "Supprimer ce stagiaire"} onClick={() => deleteDocs(L.docs, L.name)} />}
                                </summary>
                                <div className="arch-docs">
                                  {L.docs.map((d) => <DocLigne key={d.doc_id} d={d} />)}
                                </div>
                              </details>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {viewId && <DocumentViewModal id={viewId} onClose={() => setViewId(null)} />}
    </Card>
  );
}

export default Suivi;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   CE QUE LE COFFRE OCCUPE — l'inventaire, et de quoi agir dessus.

   POURQUOI UN PANNEAU REPLIÉ, chargé au clic : la requête lit tous les blobs pour en calculer
   les empreintes. Quelques secondes sur 681 Mo — acceptable pour un inventaire qu'on demande,
   inacceptable à chaque ouverture de la page.

   CE QU'IL MONTRE, ET POURQUOI DANS CET ORDRE. La mesure qui a précédé cet écran disait deux
   choses. D'abord que la masse est CONCENTRÉE : 12 % des fichiers portent 55 % du volume — d'où
   la liste des plus lourds, qui règle le problème en trente lignes. Ensuite que la DENSITÉ
   sépare le bon grain de l'ivraie : un scan JPEG de 300 DPI tient en 0,13 octet par pixel, quand
   certains fichiers d'ici en font 2,7 — soit presque un bitmap brut (3,0). C'est la seule mesure
   qui distingue un document lourd parce qu'il est détaillé d'un document lourd pour rien.

   LES DOUBLONS SE MONTRENT AVEC LEURS DÉTENTEURS. Supprimer une copie retire un document du
   dossier de quelqu'un. Le même PDF sous sept stagiaires peut être une erreur de classement —
   c'est le cas qu'on a trouvé, l'évaluation d'une personne recopiée dans six autres dossiers —
   ou une pièce commune légitimement partout. L'écran ne tranche pas, il nomme.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */
const mo = (o) => (o >= 1048576 ? (o / 1048576).toFixed(1) + " Mo" : Math.round(o / 1024) + " Ko");

/* LE MOT À RECOPIER POUR LANCER L'INVENTAIRE.
   Il n'est pas là pour vérifier une identité — l'écran est déjà réservé à l'administration — mais
   pour rendre le geste DÉLIBÉRÉ. La requête lit les 681 Mo de blobs de la table : 7,4 secondes
   mesurées, pendant lesquelles la base travaille pour tout le monde. Un bouton se clique par
   curiosité, et se reclique en attendant que ça vienne ; un mot à recopier, non.
   En français et en clair : un mot qu'on ne comprend pas se recopie machinalement, ce qui
   annulerait tout l'intérêt. */
const MOT_INVENTAIRE = "INVENTAIRE";
/* Tolérant sur la casse et les espaces autour : ce qu'on demande, c'est un geste conscient,
   pas une dictée. Refuser « inventaire » en minuscules ne filtrerait que la patience. */
const motOk = (v) => v.trim().toUpperCase() === MOT_INVENTAIRE;

function PanneauStockage({ onError, onSupprime }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demande, setDemande] = useState(false);   // le verrou est-il ouvert à l'écran ?
  const [saisie, setSaisie] = useState("");

  async function analyser() {
    setDemande(false); setSaisie("");
    setBusy(true);
    try { setData((await getArchiveStockage()).data); }
    catch (e) { onError?.(e.message); }
    finally { setBusy(false); }
  }

  /* LE VERROU COUVRE AUSSI « RECALCULER ». Sans cela il suffirait d'un premier passage pour
     obtenir un bouton libre juste à côté — et c'est précisément le reclic répété qu'on veut
     empêcher, pas le premier. */
  const verrou = demande && createPortal(
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="mhead">
          <h3>Lancer l'inventaire du coffre ?</h3>
          <button className="x" onClick={() => setDemande(false)} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          <p className="lead" style={{ marginTop: 0 }}>
            L'inventaire lit <b>l'intégralité des fichiers archivés</b> pour en calculer la taille
            et l'empreinte. Comptez plusieurs secondes, pendant lesquelles la base est occupée
            pour tout le monde.
          </p>
          <label className="field confirm-mot" style={{ marginBottom: 0 }}>
            <span>Recopiez <b>{MOT_INVENTAIRE}</b> pour confirmer</span>
            <input className="inp" autoFocus value={saisie} spellCheck="false"
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && motOk(saisie)) analyser(); }} />
          </label>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={() => setDemande(false)}>Annuler</button>
          <button className="btn primary" disabled={!motOk(saisie)} onClick={analyser}>
            <Icon name="package" size={15} /> Lancer l'inventaire
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  if (!data) {
    return (
      <div className="stock-invite">
        <span className="hint">
          <Icon name="package" size={13} /> Les archives sont stockées dans la base. Voir ce
          qu'elles occupent, et repérer les fichiers inutilement lourds ou en double.
        </span>
        <button className="btn ghost sm" disabled={busy} onClick={() => setDemande(true)}>
          {busy ? "Lecture des fichiers…" : "Analyser l'espace occupé"}
        </button>
        {verrou}
      </div>
    );
  }

  const { total, tranches, lourds, doublons, gaspilleDoublons } = data;
  const maxT = Math.max(...tranches.map((t) => t.octets), 1);
  // Ce qu'on peut réellement retirer : tout sauf un exemplaire par groupe.
  const copiesEnTrop = doublons.reduce((s, d) => s + d.n - 1, 0);

  /* APRÈS UNE SUPPRESSION, L'INVENTAIRE EST FAUX — la copie effacée y figure encore et son poids
     est toujours compté. Mais on ne RELIT PAS la base pour autant : relancer l'inventaire à
     chaque corbeille ferait relire les 681 Mo une fois par doublon traité, soit vingt-quatre
     fois pour les seuls groupes de sept. C'est exactement le martèlement que le verrou de
     confirmation cherche à éviter — le rétablir ici l'aurait vidé de son sens.
     On retranche donc ce qu'on sait avoir supprimé : un identifiant, une taille, une tranche.
     C'est de l'arithmétique exacte, pas une approximation. */
  function retirerDeLInventaire(x) {
    setData((d) => {
      if (!d) return d;
      const doublons = d.doublons
        .map((g) => {
          if (!g.exemplaires.some((e) => e.id === x.id)) return g;
          const exemplaires = g.exemplaires.filter((e) => e.id !== x.id);
          return { ...g, exemplaires, n: exemplaires.length,
            gaspille: g.octets * (exemplaires.length - 1) };
        })
        /* UN GROUPE RETOMBÉ À UN SEUL EXEMPLAIRE N'EST PLUS UN DOUBLON : le laisser afficherait
           « 1 exemplaire identique », ce qui ne veut rien dire. */
        .filter((g) => g.n > 1);
      return {
        ...d,
        total: { n: d.total.n - 1, octets: d.total.octets - x.octets },
        // La tranche est celle dont le seuil est le plus haut que le fichier atteigne.
        tranches: d.tranches.map((t) => (t === d.tranches.find((u) => x.octets >= u.min)
          ? { ...t, n: t.n - 1, octets: t.octets - x.octets } : t)),
        lourds: d.lourds.filter((l) => l.id !== x.id),
        doublons,
        gaspilleDoublons: doublons.reduce((s, g) => s + g.gaspille, 0),
      };
    });
  }

  async function supprimerUne(x) {
    if (await onSupprime([x.id], `« ${x.title} »${x.learner_name ? ` — ${x.learner_name}` : ""}`)) {
      retirerDeLInventaire(x);
    }
  }

  return (
    <div className="stock">
      {verrou}
      <div className="stock-tete">
        <b>{total.n} document{total.n > 1 ? "s" : ""} · <span className="chiffres">{mo(total.octets)}</span></b>
        <button className="btn ghost sm" disabled={busy} onClick={() => setDemande(true)}>Recalculer</button>
      </div>

      {/* LA RÉPARTITION EN PREMIER : c'est elle qui montre que quelques fichiers font le volume,
          donc que la suite vaut la peine d'être lue. */}
      <div className="stock-tranches">
        {tranches.map((t) => (
          <div key={t.libelle} className="stock-tr">
            <span className="stock-tr-l">{t.libelle}</span>
            <span className="stock-tr-b"><i style={{ width: `${100 * t.octets / maxT}%` }} /></span>
            <span className="stock-tr-n chiffres">{t.n}</span>
            <span className="stock-tr-o chiffres">{mo(t.octets)}</span>
          </div>
        ))}
      </div>

      {doublons.length > 0 && (
        <details className="stock-bloc">
          {/* « 26 documents en double » se lisait comme 26 fichiers à supprimer. Ce sont 26
              documents présents en PLUSIEURS exemplaires, soit 46 copies en trop : c'est ce
              second nombre qui dit ce qu'on peut retirer. */}
          <summary>
            <b>{doublons.length} document{doublons.length > 1 ? "s" : ""} en plusieurs exemplaires</b>
            <span className="hint"> · <span className="chiffres">{copiesEnTrop}</span> copie
              {copiesEnTrop > 1 ? "s" : ""} superflue{copiesEnTrop > 1 ? "s" : ""},
              <span className="chiffres"> {mo(gaspilleDoublons)}</span></span>
          </summary>
          <p className="hint stock-avert">
            <Icon name="alert-triangle" size={12} /> Chaque copie occupe le dossier d'un stagiaire.
            Supprimer une copie retire le document de <b>son</b> dossier — vérifiez qui la détient
            avant de trancher.
          </p>
          {doublons.map((d, i) => (
            <div key={i} className="stock-dbl">
              <div className="stock-dbl-t">
                <b className="chiffres">{d.n}</b> exemplaires identiques ·
                <span className="chiffres"> {mo(d.octets)}</span> pièce
              </div>
              {/* UNE CORBEILLE PAR EXEMPLAIRE, et non un « ne garder que le premier ».
                  Le bouton groupé décidait à la place de l'utilisateur QUEL exemplaire survit —
                  le premier, c'est-à-dire celui que la base a rendu en premier, sans que cet
                  ordre veuille dire quoi que ce soit. Or le choix a du sens : sur l'évaluation
                  d'une stagiaire recopiée dans six autres dossiers, la copie à garder est celle
                  classée sous SON nom, pas la première venue. On supprime donc au cas par cas,
                  en voyant qui détient quoi. */}
              <ul className="stock-dbl-l">
                {d.exemplaires.map((x) => (
                  <li key={x.id}>
                    <a href={archiveFileUrl(x.id)} target="_blank" rel="noopener noreferrer">{x.title}</a>
                    <span className="hint"> — {x.learner_name || "sans stagiaire"}
                      {x.year ? ` · ${x.year}` : ""}{x.week ? ` S${x.week}` : ""}</span>
                    <button type="button" className="iconbtn del stock-del"
                      title={`Supprimer cette copie${x.learner_name ? ` du dossier de ${x.learner_name}` : ""}`}
                      onClick={() => supprimerUne(x)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}

      <details className="stock-bloc">
        <summary><b>Les {lourds.length} plus lourds</b>
          <span className="hint"> · <span className="chiffres">{mo(lourds.reduce((s, x) => s + x.octets, 0))}</span> à eux seuls</span>
        </summary>
        <ul className="stock-lourds">
          {lourds.map((x) => (
            <li key={x.id}>
              <span className="chiffres stock-poids">{mo(x.octets)}</span>
              <a href={archiveFileUrl(x.id)} target="_blank" rel="noopener noreferrer">{x.title}</a>
              <span className="hint">{x.learner_name ? ` — ${x.learner_name}` : ""}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
