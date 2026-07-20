import { useEffect, useState } from "react";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import {
  getQuestContent, createQuestChapter, updateQuestChapter, deleteQuestChapter,
  createQuestQuestion, updateQuestQuestion, deleteQuestQuestion,
} from "../api/apiClient.js";

/**
 * Banque de questions Pizza Quest — chapitres et questions d'une formation.
 *
 * Trois types, ceux du jeu : QCM (plusieurs choix, un correct), Vrai/Faux, et Association
 * (relier deux colonnes). Le formulaire ne montre QUE les champs du type choisi : afficher
 * les paires d'association sous un vrai/faux invite à les remplir pour rien.
 *
 * L'XP se lit à deux niveaux : la difficulté donne le tarif, la question peut le surcharger.
 * Laisser le champ vide = « prends celui de la difficulté », ce qui permet de retarifer un
 * palier entier d'un seul geste.
 */

const TYPES = [
  { v: "QCM", label: "QCM", ic: "list-checks" },
  { v: "VF", label: "Vrai / Faux", ic: "check-circle" },
  { v: "ASSOC", label: "Association", ic: "shuffle" },
];

export default function QuestBankEditor({ programs, difficulties, onStatus }) {
  const [programId, setProgramId] = useState("");
  const [bank, setBank] = useState(null);
  const [openCh, setOpenCh] = useState(null);   // chapitre déplié
  const [editing, setEditing] = useState(null); // { chapterId, question|null }
  const [newCh, setNewCh] = useState("");

  const reload = () => getQuestContent(programId || undefined)
    .then((r) => setBank(r.data || { chapters: [], questions: [], options: [] }))
    .catch((e) => { onStatus({ type: "error", message: e.message }); setBank({ chapters: [], questions: [], options: [] }); });
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [programId]);

  async function run(fn, ok) {
    onStatus(null);
    try { await fn(); await reload(); if (ok) onStatus({ type: "success", message: ok }); }
    catch (e) { onStatus({ type: "error", message: e.message || "Action impossible." }); }
  }

  if (!bank) return <p className="hint">Chargement…</p>;
  const qOf = (chId) => bank.questions.filter((q) => q.chapter_id === chId);
  const optsOf = (qId) => bank.options.filter((o) => o.question_id === qId);

  return (
    <Card title={<span className="card-ttl"><Icon name="book-open" size={16} /> Banque de questions</span>}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label className="hint">Formation</label>
        <select value={programId} onChange={(e) => { setProgramId(e.target.value); setOpenCh(null); }}>
          <option value="">Toutes</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
        </select>
        <form style={{ display: "flex", gap: 6, marginLeft: "auto" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCh.trim()) return;
            run(() => createQuestChapter({ title: newCh.trim(), program_id: programId || null }), "Chapitre créé.");
            setNewCh("");
          }}>
          <input className="inp" value={newCh} onChange={(e) => setNewCh(e.target.value)}
            placeholder="Nouveau chapitre…" style={{ maxWidth: 220 }} />
          <button type="submit" className="btn sm" disabled={!newCh.trim()}><Icon name="plus" size={14} /> Chapitre</button>
        </form>
      </div>

      {bank.chapters.length === 0 ? (
        <p className="hint">
          Aucun chapitre{programId ? " pour cette formation" : ""}. Créez-en un, ou importez la banque
          fournie (<code>102_seed_quest_questions.sql</code>).
        </p>
      ) : bank.chapters.map((ch) => {
        const qs = qOf(ch.id);
        const ouvert = openCh === ch.id;
        return (
          <div key={ch.id} style={{ border: "1px solid var(--border-soft)", borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 12px" }}>
              <button type="button" className="iconbtn" onClick={() => setOpenCh(ouvert ? null : ch.id)}
                aria-label={ouvert ? "Replier" : "Déplier"}>
                <Icon name={ouvert ? "chevron-down" : "chevron-right"} size={15} />
              </button>
              <b style={{ flex: 1 }}>{ch.title}</b>
              <span className="hint">{qs.length} question{qs.length > 1 ? "s" : ""}</span>
              {!ch.active && <span className="badge n">inactif</span>}
              <select value={ch.program_id || ""} title="Formation rattachée"
                onChange={(e) => run(() => updateQuestChapter(ch.id, { program_id: e.target.value || null }))}>
                <option value="">— non rattaché</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
              <button type="button" className="btn sm ghost danger"
                onClick={() => {
                  if (window.confirm(`Supprimer « ${ch.title} » et ses ${qs.length} question(s) ? C'est définitif.`)) {
                    run(() => deleteQuestChapter(ch.id), "Chapitre supprimé.");
                  }
                }}>
                <Icon name="trash" size={13} />
              </button>
            </div>

            {ouvert && (
              <div style={{ borderTop: "1px solid var(--border-soft)", padding: "10px 12px" }}>
                {qs.map((q) => (
                  <QuestionRow key={q.id} q={q} opts={optsOf(q.id)} difficulties={difficulties}
                    onEdit={() => setEditing({ chapterId: ch.id, question: q })}
                    onDelete={() => {
                      if (window.confirm("Supprimer cette question ?")) run(() => deleteQuestQuestion(q.id), "Question supprimée.");
                    }} />
                ))}
                <button type="button" className="btn sm ghost" style={{ marginTop: 8 }}
                  onClick={() => setEditing({ chapterId: ch.id, question: null })}>
                  <Icon name="plus" size={14} /> Ajouter une question
                </button>
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <QuestionModal
          chapterId={editing.chapterId}
          question={editing.question}
          options={editing.question ? optsOf(editing.question.id) : []}
          difficulties={difficulties}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            await run(
              () => (editing.question
                ? updateQuestQuestion(editing.question.id, payload)
                : createQuestQuestion({ ...payload, chapter_id: editing.chapterId })),
              "Question enregistrée."
            );
            setEditing(null);
          }} />
      )}
    </Card>
  );
}

/* ---- Ligne de question (lecture) ------------------------------------------------------ */

function QuestionRow({ q, opts, difficulties, onEdit, onDelete }) {
  const t = TYPES.find((x) => x.v === q.type) || TYPES[0];
  const diff = difficulties.find((d) => d.id === q.difficulty_id);
  // XP effectif : celui de la question, sinon celui de sa difficulté (même règle qu'au jeu).
  const xp = q.xp != null ? q.xp : (diff ? diff.xp : 10);
  const bonne = q.type === "VF"
    ? (q.vf_answer ? "Vrai" : "Faux")
    : q.type === "ASSOC"
      ? `${opts.length} paires`
      : (opts.find((o) => o.is_correct) || {}).text || "—";

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <span title={t.label} style={{ marginTop: 2, color: "var(--muted)" }}><Icon name={t.ic} size={14} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ lineHeight: 1.35 }}>{q.text}</div>
        <div className="hint" style={{ marginTop: 2 }}>
          <b>{bonne}</b>
          {diff ? <> · {diff.name}</> : null} · {xp} XP
          {q.source ? <> · {q.source}</> : null}
          {!q.active ? <> · <span style={{ color: "var(--ember1)" }}>inactive</span></> : null}
        </div>
      </div>
      <button type="button" className="btn sm ghost" onClick={onEdit}><Icon name="pencil" size={13} /></button>
      <button type="button" className="btn sm ghost danger" onClick={onDelete}><Icon name="trash" size={13} /></button>
    </div>
  );
}

