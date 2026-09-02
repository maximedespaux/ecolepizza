import { useContext, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMyFormation, signMyEmargement, getDossierPieces, deposerPiece, pieceFichierUrl } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import SignatureModal from "../components/SignatureModal.jsx";
import QuizModal from "../components/QuizModal.jsx";
import { Icon } from "../components/Icon.jsx";
import { dateHeure } from "../lib/format.js";

const SLOT = { MATIN: "Matin", APRES_MIDI: "Après-midi", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };
const frDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }) : "");

/* ÉTAT VISUEL D'UNE ÉTAPE — la « pastille » du parcours. `done` (fait), `wait` (déposé, en cours de
   vérification), `refused` (à refaire), `current` (l'étape sur laquelle agir maintenant), `todo`. */
const PASTILLE = {
  done:    { bg: "var(--green)", ic: "check", label: "Fait" },
  wait:    { bg: "var(--gold, #c79a2e)", ic: "clock", label: "En vérification" },
  refused: { bg: "var(--red, #c0392b)", ic: "x", label: "À refaire" },
  current: { bg: "var(--blue)", ic: "chevron-right", label: "À faire" },
  todo:    { bg: "var(--border)", ic: "circle", label: "À venir" },
};
const PIECE_ETAT = { VALIDEE: "done", DEPOSEE: "wait", REFUSEE: "refused", ATTENDUE: "todo" };

