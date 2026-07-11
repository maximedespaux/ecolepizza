import { useEffect, useState } from "react";
import {
  getQuizzes, getQuiz, createQuiz, saveQuiz, deleteQuiz, duplicateQuiz, sendQuiz,
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
  { v: "GRID_SINGLE", label: "Grille — 1 réponse par ligne" },
  { v: "GRID_MULTI", label: "Grille — plusieurs réponses par ligne" },
];
const isGrid = (t) => t === "GRID_SINGLE" || t === "GRID_MULTI";
const blankQuestion = () => ({ text: "", type: "SINGLE", points: 1, partial_scoring: 0, scale_max: 5, options: [{ text: "", is_correct: false }, { text: "", is_correct: false }], rows: [{ text: "", correct: [], points: 1 }, { text: "", correct: [], points: 1 }] });

// Étiquette courte du jour : J2, ou J-3 (avant le début).
function dayTag(day) {
  if (day == null || day === "") return "—";
  const d = Number(day);
  if (!Number.isFinite(d)) return "—";
  return d < 0 ? `J${d}` : `J${d < 1 ? 1 : d}`;
}
// Phrase pour le jour d'envoi.
function dayPhrase(day) {
  if (day == null || day === "") return "le jour J";
  const d = Number(day);
  if (!Number.isFinite(d)) return "le jour J";
  if (d < 0) return `${Math.abs(d)} jour(s) avant le début`;
  return `le matin du jour ${d < 1 ? 1 : d}`;
}

