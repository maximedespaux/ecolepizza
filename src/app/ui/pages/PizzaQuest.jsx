import { useEffect, useMemo, useState } from "react";
import { getMyFormations, getMyProfile } from "../api/apiClient.js";
import { Icon } from "../components/Icon.jsx";
import ConstructorGame from "../components/ConstructorGame.jsx";
import { colorOf } from "../lib/format.js";
import { NIV1_CHAPTERS } from "../lib/niv1Questions.js";
import { saveQuestProgress } from "../lib/gamification.js";

/**
 * Pizza Quest — entraînement QCM ludique (façon Duolingo × Mario/Royal Match).
 * ACCUEIL = le schéma des formations, en carte de jeu : le tronc (Niveau I / I Pro
 * → Niveau II en prérequis) + Fabriquer des pizzas artisanales + les spécialisations,
 * thématisé pizza (blé, eau, huile, levure…). On clique une formation → son « monde »
 * (chemin de chapitres) → un chapitre = mini-QCM (les « étapes »).
 *
 * Le monde « Niveau I » utilise les vraies questions du manuel (banque niv1Questions,
 * formats variés : QCM / Vrai-Faux / Associations). Les autres niveaux restent en
 * démo (questions d'exemple) en attendant leurs manuels. Progression miroir localStorage +
 * serveur (learner_quest_progress) : réhydratée au montage, donc un cache vidé ne perd rien.
 */

const DEMO_QUESTIONS = [
  { q: "Que signifie « TH » dans un empâtement ?", c: ["Taux d'hydratation", "Température de l'huile", "Temps de repos", "Type de farine"], a: 0 },
  { q: "Pour 1 kg de farine à 65 % d'hydratation, combien d'eau ?", c: ["650 g", "65 g", "165 g", "6,5 kg"], a: 0 },
  { q: "La « force » d'une farine se mesure par…", c: ["Le W (force boulangère)", "Sa couleur", "Son prix", "Son taux de sucre"], a: 0 },
  { q: "La poolish est une préfermentation…", c: ["Liquide (≈100 % d'hydratation)", "Sèche (≈45 %)", "Sans levure", "À base d'huile"], a: 0 },
  { q: "La biga est une préfermentation…", c: ["Sèche (≈45–50 %)", "Liquide 100 %", "À base de tomate", "Sans farine"], a: 0 },
  { q: "Le « pointage » désigne…", c: ["La 1re fermentation en masse", "La cuisson", "Le façonnage", "Le nappage"], a: 0 },
  { q: "Le sel dans la pâte sert surtout à…", c: ["Renforcer le gluten & réguler la fermentation", "Colorer la pâte", "Sucrer", "Faire lever plus vite"], a: 0 },
  { q: "Température d'un four à bois pour une napolitaine ?", c: ["≈ 430–480 °C", "180 °C", "250 °C", "600 °C"], a: 0 },
];
const DEMO_CHAPTERS = [
  { title: "Les farines", ic: "package" },
  { title: "L'hydratation", ic: "droplet" },
  { title: "Le pétrissage", ic: "refresh" },
  { title: "La fermentation", ic: "flame" },
  { title: "La cuisson", ic: "pizza" },
  { title: "Dressage & service", ic: "check-circle" },
];
const STEPS_PER_CH = 6;

// Chapitres d'un monde : vraies questions pour le Niveau I, démo pour le reste.
const chaptersFor = (w) => (roleOf(w) === "niv1" ? NIV1_CHAPTERS : DEMO_CHAPTERS);

const KEY = "pizzaquest.v1";
const loadProg = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
// Enregistre en local ET en base (miroir) via gamification.saveQuestProgress.
const saveProg = (p) => saveQuestProgress(p);
const pickQuestions = (n) => {
  const pool = [...DEMO_QUESTIONS], out = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
};

// Rôle d'une formation dans le schéma (par mots-clés du titre) + ingrédient-thème.
function roleOf(w) {
  const t = `${w.title} ${w.code}`.toLowerCase();
  if (/artisanal/.test(t)) return "decouverte";
  if (/expert/.test(t)) return "expert"; // suite du Niveau II (prérequis Niveau II)
  if (/teglia|pala|napolit/.test(t)) return "spe";
  if (/niveau ii|emp[aâ]tement/.test(t)) return "niv2";
  if (/pro/.test(t)) return "niv1pro";
  if (/niveau i|classique/.test(t)) return "niv1";
  return "autre";
}
const INGREDIENT = { decouverte: "🍕", niv1: "🌾", niv1pro: "🌾", niv2: "🧫", expert: "🏆", spe: "🔥", autre: "🧑‍🍳" };