function StudentFormationDetail() {
  const { id } = useParams(); // = enrollment_id (le dossier)
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const [data, setData] = useState(null);
  const [pieces, setPieces] = useState([]); // pièces à fournir (dossier de cette inscription)
  const [status, setStatus] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [quizDoc, setQuizDoc] = useState(null);
  const [signing, setSigning] = useState(null);
  const fileRef = useRef(null);
  const pieceCible = useRef(null); // pieceTypeId pour lequel on ouvre le sélecteur de fichier

  function load() {
    getMyFormation(id).then((r) => setData(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
    getDossierPieces(id).then((r) => setPieces(r.data || [])).catch(() => setPieces([]));
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

  function choisirFichier(pieceTypeId) { pieceCible.current = pieceTypeId; fileRef.current?.click(); }
  async function onFichier(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pieceCible.current) return;
    try {
      await deposerPiece(id, pieceCible.current, file);
      setStatus({ type: "success", message: "Document envoyé. Il sera vérifié par l'école." });
      load();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  // Construit la liste ordonnée des ÉTAPES : d'abord les pièces à fournir, puis les documents.
  const etapesPieces = pieces.map((p) => ({ kind: "piece", key: `p-${p.piece_type_id}`, p, etat: PIECE_ETAT[p.statut] || "todo" }));
  const etapesDocs = (data?.documents || []).map((d) => ({ kind: "doc", key: `d-${d.id}`, d, etat: d.status === "SIGNE" ? "done" : "todo" }));
  const etapes = [...etapesPieces, ...etapesDocs];
  // La PREMIÈRE étape non terminée (et non en attente de vérif) porte la pastille « en cours ».
  const idxCourant = etapes.findIndex((e) => e.etat === "todo" || e.etat === "refused");

  return (
    <>
      <div className="hero" style={{ background: "var(--grad-navy)" }}>
        <button className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: 0, color: "rgba(255,255,255,.8)" }} onClick={() => navigate("/mon-espace")}>
          <Icon name="chevron-left" size={14} /> Mes documents
        </button>
        <h1>{data ? data.program_title : "Formation"}</h1>
        {data && (
          <p>{data.start_date && data.end_date ? `Du ${dateHeure(data.start_date)} au ${dateHeure(data.end_date)} · ` : ""}Semaine {data?.week} · {data?.year} · {data?.program_hours} h</p>
        )}
      </div>

      {/* Onglets : autres sessions du même programme */}
      {data && data.sessions && data.sessions.length > 1 && (
        <div className="sess-tabs">
          {data.sessions.map((s) => (
            <button key={s.enrollment_id}
              className={"sess-tab" + (s.enrollment_id === data.enrollment_id ? " on" : "")}
              onClick={() => { if (s.enrollment_id !== data.enrollment_id) navigate(`/formations/${s.enrollment_id}`); }}
              title={s.start_date && s.end_date ? `Du ${dateHeure(s.start_date)} au ${dateHeure(s.end_date)}` : ""}>
              <Icon name="calendar" size={13} /> Semaine {s.week} · {s.year}
            </button>
          ))}
        </div>
      )}

      <StatusMessage status={status} />

      {/* Sélecteur de fichier partagé (déclenché par « Fournir »/« Renvoyer »). */}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={onFichier} />

      {data && (
        <Card title="Mon parcours">
          {etapes.length === 0 ? (
            <EmptyState icon="file-text">Aucune étape pour le moment.</EmptyState>
          ) : (
            <div className="parcours">
              {etapes.map((e, i) => {
                const etat = i === idxCourant ? "current" : e.etat;
                const pas = PASTILLE[etat] || PASTILLE.todo;
                const dernier = i === etapes.length - 1;
                return (
                  <div key={e.key} className="parcours-etape" style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                    {/* Rail vertical : pastille + trait de liaison. */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", background: pas.bg, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
                        <Icon name={pas.ic} size={14} />
                      </span>
                      {!dernier && <span style={{ width: 2, flex: 1, background: "var(--border-soft)", marginTop: 2 }} />}
                    </div>
                    {/* Contenu de l'étape. */}
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: dernier ? 0 : 14 }}>
                      {e.kind === "piece" ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <b style={{ flex: 1, minWidth: 0 }}>Fournir&nbsp;: {e.p.label}</b>
                            <Badge tone={{ done: "g", wait: "a", refused: "r", todo: "n", current: "b" }[etat]}>{pas.label}</Badge>
                            {e.p.fichiers?.length > 0 && (
                              <button className="btn sm ghost" onClick={() => window.open(pieceFichierUrl(e.p.fichiers[0].id), "_blank", "noopener")}>
                                <Icon name="eye" size={14} /> Voir
                              </button>
                            )}
                            {(e.etat === "todo" || e.etat === "refused") && (
                              <button className="btn sm primary" onClick={() => choisirFichier(e.p.piece_type_id)}>
                                <Icon name="upload" size={14} /> {e.etat === "refused" ? "Renvoyer" : "Fournir"}
                              </button>
                            )}
                          </div>
                          {e.p.consigne && <p className="hint" style={{ margin: "2px 0 0" }}>{e.p.consigne}</p>}
                          {e.etat === "refused" && e.p.motif_refus && (
                            <p className="hint" style={{ margin: "4px 0 0", color: "var(--red, #c0392b)" }}>
                              <Icon name="x" size={12} /> Refusé&nbsp;: {e.p.motif_refus} — merci d'en envoyer un nouveau.
                            </p>
                          )}
                        </>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ color: "var(--blue)", display: "inline-flex", flex: "none" }}><Icon name={e.d.quiz_id ? "list-checks" : "file-text"} size={16} /></span>
                          <b style={{ flex: 1, minWidth: 0 }}>{e.d.title}{e.d.signed_at && <span style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>Signé le {dateHeure(e.d.signed_at)}</span>}</b>
                          {e.d.quiz_id ? (
                            <>
                              <Badge tone={e.d.status === "SIGNE" ? "g" : "b"}>{e.d.status === "SIGNE" ? "Répondu" : "QCM à faire"}</Badge>
                              <button className="btn sm primary" onClick={() => setQuizDoc(e.d.id)}>{e.d.status === "SIGNE" ? "Voir" : "Répondre"}</button>
                            </>
                          ) : (
                            <>
                              <Badge tone={e.d.status === "SIGNE" ? "g" : "b"}>{e.d.status === "SIGNE" ? "Signé" : "À signer"}</Badge>
                              <button className="btn sm primary" onClick={() => setViewId(e.d.id)}>{e.d.status === "SIGNE" ? "Consulter" : "Consulter / signer"}</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
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
                      <Badge tone="g">Signé{r.signed_at ? ` · ${dateHeure(r.signed_at)}` : ""}</Badge>
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