// Regroupe les QCM par formation ; les QCM non rattachés en dernier, chaque groupe trié par jour.
function groupByFormation(quizzes) {
  const map = new Map();
  for (const q of quizzes) {
    const key = q.program_id || "__none__";
    if (!map.has(key)) map.set(key, { key, program_code: q.program_code || "", program_title: q.program_title || "", items: [] });
    map.get(key).items.push(q);
  }
  const groups = [...map.values()];
  groups.forEach((g) => g.items.sort((a, b) => (a.day || 99) - (b.day || 99) || a.title.localeCompare(b.title)));
  return groups.sort((a, b) => {
    if (!a.program_code) return 1;
    if (!b.program_code) return -1;
    return a.program_code.localeCompare(b.program_code);
  });
}

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
  async function onDuplicate(q) {
    try { await duplicateQuiz(q.id); setStatus({ type: "success", message: `« ${q.title} » dupliqué.` }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function onSend(q) {
    if (!q.sendable) {
      window.alert(`Envoi impossible : ${q.send_reason || "les conditions d'envoi ne sont pas réunies."}`);
      return;
    }
    if (!window.confirm(`Envoyer « ${q.title} » à ${q.eligible_count} stagiaire(s) de la session en cours ?`)) return;
    try { const { data } = await sendQuiz(q.id); setStatus({ type: "success", message: `Envoyé à ${data.sent} stagiaire(s).` }); load(); }
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
      <PageHead eyebrow="Modèles" title="Modèles de QCM"
        lead="Créez des questionnaires (test de positionnement, évaluation…) rattachés à une formation et à un jour. Envoi manuel ou automatique le matin du jour J ; le stagiaire y répond dans son espace."
        actions={<button className="btn primary" onClick={onNew}>＋ Nouveau QCM</button>} />
      <StatusMessage status={status} />

      {quizzes.length === 0 ? (
        <Card title="QCM (0)"><EmptyState icon="❓">Aucun QCM.</EmptyState></Card>
      ) : (
        groupByFormation(quizzes).map((g) => (
          <Card key={g.key} title={g.program_code ? `${g.program_code} — ${g.program_title}` : "Non rattachés à une formation"}
            more={<Badge tone="n">{g.items.length}</Badge>}>
            <div className="tablewrap" style={{ border: "none" }}>
              <table>
                <thead><tr><th>Titre</th><th>Jour</th><th>Envoi</th><th>Type</th><th>Questions</th><th></th></tr></thead>
                <tbody>
                  {g.items.map((q) => (
                    <tr key={q.id}>
                      <td><b>{q.title}</b></td>
                      <td className="tnum">{dayTag(q.day)}</td>
                      <td>{q.auto_send ? <Badge tone="g">Auto</Badge> : <span className="hint">Manuel</span>}</td>
                      <td>{q.kind === "SURVEY" ? <Badge tone="n">Enquête</Badge> : <Badge tone="b">Noté</Badge>}</td>
                      <td className="tnum">{q.n_questions}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn sm ghost"
                          style={q.sendable ? undefined : { opacity: 0.45 }}
                          title={q.sendable ? `Envoyer aux stagiaires (${q.eligible_count})` : (q.send_reason || "Envoi indisponible")}
                          onClick={() => onSend(q)}>Envoyer</button>{" "}
                        <button className="btn sm ghost" onClick={() => onEdit(q)}>Éditer</button>{" "}
                        <button className="btn sm ghost" title="Dupliquer ce QCM" onClick={() => onDuplicate(q)}>Dupliquer</button>{" "}
                        <button className="btn sm ghost danger" onClick={() => onDelete(q)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
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
  // Grille — lignes.
  const setRow = (qi, ri, patch) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => j !== qi ? q : { ...q, rows: (q.rows || []).map((rw, k) => (k === ri ? { ...rw, ...patch } : rw)) }) }));
  const addRow = (qi) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => j !== qi ? q : { ...q, rows: [...(q.rows || []), { text: "", correct: [], points: 1 }] }) }));
  const delRow = (qi, ri) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => j !== qi ? q : { ...q, rows: (q.rows || []).filter((_, k) => k !== ri) }) }));
  // Coche la colonne correcte d'une ligne (par position). single -> remplace ; multi -> ajoute/retire.
  const toggleRowCorrect = (qi, ri, colPos, single) => setForm((p) => ({ ...p, questions: p.questions.map((q, j) => {
    if (j !== qi) return q;
    const rows = (q.rows || []).map((rw, k) => {
      if (k !== ri) return rw;
      const cur = new Set(rw.correct || []);
      if (single) return { ...rw, correct: cur.has(colPos) ? [] : [colPos] };
      if (cur.has(colPos)) cur.delete(colPos); else cur.add(colPos);
      return { ...rw, correct: [...cur].sort((a, b) => a - b) };
    });
    return { ...q, rows };
  }) }));

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
            <input className="inp" type="number" value={form.day} onChange={set("day")} placeholder="ex. 2, ou -3 (avant)" /></div>
          {form.kind === "GRADED" && (
            <div className="field"><label>Seuil de réussite (%)</label>
              <input className="inp" type="number" min="0" max="100" value={form.pass_score} onChange={set("pass_score")} placeholder="ex. 60" /></div>
          )}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 6 }}>
          <input type="checkbox" checked={form.auto_send} onChange={(e) => setForm((p) => ({ ...p, auto_send: e.target.checked }))} />
          Envoi automatique {dayPhrase(form.day)} (sinon envoi manuel avec « Envoyer »)
        </label>
        <p className="hint" style={{ margin: 0 }}>
          {form.day === "" || form.day == null
            ? "Indiquez le jour où ce QCM doit être rempli : un nombre positif = jour de stage (J1 = 1er jour), un nombre négatif = jours avant le début (ex. -3 pour un test de positionnement 3 jours avant)."
            : `Le QCM sera proposé aux stagiaires ${form.auto_send ? "automatiquement" : "après envoi manuel"} ${dayPhrase(form.day)}.`}
        </p>
      </Card>

      {form.questions.map((q, i) => (
        <Card key={i} title={`Question ${i + 1}`} more={<button className="btn sm ghost danger" onClick={() => delQ(i)}>Supprimer</button>}>
          <div className="field"><label>Énoncé</label>
            <textarea className="inp" rows={2} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} /></div>
          <div className="field"><label>Image (optionnel)</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {q.image ? <img src={q.image} alt="" style={{ height: 56, maxWidth: 120, objectFit: "contain", border: "1px solid var(--border-soft)", borderRadius: 6, padding: 2 }} /> : <span className="sub" style={{ fontSize: 12 }}>Aucune image</span>}
              <label className="btn sm ghost" style={{ cursor: "pointer" }}>
                {q.image ? "Remplacer" : "Ajouter"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  if (f.size > 2 * 1024 * 1024) { onError && onError("Image trop lourde (max 2 Mo)."); return; }
                  const rd = new FileReader(); rd.onload = () => setQ(i, { image: rd.result }); rd.readAsDataURL(f);
                }} />
              </label>
              {q.image ? <button type="button" className="btn sm ghost" onClick={() => setQ(i, { image: null })}>Retirer</button> : null}
            </div></div>
          <div className="row3">
            <div className="field"><label>Type</label>
              <select value={q.type} onChange={(e) => setQ(i, { type: e.target.value })}>{QTYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></div>
            {q.type === "SCALE" ? (
              <div className="field"><label>Note max</label>
                <input className="inp" type="number" min="2" max="10" value={q.scale_max ?? ""} onChange={(e) => setQ(i, { scale_max: e.target.value })} /></div>
            ) : form.kind === "GRADED" && isGrid(q.type) ? (
              <div className="field"><label>Points</label><span className="hint" style={{ paddingTop: 8 }}>Définis par ligne (colonne « Pts »).</span></div>
            ) : form.kind === "GRADED" ? (
              <div className="field"><label>Points {q.type === "MULTI" && q.partial_scoring ? "(par bonne réponse)" : ""}</label>
                <input className="inp" type="number" min="0" value={q.points ?? ""}
                  onChange={(e) => setQ(i, { points: e.target.value })} />
                {(q.points === "" || q.points == null || Number(q.points) === 0) && <span className="hint">Vide ou 0 : question non notée.</span>}
              </div>
            ) : <div />}
            <div />
          </div>

          {form.kind === "GRADED" && q.type === "MULTI" && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, margin: "2px 0 10px" }}>
              <input type="checkbox" checked={!!q.partial_scoring}
                onChange={(e) => setQ(i, { partial_scoring: e.target.checked ? 1 : 0 })} />
              Points par bonne réponse
              <span className="hint">
                {q.partial_scoring
                  ? "Chaque bonne réponse cochée rapporte les points ; une mauvaise en retire autant (min. 0)."
                  : "Tout ou rien : il faut cocher exactement les bonnes réponses."}
              </span>
            </label>
          )}

          {isGrid(q.type) && (
            <>
              <div className="field">
                <label>Colonnes (choix proposés)</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {q.options.map((o, oi) => (
                    <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input className="inp" style={{ flex: 1 }} value={o.text} onChange={(e) => setOpt(i, oi, { text: e.target.value })} placeholder={`Colonne ${oi + 1}`} />
                      <button className="btn sm ghost" onClick={() => delOpt(i, oi)} disabled={q.options.length <= 1}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => addOpt(i)}>＋ Colonne</button>
              </div>
              <div className="field">
                <label>Lignes {form.kind === "GRADED" && <span className="hint">(cochez la/les bonne(s) colonne(s) par ligne)</span>}</label>
                {form.kind === "GRADED" ? (
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead><tr><th></th>{q.options.map((o, oi) => <th key={oi} style={{ fontSize: 12, padding: "2px 6px", whiteSpace: "nowrap" }}>{o.text || `Col ${oi + 1}`}</th>)}<th style={{ fontSize: 12 }}>Pts</th><th></th></tr></thead>
                      <tbody>
                        {(q.rows || []).map((rw, ri) => (
                          <tr key={ri}>
                            <td><input className="inp" style={{ minWidth: 150 }} value={rw.text} onChange={(e) => setRow(i, ri, { text: e.target.value })} placeholder={`Ligne ${ri + 1}`} /></td>
                            {q.options.map((o, oi) => (
                              <td key={oi} style={{ textAlign: "center" }}>
                                <input type={q.type === "GRID_SINGLE" ? "radio" : "checkbox"} name={`q${i}r${ri}`} checked={(rw.correct || []).includes(oi)} onChange={() => toggleRowCorrect(i, ri, oi, q.type === "GRID_SINGLE")} />
                              </td>
                            ))}
                            <td><input className="inp" type="number" min="0" style={{ width: 56 }} value={rw.points ?? ""} onChange={(e) => setRow(i, ri, { points: e.target.value })} title="Points de cette ligne" /></td>
                            <td><button className="btn sm ghost" onClick={() => delRow(i, ri)} disabled={(q.rows || []).length <= 1}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(q.rows || []).map((rw, ri) => (
                      <div key={ri} style={{ display: "flex", gap: 8 }}>
                        <input className="inp" style={{ flex: 1 }} value={rw.text} onChange={(e) => setRow(i, ri, { text: e.target.value })} placeholder={`Ligne ${ri + 1}`} />
                        <button className="btn sm ghost" onClick={() => delRow(i, ri)} disabled={(q.rows || []).length <= 1}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => addRow(i)}>＋ Ligne</button>
              </div>
            </>
          )}

          {!isGrid(q.type) && q.type !== "SCALE" && (
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

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", margin: "18px 0 8px" }}>
        <button className="btn ghost" onClick={onClose}>← Retour</button>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer le QCM"}</button>
      </div>
    </>
  );
}

export default Quiz;