function PizzaQuest() {
  const [worlds, setWorlds] = useState(null);
  const [active, setActive] = useState(null); // null = carte ; sinon code du monde
  const [prog, setProg] = useState(loadProg);
  const [quiz, setQuiz] = useState(null);
  const [mini, setMini] = useState(null); // mini-jeu ouvert (ex. "constructeur")

  useEffect(() => {
    getMyFormations().then((r) => {
      setWorlds((r.data || []).map((f) => ({
        code: f.program_code, title: f.program_title,
        color: f.color || colorOf(f.program_code), unlocked: (!!f.has_badge || !!f.enrolled) && !f.revoked,
      })));
    }).catch(() => setWorlds([]));
  }, []);

  // Réhydrate la progression depuis le serveur (source de vérité) et fusionne avec le local
  // (meilleur score conservé). Le localStorage peut être vidé sans perdre la progression.
  useEffect(() => {
    getMyProfile().then((r) => {
      const server = (r && r.data && r.data.progress) || {};
      if (!Object.keys(server).length) return;
      setProg((local) => {
        const merged = { ...local };
        for (const [w, steps] of Object.entries(server)) {
          merged[w] = { ...(merged[w] || {}) };
          for (const [st, stars] of Object.entries(steps)) merged[w][st] = Math.max(Number(stars) || 0, merged[w][st] || 0);
        }
        try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* ignore */ }
        return merged;
      });
    }).catch(() => {});
  }, []);

  const xp = useMemo(() => Object.values(prog).reduce((s, w) => s + Object.values(w).reduce((a, st) => a + st * 10, 0), 0), [prog]);
  const totalStars = useMemo(() => Object.values(prog).reduce((s, w) => s + Object.values(w).reduce((a, v) => a + v, 0), 0), [prog]);

  function finishChapter(code, chIdx, stars) {
    setProg((p) => {
      const next = { ...p, [code]: { ...(p[code] || {}), [chIdx]: Math.max(stars, (p[code] || {})[chIdx] || 0) } };
      saveProg(next); return next;
    });
    setQuiz(null);
  }
  function finishMini(key, stars) {
    setProg((p) => { const next = { ...p, [key]: { 0: Math.max(stars, (p[key] || {})[0] || 0) } }; saveProg(next); return next; });
    setMini(null);
  }

  if (!worlds) return <div className="hero"><div className="eyebrow">Espace stagiaire</div><h1>Pizza Quest</h1><p>Chargement…</p></div>;
  const world = active ? worlds.find((w) => w.code === active) : null;

  return (
    <>
      <div className="hero" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="eyebrow">Espace stagiaire · entraînement</div>
          <h1 style={{ marginBottom: 4 }}>Pizza Quest</h1>
          <p style={{ margin: 0 }}>Entraîne-toi pour le QCM de demain — choisis une formation sur la carte.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="pq-stat"><Icon name="target" size={16} /><b>{xp}</b><span>XP</span></div>
          <div className="pq-stat"><span style={{ fontSize: 15 }}>⭐</span><b>{totalStars}</b><span>étoiles</span></div>
        </div>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>Le <b>Niveau I</b> contient les vraies questions du manuel (QCM, vrai/faux, associations). Les autres niveaux arrivent bientôt.</p>

      {world
        ? <WorldView world={world} prog={prog[world.code] || {}} onBack={() => setActive(null)}
            onChapter={(chIdx, chapter) => setQuiz({ code: world.code, chIdx, chapter, questions: chapter.questions || pickQuestions(STEPS_PER_CH) })} />
        : <><MiniGames onOpen={setMini} /><FormationMap worlds={worlds} prog={prog} onPick={setActive} /></>}

      {quiz && world && (
        <QuizModal world={world} data={quiz} onClose={() => setQuiz(null)} onFinish={(stars) => finishChapter(quiz.code, quiz.chIdx, stars)} />
      )}
      {mini === "constructeur" && <ConstructorGame onClose={() => setMini(null)} onFinish={(stars) => finishMini("constructeur", stars)} />}
    </>
  );
}

