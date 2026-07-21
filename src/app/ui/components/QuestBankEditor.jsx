import { useEffect, useRef, useState } from "react";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { colorOf } from "../lib/format.js";
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

/**
 * Icônes proposées pour un chapitre. Sélection VOLONTAIREMENT COURTE, tirée du vocabulaire
 * du métier et du déroulé d'un empâtement : les quatre-vingts icônes de l'application
 * (tableau de bord, facture, imprimante…) n'ont rien à dire ici et noieraient les bonnes.
 * L'icône n'est pas décorative — c'est elle qui marque le chapitre sur le chemin du
 * stagiaire, elle doit se reconnaître d'un coup d'œil.
 */
const ICONES_CHAPITRE = [
  { n: "wheat", l: "Farine, céréales" },
  { n: "droplet", l: "Eau, hydratation" },
  { n: "salt", l: "Sel" },
  { n: "oil", l: "Huile" },
  { n: "yeast", l: "Levure" },
  { n: "refresh", l: "Pétrissage, fermentation" },
  { n: "clock", l: "Temps, protocole" },
  { n: "thermometer", l: "Température" },
  { n: "flame", l: "Cuisson, four" },
  { n: "pizza", l: "Pizza, réalisation" },
  { n: "utensils", l: "Service, dressage" },
  { n: "package", l: "Matériel, ingrédients" },
  { n: "flask", l: "Mesures, calculs" },
  { n: "calculator", l: "Calcul" },
  { n: "list-checks", l: "Méthode, étapes" },
  { n: "check-circle", l: "Contrôle, validation" },
  { n: "clipboard-check", l: "Hygiène, conformité" },
  { n: "spray-can", l: "Nettoyage" },
  { n: "book-open", l: "Théorie, lexique" },
  { n: "graduation-cap", l: "Examen, certification" },
  { n: "star", l: "Perfectionnement" },
  { n: "target", l: "Objectif" },
];

/**
 * Icône d'un chapitre : l'affiche et permet d'en changer d'un clic.
 * Le choix s'applique immédiatement — un chapitre n'a qu'un champ, un bouton « enregistrer »
 * pour une icône serait une étape de plus pour rien.
 */
function ChapterIcon({ value, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [open]);

  const courant = ICONES_CHAPITRE.find((i) => i.n === value);
  return (
    <span className="qb-ico" ref={ref}>
      <button type="button" className={"qb-ico-btn" + (value ? "" : " vide")} onClick={() => setOpen((o) => !o)}
        title={value ? `Icône : ${courant ? courant.l : value} — cliquer pour changer` : "Aucune icône — cliquer pour en choisir une"}>
        <Icon name={value || "image"} size={15} />
      </button>
      {open && (
        <div className="qb-ico-pop">
          <div className="qb-ico-grid">
            {ICONES_CHAPITRE.map((i) => (
              <button key={i.n} type="button" title={i.l}
                className={"qb-ico-opt" + (i.n === value ? " on" : "")}
                onClick={() => { onPick(i.n); setOpen(false); }}>
                <Icon name={i.n} size={16} />
              </button>
            ))}
          </div>
          {value && (
            <button type="button" className="btn sm ghost" style={{ width: "100%", marginTop: 6 }}
              onClick={() => { onPick(null); setOpen(false); }}>
              Retirer l'icône
            </button>
          )}
        </div>
      )}
    </span>
  );
}