/* ---- Édition d'une question ----------------------------------------------------------- */

function QuestionModal({ question, options, difficulties, onClose, onSave }) {
  const [type, setType] = useState(question?.type || "QCM");
  const [text, setText] = useState(question?.text || "");
  const [expl, setExpl] = useState(question?.explanation || "");
  const [src, setSrc] = useState(question?.source || "");
  const [diffId, setDiffId] = useState(question?.difficulty_id || "");
  const [xp, setXp] = useState(question?.xp ?? "");
  const [active, setActive] = useState(question ? !!question.active : true);
  const [vf, setVf] = useState(question?.vf_answer ? "1" : "0");
  // QCM : liste de choix + index du bon. ASSOC : liste de paires.
  const [choices, setChoices] = useState(() => {
    const c = options.filter((o) => !o.match_text).map((o) => o.text);
    return c.length ? c : ["", ""];
  });
  const [correct, setCorrect] = useState(() => Math.max(0, options.findIndex((o) => o.is_correct && !o.match_text)));
  const [pairs, setPairs] = useState(() => {
    const p = options.filter((o) => o.match_text).map((o) => [o.text, o.match_text]);
    return p.length ? p : [["", ""], ["", ""]];
  });
  const [err, setErr] = useState(null);

  function submit(e) {
    e.preventDefault();
    setErr(null);
    const base = {
      type, text: text.trim(), explanation: expl.trim() || null, source: src.trim() || null,
      difficulty_id: diffId || null, xp: xp === "" ? null : Number(xp), active,
    };
    if (!base.text) return setErr("Énoncé requis.");
    if (type === "VF") return onSave({ ...base, vf_answer: vf === "1" });
    if (type === "ASSOC") {
      const p = pairs.map(([a, b]) => ({ text: a.trim(), match_text: b.trim() })).filter((x) => x.text && x.match_text);
      if (p.length < 2) return setErr("Une association demande au moins deux paires complètes.");
      return onSave({ ...base, pairs: p });
    }
    const c = choices.map((x) => x.trim()).filter(Boolean);
    if (c.length < 2) return setErr("Un QCM demande au moins deux choix.");
    if (correct >= c.length) return setErr("Désignez la bonne réponse.");
    onSave({ ...base, choices: c, correct_index: correct });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>{question ? "Modifier la question" : "Nouvelle question"}</h3>

          <div className="seg" style={{ marginBottom: 12 }}>
            {TYPES.map((t) => (
              <button key={t.v} type="button" className={"seg-btn" + (type === t.v ? " on" : "")}
                onClick={() => setType(t.v)}><Icon name={t.ic} size={13} /> {t.label}</button>
            ))}
          </div>

          <div className="field">
            <label>Énoncé</label>
            <textarea className="inp" rows={2} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Que mesure le « W » d'une farine ?" />
          </div>

          {type === "QCM" && (
            <div className="field">
              <label>Choix — cochez la bonne réponse</label>
              {choices.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)}
                    title="Bonne réponse" />
                  <input className="inp" value={c} placeholder={`Choix ${i + 1}`}
                    onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} />
                  {choices.length > 2 && (
                    <button type="button" className="iconbtn del" title="Retirer"
                      onClick={() => {
                        setChoices(choices.filter((_, j) => j !== i));
                        if (correct >= i && correct > 0) setCorrect(correct - 1);
                      }}><Icon name="x" size={13} /></button>
                  )}
                </div>
              ))}
              <button type="button" className="btn sm ghost" onClick={() => setChoices([...choices, ""])}>
                <Icon name="plus" size={13} /> Ajouter un choix
              </button>
              {/* Le jeu mélange les choix à l'affichage : la position ne trahit pas la réponse. */}
              <p className="hint" style={{ marginTop: 6 }}>
                Les choix sont mélangés à l'écran. Évitez les leurres absurdes : un mauvais choix
                doit rester crédible, sinon la question ne teste plus rien.
              </p>
            </div>
          )}

          {type === "VF" && (
            <div className="field">
              <label>L'affirmation est…</label>
              <div className="seg">
                <button type="button" className={"seg-btn" + (vf === "1" ? " on" : "")} onClick={() => setVf("1")}>Vraie</button>
                <button type="button" className={"seg-btn" + (vf === "0" ? " on" : "")} onClick={() => setVf("0")}>Fausse</button>
              </div>
            </div>
          )}

          {type === "ASSOC" && (
            <div className="field">
              <label>Paires à relier</label>
              {pairs.map(([a, b], i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input className="inp" value={a} placeholder="Terme"
                    onChange={(e) => setPairs(pairs.map((p, j) => (j === i ? [e.target.value, p[1]] : p)))} />
                  <Icon name="chevron-right" size={13} />
                  <input className="inp" value={b} placeholder="Correspondance"
                    onChange={(e) => setPairs(pairs.map((p, j) => (j === i ? [p[0], e.target.value] : p)))} />
                  {pairs.length > 2 && (
                    <button type="button" className="iconbtn del" title="Retirer"
                      onClick={() => setPairs(pairs.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
                  )}
                </div>
              ))}
              <button type="button" className="btn sm ghost" onClick={() => setPairs([...pairs, ["", ""]])}>
                <Icon name="plus" size={13} /> Ajouter une paire
              </button>
            </div>
          )}

          <div className="field">
            <label>Explication <span className="hint">— affichée après la réponse</span></label>
            <textarea className="inp" rows={2} value={expl} onChange={(e) => setExpl(e.target.value)}
              placeholder="Le pourquoi : sans lui, le stagiaire retient la bonne case et pas la raison." />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 170 }}>
              <label>Source</label>
              <input className="inp" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="Manuel Niveau I, p. 17" />
            </div>
            <div className="field" style={{ width: 150 }}>
              <label>Difficulté</label>
              <select value={diffId} onChange={(e) => setDiffId(e.target.value)}>
                <option value="">—</option>
                {difficulties.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ width: 120 }}>
              <label>XP</label>
              <input className="inp" type="number" min="0" value={xp} onChange={(e) => setXp(e.target.value)}
                placeholder={difficulties.find((d) => d.id === diffId)?.xp ?? 10} />
            </div>
          </div>
          <p className="hint" style={{ marginTop: -4 }}>
            XP vide = celui de la difficulté choisie. Le renseigner ne vaut que pour cette question.
          </p>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active <span className="hint">— décochez pour la retirer du jeu sans la supprimer</span>
          </label>

          {err && <p className="hint" style={{ color: "var(--ember1)", marginTop: 8 }}>{err}</p>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}
