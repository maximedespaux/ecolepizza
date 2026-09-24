import { useContext, useEffect, useRef, useState } from "react";
import { getQcmResultats, getQcmResultatDetail, deleteQcmResponse, getPreuveReponse } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import { peutEcrire } from "../lib/nav.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import { dateHeure } from "../lib/format.js";
import { colorForLevel } from "../lib/levels.js";
import SelecteurSemaine from "../components/SelecteurSemaine.jsx";
/* LE MÊME rangement que Notation, pas une copie : c'est la règle de rangement qui divergeait
   quand le code était recopié (cf. lib/sessions.js), pas le balisage. */
import { grouperParSemaine, semaineParDefaut } from "../lib/sessions.js";
import { parJour } from "../lib/qcmJours.js";
import GrilleCorrigee from "../components/GrilleCorrigee.jsx";

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
/* L'ÉNONCÉ GARDE SES RETOURS À LA LIGNE. La question des allergènes est écrite en liste —
   « - 20 % de pâte fermentée / - 5 % de graines torréfiées / … » — et s'affichait en un seul
   paragraphe : « - 20 % de pâte fermentée - 5 % de graines torréfiées - 10 % de farine de soja
   Et les ingrédients suivants : - Tomate - Champignons… ». La liste EST la question : c'est en
   lisant « graines torréfiées » qu'on trouve le sésame. */
const ENONCE = { whiteSpace: "pre-line" };

/* Couleur de la part de justes : on repère la ligne qui pose problème sans lire chaque chiffre. */
const tonJustes = (pct) => (pct == null ? "var(--muted)" : pct >= 75 ? "var(--green,#2e9e5b)" : pct >= 50 ? "var(--amber,#b8860b)" : "#c0392b");

/**
 * Le récapitulatif d'une question en GRILLE : une ligne par ligne de la grille, le nombre de
 * stagiaires par colonne, la bonne colonne marquée, et la part de réponses justes.
 */
