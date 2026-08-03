import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useNavigate } from "react-router-dom";
import {
  getSuivi, getArchives, downloadDocumentPdf,
  importArchives, archiveFileUrl, downloadArchiveFile, bulkDeleteArchives,
} from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Roadmap from "../components/Roadmap.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import { scoreBadge, colorOf } from "../lib/format.js";

const DOC_STATUS = { ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"], ARCHIVE: ["Archivé", "n"] };
const SCORE_ORDER = { ROUGE: 0, ORANGE: 1, VERT: 2 };

// Barre de progression compacte + pourcentage (réutilisée pour dossier et groupe).
function ProgressPct({ percent }) {
  return (
    <span style={{ width: 90, flexShrink: 0 }} title={`${percent || 0}% du parcours`}>
      <span style={{ display: "block", height: 6, borderRadius: 4, background: "var(--border-soft, #e3e3e6)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${percent || 0}%`, background: "var(--ember1, #c0392b)" }} />
      </span>
      <span style={{ display: "block", fontSize: 11, color: "var(--muted)", textAlign: "right", marginTop: 2 }}>{percent || 0}%</span>
    </span>
  );
}

// État d'une étape d'un dossier (identique à Roadmap.stepState) pour l'agrégat groupe.
function docState(doc) {
  if (doc.status === "SIGNE") return "done";
  if (doc.stagiaireSign) return ["ENVOYE", "CONSULTE", "GENERE"].includes(doc.status) ? "progress" : "todo";
  return ["GENERE", "ENVOYE", "CONSULTE"].includes(doc.status) ? "done" : "todo";
}

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
        <ProgressPct percent={d.percent} />
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
  const manques = useMemo(() => {
    const m = new Map();
    for (const d of dossiers) {
      for (const doc of (d.documents || [])) {
        if (docState(doc) === "done") continue;
        if (!m.has(doc.type)) m.set(doc.type, { type: doc.type, label: doc.label, n: 0 });
        m.get(doc.type).n++;
      }
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [dossiers]);

  // Cliquer un manque filtre la liste : la page se termine par un geste, pas par un constat.
  const dossiersVus = useMemo(() => {
    if (!manqueFiltre) return dossiers;
    return dossiers.filter((d) => (d.documents || [])
      .some((doc) => doc.type === manqueFiltre && docState(doc) !== "done"));
  }, [dossiers, manqueFiltre]);

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
          st.total++;
          const s = docState(doc);
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
                {manques.map((m) => (
                  <button key={m.type} type="button" aria-pressed={manqueFiltre === m.type}
                    className={"manque-i" + (manqueFiltre === m.type ? " on" : "")}
                    onClick={() => setManqueFiltre((f) => (f === m.type ? null : m.type))}>
                    <b className="tnum">{m.n}</b><span>{m.label}</span>
                  </button>
                ))}
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
            <span><b className="tnum">{count("ROUGE")}</b> incomplet{count("ROUGE") > 1 ? "s" : ""}</span><i />
            <span><b className="tnum">{count("ORANGE")}</b> en cours</span><i />
            <span><b className="tnum">{count("VERT")}</b> complet{count("VERT") > 1 ? "s" : ""}</span>
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
                        <ProgressPct percent={g.percent} />
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
    // Feuille = stagiaire, ou ENTREPRISE pour un document de groupe (scope COMPANY).
    const isCo = r.scope === "COMPANY";
    const lKey = isCo ? `co:${r.company_id || r.company_name || "?"}` : (r.learner_id || `${r.last_name}${r.first_name}`);
    const Y = years[y] || (years[y] = { label: y, total: 0, weeks: {} });
    const W = Y.weeks[wKey] || (Y.weeks[wKey] = { week: r.week || 0, total: 0, formations: {} });
    const F = W.formations[fKey] || (W.formations[fKey] = { code: r.program_code || "-", title: r.program_title || "", total: 0, learners: {} });
    const L = F.learners[lKey] || (F.learners[lKey] = {
      name: isCo ? (r.company_name || "Entreprise") : (`${r.last_name || ""} ${r.first_name || ""}`.trim() || "-"),
      learner_id: r.learner_id, company: isCo, docs: [],
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
  const isAdmin = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"].includes(user?.role);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [viewId, setViewId] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

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
      onInfo?.(`${data.imported} document(s) importé(s)${data.skipped ? `, ${data.skipped} ignoré(s) (non PDF)` : ""}.`);
      load();
    } catch (err) { onError?.(err.message); }
    finally { setBusy(false); }
  }

  // Supprime définitivement un ensemble de documents (en base). `docs` = lignes
  // du coffre ; on sépare les PDF importés (archive) des documents générés (gen).
  async function deleteDocs(docs, what) {
    const archive_ids = docs.filter((d) => d.source === "archive").map((d) => d.doc_id);
    const document_ids = docs.filter((d) => d.source === "gen").map((d) => d.doc_id);
    const total = archive_ids.length + document_ids.length;
    if (!total) { onError?.("Aucun document à supprimer ici."); return; }
    const detail = document_ids.length && archive_ids.length
      ? ` (${document_ids.length} généré(s), ${archive_ids.length} archivé(s))`
      : "";
    if (!window.confirm(`Supprimer définitivement ${total} document(s)${what ? `, ${what}` : ""}${detail} ?\nCette action est irréversible et les supprime de la base.`)) return;
    try {
      const { deleted } = await bulkDeleteArchives(archive_ids, document_ids);
      onInfo?.(`${deleted} document(s) supprimé(s).`);
      load();
    } catch (err) { onError?.(err.message); }
  }
  const weekDocs = (W) => W.formationsArr.flatMap((F) => F.learnersArr.flatMap((L) => L.docs));
  const formationDocs = (F) => F.learnersArr.flatMap((L) => L.docs);
  // Bouton de suppression sur une ligne de regroupement (semaine / formation / stagiaire).
  const DelBtn = ({ onClick, title }) => (
    <button type="button" className="iconbtn del" title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      style={{ marginLeft: 8 }}><Icon name="trash" size={15} /></button>
  );

  const tree = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => `${r.last_name} ${r.first_name} ${r.company_name || ""} ${r.program_code} ${r.program_title} ${r.title}`.toLowerCase().includes(needle))
      : rows;
    return buildTree(filtered);
  }, [rows, q]);

  if (rows === null) return <Card title="Archives"><p className="hint">Chargement…</p></Card>;

  return (
    <Card title={`Archives documentaires (${rows.length})`}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <input className="inp" placeholder="Rechercher un stagiaire, une entreprise, une formation, un document…" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 460, flex: 1, minWidth: 220 }} />
        {isAdmin && (
          <>
            <input ref={fileRef} type="file" webkitdirectory="" directory="" multiple accept="application/pdf,.pdf"
              style={{ display: "none" }} onChange={onPick} />
            <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Import en cours…" : "Importer un dossier"}
            </button>
          </>
        )}
      </div>
      {isAdmin && (
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Dossier <b>année / semaine / formation / stagiaire</b> · PDF uniquement.
        </p>
      )}

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
                      {isAdmin && <DelBtn title="Supprimer toute la semaine" onClick={() => deleteDocs(weekDocs(W), W.week ? `Semaine ${W.week}` : "Sans session")} />}
                    </summary>
                    <div className="arch-in">
                      {W.formationsArr.map((F) => (
                        <details key={F.code}>
                          <summary className="arch-sum">
                            <span className="badge n mono" style={{ background: colorOf(F.code), color: "#fff", borderColor: "transparent" }}>{F.code}</span>
                            {" "}{F.title} <span className="arch-count">{F.total}</span>
                            {isAdmin && <DelBtn title="Supprimer toute la formation" onClick={() => deleteDocs(formationDocs(F), F.title)} />}
                          </summary>
                          <div className="arch-in">
                            {F.learnersArr.map((L) => (
                              <details key={L.learner_id || L.name}>
                                <summary className="arch-sum">
                                  {L.company && <Icon name="building" size={13} style={{ marginRight: 5, verticalAlign: "-2px", color: "var(--ember1, #c0392b)" }} />}
                                  {L.name} <span className="arch-count">{L.docs.length}</span>
                                  {isAdmin && <DelBtn title={L.company ? "Supprimer cette entreprise" : "Supprimer ce stagiaire"} onClick={() => deleteDocs(L.docs, L.name)} />}
                                </summary>
                                <div className="arch-docs">
                                  {L.docs.map((d) => {
                                    const [lab, tone] = DOC_STATUS[d.status] || [d.status, "n"];
                                    return (
                                      <div key={d.doc_id} className="arch-doc">
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                          <b>{d.title}</b>
                                          <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                                            {d.signed_at ? `signé le ${d.signed_at}` : d.sent_at ? `envoyé le ${d.sent_at}` : ""}
                                          </span>
                                        </span>
                                        <Badge tone={tone}>{lab}</Badge>
                                        <button className="iconbtn" title="Aperçu" aria-label={`Aperçu de ${d.title}`}
                                          onClick={() => d.source === "archive" ? window.open(archiveFileUrl(d.doc_id), "_blank", "noopener") : setViewId(d.doc_id)}><Icon name="eye" size={16} /></button>
                                        <button className="iconbtn" title="Télécharger le PDF" aria-label={`Télécharger le PDF de ${d.title}`}
                                          onClick={() => d.source === "archive" ? downloadArchiveFile(d.doc_id, `${d.title}.pdf`) : downloadDocumentPdf(d.doc_id, `${d.title}.pdf`)}><Icon name="download" size={16} /></button>
                                        {isAdmin && (
                                          <button className="iconbtn del" title="Supprimer ce document" aria-label={`Supprimer ${d.title}`} onClick={() => deleteDocs([d], d.title)}><Icon name="trash" size={15} /></button>
                                        )}
                                      </div>
                                    );
                                  })}
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
