"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRole } from "./RoleProvider";
import { MODULES, unlockedModules, PedaModule, QuizQ, VraiFaux, Ordre, Flashcard } from "@/lib/pedago";
import { colorOf } from "./calendrier/shared";
import DoughCalculator from "./student/DoughCalculator";

interface Enr {
  id: string; crmStage: string; devisSigne: boolean; acompteRecu: boolean;
  session: { annee: number; semaine: number; dateDebut: string | null; dateFin: string | null; program: { code: string; titre: string; jours: number } };
}
interface Doc { id: string; type: string; status: string; numberPrefix?: string; enrollmentId?: string }

const DOC_LABEL: Record<string, string> = {
  PROGRAMME: "Programme", FICHE_SEMAINE: "Fiche d'expression", TEST_POSITIONNEMENT: "Test de positionnement",
  DEVIS: "Devis", CONTRAT: "Contrat / Convention", CONVENTION: "Convention de formation", CONVOCATION: "Convocation", INVITATION: "Invitation",
  DROIT_IMAGE: "Droit à l'image", CGV: "Conditions générales de vente", EMARGEMENT: "Feuille d'émargement",
  ATTESTATION_HYGIENE: "Attestation Hygiène", CERTIFICAT_REALISATION: "Certificat de réalisation",
  EVALUATION_FINANCEUR: "Évaluation à chaud / à froid", EVALUATION_MANAGEUR: "Évaluation manageur",
};

// Ordre FIXE d'affichage (2 sections) — on trie sur l'index, jamais par texte.
const INSCRIPTION = ["PROGRAMME", "FICHE_SEMAINE", "TEST_POSITIONNEMENT", "DEVIS", "CONTRAT", "CONVENTION", "DROIT_IMAGE", "CONVOCATION", "INVITATION", "CGV"];
const FIN = ["EMARGEMENT", "EVALUATION_FINANCEUR", "EVALUATION_MANAGEUR", "ATTESTATION_HYGIENE", "CERTIFICAT_REALISATION"];
// Documents accessibles même dossier incomplet (à signer pour débloquer).
const A_SIGNER_LIBRE = new Set(["DEVIS", "DROIT_IMAGE"]);
const ordered = (docs: Doc[], order: string[]) =>
  docs.filter((d) => order.includes(d.type)).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
// Décalage horizontal des nœuds du parcours (effet serpentin type Duolingo).
const WAVE = [0, 58, 86, 58, 0, -58, -86];

