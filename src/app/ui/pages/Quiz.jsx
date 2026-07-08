import { useEffect, useState } from "react";
import {
  getQuizzes, getQuiz, createQuiz, saveQuiz, deleteQuiz, sendQuiz,
  getFormations,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";

const KINDS = [
  { v: "GRADED", label: "Noté (correction + score)" },
  { v: "SURVEY", label: "Enquête (sans note)" },
];
const QTYPES = [
  { v: "SINGLE", label: "Choix unique (QCU)" },
  { v: "MULTI", label: "Choix multiple (QCM)" },
  { v: "SCALE", label: "Échelle / note" },
];
const blankQuestion = () => ({ text: "", type: "SINGLE", points: 1, scale_max: 5, options: [{ text: "", is_correct: false }, { text: "", is_correct: false }] });

function Quiz() {
  const [quizzes, setQuizzes] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // objet quiz en édition
  const [formations, setFormations] = useState([]);

  async function load() {
    try { const { data } = await getQuizzes(); setQuizzes(data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); getFormations().then((r) => setFormations(r.data)).catch(() => {}); }, []);

  async function onNew() {
    try {
      const { id } = await createQuiz({ title: "Nouveau QCM", kind: "GRADED" });
      const { data } = await getQuiz(id);
      setEditing({ ...data, questions: data.questions || [] });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function onEdit(q) {
    try { const { data } = await getQuiz(q.id); setEditing({ ...data, questions: data.questions || [] }); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function onDelete(q) {
    if (!window.confirm(`Supprimer le QCM « ${q.title} » ?`)) return;
    try { await deleteQuiz(q.id); setStatus({ type: "success", message: "QCM supprimé." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function onSend(q) {
    if (!q.program_id) { setStatus({ type: "error", message: "Rattachez ce QCM à une formation d'abord." }); return; }
    if (!window.confirm(`Envoyer « ${q.title} » aux stagiaires inscrits à cette formation ?`)) return;
    try { const { data } = await sendQuiz(q.id); setStatus({ type: "success", message: `Envoyé à ${data.sent} stagiaire(s).` }); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  if (editing) {
    return <QuizEditor quiz={editing} formations={formations}
      onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); setStatus({ type: "success", message: "QCM enregistré." }); load(); }}
      onError={(m) => setStatus({ type: "error", message: m })} />;
  }

  return (
    <>
      <PageHead eyebrow="Pédagogie" title="QCM & tests"
        lead="Créez des questionnaires (test de positionnement, évaluation…) rattachés à une étape d'une formation. Le stagiaire y répond dans son espace."
        actions={<button className="btn primary" onClick={onNew}>＋ Nouveau QCM</button>} />
      <StatusMessage status={status} />

      <Card title={`QCM (${quizzes.length})`}>
        {quizzes.length === 0 ? <EmptyState icon="❓">Aucun QCM.</EmptyState> : (
          <div className="tablewrap" style={{ border: "none" }}>
            <table>
              <thead><tr><th>Titre</th><th>Formation</th><th>Jour</th><th>Envoi</th><th>Type</th><th>Questions</th><th></th></tr></thead>
              <tbody>
                {quizzes.map((q) => (
                  <tr key={q.id}>
                    <td><b>{q.title}</b></td>
                    <td>{q.program_code || <span className="hint">—</span>}</td>
                    <td className="tnum">{q.day ? `J${q.day}` : "—"}</td>
                    <td>{q.auto_send ? <Badge tone="g">Auto</Badge> : <span className="hint">Manuel</span>}</td>
                    <td>{q.kind === "SURVEY" ? <Badge tone="n">Enquête</Badge> : <Badge tone="b">Noté</Badge>}</td>
                    <td className="tnum">{q.n_questions}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn sm ghost" title="Envoyer aux stagiaires" onClick={() => onSend(q)}>📤 Envoyer</button>{" "}
                      <button className="btn sm ghost" onClick={() => onEdit(q)}>✎ Éditer</button>{" "}
                      <button className="btn sm ghost danger" onClick={() => onDelete(q)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function QuizEditor({ quiz, formations, onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    title: quiz.title || "", kind: quiz.kind || "GRADED", program_id: quiz.program_id || "",
    day: quiz.day ?? "", auto_send: !!quiz.auto_send, pass_score: quiz.pass_score ?? "",
    questions: quiz.questions && quiz.questions.length ? quiz.questions : [blankQuestion()],
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const setQ = (i, patch) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  const setOpt = (qi, oi, patch) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => j !== qi ? q : { ...q, options: q.options.map((o, k) => (k === oi ? { ...o, ...patch } : o)) }) }));
  const addQ = () => setForm((p) => ({ ...p, questions: [...p.questions, blankQuestion()] }));
  const delQ = (i) => setForm((p) => ({ ...p, questions: p.questions.filter((_, j) => j !== i) }));
  const addOpt = (qi) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => j !== qi ? q : { ...q, options: [...q.options, { text: "", is_correct: false }] }) }));
  const delOpt = (qi, oi) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => j !== qi ? q : { ...q, options: q.options.filter((_, k) => k !== oi) }) }));
  // QCU : une seule bonne réponse -> cocher exclut les autres.
  const setCorrect = (qi, oi, type) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => j !== qi ? q : { ...q, options: q.options.map((o, k) => ({ ...o, is_correct: k === oi ? !o.is_correct : (type === "SINGLE" ? false : o.is_correct) })) }) }));

  async function save() {
    if (!form.title.trim()) { onError("Titre requis."); return; }
    setSaving(true);
    try { await saveQuiz(quiz.id, { ...form, pass_score: form.pass_score === "" ? null : Number(form.pass_score) }); onSaved(); }
    catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <PageHead eyebrow="Pédagogie · QCM"
        title={<span>Éditer le QCM</span>}
        actions={<div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>← Retour</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>} />

      <Card title="Réglages">
        <div className="row2">
          <div className="field"><label>Titre</label>
            <input className="inp" value={form.title} onChange={set("title")} placeholder="Test de positionnement — Napolitaine" /></div>
          <div className="field"><label>Type</label>
            <select value={form.kind} onChange={set("kind")}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}</select></div>
        </div>
        <div className="row3">
          <div className="field"><label>Formation</label>
            <select value={form.program_id} onChange={set("program_id")}>
              <option value="">— Choisir —</option>
              {formations.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.title}</option>)}
            </select></div>
          <div className="field"><label>Jour de la formation</label>
            <input className="inp" type="number" min="1" value={form.day} onChange={set("day")} placeholder="ex. 2 (= jour 2)" /></div>
          {form.kind === "GRADED" && (
            <div className="field"><label>Seuil de réussite (%)</label>
              <input className="inp" type="number" min="0" max="100" value={form.pass_score} onChange={set("pass_score")} placeholder="ex. 60" /></div>
          )}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 6 }}>
          <input type="checkbox" checked={form.auto_send} onChange={(e) => setForm((p) => ({ ...p, auto_send: e.target.checked }))} />
          Envoi automatique le matin du jour {form.day || "J"} (sinon envoi manuel avec « Envoyer »)
        </label>
        <p className="hint" style={{ margin: 0 }}>
          {form.day
            ? `Le QCM sera proposé aux stagiaires de cette formation ${form.auto_send ? "automatiquement" : "après envoi manuel"} le jour ${form.day}.`
            : "Indiquez le jour de formation où ce QCM doit être rempli."}
        </p>
      </Card>

      {form.questions.map((q, i) => (
        <Card key={i} title={`Question ${i + 1}`} more={<button className="btn sm ghost danger" onClick={() => delQ(i)}>🗑 Supprimer</button>}>
          <div className="field"><label>Énoncé</label>
            <textarea className="inp" rows={2} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} /></div>
          <div className="row3">
            <div className="field"><label>Type</label>
              <select value={q.type} onChange={(e) => setQ(i, { type: e.target.value })}>{QTYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></div>
            {q.type === "SCALE" ? (
              <div className="field"><label>Note max</label>
                <input className="inp" type="number" min="2" max="10" value={q.scale_max} onChange={(e) => setQ(i, { scale_max: Number(e.target.value) || 5 })} /></div>
            ) : form.kind === "GRADED" ? (
              <div className="field"><label>Points</label>
                <input className="inp" type="number" min="1" value={q.points} onChange={(e) => setQ(i, { points: Number(e.target.value) || 1 })} /></div>
            ) : <div />}
            <div />
          </div>

          {q.type !== "SCALE" && (
            <div className="field">
              <label>Réponses {form.kind === "GRADED" && <span className="hint">(cochez la/les bonne(s))</span>}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {q.options.map((o, oi) => (
                  <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {form.kind === "GRADED" && (
                      <input type={q.type === "SINGLE" ? "radio" : "checkbox"} checked={!!o.is_correct}
                        name={`q${i}`} onChange={() => setCorrect(i, oi, q.type)} title="Bonne réponse" />
                    )}
                    <input className="inp" style={{ flex: 1 }} value={o.text} onChange={(e) => setOpt(i, oi, { text: e.target.value })} placeholder={`Réponse ${oi + 1}`} />
                    <button className="btn sm ghost" onClick={() => delOpt(i, oi)} disabled={q.options.length <= 1}>✕</button>
                  </div>
                ))}
              </div>
              <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => addOpt(i)}>＋ Réponse</button>
            </div>
          )}
          {q.type === "SCALE" && <p className="hint" style={{ margin: 0 }}>Le stagiaire choisira une note de 1 à {q.scale_max}.</p>}
        </Card>
      ))}

      <button className="btn" onClick={addQ}>＋ Ajouter une question</button>
    </>
  );
}

export default Quiz;
