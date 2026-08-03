import { useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMyFormation, signMyEmargement } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import SignatureModal from "../components/SignatureModal.jsx";
import QuizModal from "../components/QuizModal.jsx";
import { Icon } from "../components/Icon.jsx";

const STATUS = { SIGNE: ["Signé", "g"], ENVOYE: ["Reçu", "a"], CONSULTE: ["Consulté", "a"], A_FAIRE: ["-", "n"] };
const SLOT = { MATIN: "Matin", APRES_MIDI: "Après-midi", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };
const frDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }) : "");

function StudentFormationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [quizDoc, setQuizDoc] = useState(null); // document QCM à répondre / consulter
  const [signing, setSigning] = useState(null); // demi-journée d'émargement à signer

  function load() {
    getMyFormation(id).then((r) => setData(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }
  useEffect(() => { load(); }, [id]);

  async function onSign({ signer_name, signature_data }) {
    try {
      await signMyEmargement(signing.record_id, { signer_name, signature_data });
      setSigning(null);
      setStatus({ type: "success", message: "Émargement signé. Merci !" });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  return (
    <>
      <div className="hero" style={{ background: "var(--grad-navy)" }}>
        <button className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: 0, color: "rgba(255,255,255,.8)" }} onClick={() => navigate("/mon-espace")}>
          <Icon name="chevron-left" size={14} /> Mes documents
        </button>
        <h1>{data ? data.program_title : "Formation"}</h1>
        {data && (
          <p>{data.start_date && data.end_date ? `Du ${data.start_date} au ${data.end_date} · ` : ""}Semaine {data?.week} · {data?.year} · {data?.program_hours} h</p>
        )}
      </div>

      {/* Onglets : autres sessions du même programme (W23 / W25…) */}
      {data && data.sessions && data.sessions.length > 1 && (
        <div className="sess-tabs">
          {data.sessions.map((s) => (
            <button key={s.enrollment_id}
              className={"sess-tab" + (s.enrollment_id === data.enrollment_id ? " on" : "")}
              onClick={() => { if (s.enrollment_id !== data.enrollment_id) navigate(`/formations/${s.enrollment_id}`); }}
              title={s.start_date && s.end_date ? `Du ${s.start_date} au ${s.end_date}` : ""}>
              <Icon name="calendar" size={13} /> Semaine {s.week} · {s.year}
            </button>
          ))}
        </div>
      )}

      <StatusMessage status={status} />

      {data && (
        <Card title="Documents de la formation">
          {(!data.documents || data.documents.length === 0) ? (
            <EmptyState icon="file-text">Aucun document disponible.</EmptyState>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {data.documents.map((d) => {
                const [label, tone] = STATUS[d.status] || [d.status, "n"];
                return (
                  <div key={d.id} className="stu-row">
                    <span style={{ color: "var(--blue)", display: "inline-flex", flex: "none" }}><Icon name={d.quiz_id ? "list-checks" : "file-text"} size={17} /></span>
                    <span className="stu-row-t">
                      <b>{d.title}</b>
                      {d.signed_at && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>Signé le {d.signed_at}</span>}
                    </span>
                    {d.quiz_id ? (
                      <>
                        <Badge tone={d.status === "SIGNE" ? "g" : "b"}>{d.status === "SIGNE" ? "Répondu" : "QCM à faire"}</Badge>
                        <button className="btn sm primary" onClick={() => setQuizDoc(d.id)}>
                          {d.status === "SIGNE" ? "Voir mon QCM" : "Répondre au QCM"}
                        </button>
                      </>
                    ) : (
                      <>
                        <Badge tone={tone}>{label}</Badge>
                        <button className="btn sm primary" onClick={() => setViewId(d.id)}>
                          {d.status === "SIGNE" ? "Consulter" : "Consulter / signer"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {data && (() => {
        const gate = data.emargement_gate || {};
        const locked = !!gate.locked;
        return (
        <Card title="Émargement, ma présence">
          {locked && (
            <div className="emarg-lock">
              <Icon name="lock" size={15} />
              <span>Émargement verrouillé, signe d'abord tes documents{gate.break_label ? <> jusqu'à « <b>{gate.break_label}</b> »</> : null}. <b>{gate.done}/{gate.need}</b> document{gate.need > 1 ? "s" : ""} signé{gate.done > 1 ? "s" : ""}.</span>
            </div>
          )}
          {(!data.emargement || data.emargement.length === 0) ? (
            <EmptyState icon="pencil">Aucune demi-journée à émarger pour cette session.</EmptyState>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {data.emargement.map((r) => {
                const future = r.date > (data.today || "");
                return (
                  <div key={r.record_id} className="stu-row">
                    <span style={{ color: r.signed ? "var(--green)" : "var(--blue)", display: "inline-flex", flex: "none" }}><Icon name="calendar" size={16} /></span>
                    <span className="stu-row-t">
                      <b style={{ textTransform: "capitalize" }}>{frDate(r.date)}, {SLOT[r.slot] || r.slot}</b>
                    </span>
                    {r.signed ? (
                      <Badge tone="g">Signé{r.signed_at ? ` · ${r.signed_at}` : ""}</Badge>
                    ) : locked ? (
                      <span className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="lock" size={13} /> Documents requis</span>
                    ) : future ? (
                      <span className="hint">À venir</span>
                    ) : (
                      <button className="btn sm primary" onClick={() => setSigning(r)}>Signer</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        );
      })()}

      {viewId && (
        <DocumentViewModal id={viewId} canSign defaultName={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
          onClose={() => setViewId(null)} onChanged={load} />
      )}

      {quizDoc && (
        <QuizModal documentId={quizDoc} onClose={() => { setQuizDoc(null); load(); }} />
      )}

      {signing && (
        <SignatureModal
          doc={{ label: `Émargement, ${SLOT[signing.slot] || signing.slot} ${frDate(signing.date)}` }}
          defaultName={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
          onConfirm={onSign}
          onClose={() => setSigning(null)}
        />
      )}
    </>
  );
}

export default StudentFormationDetail;
