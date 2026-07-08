import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSuivi, getArchives, downloadDocumentPdf,
  importArchives, archiveFileUrl, downloadArchiveFile, deleteArchive,
} from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Roadmap from "../components/Roadmap.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import { scoreBadge, colorOf } from "../lib/format.js";

const DOC_STATUS = { ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé ✓", "g"], ARCHIVE: ["Archivé", "n"] };
const SIGN_TYPES = new Set(["DEVIS", "CONTRAT", "CONVENTION", "DROIT_IMAGE"]);
const docIcon = (d) => (d.quiz_id ? "❓" : SIGN_TYPES.has(d.type) ? "✍️" : "📄");

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

  return (
    <>
      <PageHead
        eyebrow="Qualiopi"
        title="Suivi de conformité"
        lead="Suivez la conformité des dossiers, et retrouvez tous les documents partagés et signés, classés par année, semaine, formation et stagiaire."
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
          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <Kpi label="Incomplets" value={count("ROUGE")} />
            <Kpi label="En cours" value={count("ORANGE")} />
            <Kpi label="Complets" value={count("VERT")} />
          </div>

          <Card title={`Dossiers (${dossiers.length})`}>
            {dossiers.length === 0 ? (
              <EmptyState icon="▤">Aucun dossier à suivre.</EmptyState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dossiers.map((d) => {
                  const isOpen = !!open[d.enrollment_id];
                  return (
                    <div key={d.enrollment_id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                      <button type="button" onClick={() => toggle(d.enrollment_id)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ transition: ".15s", transform: isOpen ? "rotate(90deg)" : "none", color: "var(--dim)" }}>▶</span>
                        <span className="badge n mono" style={{ background: colorOf(d.program_code), color: "#fff", borderColor: "transparent" }}>{d.program_code}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{d.last_name} {d.first_name}</b>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{d.program_title} · {d.signed}/{d.to_sign} signé(s)</span>
                        </span>
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
    const y = r.year != null ? String(r.year) : "—";
    const wKey = r.week != null ? String(r.week) : "—";
    const fKey = r.program_code || "—";
    const lKey = r.learner_id || `${r.last_name}${r.first_name}`;
    const Y = years[y] || (years[y] = { label: y, total: 0, weeks: {} });
    const W = Y.weeks[wKey] || (Y.weeks[wKey] = { week: r.week || 0, total: 0, formations: {} });
    const F = W.formations[fKey] || (W.formations[fKey] = { code: r.program_code || "—", title: r.program_title || "", total: 0, learners: {} });
    const L = F.learners[lKey] || (F.learners[lKey] = { name: `${r.last_name || ""} ${r.first_name || ""}`.trim() || "—", learner_id: r.learner_id, docs: [] });
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

  async function onDelete(d) {
    if (!window.confirm(`Supprimer définitivement « ${d.title} » de l'archive ?`)) return;
    try { await deleteArchive(d.doc_id); load(); }
    catch (err) { onError?.(err.message); }
  }

  const tree = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => `${r.last_name} ${r.first_name} ${r.program_code} ${r.program_title} ${r.title}`.toLowerCase().includes(needle))
      : rows;
    return buildTree(filtered);
  }, [rows, q]);

  if (rows === null) return <Card title="Archives"><p className="hint">Chargement…</p></Card>;

  return (
    <Card title={`Archives documentaires (${rows.length})`}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <input className="inp" placeholder="Rechercher un stagiaire, une formation, un document…" value={q}
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
          Choisissez un dossier organisé en <b>année / semaine / (formation) / stagiaire</b>. Seuls les PDF sont importés ; pour de gros volumes, importez année par année ou semaine par semaine.
        </p>
      )}

      {tree.length === 0 ? (
        <EmptyState icon="🗄">Aucun document partagé pour l'instant.</EmptyState>
      ) : (
        <div className="arch">
          {tree.map((Y) => (
            <details key={Y.label} open>
              <summary className="arch-sum arch-y">{Y.label} <span className="arch-count">{Y.total}</span></summary>
              <div className="arch-in">
                {Y.weeksArr.map((W) => (
                  <details key={W.week}>
                    <summary className="arch-sum">{W.week ? `Semaine ${W.week}` : "Sans session"} <span className="arch-count">{W.total}</span></summary>
                    <div className="arch-in">
                      {W.formationsArr.map((F) => (
                        <details key={F.code}>
                          <summary className="arch-sum">
                            <span className="badge n mono" style={{ background: colorOf(F.code), color: "#fff", borderColor: "transparent" }}>{F.code}</span>
                            {" "}{F.title} <span className="arch-count">{F.total}</span>
                          </summary>
                          <div className="arch-in">
                            {F.learnersArr.map((L) => (
                              <details key={L.learner_id || L.name}>
                                <summary className="arch-sum">{L.name} <span className="arch-count">{L.docs.length}</span></summary>
                                <div className="arch-docs">
                                  {L.docs.map((d) => {
                                    const [lab, tone] = DOC_STATUS[d.status] || [d.status, "n"];
                                    return (
                                      <div key={d.doc_id} className="arch-doc">
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                          {docIcon(d)} <b>{d.title}</b>
                                          <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                                            {d.signed_at ? `signé le ${d.signed_at}` : d.sent_at ? `envoyé le ${d.sent_at}` : ""}
                                          </span>
                                        </span>
                                        <Badge tone={tone}>{lab}</Badge>
                                        <button className="iconbtn" title="Aperçu"
                                          onClick={() => d.source === "archive" ? window.open(archiveFileUrl(d.doc_id), "_blank", "noopener") : setViewId(d.doc_id)}>👁</button>
                                        <button className="iconbtn" title="Télécharger le PDF"
                                          onClick={() => d.source === "archive" ? downloadArchiveFile(d.doc_id, `${d.title}.pdf`) : downloadDocumentPdf(d.doc_id, `${d.title}.pdf`)}>⬇</button>
                                        {isAdmin && d.source === "archive" && (
                                          <button className="iconbtn del" title="Supprimer de l'archive" onClick={() => onDelete(d)}>🗑</button>
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