// Carte de parcours : le schéma des formations, en jeu (le tronc + les spécialisations).
function FormationMap({ worlds, prog, onPick }) {
  const by = { decouverte: [], niv1: [], niv1pro: [], niv2: [], expert: [], spe: [], autre: [] };
  for (const w of worlds) by[roleOf(w)].push(w);
  const card = (w, prereq) => <FCard key={w.code} w={w} prog={prog[w.code]} onPick={onPick} prereq={prereq} />;
  const hasTronc = by.decouverte.length || by.niv1.length || by.niv1pro.length || by.niv2.length || by.expert.length;

  return (
    <div className="pq-board">
      <div className="pq-ingredients" aria-hidden="true">🌾 💧 🫒 🧫 🍅 🧀 🔥 🍕</div>

      {hasTronc && <>
        <div className="pq-tier-label">Nos formations</div>
        {by.decouverte.length > 0 && <div className="pq-row">{by.decouverte.map((w) => card(w))}</div>}
        {(by.niv1.length > 0 || by.niv1pro.length > 0) && (
          <div className="pq-row" style={{ marginTop: 12 }}>{by.niv1.map((w) => card(w))}{by.niv1pro.map((w) => card(w))}</div>
        )}
        {by.niv2.length > 0 && (
          <>
            <div className="pq-connect"><Icon name="chevron-down" size={22} /><Icon name="chevron-down" size={22} /></div>
            <div className="pq-row">{by.niv2.map((w) => card(w, true))}</div>
          </>
        )}
        {by.expert.length > 0 && (
          <>
            <div className="pq-connect"><Icon name="chevron-down" size={22} /></div>
            <div className="pq-row">{by.expert.map((w) => card(w, true))}</div>
          </>
        )}
        {(by.niv2.length > 0 || by.expert.length > 0) && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <span className="pq-legend"><span className="pq-prereq" style={{ position: "static", width: 20, height: 20 }}>!</span> = prérequis (niveau précédent)</span>
          </div>
        )}
      </>}

      {by.spe.length > 0 && <>
        <div className="pq-divider" />
        <div className="pq-tier-label">Nos spécialisations</div>
        <div className="pq-row">{by.spe.map((w) => card(w))}</div>
      </>}

      {by.autre.length > 0 && <>
        <div className="pq-divider" />
        <div className="pq-tier-label">Autres</div>
        <div className="pq-row">{by.autre.map((w) => card(w))}</div>
      </>}
    </div>
  );
}

// Bandeau des mini-jeux (autres modes de jeu à côté du QCM).
function MiniGames({ onOpen }) {
  return (
    <div className="pq-minis">
      <button className="pq-mini" onClick={() => onOpen("constructeur")}>
        <span className="pq-mini-e" style={{ color: "var(--ember1)" }}><Icon name="pizza" size={24} /></span>
        <span className="pq-mini-txt"><b>Le Constructeur</b><span className="pq-mini-sub">Ordonne la recette</span></span>
      </button>
      <div className="pq-mini soon"><span className="pq-mini-e" style={{ color: "var(--dim)" }}><Icon name="clock" size={24} /></span><span className="pq-mini-txt"><b>Chrono Rush</b><span className="pq-mini-sub">Bientôt</span></span></div>
      <div className="pq-mini soon"><span className="pq-mini-e" style={{ color: "var(--dim)" }}><Icon name="shuffle" size={24} /></span><span className="pq-mini-txt"><b>Associations</b><span className="pq-mini-sub">Bientôt</span></span></div>
    </div>
  );
}