function TableauGrille({ grille }) {
  const cell = { padding: "5px 8px", borderBottom: "1px solid var(--border-soft)", fontSize: 13 };
  return (
    <div style={{ overflowX: "auto", marginTop: 8 }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: "left", color: "var(--muted)", fontWeight: 600 }}></th>
            {grille.colonnes.map((c, ci) => (
              <th key={ci} style={{ ...cell, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>{c}</th>
            ))}
            <th style={{ ...cell, textAlign: "right", color: "var(--muted)", fontWeight: 600 }}>Justes</th>
          </tr>
        </thead>
        <tbody>
          {grille.lignes.map((l, li) => (
            <tr key={li}>
              <td style={{ ...cell, fontWeight: 600 }}>{l.texte}</td>
              {grille.colonnes.map((_, ci) => {
                const bonne = l.bonnes.includes(ci);
                const n = l.comptes[ci] || 0;
                /* La bonne colonne en vert, avec sa coche ; un compte dans une MAUVAISE colonne en
                   rouge — c'est lui qui dit combien se sont trompés, et dans quel sens. */
                return (
                  <td key={ci} style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums",
                    background: bonne ? "rgba(22,163,74,.10)" : undefined,
                    color: bonne ? "var(--green,#2e9e5b)" : n > 0 ? "#c0392b" : "var(--dim)",
                    fontWeight: bonne || n > 0 ? 600 : 400 }}
                    title={bonne ? "Bonne réponse" : undefined}>
                    {bonne && <Icon name="check" size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} />}{n}
                  </td>
                );
              })}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: tonJustes(l.juste_pct), fontVariantNumeric: "tabular-nums" }}>
                {l.juste_pct == null ? "—" : `${l.juste_pct} %`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailQuestion({ q, num }) {
  /* RÉPONSE LIBRE : pas de répartition à dessiner, on LIT. Chaque texte avec son auteur et sa date,
     dans l'ordre reçu ; la liste défile au-delà de quelques réponses pour ne pas repousser les
     autres questions trois écrans plus bas. */
  if (q.textes) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <b style={ENONCE}>{num}. {q.text}</b>
          <span className="hint" style={{ flex: "none" }}>{q.textes.length} réponse{q.textes.length > 1 ? "s" : ""} rédigée{q.textes.length > 1 ? "s" : ""}</span>
        </div>
        {q.textes.length === 0 ? (
          <p className="hint" style={{ margin: "6px 0 0" }}>Aucune réponse rédigée.</p>
        ) : (
          <div className="qcm-textes">
            {q.textes.map((t, i) => (
              <div key={i} className="qcm-texte">
                {(t.nom || t.le) && (
                  <div className="hint" style={{ fontSize: 11.5, marginBottom: 3 }}>
                    {t.nom || "Stagiaire"}{t.le ? ` · ${dateHeure(t.le)}` : ""}
                  </div>
                )}
                <div className="qcm-texte-corps">{t.texte}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (q.scale) {
    const maxN = Math.max(1, ...Object.values(q.scale.dist));
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <b style={ENONCE}>{num}. {q.text}</b>
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
  /* UNE GRILLE SE LIT EN TABLEAU, puisque c'en est un. L'écran affichait « grille · 4 réponse(s)
     (détail par cellule à venir) » — depuis la création des grilles, rien d'autre. Sur la question
     des allergènes (RS7404, jeudi S38), le tableau dit d'un coup d'œil ce qu'elle cachait : Sésame
     25 % de justes, Soja 50 %. C'est la seule chose que ce récapitulatif existe pour montrer.
     Ancienne réponse du serveur (`grille === true`, sans détail) : on garde l'ancienne ligne. */
  if (q.grille) {
    if (q.grille === true || !q.grille.lignes) {
      return <div><b style={ENONCE}>{num}. {q.text}</b> <span className="hint">· grille · {q.responses} réponse(s)</span></div>;
    }
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <b style={ENONCE}>{num}. {q.text}</b>
          <span className="hint" style={{ flex: "none" }}>{q.responses} rép.</span>
        </div>
        <TableauGrille grille={q.grille} />
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <b style={ENONCE}>{num}. {q.text}</b>
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
function StagiairesTable({ learners, quiz, peutSupprimer, onDelete, onPreuve }) {
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
            {peutSupprimer && l.id && (
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
          {estPartage(q) && `${q.formations.map((f) => f.code).join(", ")} · `}
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

/* Regroupe les QCM par FORMATION (program_id) ; « Autre » pour ceux qui n'en ont pas.
   UN QCM PARTAGÉ entre plusieurs formations (migration 163) va sous « Plusieurs formations » :
   rangé sous sa seule formation principale, on croirait que ses réponses ne viennent que de
   celle-là. */
const estPartage = (q) => (q.formations || []).length > 1;
function grouperParFormation(rows) {
  const parCle = new Map();
  for (const q of rows) {
    const partage = estPartage(q);
    const cle = partage ? "_plusieurs" : (q.program_id || "_autre");
    if (!parCle.has(cle)) {
      parCle.set(cle, {
        cle,
        autre: !partage && !q.program_id,
        plusieurs: partage,
        /* Le CODE reste séparé de l'intitulé : fondus dans une seule chaîne, on ne pouvait plus
           en faire une pastille. La couleur vient de la ligne (choix de l'organisme) et retombe
           sur la palette commune sinon — même ordre de priorité que `setBadgeColors` ailleurs. */
        code: !partage && q.program_id ? (q.program_code || "") : "",
        titre: partage ? "Plusieurs formations" : q.program_id ? (q.program_title || "") : "Autre — sans formation",
        couleur: q.program_color || null,
        items: [],
      });
    }
    parCle.get(cle).items.push(q);
  }
  /* DANS CHAQUE GROUPE, L'ORDRE DES JOURS — le test de positionnement (J-7), puis mardi, mercredi…
     Le serveur range au nombre de réponses : un tri qui change de semaine en semaine, et qui
     donnait « Jeudi, Mardi, Mercredi, Test de positionnement ». La règle est celle des Modèles de
     QCM (lib/qcmJours.js), pas une copie. */
  for (const g of parCle.values()) g.items.sort(parJour);
  // Les formations, puis « Plusieurs formations », puis « Autre » toujours en dernier.
  const rang = (g) => (g.autre ? 2 : g.plusieurs ? 1 : 0);
  return [...parCle.values()].sort((a, b) => rang(a) - rang(b));
}

/**
 * Résultats QCM (Qualité & conformité) : ce que les stagiaires répondent aux QCM de « Modèles de
 * QCM » (sans rapport avec le Pizza Quest). Vue d'ensemble par QCM (groupée par formation), puis
 * par question / par stagiaire.
 */
/* LA VUE CHOISIE (« par semaine » ou « globale ») se retrouve à la visite suivante. Une commodité de ce
   navigateur, rien de plus : sans stockage (navigation privée…), on retombe sur la semaine en cours. */
const CLE_VUE = "impastio.resultatsQcm.vue";
const vueMemorisee = () => { try { return localStorage.getItem(CLE_VUE); } catch { return null; } };
const memoriserVue = (v) => { try { localStorage.setItem(CLE_VUE, v); } catch { /* sans stockage : rien à retenir */ } };

/* PAR SEMAINE : l'historique d'un QCM, semaine de session après semaine de session, côte à côte, pour
   comparer les promotions sans passer d'une semaine à l'autre. Le serveur les range comme le filtre et
   les calcule comme le total : cliquer une semaine y bascule, ce QCM restant ouvert, et y retrouve ces
   chiffres. Même rangée que la liste des QCM, compacte : la colonne fait 380 px. */
function SemainesTable({ lignes, quiz, onOuvrir }) {
  const note = quiz.kind === "GRADED";
  if (!lignes.length) return <p className="hint" style={{ margin: 0 }}>Aucune réponse.</p>;
  const coupe = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const rangee = { display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "7px 9px", borderRadius: 9,
    color: "var(--text)", background: "transparent", border: "1px solid var(--border-soft)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {lignes.map((l) => {
        const cle = l.annee ? `${l.annee}-${String(l.semaine).padStart(2, "0")}` : null;
        const contenu = (
          <>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600, fontSize: 13, ...coupe }}>
                {cle ? `S${l.semaine} · ${l.annee}` : "Sans session"}
                {l.formations && <span className="hint" style={{ fontWeight: 400 }}> · {l.formations}</span>}
              </span>
              <span className="hint" style={{ display: "block", fontSize: 11.5, ...coupe }}>
                {l.responses} rép.{note && l.avg_pct != null && ` · ${l.avg_pct} % moy.`}
                {!cle && " · dossier retiré de sa session"}
              </span>
            </span>
            {note && quiz.pass_score != null && l.pass_rate != null && <Badge tone={pctTone(l.pass_rate)}>{l.pass_rate} %</Badge>}
            {cle && <Icon name="chevron-right" size={14} style={{ flex: "none" }} />}
          </>
        );
        return cle ? (
          <button key={cle} type="button" onClick={() => onOuvrir(cle)} title="Voir cette semaine" style={{ ...rangee, cursor: "pointer" }}>{contenu}</button>
        ) : (
          <div key="sans-session" style={rangee}>{contenu}</div>
        );
      })}
    </div>
  );
}

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
  /* LA SEMAINE REMPLACE LA SESSION. Deux sessions tournent souvent la même semaine — en production
     le 2026-09-17, NIV1H et RS7404 avaient toutes deux des réponses en S38 — et il fallait choisir
     l'une, lire, puis choisir l'autre. On vient voir « ce qu'ils ont répondu cette semaine » :
     c'est la semaine qui répond, pas la session.
     `undefined` = pas encore choisie (on attend la liste) ; "" = toutes les semaines ; sinon la
     clé « 2026-38 » de lib/sessions.js. */
  const [semaine, setSemaine] = useState(undefined);
  const [selYear, setSelYear] = useState("");
  const { user } = useContext(UserContext);
  // Supprimer une réponse : DELETE /quizzes/reponse, rubrique /qcm côté serveur (cf. peutEcrire).
  const peutSupprimer = peutEcrire(user, "/qcm");

  /* LES FILTRES COURANTS, en un seul endroit : quatre appels les passaient à la main.
     L'ANNÉE NE VAUT QUE POUR « TOUTES LES SEMAINES » — une semaine désigne déjà son année, et
     cumuler les deux permettrait de demander la S38 de 2026 « en 2025 », une page vide qu'on
     prendrait pour une absence de réponses. */
  const args = () => [null, semaine ? null : (selYear || null), semaine || null];

  /* PAR SEMAINE / GLOBALE. La vue globale EST « toutes les semaines » (semaine === "") : le bouton et
     l'entrée du sélecteur disent la même chose — jamais deux états qui pourraient se contredire. */
  const globale = semaine === "";
  const semainesDispo = grouperParSemaine(filtres.sessions);
  // L'onglet « Par semaine » du détail n'existe qu'en vue globale : hors d'elle, on retombe sur les questions.
  const vueEffective = !globale && vue === "semaines" ? "questions" : vue;
  function choisirSemaine(v) {
    memoriserVue(v ? "semaine" : "globale");
    setSemaine(v);
  }
  function choisirVue(v) {
    if (v === "globale") choisirSemaine("");
    else choisirSemaine(semaineParDefaut(semainesDispo) || "");
  }

  /* 1) OUVRIR SUR LA SEMAINE EN COURS — la même règle que Notation (`semaineParDefaut`) : celle
     d'aujourd'hui si elle a des réponses, sinon la plus récente qui en a. On attend la liste
     avant de charger quoi que ce soit, sans quoi l'écran afficherait d'abord TOUT, puis
     sauterait à la semaine — un clignotement de plusieurs centaines de réponses. */
  useEffect(() => {
    getQcmResultats(null, null, null)
      .then((r) => {
        const f = r.filtres || { sessions: [], years: [] };
        setFiltres(f);
        const parDefaut = semaineParDefaut(grouperParSemaine(f.sessions)) || "";
        // Vue globale retenue à la dernière visite : toutes les semaines d'emblée.
        setSemaine(vueMemorisee() === "globale" ? "" : parDefaut);
      })
      .catch((e) => { setStatus({ type: "error", message: e.message }); setSemaine(""); });
  }, []);

  // 2) Recharge la vue d'ensemble à chaque changement de filtre ; un détail ouvert suit le filtre.
  useEffect(() => {
    if (semaine === undefined) return;
    getQcmResultats(...args())
      .then((r) => { setRows(r.data || []); if (r.filtres) setFiltres(r.filtres); })
      .catch((e) => setStatus({ type: "error", message: e.message }));
    if (sel) getQcmResultatDetail(sel, ...args()).then((r) => setDetail(r.data)).catch(() => {});
  }, [semaine, selYear]);

  /* Sous 940 px les deux colonnes s'empilent : le détail repasse SOUS la liste, hors du
     champ de vision. On l'y ramène — sans quoi le clic ne montrerait toujours rien, ce qui
     est le défaut qu'on corrige. Au-dessus de ce palier la grille suffit, et déplacer la
     page serait au mieux inutile, au pire désorientant. */
  const detailRef = useRef(null);
  function ouvrir(id) {
    if (id === sel) { setSel(null); setDetail(null); return; } // re-clic = replier
    setSel(id); setDetail(null); setVue("questions"); setLoadingDetail(true);
    getQcmResultatDetail(id, ...args())
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
      const [ov, det] = await Promise.all([getQcmResultats(...args()), getQcmResultatDetail(sel, ...args())]);
      setRows(ov.data || []);
      setDetail(det.data);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  /* Suffixe du fichier exporté : la semaine (« S38-2026 ») ou l'année. Un CSV sans son filtre
     dans le nom se confond, dans un dossier de téléchargements, avec celui de la semaine d'avant. */
  function suffixeFiltre() {
    if (semaine) {
      const [an, sem] = semaine.split("-");
      return `-S${Number(sem)}-${an}`;
    }
    return selYear ? `-${selYear}` : "";
  }
  function exporterVue() {
    if (!visibles.length) return;
    const entetes = ["Formation", "QCM", "Type", "Réponses", "Score moyen %", "Taux de réussite %"];
    // Ce qu'on voit, pas ce que le serveur a rendu : exporter vingt-deux lignes quand l'écran en
    // montre six ferait mentir le fichier sur ce qu'on a regardé. Et DANS L'ORDRE où on le voit :
    // par formation, puis par jour.
    const lignes = grouperParFormation(visibles).flatMap((g) => g.items).map((q) => [
      estPartage(q) ? q.formations.map((f) => f.code).join(", ")
        : q.program_id ? [q.program_code, q.program_title].filter(Boolean).join(" · ") : "Autre",
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

  /* EN VUE SEMAINE, SEULS LES QCM QUI ONT DES RÉPONSES. Le serveur rend TOUS les QCM, jointure à
     gauche oblige — y compris ceux que personne n'a remplis cette semaine-là. Sur vingt-deux QCM,
     on en parcourait seize à zéro pour trouver les six qui comptaient, ce qui est l'inverse
     d'« avoir les réponses vite ». Sur « toutes les semaines », on les garde : un QCM jamais
     rempli est une information en soi, celle qu'on vient chercher pour un bilan. */
  const visibles = rows ? (semaine ? rows.filter((q) => q.responses > 0) : rows) : [];

  return (
    <>
      <PageHead eyebrow="Qualité & conformité" title="Résultats QCM"
        lead="Ce que les stagiaires répondent aux QCM — moyenne, réussite, et le détail par question pour repérer ce qui coince." />
      <StatusMessage status={status} />

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "0 0 14px" }}>
          {/* LE SÉLECTEUR DE NOTATION, avec son entrée « toutes » en plus. Il montre sur chaque
              semaine les badges de ses formations — on choisit en voyant ce qu'on va trouver. */}
          <div className="tabs" role="tablist" aria-label="Vue des résultats" style={{ display: "flex", gap: 4 }}>
            <button type="button" role="tab" aria-selected={!globale} className={"tab" + (!globale ? " on" : "")}
              disabled={!semainesDispo.length} onClick={() => choisirVue("semaine")}>Par semaine</button>
            <button type="button" role="tab" aria-selected={globale} className={"tab" + (globale ? " on" : "")}
              onClick={() => choisirVue("globale")}>Globale</button>
          </div>
          {!globale && (
            <div style={{ flex: "1 1 320px", maxWidth: 460 }}>
              <SelecteurSemaine sessions={filtres.sessions} valeur={semaine || ""} onChoisir={choisirSemaine}
                label="Semaine des réponses" toutes="Toutes les semaines" vide="Aucune réponse enregistrée." />
            </div>
          )}
          {/* L'année ne sert que sur « toutes les semaines » : une semaine désigne déjà la sienne. */}
          {!semaine && filtres.years.length > 0 && (
            <select className="inp" value={selYear} onChange={(e) => setSelYear(e.target.value)} style={{ maxWidth: 190 }}
              aria-label="Filtrer par année">
              <option value="">Toutes les années</option>
              {filtres.years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={exporterVue} title="Exporter la vue affichée (CSV)">⬇ Exporter (CSV)</button>
        </div>
      )}

      {!rows ? (
        <p className="hint">Chargement…</p>
      ) : rows.length === 0 ? (
        <Card title="Résultats QCM"><p className="hint" style={{ margin: 0 }}>Aucun QCM au référentiel. Créez-en dans Configuration → Modèles de QCM.</p></Card>
      ) : visibles.length === 0 ? (
        <Card title="Résultats QCM"><p className="hint" style={{ margin: 0 }}>Aucune réponse cette semaine. Choisissez-en une autre, ou « Toutes les semaines ».</p></Card>
      ) : (
        <div className={sel ? "qcm-split" : undefined}>
        <Card className="qcm-liste" title={semaine ? `QCM répondus cette semaine (${visibles.length})` : `QCM (${visibles.length})`}>
          {grouperParFormation(visibles).map((g) => (
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
                          <button type="button" role="tab" className={"tab" + (vueEffective === "questions" ? " on" : "")} onClick={() => setVue("questions")}>Par question</button>
                          <button type="button" role="tab" className={"tab" + (vueEffective === "stagiaires" ? " on" : "")} onClick={() => setVue("stagiaires")}>Par stagiaire ({detail.learners.length})</button>
                          {globale && detail.par_semaine && (
                            <button type="button" role="tab" className={"tab" + (vueEffective === "semaines" ? " on" : "")} onClick={() => setVue("semaines")}>Par semaine ({detail.par_semaine.length})</button>
                          )}
                        </div>
                        {vueEffective === "semaines" ? (
                          <SemainesTable lignes={detail.par_semaine || []} quiz={detail.quiz} onOuvrir={choisirSemaine} />
                        ) : vueEffective === "questions" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                            {detail.questions.map((q, i) => <DetailQuestion key={q.id} q={q} num={i + 1} />)}
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                              <button type="button" className="btn sm" onClick={exporterStagiaires} title="Exporter la liste par stagiaire (CSV)">⬇ Exporter (CSV)</button>
                            </div>
                            <StagiairesTable learners={detail.learners} quiz={detail.quiz} peutSupprimer={peutSupprimer}
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
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 760 }}>
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
                  <div style={{ fontWeight: 600, marginBottom: 6, ...ENONCE }}>{q.rang}. {q.enonce}</div>
                  {q.type === "TEXT" ? (
                    /* Le texte tel qu'envoyé, et la limite D'ALORS : une limite relevée depuis ne doit
                       pas faire paraître conforme une réponse qui ne l'était pas. */
                    <>
                      <div className="qcm-texte-corps">{q.texte || "—"}</div>
                      <p className="hint" style={{ margin: "4px 0 0", fontSize: 11.5 }}>{q.mots} mot{q.mots > 1 ? "s" : ""} · limite {q.mots_max}</p>
                    </>
                  ) : q.options ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {q.options.map((o, k) => (
                        <li key={k} style={{ color: o.choisie ? "var(--text)" : "var(--muted)", fontWeight: o.choisie ? 600 : 400 }}>
                          {o.choisie ? "☑" : "☐"} {o.texte}
                          {o.correcte && <span className="hint"> · bonne réponse</span>}
                        </li>
                      ))}
                    </ul>
                  ) : q.lignes && q.lignes.some((li) => li.juste !== undefined) ? (
                    /* PREUVE DE VERSION 2 : la correction a été figée à l'envoi. Elle est en LIBELLÉS
                       (« Oui », « Non ») — la preuve doit se lire sans la grille d'aujourd'hui — et le
                       tableau partagé attend des POSITIONS : on les retrouve dans les colonnes de la
                       preuve elle-même, jamais dans le QCM actuel. */
                    <GrilleCorrigee colonnes={q.colonnes || []} lignes={q.lignes.map((li) => ({
                      texte: li.libelle,
                      choisies: li.choisi.map((t) => (q.colonnes || []).indexOf(t)).filter((x) => x >= 0),
                      bonnes: (li.bonnes || []).map((t) => (q.colonnes || []).indexOf(t)).filter((x) => x >= 0),
                      juste: li.juste,
                    }))} />
                  ) : q.lignes ? (
                    <>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {q.lignes.map((li, k) => (
                          <li key={k}>{li.libelle} : <b>{li.choisi.length ? li.choisi.join(", ") : "—"}</b></li>
                        ))}
                      </ul>
                      {/* PREUVE DE VERSION 1 : on NE la complète PAS avec la grille d'aujourd'hui, qui a pu
                          être corrigée depuis — la preuve mentirait. On dit simplement ce qui manque. */}
                      <p className="hint" style={{ margin: "6px 0 0", fontSize: 11.5 }}>
                        La correction des grilles n'était pas conservée dans les preuves avant le 17/09/2026 :
                        seule la réponse donnée l'est. Le score, lui, est exact.
                      </p>
                    </>
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