export default function MonEspaceClient() {
  const { profile } = useRole();
  const [enrollments, setEnrollments] = useState<Enr[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsByEnr, setDocsByEnr] = useState<Record<string, Doc[]>>({});
  const [loading, setLoading] = useState(true);
  const [openModule, setOpenModule] = useState<PedaModule | null>(null);
  const [tool, setTool] = useState<null | "pate" | "docs" | "certif" | "mercuriale">(null);

  const load = useCallback(async () => {
    setLoading(true);
    const lid = profile?.learnerId;
    let enr: Enr[] = [];
    try {
      const j = await (await fetch("/api/enrollments" + (lid ? "?learnerId=" + lid : ""))).json();
      enr = j.data ?? [];
      if (!lid && profile) enr = enr.filter((e: Enr & { learner?: { nom?: string } }) => profile.name.toLowerCase().includes((e.learner?.nom || "").toLowerCase()));
    } catch { /* */ }
    setEnrollments(enr);
    const all: Doc[] = [];
    const byEnr: Record<string, Doc[]> = {};
    for (const e of enr) {
      try {
        const j = await (await fetch("/api/documents?enrollmentId=" + e.id)).json();
        const list: Doc[] = j.data || [];
        // Dé-duplication : un seul document par type et par dossier.
        const seen = new Set<string>();
        const dedup = list.filter((d) => (seen.has(d.type) ? false : (seen.add(d.type), true)));
        byEnr[e.id] = dedup;
        dedup.forEach((d) => all.push({ ...d, enrollmentId: e.id }));
      } catch { byEnr[e.id] = []; }
    }
    setDocsByEnr(byEnr);
    setDocs(all);
    setLoading(false);
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  const doneCodes = useMemo(() => enrollments.map((e) => e.session.program.code), [enrollments]);
  const unlocked = useMemo(() => unlockedModules(doneCodes), [doneCodes]);
  const progress = Math.round((unlocked.size / MODULES.length) * 100);
  const prenom = profile?.name.split(" ")[0] ?? "";
  const certif = docs.find((d) => d.type === "CERTIFICAT_REALISATION");
  const currentFormation = enrollments[0]?.session.program.titre;
  // Fin de formation : les documents finaux sont délivrés une fois la formation terminée.
  const formationTerminee = enrollments.some((e) => ["TERMINE", "EVALUATION_ENVOYEE", "ARCHIVE"].includes(e.crmStage))
    || certif?.status === "SIGNE" || certif?.status === "ARCHIVE";

  return (
    <div className="font-sans">
      {/* Hero gamifié */}
      <div className="relative overflow-hidden rounded-3xl p-7 text-white bg-[linear-gradient(135deg,var(--navy),var(--navy-dark))] shadow-xl">
        <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full blur-3xl bg-[radial-gradient(circle,rgba(220,62,55,.4),transparent_70%)]" />
        <div className="relative flex items-center gap-5 flex-wrap">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-white/10 text-4xl animate-[pop_.4s_ease]">🧑‍🍳</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/70">Espace stagiaire</div>
            <h1 className="font-display text-3xl font-extrabold mt-1">Bonjour, {prenom} 👋</h1>
            <p className="text-white/80 text-sm mt-1">{currentFormation ? `Formation : ${currentFormation}` : "Votre parcours pizzaïolo"}</p>
          </div>
          <div className="text-center">
            <div className="relative grid h-20 w-20 place-items-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="7" /><circle cx="40" cy="40" r="34" fill="none" stroke="var(--ember1)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`} style={{ transition: "stroke-dashoffset .8s ease" }} /></svg>
              <span className="font-display text-xl font-extrabold">{progress}%</span>
            </div>
            <div className="text-[11px] text-white/70 mt-1">Parcours</div>
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2 mt-4">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">🔓 {unlocked.size} module(s) débloqué(s)</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">📄 {docs.length} document(s)</span>
          {certif && <span className="rounded-full bg-[color-mix(in_srgb,var(--green)_70%,white)] text-navy px-3 py-1 text-xs font-bold">🏅 Certificat</span>}
        </div>
      </div>

      {/* Tuiles outils */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <Tile icon="📄" title="Mes documents" sub={`${docs.length} fichier(s)`} onClick={() => setTool("docs")} />
        <Tile icon="🏅" title="Mon certificat" sub={certif ? "Disponible" : "En cours"} onClick={() => setTool("certif")} />
        <Tile icon="🧮" title="Calcul de pâte" sub="Empâtement" onClick={() => setTool("pate")} />
        <Tile icon="🛒" title="Mercuriale" sub="Coût matière" onClick={() => setTool("mercuriale")} />
      </div>

      {/* Fin de formation — documents délivrés (avec préparation « loading ») */}
      <div className="mt-5 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-base font-bold text-navy">Ma fin de formation</h3>
          <span className={`text-xs font-semibold ${formationTerminee ? "text-[color:var(--green)]" : "text-muted"}`}>{formationTerminee ? "Formation terminée" : "Formation en cours"}</span>
        </div>
        <p className="text-xs text-muted mb-4">Ces documents sont délivrés automatiquement à la fin de votre formation (le certificat en cas d&apos;obtention).</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Deliverable icon="🏅" label="Certificat de réalisation" ready={formationTerminee && !!certif} href={certif ? `/api/documents/${certif.id}/download` : undefined} />
          <Deliverable icon="📜" label="Attestation de fin de stage" ready={formationTerminee} />
          <Deliverable icon="🧾" label="Facture" ready={formationTerminee} />
        </div>
      </div>

      {/* Parcours d'apprentissage */}
      <div className="mt-8">
        <h2 className="font-display text-xl font-bold text-navy text-center">Mon parcours pizzaïolo</h2>
        <p className="text-center text-sm text-muted mt-1 mb-6">Débloquez les modules selon les formations suivies. Cliquez pour vous entraîner.</p>
        {loading ? <div className="text-center text-muted text-sm">Chargement…</div> : (
          <div className="relative mx-auto max-w-md">
            <div className="absolute left-1/2 top-6 bottom-6 w-0.5 -translate-x-1/2 bg-line" />
            <div className="relative flex flex-col items-center gap-6">
              {MODULES.map((m, i) => {
                const isUnlocked = unlocked.has(m.code);
                const color = colorOf(m.code);
                return (
                  <button key={m.code} disabled={!isUnlocked} onClick={() => setOpenModule(m)}
                    style={{ transform: `translateX(${WAVE[i % WAVE.length]}px)` }}
                    className={`relative flex flex-col items-center transition ${isUnlocked ? "hover:-translate-y-1 cursor-pointer" : "cursor-not-allowed"}`}>
                    <span className="grid h-[68px] w-[68px] place-items-center rounded-full text-3xl shadow-lg ring-4 ring-[var(--bg)]"
                      style={{ background: isUnlocked ? color : "var(--surface3)", filter: isUnlocked ? "none" : "grayscale(1)", opacity: isUnlocked ? 1 : 0.6 }}>
                      {isUnlocked ? m.icon : "🔒"}
                    </span>
                    <span className={`mt-2 text-xs font-bold text-center max-w-[130px] ${isUnlocked ? "text-ink" : "text-dim"}`}>{m.label}</span>
                    {isUnlocked && <span className="text-[10px] text-muted">{m.short}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {openModule && <ModuleModal module={openModule} onClose={() => setOpenModule(null)} />}
      {tool && <ToolModal tool={tool} docs={docs} certif={certif} enrollments={enrollments} docsByEnr={docsByEnr} learnerId={profile?.learnerId} onRefresh={load} onClose={() => setTool(null)} />}
    </div>
  );
}

function Tile({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:border-navy">
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 text-sm font-bold text-navy">{title}</div>
      <div className="text-xs text-muted">{sub}</div>
    </button>
  );
}

function Deliverable({ icon, label, ready, href }: { icon: string; label: string; ready: boolean; href?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3.5 flex flex-col items-center text-center gap-1.5">
      <span className="text-2xl">{icon}</span>
      <span className="text-[13px] font-semibold text-ink leading-tight">{label}</span>
      {ready ? (
        href ? (
          <a href={href} className="mt-1 rounded-lg bg-[var(--green-bg)] text-[color:var(--green)] px-3 py-1.5 text-xs font-bold hover:brightness-95 transition">✓ Télécharger</a>
        ) : (
          <span className="mt-1 rounded-lg bg-[var(--green-bg)] text-[color:var(--green)] px-3 py-1.5 text-xs font-bold">✓ Disponible</span>
        )
      ) : (
        <span className="mt-1 flex items-center gap-2 text-xs text-muted">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-line border-t-navy animate-spin" />
          En préparation
        </span>
      )}
    </div>
  );
}

function Modal({ title, wide, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-start justify-center overflow-y-auto bg-[rgba(8,10,24,.55)] backdrop-blur-sm p-4 sm:p-8" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-3xl border border-line bg-surface shadow-2xl animate-[pop_.24s_ease]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="font-display text-lg font-bold text-navy">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const ACTS = [
  { k: "cours", label: "📚 Cours" }, { k: "quiz", label: "❓ Quiz" }, { k: "vf", label: "⚖️ Vrai / Faux" },
  { k: "ordre", label: "🔢 Dans l'ordre" }, { k: "cartes", label: "🃏 Flashcards" },
] as const;

function ModuleModal({ module, onClose }: { module: PedaModule; onClose: () => void }) {
  const [act, setAct] = useState<(typeof ACTS)[number]["k"]>("cours");
  return (
    <Modal title={`${module.icon} ${module.label}`} wide onClose={onClose}>
      <div className="text-[13px] text-muted mb-3">📘 {module.manuel}</div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {ACTS.map((a) => (
          <button key={a.k} onClick={() => setAct(a.k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${act === a.k ? "bg-navy text-white" : "bg-surface-2 text-muted hover:text-ink"}`}>{a.label}</button>
        ))}
      </div>
      {act === "cours" && (
        <div>
          <div className="text-sm font-bold text-navy mb-2">Ce que vous apprenez</div>
          <ul className="space-y-1.5">{module.topics.map((t) => <li key={t} className="flex items-start gap-2 text-sm text-ink"><span className="text-ember">✓</span>{t}</li>)}</ul>
          <p className="text-xs text-dim mt-4">Choisissez une activité ci-dessus pour vous entraîner 🎯</p>
        </div>
      )}
      {act === "quiz" && <QuizGame quiz={module.quiz} />}
      {act === "vf" && <VraiFauxGame items={module.vraiFaux} />}
      {act === "ordre" && <OrdreGame ordre={module.ordre} />}
      {act === "cartes" && <FlashcardsGame cards={module.flashcards} />}
    </Modal>
  );
}