// Carte-formation (rectangle coloré façon schéma) → ouvre le monde.
function FCard({ w, prog, onPick, prereq }) {
  const done = prog ? Object.keys(prog).length : 0;
  const stars = prog ? Object.values(prog).reduce((a, s) => a + s, 0) : 0;
  const nbCh = chaptersFor(w).length;
  const ing = INGREDIENT[roleOf(w)];
  return (
    <button
      className={"pq-fcard" + (w.unlocked ? "" : " locked")}
      style={w.unlocked ? { background: w.color } : undefined}
      disabled={!w.unlocked}
      onClick={() => onPick(w.code)}
      title={w.unlocked ? w.title : "Obtiens le badge de ce niveau pour le débloquer"}
    >
      {prereq && <span className="pq-prereq" title="Prérequis">!</span>}
      <span className="pq-fcard-top">
        <span className="pq-fcard-code">{w.code}</span>
        <span className="pq-fcard-ing" aria-hidden="true">{w.unlocked ? ing : <Icon name="lock" size={16} />}</span>
      </span>
      <span className="pq-fcard-title">{w.title}</span>
      <span className="pq-fcard-meta">{w.unlocked ? `${done}/${nbCh} chapitres · ${stars} ⭐` : "Non débloqué"}</span>
    </button>
  );
}

