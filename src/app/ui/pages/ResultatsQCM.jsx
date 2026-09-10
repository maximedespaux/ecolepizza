import { useContext, useEffect, useRef, useState } from "react";
import { getQcmResultats, getQcmResultatDetail, deleteQcmResponse, getPreuveReponse } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import { dateHeure } from "../lib/format.js";
import { colorForLevel } from "../lib/levels.js";

// Couleur d'un pourcentage de réussite : vert / ambre / rouge.
const pctTone = (p) => (p == null ? "n" : p >= 75 ? "g" : p >= 50 ? "a" : "r");

// Export CSV, format « Excel FR » : POINT-VIRGULE (la virgule y est un séparateur décimal) et BOM
// (sans lui, « Ã© » à la place des accents). Même choix que ExportPartenaire — un CSV illisible
// serait recopié à la main, ce que cet écran veut justement éviter.
function cellCsv(v) {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function telechargerCsv(nom, entetes, lignes) {
  const csv = "﻿" + [entetes, ...lignes].map((r) => r.map(cellCsv).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nom; a.click();
  URL.revokeObjectURL(url);
}

// Grand chiffre encadré (réponses, score moyen, réussite).
function Stat({ label, value, tone }) {
  const col = tone === "g" ? "var(--green,#2e9e5b)" : tone === "r" ? "var(--ember1,#c0392b)" : tone === "a" ? "var(--amber,#b8860b)" : "var(--text)";
  return (
    <div style={{ border: "1px solid var(--border-soft)", borderRadius: 10, padding: "8px 14px", minWidth: 110 }}>
      <div className="hint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: col }}>{value}</div>
    </div>
  );
}

// Répartition d'UNE question : options (QCU/QCM), échelle, ou grille (v1 : compte seul).
function DetailQuestion({ q, num }) {
  if (q.scale) {
    const maxN = Math.max(1, ...Object.values(q.scale.dist));
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <b>{num}. {q.text}</b>
          <span className="hint" style={{ flex: "none" }}>{q.responses} rép.{q.scale.avg != null ? ` · moyenne ${q.scale.avg}/${q.scale.max}` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 8 }}>
          {Object.entries(q.scale.dist).map(([v, n]) => (
            <div key={v} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 48, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", height: `${(n / maxN) * 100}%`, minHeight: n ? 3 : 0,
                  background: "linear-gradient(180deg,#e0932e,#c0392b)", borderRadius: "4px 4px 0 0" }} />
              </div>
              <div className="hint" style={{ fontSize: 11 }}>{v}<br />{n}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (q.grille) {
    return <div><b>{num}. {q.text}</b> <span className="hint">· grille · {q.responses} réponse(s) (détail par cellule à venir)</span></div>;
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <b>{num}. {q.text}</b>
        <span className="hint" style={{ flex: "none" }}>{q.responses} rép.{q.correct_pct != null ? ` · ${q.correct_pct}% de bonnes réponses` : ""}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {q.options.map((o, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: "0 0 40%", minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
              {o.is_correct && <span title="Bonne réponse" style={{ color: "var(--green,#2e9e5b)", flex: "none" }}><Icon name="check" size={14} /></span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: o.is_correct ? 600 : 400 }}>{o.text}</span>
            </span>
            <span style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--border-soft)", overflow: "hidden", minWidth: 50 }}>
              <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(100, o.pct))}%`,
                background: o.is_correct ? "var(--green,#2e9e5b)" : "linear-gradient(90deg,#c0392b,#e0932e)" }} />
            </span>
            <span className="hint" style={{ flex: "0 0 62px", textAlign: "right", fontSize: 12 }}>{o.pct}% ({o.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Par stagiaire : une ligne par réponse (score + réussi/échoué pour un QCM noté, date). Une reprise
// apparaît comme une ligne de plus, avec sa date — on voit qui a repassé et progressé.
function StagiairesTable({ learners, quiz, isAdmin, onDelete, onPreuve }) {
  const note = quiz.kind === "GRADED";
  if (!learners.length) return <p className="hint" style={{ margin: 0 }}>Aucune réponse.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {learners.map((l, i) => {
        const reussi = note && l.pct != null && quiz.pass_score != null ? l.pct >= quiz.pass_score : null;
        return (
          <div key={l.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", border: "1px solid var(--border-soft)", borderRadius: 8 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
            {note && <span style={{ flex: "none", minWidth: 50, textAlign: "right", fontWeight: 600 }}>{l.pct != null ? `${l.pct}%` : "—"}</span>}
            {reussi != null && <Badge tone={reussi ? "g" : "r"}>{reussi ? "Réussi" : "Échoué"}</Badge>}
            <span className="hint" style={{ flex: "none", fontSize: 12 }}>{dateHeure(l.completed_at)}</span>
            {/* PREUVE : le questionnaire tel qu'il était le jour de la réponse. Le bouton n'apparaît
                que s'il y en a une — une réponse antérieure à la migration 144 n'en a pas, et ouvrir
                sur du vide laisserait croire que le stagiaire n'avait rien répondu. */}
            {l.a_preuve ? (
              <button type="button" className="icon-btn" title="Voir la preuve : le questionnaire tel qu'il était"
                aria-label={`Voir la preuve de ${l.name}`}
                onClick={() => onPreuve(l.id)} style={{ flex: "none" }}><Icon name="eye" size={14} /></button>
            ) : (
              <span className="hint" style={{ flex: "none", fontSize: 11 }} title="Réponse antérieure à l'enregistrement des preuves">—</span>
            )}
            {isAdmin && l.id && (
              <button type="button" className="icon-btn" title="Supprimer cette réponse" aria-label="Supprimer cette réponse"
                onClick={() => onDelete(l.id)} style={{ flex: "none" }}><Icon name="x" size={14} /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Une ligne QCM de la liste (sélectionnable, ouvre le détail).
 *
 * COMPACTE PARCE QUE LA COLONNE FAIT 380 px. La version large empilait cinq blocs sur une ligne —
 * titre, badge « Noté », 86 px de moyenne, 104 px de réussite, chevron. Mesuré dans la colonne :
 * les largeurs fixes prenaient 254 px, le titre était écrasé à DIX pixels et se pliait lettre par
 * lettre — chaque rangée montait à 177 px de haut pour dix-neuf QCM. Illisible et interminable.
 *
 * Deux lignes de texte à la place : l'intitulé, puis les chiffres en petit. Rien n'est perdu — la
 * moyenne et le nombre de réponses descendent d'un cran, et le TAUX DE RÉUSSITE garde sa pastille
 * colorée, seule information qui se lit sans être lue. Le reste du détail est de toute façon à
 * côté, dans l'autre colonne : cette liste sert à CHOISIR, pas à analyser.
 *
 * `minWidth: 0` sur le bloc de texte : sans lui, un élément flex refuse de descendre sous la
 * largeur de son contenu et l'ellipse ne se déclenche jamais (même piège que le fil d'Ariane de
 * la barre supérieure).
 */
function QcmRow({ q, on, onClick }) {
  const note = q.kind === "GRADED";
  const coupe = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <button type="button" onClick={onClick} title={q.title}
      style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "7px 9px", borderRadius: 9, cursor: "pointer", color: "var(--text)",
        background: on ? "var(--surface2)" : "transparent", border: on ? "1px solid var(--ember1,#c0392b)" : "1px solid var(--border-soft)", opacity: q.active ? 1 : 0.55 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 13, ...coupe }}>
          {q.title}{!q.active && <span className="hint"> · inactif</span>}
        </span>
        <span className="hint" style={{ display: "block", fontSize: 11.5, ...coupe }}>
          {!note && "Enquête · "}
          {q.responses} rép.
          {note && q.responses > 0 && ` · ${q.avg_pct ?? "—"} % moy.`}
        </span>
      </span>
      {/* La pastille de réussite reste : c'est la seule donnée qu'on lit à la couleur, sans lire. */}
      {note && q.pass_rate != null && <Badge tone={pctTone(q.pass_rate)}>{q.pass_rate} %</Badge>}
      <Icon name="chevron-right" size={14} style={{ flex: "none" }} />
    </button>
  );
}

// Regroupe les QCM par FORMATION (program_id) ; « Autre » pour ceux qui n'en ont pas.
function grouperParFormation(rows) {
  const parCle = new Map();
  for (const q of rows) {
    const cle = q.program_id || "_autre";
    if (!parCle.has(cle)) {
      parCle.set(cle, {
        cle,
        autre: !q.program_id,
        /* Le CODE reste séparé de l'intitulé : fondus dans une seule chaîne, on ne pouvait plus
           en faire une pastille. La couleur vient de la ligne (choix de l'organisme) et retombe
           sur la palette commune sinon — même ordre de priorité que `setBadgeColors` ailleurs. */
        code: q.program_id ? (q.program_code || "") : "",
        titre: q.program_id ? (q.program_title || "") : "Autre — sans formation",
        couleur: q.program_color || null,
        items: [],
      });
    }
    parCle.get(cle).items.push(q);
  }
  // « Autre » toujours en dernier (le serveur trie déjà program_id NULL en fin, on s'en assure).
  return [...parCle.values()].sort((a, b) => (a.autre ? 1 : 0) - (b.autre ? 1 : 0));
}

/**
 * Résultats QCM (Qualité & conformité) : ce que les stagiaires répondent aux QCM de « Modèles de
 * QCM » (sans rapport avec le Pizza Quest). Vue d'ensemble par QCM (groupée par formation), puis
 * par question / par stagiaire.
 */
function ResultatsQCM() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState(null);
  const [sel, setSel] = useState(null);        // id du QCM ouvert
  const [detail, setDetail] = useState(null);
  const [preuve, setPreuve] = useState(null); // { name, completed_at, preuve|null, raison? }

  /* La preuve se charge À LA DEMANDE : quelques kilo-octets par réponse, pour un écran qu'on
     ouvre d'abord pour lire des pourcentages. La liste dit seulement qu'elle existe. */
  async function ouvrirPreuve(id) {
    setPreuve({ chargement: true });
    try { setPreuve((await getPreuveReponse(id)).data); }
    catch (e) { setPreuve(null); setStatus({ type: "error", message: e.message }); }
  }
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [vue, setVue] = useState("questions"); // "questions" | "stagiaires"
  const [filtres, setFiltres] = useState({ sessions: [], years: [] }); // options disponibles
  const [selSession, setSelSession] = useState("");
  const [selYear, setSelYear] = useState("");
  const { user } = useContext(UserContext);
  const isAdmin = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"].includes(user?.role); // l'auditeur ne supprime pas

  // Recharge la vue d'ensemble à chaque changement de filtre ; un détail ouvert suit le filtre.
  useEffect(() => {
    getQcmResultats(selSession || null, selYear || null)
      .then((r) => { setRows(r.data || []); if (r.filtres) setFiltres(r.filtres); })
      .catch((e) => setStatus({ type: "error", message: e.message }));
    if (sel) getQcmResultatDetail(sel, selSession || null, selYear || null).then((r) => setDetail(r.data)).catch(() => {});
  }, [selSession, selYear]);

  /* Sous 940 px les deux colonnes s'empilent : le détail repasse SOUS la liste, hors du
     champ de vision. On l'y ramène — sans quoi le clic ne montrerait toujours rien, ce qui
     est le défaut qu'on corrige. Au-dessus de ce palier la grille suffit, et déplacer la
     page serait au mieux inutile, au pire désorientant. */
  const detailRef = useRef(null);
  function ouvrir(id) {
    if (id === sel) { setSel(null); setDetail(null); return; } // re-clic = replier
    setSel(id); setDetail(null); setVue("questions"); setLoadingDetail(true);
    getQcmResultatDetail(id, selSession || null, selYear || null)
      .then((r) => {
        setDetail(r.data);
        if (window.matchMedia("(max-width: 1220px)").matches) {
          requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }
      })
      .catch((e) => setStatus({ type: "error", message: e.message }))
      .finally(() => setLoadingDetail(false));
  }

  async function supprimerReponse(id) {
    if (!window.confirm("Supprimer cette réponse ? Les statistiques seront recalculées.")) return;
    try {
      await deleteQcmResponse(id);
      // Le compteur du QCM change aussi : on recharge la vue d'ensemble ET le détail ouvert.
      const [ov, det] = await Promise.all([getQcmResultats(selSession || null, selYear || null), getQcmResultatDetail(sel, selSession || null, selYear || null)]);
      setRows(ov.data || []);
      setDetail(det.data);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  // Suffixe de nom de fichier reflétant le filtre courant (session lisible + année).
  function suffixeFiltre() {
    const s = selSession ? filtres.sessions.find((x) => x.id === selSession) : null;
    const parts = [];
    if (s) parts.push([s.code, s.start_date].filter(Boolean).join("-"));
    if (selYear) parts.push(selYear);
    return parts.length ? "-" + parts.join("-").replace(/[^\w-]+/g, "-") : "";
  }
  function exporterVue() {
    if (!rows || !rows.length) return;
    const entetes = ["Formation", "QCM", "Type", "Réponses", "Score moyen %", "Taux de réussite %"];
    const lignes = rows.map((q) => [
      q.program_id ? [q.program_code, q.program_title].filter(Boolean).join(" · ") : "Autre",
      q.title, q.kind === "GRADED" ? "Noté" : "Enquête", q.responses, q.avg_pct ?? "", q.pass_rate ?? "",
    ]);
    telechargerCsv(`resultats-qcm${suffixeFiltre()}.csv`, entetes, lignes);
  }
  function exporterStagiaires() {
    if (!detail || !detail.learners.length) return;
    const note = detail.quiz.kind === "GRADED";
    const entetes = note ? ["Stagiaire", "Score %", "Résultat", "Date"] : ["Stagiaire", "Date"];
    const lignes = detail.learners.map((l) => {
      const reussi = note && l.pct != null && detail.quiz.pass_score != null ? (l.pct >= detail.quiz.pass_score ? "Réussi" : "Échoué") : "";
      return note ? [l.name, l.pct ?? "", reussi, dateHeure(l.completed_at)] : [l.name, dateHeure(l.completed_at)];
    });
    const base = (detail.quiz.title || "qcm").replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 40);
    telechargerCsv(`${base}${suffixeFiltre()}.csv`, entetes, lignes);
  }

  return (
    <>
      <PageHead eyebrow="Qualité & conformité" title="Résultats QCM"
        lead="Ce que les stagiaires répondent aux QCM — moyenne, réussite, et le détail par question pour repérer ce qui coince." />
      <StatusMessage status={status} />

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "0 0 14px" }}>
          {filtres.sessions.length > 0 && (
            <select className="inp" value={selSession} onChange={(e) => setSelSession(e.target.value)} style={{ maxWidth: 300 }}
              aria-label="Filtrer par session">
              <option value="">Toutes les sessions</option>
              {filtres.sessions.map((s) => <option key={s.id} value={s.id}>{[s.code, s.start_date].filter(Boolean).join(" · ")}</option>)}
            </select>
          )}
          {filtres.years.length > 0 && (
            <select className="inp" value={selYear} onChange={(e) => setSelYear(e.target.value)} style={{ maxWidth: 150 }}
              aria-label="Filtrer par année">
              <option value="">Toutes les années</option>
              {filtres.years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          )}
          {(selSession || selYear) && (
            <button type="button" className="btn sm ghost" onClick={() => { setSelSession(""); setSelYear(""); }}>Réinitialiser</button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={exporterVue} title="Exporter la vue d'ensemble filtrée (CSV)">⬇ Exporter (CSV)</button>
        </div>
      )}

      {!rows ? (
        <p className="hint">Chargement…</p>
      ) : rows.length === 0 ? (
        <Card title="Résultats QCM"><p className="hint" style={{ margin: 0 }}>Aucun QCM au référentiel. Créez-en dans Configuration → Modèles de QCM.</p></Card>
      ) : (
        <div className={sel ? "qcm-split" : undefined}>
        <Card className="qcm-liste" title={`QCM (${rows.length})`}>
          {grouperParFormation(rows).map((g) => (
            <div key={g.cle} style={{ marginBottom: 14 }}>
              {/* La couleur passe du TEXTE à la PASTILLE : garder les deux ferait deux signaux
                  pour une seule information, et le rouge de l'en-tête entrait en concurrence
                  avec la teinte propre de la formation. L'intitulé redevient neutre. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700,
                letterSpacing: ".06em", textTransform: "uppercase",
                color: "var(--muted)", margin: "2px 2px 6px" }}>
                {g.code && (
                  <span className="lvl-chip" style={{ background: g.couleur || colorForLevel(g.code) }}>{g.code}</span>
                )}
                {g.titre} <span className="hint" style={{ fontWeight: 400 }}>({g.items.length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {g.items.map((q) => <QcmRow key={q.id} q={q} on={q.id === sel} onClick={() => ouvrir(q.id)} />)}
              </div>
            </div>
          ))}
        </Card>
          {sel && (
            <div ref={detailRef}>
              <Card title={detail ? detail.quiz.title : "Détail"}>
                {loadingDetail ? (
                  <p className="hint">Chargement…</p>
                ) : !detail ? null : (
                  <>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: detail.responses ? 16 : 0 }}>
                      <Stat label="Réponses" value={detail.responses} />
                      {detail.quiz.kind === "GRADED" && <Stat label="Score moyen" value={detail.responses ? `${detail.avg_pct ?? "—"}%` : "—"} />}
                      {detail.quiz.kind === "GRADED" && detail.quiz.pass_score != null && (
                        <Stat label={`Réussite (≥ ${detail.quiz.pass_score} %)`} value={detail.pass_rate != null ? `${detail.pass_rate}%` : "—"} tone={pctTone(detail.pass_rate)} />
                      )}
                    </div>
                    {detail.responses === 0 ? (
                      <p className="hint" style={{ margin: 0 }}>Aucun stagiaire n'a encore répondu à ce QCM.</p>
                    ) : (
                      <>
                        <div className="tabs" role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-soft)" }}>
                          <button type="button" role="tab" className={"tab" + (vue === "questions" ? " on" : "")} onClick={() => setVue("questions")}>Par question</button>
                          <button type="button" role="tab" className={"tab" + (vue === "stagiaires" ? " on" : "")} onClick={() => setVue("stagiaires")}>Par stagiaire ({detail.learners.length})</button>
                        </div>
                        {vue === "questions" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                            {detail.questions.map((q, i) => <DetailQuestion key={q.id} q={q} num={i + 1} />)}
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                              <button type="button" className="btn sm" onClick={exporterStagiaires} title="Exporter la liste par stagiaire (CSV)">⬇ Exporter (CSV)</button>
                            </div>
                            <StagiairesTable learners={detail.learners} quiz={detail.quiz} isAdmin={isAdmin}
                              onDelete={supprimerReponse} onPreuve={ouvrirPreuve} />
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </Card>
            </div>
            )}
        </div>
      )}

      {preuve && <PreuveModal etat={preuve} onClose={() => setPreuve(null)} />}
    </>
  );
}

/**
 * LA PREUVE D'UNE RÉPONSE — le questionnaire tel qu'il était le jour où le stagiaire a répondu.
 *
 * Elle ne se reconstitue PAS depuis le QCM d'aujourd'hui, et c'est tout l'intérêt : enregistrer un
 * QCM supprime ses questions et les recrée sous de nouveaux identifiants, une option retirée
 * disparaît, un énoncé corrigé ne dit plus la même chose. Ce qu'on affiche ici a été recopié en
 * toutes lettres à la seconde de la validation, et ne dépend d'aucune autre table.
 *
 * TROIS ABSENCES DISTINCTES, qu'on ne confond pas — afficher un questionnaire vide dans l'un de
 * ces cas laisserait croire que le stagiaire n'a rien répondu :
 *   · « migration » : la colonne n'existe pas encore, aucune preuve n'est enregistrée ;
 *   · « anterieure » : la réponse précède l'enregistrement des preuves, irrécupérable ;
 *   · « illisible » : la preuve existe mais ne se relit pas (cas qui ne devrait jamais arriver).
 */
function PreuveModal({ etat, onClose }) {
  const p = etat.preuve;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="mhead">
          <h3>Preuve de réponse{etat.name ? ` — ${etat.name}` : ""}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          {etat.chargement ? <p className="hint">Chargement…</p> : !p ? (
            <p className="hint" style={{ margin: 0 }}>
              {etat.raison === "migration"
                ? "L'enregistrement des preuves n'est pas encore actif sur ce serveur (migration 144 à jouer)."
                : etat.raison === "illisible"
                  ? "La preuve enregistrée n'est pas lisible. Le score, lui, reste exact."
                  : "Cette réponse est antérieure à l'enregistrement des preuves : le détail n'a jamais été conservé. Le score et la date, eux, restent exacts."}
            </p>
          ) : (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                {p.quiz?.titre} · répondu le {dateHeure(etat.completed_at)}
                {p.score_max ? ` · ${p.score}/${p.score_max}` : ""}
              </p>
              {(p.questions || []).map((q) => (
                <div key={q.rang} style={{ borderTop: "1px solid var(--border-soft)", padding: "10px 0" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{q.rang}. {q.enonce}</div>
                  {q.options ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {q.options.map((o, k) => (
                        <li key={k} style={{ color: o.choisie ? "var(--text)" : "var(--muted)", fontWeight: o.choisie ? 600 : 400 }}>
                          {o.choisie ? "☑" : "☐"} {o.texte}
                          {o.correcte && <span className="hint"> · bonne réponse</span>}
                        </li>
                      ))}
                    </ul>
                  ) : q.lignes ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {q.lignes.map((li, k) => (
                        <li key={k}>{li.libelle} : <b>{li.choisi.length ? li.choisi.join(", ") : "—"}</b></li>
                      ))}
                    </ul>
                  ) : (
                    <div>Réponse : <b>{q.valeur ?? q.reponse_brute ?? "—"}</b></div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="mfoot"><button className="btn ghost" onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}


export default ResultatsQCM;