function ScoreBanner({ score, total, onReset }: { score: number; total: number; onReset: () => void }) {
  const perfect = score === total;
  return (
    <div className="mt-4 text-center animate-[pop_.3s_ease]">
      <div className="text-4xl">{perfect ? "🎉" : score >= total / 2 ? "👍" : "💪"}</div>
      <div className="font-display text-2xl font-extrabold text-navy">{perfect ? "Parfait !" : `${score} / ${total}`}</div>
      <button onClick={onReset} className="mt-1 text-sm text-ember font-semibold hover:underline">Recommencer</button>
    </div>
  );
}

function QuizGame({ quiz }: { quiz: QuizQ[] }) {
  const [ans, setAns] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const score = quiz.filter((q, i) => ans[i] === q.answer).length;
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <div className="space-y-4">
        {quiz.map((q, i) => (
          <div key={i}>
            <div className="text-[13.5px] font-semibold text-ink mb-2">{i + 1}. {q.q}</div>
            <div className="space-y-1.5">
              {q.options.map((o, oi) => {
                const sel = ans[i] === oi, ok = checked && oi === q.answer, ko = checked && sel && oi !== q.answer;
                return <button key={oi} disabled={checked} onClick={() => setAns((a) => ({ ...a, [i]: oi }))}
                  className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition ${ok ? "border-[var(--green)] bg-[var(--green-bg)]" : ko ? "border-ember bg-[var(--rosso-bg)]" : sel ? "border-navy bg-surface" : "border-line bg-surface hover:border-navy"} text-ink`}>
                  {ok && "✅ "}{ko && "❌ "}{o}</button>;
              })}
            </div>
          </div>
        ))}
      </div>
      {!checked ? <button onClick={() => setChecked(true)} disabled={Object.keys(ans).length < quiz.length}
        className="mt-4 w-full rounded-xl px-4 py-2.5 font-bold text-white shadow-lg transition hover:brightness-105 disabled:opacity-50" style={{ background: "linear-gradient(135deg,var(--ember1),var(--ember2))" }}>Valider</button>
        : <ScoreBanner score={score} total={quiz.length} onReset={() => { setChecked(false); setAns({}); }} />}
    </div>
  );
}

function VraiFauxGame({ items }: { items: VraiFaux[] }) {
  const [ans, setAns] = useState<Record<number, boolean>>({});
  const [checked, setChecked] = useState(false);
  const score = items.filter((it, i) => ans[i] === it.v).length;
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4 space-y-3">
      {items.map((it, i) => {
        const sel = ans[i];
        return (
          <div key={i} className="rounded-xl bg-surface border border-line p-3">
            <div className="text-[13.5px] text-ink mb-2">{it.s}</div>
            <div className="flex gap-2">
              {[true, false].map((v) => {
                const isSel = sel === v, ok = checked && v === it.v && isSel, ko = checked && isSel && v !== it.v;
                return <button key={String(v)} disabled={checked} onClick={() => setAns((a) => ({ ...a, [i]: v }))}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${ok ? "border-[var(--green)] bg-[var(--green-bg)] text-ink" : ko ? "border-ember bg-[var(--rosso-bg)] text-ink" : isSel ? "border-navy bg-surface text-navy" : "border-line text-muted hover:border-navy"}`}>
                  {v ? "✔ Vrai" : "✘ Faux"}</button>;
              })}
            </div>
          </div>
        );
      })}
      {!checked ? <button onClick={() => setChecked(true)} disabled={Object.keys(ans).length < items.length}
        className="w-full rounded-xl px-4 py-2.5 font-bold text-white shadow-lg transition hover:brightness-105 disabled:opacity-50" style={{ background: "linear-gradient(135deg,var(--ember1),var(--ember2))" }}>Valider</button>
        : <ScoreBanner score={score} total={items.length} onReset={() => { setChecked(false); setAns({}); }} />}
    </div>
  );
}

