import { useEffect, useState } from "react";
import { takeQuiz, submitQuiz } from "../api/apiClient.js";

/** Passage d'un QCM par le stagiaire : une question à la fois, puis résultat. */
function QuizModal({ documentId, onClose, onDone }) {
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [alreadyDone, setAlreadyDone] = useState(null);

  useEffect(() => {
    takeQuiz(documentId)
      .then(({ data }) => {
        setQuiz(data.quiz); setQuestions(data.questions || []);
        if (data.done) setAlreadyDone(data.previous);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [documentId]);

  const q = questions[idx];
  const setAns = (v) => setAnswers((a) => ({ ...a, [q.id]: v }));
  const toggleMulti = (optId) => setAnswers((a) => {
    const cur = Array.isArray(a[q.id]) ? a[q.id] : [];
    return { ...a, [q.id]: cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId] };
  });
  const answered = (qq) => {
    const v = answers[qq.id];
    return qq.type === "MULTI" ? Array.isArray(v) && v.length > 0 : v != null && v !== "";
  };

  async function finish() {
    setSubmitting(true); setError(null);
    try { const { data } = await submitQuiz(documentId, answers); setResult(data); }
    catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{quiz ? quiz.title : "QCM"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          {loading ? <p className="lead">Chargement…</p>
            : error ? <div className="status err">{error}</div>
            : result ? (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 40 }}>{result.pass === false ? "📝" : "✅"}</div>
                <h3 style={{ marginBottom: 6 }}>Réponses enregistrées</h3>
                {result.kind === "GRADED" ? (
                  <p className="lead" style={{ margin: 0 }}>
                    Score : <b>{result.score}/{result.max_score}</b>{result.percent != null ? ` (${result.percent} %)` : ""}
                    {result.pass != null && <div style={{ marginTop: 6 }}>{result.pass ? "Réussi" : "En dessous du seuil"}</div>}
                  </p>
                ) : <p className="lead" style={{ margin: 0 }}>Merci pour votre retour.</p>}
              </div>
            ) : alreadyDone ? (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 36 }}>✅</div>
                <p className="lead">Vous avez déjà répondu à ce QCM{alreadyDone.completed_at ? ` le ${alreadyDone.completed_at}` : ""}.
                  {alreadyDone.max_score ? <> Score : <b>{alreadyDone.score}/{alreadyDone.max_score}</b>.</> : null}</p>
              </div>
            ) : questions.length === 0 ? <p className="lead">Ce QCM n'a pas de question.</p>
            : (
              <>
                <div className="sub" style={{ marginBottom: 8 }}>Question {idx + 1} / {questions.length}</div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>{q.text}</div>

                {q.type === "SCALE" ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {Array.from({ length: q.scale_max }, (_, n) => n + 1).map((n) => (
                      <button key={n} type="button"
                        className={"btn" + (String(answers[q.id]) === String(n) ? " primary" : " ghost")}
                        onClick={() => setAns(n)} style={{ minWidth: 44 }}>{n}</button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {q.options.map((o) => {
                      const sel = q.type === "MULTI" ? (answers[q.id] || []).includes(o.id) : answers[q.id] === o.id;
                      return (
                        <label key={o.id} className={"quiz-opt" + (sel ? " sel" : "")}>
                          <input type={q.type === "MULTI" ? "checkbox" : "radio"} name={`q${q.id}`} checked={!!sel}
                            onChange={() => (q.type === "MULTI" ? toggleMulti(o.id) : setAns(o.id))} />
                          <span>{o.text}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </>
            )}
        </div>
        {!loading && !error && !result && !alreadyDone && questions.length > 0 && (
          <div className="mfoot">
            <button className="btn ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>← Précédent</button>
            {idx < questions.length - 1 ? (
              <button className="btn primary" onClick={() => setIdx((i) => i + 1)} disabled={!answered(q)}>Suivant →</button>
            ) : (
              <button className="btn primary" onClick={finish} disabled={submitting || !answered(q)}>{submitting ? "Envoi…" : "Terminer"}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuizModal;