// Vue d'un monde : chemin de chapitres façon Duolingo.
function WorldView({ world, prog, onBack, onChapter }) {
  const chapters = chaptersFor(world);
  const doneCount = Object.keys(prog).length;
  return (
    <div className="pq-map">
      <button className="btn sm ghost" onClick={onBack} style={{ marginBottom: 12 }}><Icon name="chevron-left" size={15} /> Carte des formations</button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span className="pq-world-dot" style={{ background: world.color }}>{world.code}</span>
        <b style={{ fontSize: 15 }}>{world.title}</b>
      </div>
      <div className="pq-path">
        {chapters.map((ch, i) => {
          const stars = prog[i] || 0;
          const done = i in prog;
          const locked = i > 0 && !(i - 1 in prog);
          const offset = [0, 46, 70, 46, 0, -46][i % 6];
          return (
            <div key={i} className="pq-node-wrap" style={{ transform: `translateX(${offset}px)` }}>
              <button className={"pq-node" + (done ? " done" : "") + (locked ? " locked" : "")}
                style={{ "--c": world.color }} disabled={locked}
                onClick={() => onChapter(i, ch)} title={locked ? "Termine le chapitre précédent" : ch.title}>
                <Icon name={locked ? "eye-off" : ch.ic} size={22} />
              </button>
              <div className="pq-node-label">
                <b>{ch.title}</b>
                <span className="pq-stars">{[0, 1, 2].map((s) => <span key={s} style={{ opacity: s < stars ? 1 : 0.25 }}>⭐</span>)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="hint" style={{ textAlign: "center", marginTop: 8 }}>{doneCount}/{chapters.length} chapitres terminés</p>
    </div>
  );
}

// Mélange (Fisher-Yates) sans muter l'original.
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Mini-quiz d'un chapitre : une question à la fois, formats variés (QCM / vrai-faux /
// associations), feedback immédiat, cœurs, résultat étoilé.
function QuizModal({ world, data, onClose, onFinish }) {
  const { chapter, questions } = data;
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);   // QCM : index ; Vrai/Faux : booléen
  const [matched, setMatched] = useState({});   // Associations : { gaucheIdx: true }
  const [selLeft, setSelLeft] = useState(null);  // Associations : gauche sélectionnée
  const [wrong, setWrong] = useState(null);      // Associations : droite en erreur (flash)
  const [correct, setCorrect] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [done, setDone] = useState(false);

  const q = questions[idx];
  const type = q.t || "qcm";
  // Colonne de droite mélangée (recalculée à chaque question).
  const rightCol = useMemo(() => (type === "assoc" ? shuffled(q.pairs.map((p, li) => ({ text: p[1], li }))) : []), [q, type]);
  const assocSolved = type === "assoc" && q.pairs && Object.keys(matched).length === q.pairs.length;
  const answered = type === "assoc" ? assocSolved : picked !== null;
  const total = questions.length;

  function choose(val) {
    if (answered) return;
    setPicked(val);
    if (val === q.a) setCorrect((c) => c + 1);
    else setHearts((h) => h - 1);
  }
  function tapRight(r) {
    if (selLeft === null || matched[r.li]) return;
    if (r.li === selLeft) {
      const nm = { ...matched, [selLeft]: true };
      setMatched(nm); setSelLeft(null);
      if (Object.keys(nm).length === q.pairs.length) setCorrect((c) => c + 1); // tout relié
    } else {
      setSelLeft(null); setWrong(r.li);
      setTimeout(() => setWrong(null), 400);
    }
  }
  function next() {
    if (hearts <= 0 || idx + 1 >= questions.length) { setDone(true); return; }
    setIdx((i) => i + 1); setPicked(null); setMatched({}); setSelLeft(null);
  }

  const ratio = correct / total;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.5 ? 1 : 0;
  const good = type === "assoc" ? assocSolved : picked === q.a;
  const answerLabel = type === "vf" ? (q.a ? "Vrai" : "Faux") : type === "qcm" ? q.c[q.a] : "";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pq-world-dot" style={{ background: world.color, width: 24, height: 24, fontSize: 11 }}>{world.code}</span>
            {chapter.title}
          </h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>

        {!done ? (
          <div className="mbody">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div className="pq-progress"><span style={{ width: `${(idx / total) * 100}%`, background: world.color }} /></div>
              <span style={{ whiteSpace: "nowrap", fontSize: 14 }}>{"❤️".repeat(Math.max(0, hearts))}</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 8 }}>
              <span className={"pq-tag pq-tag-" + type}>{type === "vf" ? "Vrai / Faux" : type === "assoc" ? "Associe" : "QCM"}</span>
            </p>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 14px" }}>{idx + 1}. {q.q}</p>

            {type === "qcm" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {q.c.map((choice, ci) => {
                  let cls = "pq-choice";
                  if (answered) { if (ci === q.a) cls += " ok"; else if (ci === picked) cls += " ko"; }
                  return <button key={ci} className={cls} onClick={() => choose(ci)} disabled={answered}>{choice}</button>;
                })}
              </div>
            )}

            {type === "vf" && (
              <div style={{ display: "flex", gap: 10 }}>
                {[true, false].map((val) => {
                  let cls = "pq-choice pq-vf";
                  if (answered) { if (val === q.a) cls += " ok"; else if (val === picked) cls += " ko"; }
                  return (
                    <button key={String(val)} className={cls} onClick={() => choose(val)} disabled={answered}>
                      <Icon name={val ? "check" : "x"} size={18} /> {val ? "Vrai" : "Faux"}
                    </button>
                  );
                })}
              </div>
            )}

            {type === "assoc" && (
              <>
                <div className="pq-assoc">
                  <div className="pq-assoc-col">
                    {q.pairs.map((p, li) => (
                      <button key={li} disabled={!!matched[li]}
                        className={"pq-assoc-item" + (matched[li] ? " ok" : "") + (selLeft === li ? " sel" : "")}
                        onClick={() => setSelLeft(li)}>{p[0]}</button>
                    ))}
                  </div>
                  <div className="pq-assoc-col">
                    {rightCol.map((r) => (
                      <button key={r.li} disabled={!!matched[r.li]}
                        className={"pq-assoc-item" + (matched[r.li] ? " ok" : "") + (wrong === r.li ? " ko" : "")}
                        onClick={() => tapRight(r)}>{r.text}</button>
                    ))}
                  </div>
                </div>
                {!assocSolved && <p className="hint" style={{ margin: "10px 0 0" }}>Touche un élément à gauche, puis sa correspondance à droite.</p>}
              </>
            )}

            {answered && (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontWeight: 700, color: good ? "var(--green)" : "var(--ember1)" }}>
                  {good ? "Bravo !" : `Réponse : ${answerLabel}`}
                </span>
                <button className="btn primary" onClick={next}>{idx + 1 >= total ? "Terminer" : "Suivant"} <Icon name="chevron-right" size={15} /></button>
              </div>
            )}
          </div>
        ) : (
          <div className="mbody" style={{ textAlign: "center", padding: "24px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>{stars > 0 ? "🍕" : "💪"}</div>
            <div style={{ fontSize: 26, letterSpacing: 4, marginBottom: 8 }}>{[0, 1, 2].map((s) => <span key={s} style={{ opacity: s < stars ? 1 : 0.25 }}>⭐</span>)}</div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>{correct}/{total} bonnes réponses</p>
            <p className="hint" style={{ marginTop: 0 }}>{stars >= 2 ? "Excellent, prêt pour le QCM !" : stars === 1 ? "Bien — retente pour 3 étoiles." : "Reprends le chapitre du manuel et réessaie."}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
              <button className="btn ghost" onClick={onClose}>Fermer</button>
              <button className="btn primary" onClick={() => onFinish(stars)}>Valider (+{correct * 10} XP)</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PizzaQuest;
