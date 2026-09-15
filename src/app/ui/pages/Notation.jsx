import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import HelpDot from "../components/HelpDot.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Squelette } from "../components/Squelette.jsx";
import ProgressPct from "../components/ProgressPct.jsx";
import { getSessionsANoter, getNotationSession } from "../api/apiClient.js";
import { colorOf, dateHeure } from "../lib/format.js";

/**
 * NOTATION — tout ce qu'un stagiaire a obtenu, au même endroit.
 *
 * LES NOTES EXISTAIENT DÉJÀ, ÉPARPILLÉES : le QCM dans « Résultats QCM », rangé PAR
 * QUESTIONNAIRE ; l'évaluation pratique sur la page de la session ; le jury dans l'espace de
 * l'intervenant. Personne ne pouvait dire « où en est cette personne » sans ouvrir trois écrans
 * et faire l'addition de tête. C'est cette addition qui est ici.
 *
 * ÉCRAN DE LECTURE, SANS SAISIE. Ouvrir une saisie ici créerait un second endroit où noter — et
 * deux endroits finissent toujours par ne plus dire la même chose. Chaque colonne renvoie donc
 * là où la note se pose.
 */

/* Un total PARTIEL se dit. Sans cela, « 80 % » se lirait comme un résultat final alors qu'il ne
   porte que sur la moitié de ce qui sera évalué. */
const tonePct = (p) => (p == null ? "n" : p >= 75 ? "g" : p >= 50 ? "a" : "r");

function Note({ n }) {
  if (!n || !n.max) return <span className="hint" style={{ margin: 0 }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="mono" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{n.points} / {n.max}</span>
      <ProgressPct percent={n.percent} width={62} titre={`${n.points} points sur ${n.max}`} />
    </span>
  );
}