export default function QuestBankEditor({ programs, difficulties, onStatus }) {
  const [programId, setProgramId] = useState("");
  const [bank, setBank] = useState(null);
  const [openCh, setOpenCh] = useState(null);   // chapitre déplié
  const [editing, setEditing] = useState(null); // { chapterId, question|null }
  // Groupes REPLIÉS (et non dépliés) : à l'arrivée tout est visible, on referme ce dont on
  // n'a pas besoin. L'inverse obligerait à déplier avant de voir quoi que ce soit.
  const [plies, setPlies] = useState(() => new Set());
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
  // Un chapitre sans formation n'apparaît NULLE PART côté stagiaire : le jeu charge les
  // chapitres par formation. C'est le cas typique après un import dont la correspondance
  // de noms n'a rien trouvé — silencieux, d'où l'alerte.
  const orphelins = bank.chapters.filter((c) => !c.program_id);

  // Chapitres groupés par formation, dans l'ordre du catalogue ; les non rattachés ferment
  // la marche — c'est là qu'on va les chercher pour les corriger, pas au milieu.
  const groupes = (() => {
    const out = [];
    for (const p of programs) {
      const chapters = bank.chapters.filter((c) => c.program_id === p.id);
      if (chapters.length) out.push({ key: p.id, prog: p, chapters });
    }
    if (orphelins.length) out.push({ key: "__sans__", prog: null, chapters: orphelins });
    return out;
  })();

  /** Une ligne de chapitre — même rendu que la liste soit groupée ou non. */
  const renderChapitre = (ch) => {
    const qs = qOf(ch.id);
    const ouvert = openCh === ch.id;
    return (
      <div key={ch.id} className="qb-ch">
        <div className="qb-ch-head">
          <button type="button" className="iconbtn" onClick={() => setOpenCh(ouvert ? null : ch.id)}
            aria-label={ouvert ? "Replier" : "Déplier"}>
            <Icon name={ouvert ? "chevron-down" : "chevron-right"} size={15} />
          </button>
          {/* L'icône qui marquera ce chapitre sur le chemin du stagiaire. */}
          <ChapterIcon value={ch.icon}
            onPick={(icon) => run(() => updateQuestChapter(ch.id, { icon }), "Icône enregistrée.")} />
          {/* Le titre prend la place restante ; c'est l'information qu'on lit d'abord. */}
          <b className="qb-ch-title" title={ch.title}>{ch.title}</b>
          <span className="hint qb-ch-count">{qs.length} question{qs.length > 1 ? "s" : ""}</span>
          {!ch.active && <span className="badge n">inactif</span>}
          <select className="qb-ch-sel" value={ch.program_id || ""} title="Formation rattachée"
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
          <div className="qb-ch-body">
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
  };

  return (
    <Card title={<span className="card-ttl"><Icon name="book-open" size={16} /> Banque de questions</span>}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label className="hint">Formation</label>
        {/* Bornée, sinon le « width:100% » des champs lui fait prendre toute la rangée et
            repousse le formulaire de création hors de l'écran. */}
        <select style={{ flex: "0 1 260px", minWidth: 150 }} value={programId}
          onChange={(e) => { setProgramId(e.target.value); setOpenCh(null); }}>
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

      {orphelins.length > 0 && (
        <div className="doc-rule-warning" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="ban" />
          <div>
            <b>{orphelins.length} chapitre{orphelins.length > 1 ? "s ne sont" : " n'est"} rattaché{orphelins.length > 1 ? "s" : ""} à aucune formation</b>
            {" "}: {orphelins.length > 1 ? "ils n'apparaissent" : "il n'apparaît"} donc pas dans Pizza Quest,
            côté stagiaire. Choisissez la formation dans la liste à droite de chaque chapitre.
            <div className="hint" style={{ marginTop: 4 }}>
              {orphelins.map((c) => c.title).join(" · ")}
            </div>
          </div>
        </div>
      )}

      {bank.chapters.length === 0 ? (
        <p className="hint">
          Aucun chapitre{programId ? " pour cette formation" : ""}. Créez-en un, ou importez la banque
          fournie (<code>102_seed_quest_questions.sql</code>).
        </p>
      ) : programId ? (
        // Filtre sur UNE formation : la liste est déjà homogène, inutile de la regrouper.
        bank.chapters.map(renderChapitre)
      ) : (
        // « Toutes » : sans séparation, les chapitres de plusieurs niveaux se suivaient sans
        // qu'on sache où l'un finit. Un groupe repliable par formation, les non rattachés
        // en dernier — c'est là qu'on va les chercher pour les corriger.
        groupes.map((g) => {
          const ouvert = !plies.has(g.key);
          const nbQ = g.chapters.reduce((n, c) => n + qOf(c.id).length, 0);
          return (
            <section key={g.key} className="qb-grp">
              <button type="button" className={"qb-grp-head" + (g.prog ? "" : " orphan")}
                onClick={() => setPlies((s) => { const n = new Set(s); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}>
                <Icon name={ouvert ? "chevron-down" : "chevron-right"} size={15} />
                {g.prog
                  ? <><span className="qb-grp-code" style={{ background: g.prog.color || colorOf(g.prog.code) }}>{g.prog.code}</span>
                      <b className="qb-grp-title">{g.prog.title}</b></>
                  : <><Icon name="ban" size={14} /><b className="qb-grp-title">Non rattachés à une formation</b></>}
                <span className="hint qb-grp-count">
                  {g.chapters.length} chapitre{g.chapters.length > 1 ? "s" : ""} · {nbQ} question{nbQ > 1 ? "s" : ""}
                </span>
              </button>
              {ouvert && <div className="qb-grp-body">{g.chapters.map(renderChapitre)}</div>}
            </section>
          );
        })
      )}

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

/**
 * Éditeur d'une question, avec APERÇU EN DIRECT de ce que verra le stagiaire.
 *
 * L'aperçu est le cœur de cet écran : on écrit une question pour quelqu'un d'autre, et sans
 * le rendu on ne voit pas ce qui compte — un leurre plus long que la bonne réponse, une
 * explication qui répète l'énoncé, un intitulé illisible une fois les choix mélangés.
 *
 * Le formulaire n'affiche que les champs du type choisi : proposer des paires d'association
 * sous un vrai/faux invite à les remplir pour rien.
 */
function QuestionModal({ question, options, difficulties, onClose, onSave }) {
  const [type, setType] = useState(question?.type || "QCM");
  const [text, setText] = useState(question?.text || "");
  const [expl, setExpl] = useState(question?.explanation || "");
  const [src, setSrc] = useState(question?.source || "");
  const [diffId, setDiffId] = useState(question?.difficulty_id || "");
  const [xp, setXp] = useState(question?.xp ?? "");
  const [active, setActive] = useState(question ? !!question.active : true);
  const [vf, setVf] = useState(question?.vf_answer ? "1" : "0");
  const [choices, setChoices] = useState(() => {
    const c = options.filter((o) => !o.match_text).map((o) => o.text);
    return c.length ? c : ["", ""];
  });
  const [correct, setCorrect] = useState(() => Math.max(0, options.findIndex((o) => o.is_correct && !o.match_text)));
  const [pairs, setPairs] = useState(() => {
    const p = options.filter((o) => o.match_text).map((o) => [o.text, o.match_text]);
    return p.length ? p : [["", ""], ["", ""]];
  });

  // Échap ferme, comme partout ailleurs dans l'application.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const diff = difficulties.find((d) => d.id === diffId) || null;
  // XP effectif, résolu comme au jeu : valeur propre > difficulté > socle.
  const xpEff = xp !== "" && xp != null ? Number(xp) : (diff ? diff.xp : 10);
  const xpFrom = xp !== "" && xp != null ? "propre à la question" : diff ? `hérité de « ${diff.name} »` : "valeur par défaut";

  /* Ce qui manque pour pouvoir enregistrer. On l'affiche EN CONTINU plutôt qu'au clic :
     découvrir la raison d'un refus après coup fait recommencer la lecture du formulaire. */
  const manque = [];
  if (!text.trim()) manque.push("l'énoncé");
  if (type === "QCM") {
    const remplis = choices.filter((c) => c.trim()).length;
    if (remplis < 2) manque.push("au moins deux choix");
    else if (!choices[correct] || !choices[correct].trim()) manque.push("désigner la bonne réponse");
  }
  if (type === "ASSOC" && pairs.filter(([a, b]) => a.trim() && b.trim()).length < 2) {
    manque.push("au moins deux paires complètes");
  }
  const pret = manque.length === 0;

  function submit(e) {
    e.preventDefault();
    if (!pret) return;
    const base = {
      type, text: text.trim(), explanation: expl.trim() || null, source: src.trim() || null,
      difficulty_id: diffId || null, xp: xp === "" ? null : Number(xp), active,
    };
    if (type === "VF") return onSave({ ...base, vf_answer: vf === "1" });
    if (type === "ASSOC") {
      return onSave({
        ...base,
        pairs: pairs.map(([a, b]) => ({ text: a.trim(), match_text: b.trim() })).filter((x) => x.text && x.match_text),
      });
    }
    // Les choix vides sont retirés : l'index de la bonne réponse doit suivre le décalage.
    const gardes = choices.map((c, i) => ({ c: c.trim(), i })).filter((x) => x.c);
    const idx = gardes.findIndex((x) => x.i === correct);
    onSave({ ...base, choices: gardes.map((x) => x.c), correct_index: Math.max(0, idx) });
  }

  /* Déplacement d'une ligne (choix ou paire) : l'ordre de saisie est celui de l'aperçu et,
     pour une association, celui des colonnes. On garde la bonne réponse alignée. */
  const move = (arr, setArr, i, d, onMoved) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    setArr(next);
    onMoved?.(i, j);
  };
  const moveChoice = (i, d) => move(choices, setChoices, i, d, (a, b) => {
    setCorrect((c) => (c === a ? b : c === b ? a : c));
  });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} style={{ display: "contents" }}>
          <div className="mhead">
            <h3>{question ? "Modifier la question" : "Nouvelle question"}</h3>
            <button type="button" className="x" onClick={onClose} aria-label="Fermer">×</button>
          </div>

          <div className="mbody">
            <div className="seg" style={{ marginBottom: 14 }}>
              {TYPES.map((t) => (
                <button key={t.v} type="button" className={"seg-btn" + (type === t.v ? " on" : "")}
                  onClick={() => setType(t.v)}><Icon name={t.ic} size={13} /> {t.label}</button>
              ))}
            </div>

            <div className="qz-grid">
              {/* ---- Colonne de saisie ---- */}
              <div>
                <div className="field">
                  <label>Énoncé</label>
                  <textarea className="inp" rows={2} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="Que mesure le « W » d'une farine ?" autoFocus />
                </div>

                {type === "QCM" && (
                  <div className="field">
                    <label>Choix <span className="field-opt">— cliquez sur celui qui est correct</span></label>
                    {choices.map((c, i) => (
                      <div key={i} className={"qz-choice" + (correct === i ? " ok" : "")}>
                        <button type="button" className="qz-mark" onClick={() => setCorrect(i)}
                          title={correct === i ? "Bonne réponse" : "Désigner comme bonne réponse"}
                          aria-label="Bonne réponse" aria-pressed={correct === i}>
                          <Icon name={correct === i ? "check-circle" : "circle"} size={16} />
                        </button>
                        <input className="inp" value={c} placeholder={`Choix ${i + 1}`} maxLength={500}
                          onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))}
                          onKeyDown={(e) => {
                            // Entrée ajoute le choix suivant : on saisit une liste au clavier,
                            // sans repasser par la souris entre chaque ligne.
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (i === choices.length - 1) setChoices([...choices, ""]);
                            }
                          }} />
                        <span className="qz-tools">
                          <button type="button" className="iconbtn" title="Monter" disabled={i === 0}
                            onClick={() => moveChoice(i, -1)}><Icon name="arrow-up" size={12} /></button>
                          <button type="button" className="iconbtn" title="Descendre" disabled={i === choices.length - 1}
                            onClick={() => moveChoice(i, 1)}><Icon name="arrow-down" size={12} /></button>
                          <button type="button" className="iconbtn del" title="Retirer" disabled={choices.length <= 2}
                            onClick={() => {
                              setChoices(choices.filter((_, j) => j !== i));
                              if (correct >= i && correct > 0) setCorrect(correct - 1);
                            }}><Icon name="x" size={12} /></button>
                        </span>
                      </div>
                    ))}
                    <button type="button" className="btn sm ghost" onClick={() => setChoices([...choices, ""])}>
                      <Icon name="plus" size={13} /> Ajouter un choix
                    </button>
                    <p className="hint" style={{ marginTop: 6 }}>
                      Les choix sont mélangés à l'écran : la position ne trahit rien. Un leurre doit
                      rester crédible — une valeur plausible du métier, sinon la question ne teste plus rien.
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
                    <p className="hint" style={{ marginTop: 6 }}>
                      Équilibrez vrais et faux sur l'ensemble du chapitre : si presque tout est vrai,
                      répondre « vrai » partout suffit à passer.
                    </p>
                  </div>
                )}

                {type === "ASSOC" && (
                  <div className="field">
                    <label>Paires à relier</label>
                    {pairs.map(([a, b], i) => (
                      <div key={i} className="qz-pair">
                        <input className="inp" value={a} placeholder="Terme" maxLength={500}
                          onChange={(e) => setPairs(pairs.map((p, j) => (j === i ? [e.target.value, p[1]] : p)))} />
                        <Icon name="chevron-right" size={13} />
                        <input className="inp" value={b} placeholder="Correspondance" maxLength={500}
                          onChange={(e) => setPairs(pairs.map((p, j) => (j === i ? [p[0], e.target.value] : p)))} />
                        <span className="qz-tools">
                          <button type="button" className="iconbtn" title="Monter" disabled={i === 0}
                            onClick={() => move(pairs, setPairs, i, -1)}><Icon name="arrow-up" size={12} /></button>
                          <button type="button" className="iconbtn" title="Descendre" disabled={i === pairs.length - 1}
                            onClick={() => move(pairs, setPairs, i, 1)}><Icon name="arrow-down" size={12} /></button>
                          <button type="button" className="iconbtn del" title="Retirer" disabled={pairs.length <= 2}
                            onClick={() => setPairs(pairs.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
                        </span>
                      </div>
                    ))}
                    <button type="button" className="btn sm ghost" onClick={() => setPairs([...pairs, ["", ""]])}>
                      <Icon name="plus" size={13} /> Ajouter une paire
                    </button>
                  </div>
                )}

                <div className="field">
                  <label>Explication <span className="field-opt">— affichée après la réponse</span></label>
                  <textarea className="inp" rows={3} value={expl} onChange={(e) => setExpl(e.target.value)}
                    placeholder="Le pourquoi : sans lui, le stagiaire retient la bonne case et pas la raison." />
                </div>

                <div className="qz-meta">
                  <div className="field" style={{ margin: 0 }}>
                    <label>Source</label>
                    <input className="inp" value={src} maxLength={255} onChange={(e) => setSrc(e.target.value)}
                      placeholder="Manuel Niveau I, p. 17" />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Difficulté</label>
                    <select value={diffId} onChange={(e) => setDiffId(e.target.value)}>
                      <option value="">—</option>
                      {difficulties.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.xp} XP)</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>XP <span className="field-opt">— vide = hérité</span></label>
                    <input className="inp" type="number" min="0" value={xp} onChange={(e) => setXp(e.target.value)}
                      placeholder={diff ? String(diff.xp) : "10"} />
                  </div>
                </div>
                <p className="hint" style={{ marginTop: 6 }}>
                  Cette question vaudra <b>{xpEff} XP</b> <span className="field-opt">({xpFrom})</span>.
                </p>

                <label className="qz-active">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Active <span className="field-opt">— décochez pour la retirer du jeu sans la supprimer</span>
                </label>
              </div>

              {/* ---- Aperçu stagiaire ---- */}
              <aside className="qz-preview">
                <div className="qz-preview-h"><Icon name="eye" size={13} /> Vu par le stagiaire</div>
                <QuestionPreview type={type} text={text} choices={choices} correct={correct}
                  vf={vf} pairs={pairs} expl={expl} src={src} diff={diff} xp={xpEff} />
              </aside>
            </div>
          </div>

          <div className="mfoot">
            {/* Ce qui bloque, dit avant le clic plutôt qu'après. */}
            <span className="hint" style={{ marginRight: "auto", color: pret ? undefined : "var(--ember1)" }}>
              {pret ? "Prêt à enregistrer." : `Il manque : ${manque.join(", ")}.`}
            </span>
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn primary" disabled={!pret}>Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Rendu de la question tel qu'il apparaîtra en jeu. Volontairement fidèle sur ce qui
 * influence la rédaction (longueur des choix, ton de l'explication) et non sur l'habillage.
 * La bonne réponse est ici SIGNALÉE, ce qu'elle n'est évidemment pas en jeu : l'aperçu sert
 * à relire, pas à simuler la partie.
 */
function QuestionPreview({ type, text, choices, correct, vf, pairs, expl, src, diff, xp }) {
  const vide = !text.trim();
  return (
    <div className="qz-preview-body">
      <p className="qz-pv-q">{vide ? <span className="field-opt">L'énoncé apparaîtra ici…</span> : text}</p>
      <p className="qz-pv-meta">
        {diff && <span className="badge n" style={diff.color ? { color: diff.color } : undefined}>{diff.name}</span>}
        <span>{xp} XP</span>
      </p>

      {type === "QCM" && (
        <div className="qz-pv-choices">
          {choices.map((c, i) => (
            c.trim() ? <div key={i} className={"qz-pv-choice" + (correct === i ? " ok" : "")}>{c}</div> : null
          ))}
        </div>
      )}

      {type === "VF" && (
        <div className="qz-pv-choices">
          {["Vrai", "Faux"].map((lbl, i) => (
            <div key={lbl} className={"qz-pv-choice" + ((vf === "1" ? 0 : 1) === i ? " ok" : "")}>{lbl}</div>
          ))}
        </div>
      )}

      {type === "ASSOC" && (
        <div className="qz-pv-pairs">
          {pairs.filter(([a, b]) => a.trim() && b.trim()).map(([a, b], i) => (
            <div key={i} className="qz-pv-pair"><span>{a}</span><Icon name="chevron-right" size={11} /><span>{b}</span></div>
          ))}
        </div>
      )}

      {(expl.trim() || src.trim()) && (
        <div className="qz-pv-after">
          <b>Bravo !</b>
          {expl.trim() && <p>{expl}</p>}
          {src.trim() && <p className="field-opt">{src}</p>}
        </div>
      )}
    </div>
  );
}