function OrdreGame({ ordre }: { ordre: Ordre }) {
  const shuffled = useMemo(() => ordre.etapes.map((e, i) => ({ e, i })).sort(() => Math.random() - 0.5), [ordre]);
  const [seq, setSeq] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const remaining = shuffled.filter((s) => !seq.includes(s.i));
  const score = seq.filter((orig, pos) => orig === pos).length;
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <div className="text-sm font-bold text-navy mb-3">{ordre.titre}</div>
      <div className="space-y-2 mb-3">
        {seq.map((orig, pos) => {
          const ok = checked && orig === pos, ko = checked && orig !== pos;
          return (
            <div key={orig} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ok ? "border-[var(--green)] bg-[var(--green-bg)]" : ko ? "border-ember bg-[var(--rosso-bg)]" : "border-navy bg-surface"} text-ink`}>
              <span className="font-mono font-bold text-navy">{pos + 1}</span>{ok && "✅"}{ko && "❌"}<span className="flex-1">{ordre.etapes[orig]}</span>
              {!checked && <button onClick={() => setSeq((s) => s.filter((x) => x !== orig))} className="text-dim hover:text-ember">↩</button>}
            </div>
          );
        })}
      </div>
      {!checked && remaining.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {remaining.map((s) => <button key={s.i} onClick={() => setSeq((q) => [...q, s.i])} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:border-navy transition">{s.e}</button>)}
        </div>
      )}
      {seq.length === ordre.etapes.length && !checked && (
        <button onClick={() => setChecked(true)} className="mt-3 w-full rounded-xl px-4 py-2.5 font-bold text-white shadow-lg transition hover:brightness-105" style={{ background: "linear-gradient(135deg,var(--ember1),var(--ember2))" }}>Vérifier l'ordre</button>
      )}
      {checked && <ScoreBanner score={score} total={ordre.etapes.length} onReset={() => { setSeq([]); setChecked(false); }} />}
    </div>
  );
}

function FlashcardsGame({ cards }: { cards: Flashcard[] }) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const c = cards[i];
  const go = (d: number) => { setFlip(false); setI((v) => (v + d + cards.length) % cards.length); };
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4 text-center">
      <button onClick={() => setFlip((f) => !f)}
        className="mx-auto grid min-h-[140px] w-full max-w-sm place-items-center rounded-2xl border-2 border-line bg-surface p-6 shadow-sm transition hover:border-navy">
        {!flip ? <span className="font-display text-xl font-bold text-navy">{c.terme}</span>
          : <span className="text-sm text-ink">{c.def}</span>}
      </button>
      <div className="text-[11px] text-dim mt-2">{flip ? "Définition" : "Cliquez pour retourner"} · {i + 1}/{cards.length}</div>
      <div className="flex justify-center gap-3 mt-3">
        <button onClick={() => go(-1)} className="rounded-lg border border-line px-4 py-1.5 text-sm text-ink hover:border-navy">← Précédent</button>
        <button onClick={() => go(1)} className="rounded-lg border border-line px-4 py-1.5 text-sm text-ink hover:border-navy">Suivant →</button>
      </div>
    </div>
  );
}

function ToolModal({ tool, docs, certif, enrollments, docsByEnr, learnerId, onRefresh, onClose }: { tool: string; docs: Doc[]; certif?: Doc; enrollments: Enr[]; docsByEnr: Record<string, Doc[]>; learnerId?: string; onRefresh: () => void; onClose: () => void }) {
  void docs;
  if (tool === "pate") return <Modal title="🧮 Calcul de recette — empâtement" wide onClose={onClose}><DoughCalculator /></Modal>;
  if (tool === "certif") return (
    <Modal title="🏅 Mon certificat" onClose={onClose}>
      {certif ? (
        <div className="text-center py-4">
          <div className="text-5xl mb-3">🏅</div>
          <p className="text-sm text-muted mb-4">Votre certificat de réalisation est disponible.</p>
          <a href={`/api/documents/${certif.id}/download`} className="inline-block rounded-xl px-5 py-3 font-bold text-white shadow-lg" style={{ background: "linear-gradient(135deg,var(--ember1),var(--ember2))" }}>⬇ Télécharger mon certificat</a>
        </div>
      ) : <div className="text-center py-6 text-muted">🎓 Votre certificat sera disponible à la fin de votre formation.</div>}
    </Modal>
  );
  if (tool === "mercuriale") return (
    <Modal title="🛒 Mercuriale & coût matière" onClose={onClose}>
      <div className="text-center py-6 text-muted">📦 Le catalogue des produits et le calcul du coût matière des recettes arrivent très bientôt dans votre espace.</div>
    </Modal>
  );
  // docs → dossiers par formation
  return (
    <Modal title="Mes documents" wide onClose={onClose}>
      <MesDocuments enrollments={enrollments} docsByEnr={docsByEnr} learnerId={learnerId} onRefresh={onRefresh} />
    </Modal>
  );
}

// ---- Espace étudiant : documents groupés par formation, ordre fixe, verrouillage ----
const frDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const dateRange = (se: Enr["session"]) => (se.dateDebut ? `${frDate(se.dateDebut)} → ${frDate(se.dateFin)}` : `Sem. ${se.semaine}/${se.annee}`);

function MesDocuments({ enrollments, docsByEnr, learnerId, onRefresh }: { enrollments: Enr[]; docsByEnr: Record<string, Doc[]>; learnerId?: string; onRefresh: () => void }) {
  const [open, setOpen] = useState<string | null>(enrollments[0]?.id ?? null);

  const sign = async (docId: string) => {
    const r = await fetch("/api/signatures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.data?.token) window.open(`/signer/${j.data.token}`, "_blank");
  };

  if (enrollments.length === 0) return <div className="text-center py-6 text-muted">Aucune formation pour le moment.</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onRefresh} className="text-xs font-semibold text-ember hover:underline">↻ Rafraîchir</button>
      </div>
      {enrollments.map((e) => {
        const docs = docsByEnr[e.id] ?? [];
        const dossierComplet = e.devisSigne && e.acompteRecu;
        const isOpen = open === e.id;
        const devis = docs.find((d) => d.type === "DEVIS");
        const insc = ordered(docs, INSCRIPTION);
        // Certificat : uniquement s'il est obtenu (signé / archivé).
        const fin = ordered(docs, FIN).filter((d) => d.type !== "CERTIFICAT_REALISATION" || d.status === "SIGNE" || d.status === "ARCHIVE");
        return (
          <div key={e.id} className="rounded-2xl border border-line bg-surface overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : e.id)} className="w-full flex items-center gap-3 p-4 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white text-[11px] font-bold" style={{ background: colorOf(e.session.program.code) }}>{e.session.program.code}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink text-sm truncate">{e.session.program.titre}</div>
                <div className="text-xs text-muted">{dateRange(e.session)}</div>
              </div>
              <span className={`badge ${dossierComplet ? "g" : "a"}`}>{dossierComplet ? "Dossier complet" : "À compléter"}</span>
              <span className="text-dim">{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className="px-4 pb-4">
                {!dossierComplet && <LockNotice e={e} devis={devis} onSign={sign} />}
                <DocSection title="Inscription" docs={insc} complet={dossierComplet} learnerId={learnerId} onSign={sign} />
                {fin.length > 0 && <DocSection title="Fin de formation" docs={fin} complet={dossierComplet} learnerId={learnerId} onSign={sign} />}
                {insc.length === 0 && fin.length === 0 && <div className="text-sm text-muted py-3">Aucun document généré pour ce dossier.</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LockNotice({ e, devis, onSign }: { e: Enr; devis?: Doc; onSign: (id: string) => void }) {
  const devisSigne = e.devisSigne || devis?.status === "SIGNE";
  return (
    <div className="rounded-xl border border-[var(--amber-bg)] bg-[var(--amber-bg)] p-3.5 my-3">
      {!devisSigne ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] text-ink font-medium flex-1">🔒 Signez votre devis pour accéder à vos documents.</span>
          {devis && <button onClick={() => onSign(devis.id)} className="rounded-lg px-3.5 py-2 text-xs font-bold text-white shadow" style={{ background: "linear-gradient(135deg,var(--ember1),var(--ember2))" }}>Signer mon devis</button>}
        </div>
      ) : (
        <span className="text-[13px] text-ink font-medium">⏳ Devis signé — en attente de validation de l&apos;acompte par le secrétariat.</span>
      )}
    </div>
  );
}

function DocSection({ title, docs, complet, learnerId, onSign }: { title: string; docs: Doc[]; complet: boolean; learnerId?: string; onSign: (id: string) => void }) {
  if (docs.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-dim mb-1.5">{title}</div>
      <div className="divide-y divide-[var(--border-soft)]">
        {docs.map((d) => <DocRow key={d.id} d={d} complet={complet} learnerId={learnerId} onSign={onSign} />)}
      </div>
    </div>
  );
}

function DocRow({ d, complet, learnerId, onSign }: { d: Doc; complet: boolean; learnerId?: string; onSign: (id: string) => void }) {
  const lp = learnerId ? `learnerId=${learnerId}` : "";
  const isDevis = d.type === "DEVIS";
  const isDroit = d.type === "DROIT_IMAGE";
  const signed = d.status === "SIGNE";
  const locked = !complet && !A_SIGNER_LIBRE.has(d.type);

  let badge: [string, string]; // [classe, libellé]
  if (isDevis && !signed) badge = ["r", "À signer"];
  else if (signed) badge = ["g", "Signé"];
  else if (locked) badge = ["n", "Verrouillé"];
  else badge = ["b", "Disponible"];

  return (
    <div className="flex items-center gap-3 py-2.5" style={{ opacity: locked ? 0.55 : 1 }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm">{locked ? "🔒" : "📄"}</span>
      <span className="flex-1 text-sm font-semibold text-ink">{DOC_LABEL[d.type] ?? d.type}</span>
      <span className={`badge ${badge[0]}`}>{badge[1]}</span>
      {/* Actions */}
      {isDevis && !signed ? (
        <button onClick={() => onSign(d.id)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow" style={{ background: "linear-gradient(135deg,var(--ember1),var(--ember2))" }}>Signer</button>
      ) : isDevis && signed ? (
        <a href={`/api/documents/${d.id}/download?signed=1&inline=1&${lp}`} target="_blank" rel="noopener" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-navy transition">PDF signé</a>
      ) : locked ? (
        <span className="text-[11px] text-dim">Indisponible</span>
      ) : (
        <>
          {isDroit && !signed && <button onClick={() => onSign(d.id)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:border-navy transition">Signer</button>}
          <a href={`/api/documents/${d.id}/download?format=pdf&inline=1&${lp}`} target="_blank" rel="noopener" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-navy transition">Télécharger</a>
        </>
      )}
    </div>
  );
}