function Notation() {
  const [sessions, setSessions] = useState(null);
  const [choisie, setChoisie] = useState("");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getSessionsANoter()
      .then((r) => {
        const l = r.data || [];
        setSessions(l);
        /* La session la plus récente est ouverte d'office : c'est celle qu'on vient noter. */
        if (l.length) setChoisie(l[0].id);
      })
      .catch((e) => { setSessions([]); setStatus({ type: "error", message: e.message }); });
  }, []);

  useEffect(() => {
    if (!choisie) { setData(null); return; }
    let vivant = true;
    setData(null);
    getNotationSession(choisie)
      .then((r) => { if (vivant) setData(r.data); })
      .catch((e) => { if (vivant) setStatus({ type: "error", message: e.message }); });
    return () => { vivant = false; };
  }, [choisie]);

  const session = data?.session || null;
  const stagiaires = data?.stagiaires || [];
  const grilles = data?.grilles || {};

  /* La moyenne de la promotion, sur les seuls dossiers qui ont une note : ceux qui n'ont rien
     passé ne doivent pas la tirer vers le bas. */
  const moyenne = useMemo(() => {
    const notes = stagiaires.map((s) => s.total).filter((t) => t && t.max > 0);
    if (!notes.length) return null;
    const pts = notes.reduce((a, t) => a + t.points, 0);
    const max = notes.reduce((a, t) => a + t.max, 0);
    return { points: pts, max, percent: Math.round((pts / max) * 100), n: notes.length };
  }, [stagiaires]);

  return (
    <>
      <PageHead eyebrow="Pédagogie" title="Notation"
        lead="Ce que chaque stagiaire a obtenu, additionné : les QCM notés et l'évaluation pratique du formateur. L'avis du jury est rendu à côté — il valide des compétences, il ne se compte pas en points." />
      <StatusMessage status={status} />

      {sessions === null ? (
        <Squelette lignes={3} h={64} />
      ) : sessions.length === 0 ? (
        <Card><EmptyState icon="calendar" title="Aucune session à noter"
          text="Les sessions apparaissent ici dès qu'un stagiaire y est inscrit." /></Card>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 16px" }}>
            <label className="hint" style={{ margin: 0 }} htmlFor="sess">Session</label>
            <select id="sess" className="inp" style={{ maxWidth: 460 }} value={choisie}
              onChange={(e) => setChoisie(e.target.value)}>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} — ` : ""}{s.title || "Session"} · {dateHeure(s.start_date)} · {s.inscrits} inscrit(s)
                </option>
              ))}
            </select>
            {moyenne && (
              <span className="hint" style={{ margin: 0 }}>
                Moyenne de la promotion&nbsp;: <b>{moyenne.percent} %</b> sur {moyenne.n} dossier(s) notés
              </span>
            )}
          </div>

          {!data ? (
            <Squelette lignes={4} h={56} />
          ) : (
            <Card title={`${session?.code || ""} ${session?.title || ""}`.trim() || "Session"}
              more={<Link to={`/sessions/${choisie}`} className="card-more">Ouvrir la session →</Link>}>
              {stagiaires.length === 0 ? (
                <EmptyState icon="users">Aucun stagiaire inscrit.</EmptyState>
              ) : (
                <div className="tablewrap">
                  <table className="dt">
                    <thead>
                      <tr>
                        <th>Stagiaire</th>
                        <th>QCM notés</th>
                        <th>
                          Évaluation pratique
                          {grilles.formateur ? null : <HelpDot text={"Cette formation n'a pas de grille d'évaluation pratique.\n\nOn la définit dans Formations → Modifier → Évaluation pratique."} />}
                        </th>
                        <th>Total</th>
                        <th>
                          Jury
                          <HelpDot text={"Le jury VALIDE DES COMPÉTENCES selon une règle (« 5 critères sur 6 dont C2.3 »), il ne pose pas de points.\n\nLe convertir en points ferait apparaître un nombre que personne n'a calculé et qui ne figure sur aucun document signé. Il est donc rendu à côté du total, jamais dedans."} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stagiaires.map((s) => (
                        <tr key={s.enrollment_id}>
                          <td>
                            <Link to={`/stagiaires/${s.learner_id}`} style={{ fontWeight: 600 }}>{s.nom || "—"}</Link>
                          </td>
                          <td>
                            <Note n={s.qcm} />
                            {s.qcm && s.qcm.quiz.length > 0 && (
                              <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                                {s.qcm.quiz.map((q) => q.title).join(" · ")}
                              </span>
                            )}
                          </td>
                          <td><Note n={s.evaluation} /></td>
                          <td>
                            {s.total.max > 0 ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <Badge tone={tonePct(s.total.percent)}>{s.total.percent} %</Badge>
                                <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
                                  {s.total.points} / {s.total.max}
                                </span>
                                {/* PARTIEL SE DIT : le total est juste, mais il ne porte pas
                                    encore sur tout ce qui sera évalué. */}
                                {s.total.partiel && (
                                  <Badge tone="n" title="Toutes les épreuves ne sont pas passées">partiel</Badge>
                                )}
                              </span>
                            ) : <span className="hint" style={{ margin: 0 }}>Rien de noté</span>}
                          </td>
                          <td>
                            {!s.jury ? <span className="hint" style={{ margin: 0 }}>—</span> : (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span className="mono" style={{ fontSize: 13 }}>{s.jury.validees} / {s.jury.total}</span>
                                {s.jury.verdict?.avis === "FAVORABLE" && <Badge tone="g">Favorable</Badge>}
                                {s.jury.verdict?.avis === "DEFAVORABLE" && <Badge tone="r">Défavorable</Badge>}
                                {s.jury.verdict?.rattrapage ? <Badge tone="a">Rattrapage</Badge> : null}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="hint" style={{ marginBottom: 0 }}>
                Écran de lecture&nbsp;: les notes se saisissent au QCM, sur la page de la session pour
                l'évaluation pratique, et dans l'espace de l'intervenant pour le jury.
                {" "}<b>Ce qui n'a pas été passé ne compte pas pour zéro</b> — le total porte sur les seules
                épreuves réellement notées.
              </p>
            </Card>
          )}
        </>
      )}
    </>
  );
}

export default Notation;
