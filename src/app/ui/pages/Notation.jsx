import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import HelpDot from "../components/HelpDot.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DataTable from "../components/DataTable.jsx";
import { Squelette } from "../components/Squelette.jsx";
import ProgressPct from "../components/ProgressPct.jsx";
import SessionEvaluation from "../components/SessionEvaluation.jsx";
import SelecteurSession from "../components/SelecteurSession.jsx";
import { getSessionsANoter, getNotationSession } from "../api/apiClient.js";
import { initials } from "../lib/format.js";

/**
 * NOTATION — noter, puis lire ce que ça donne.
 *
 * DEUX TEMPS, DEUX SECTIONS, et c'est toute l'ergonomie de cet écran :
 *   · NOTE     — on saisit. Le formateur a son groupe devant lui.
 *   · RÉSULTAT — on lit. L'addition de tout ce qui a été saisi, par stagiaire.
 * Les mélanger dans une seule page obligeait à défiler entre une grille de saisie et un tableau
 * de synthèse qui ne se consultent jamais au même moment.
 *
 * LA SAISIE A ÉTÉ RETIRÉE DE LA PAGE DE LA SESSION. Elle y voisinait l'inscription, les
 * consentements, les intervenants, l'émargement et le procès-verbal : six cartes empilées dont
 * une seule intéressait le formateur venu noter. Elle vit désormais là où l'on vient pour
 * noter, et la session redevient lisible.
 *
 * LA SESSION SE CHOISIT EN HAUT, UNE FOIS, et vaut pour les deux sections : on note un groupe
 * puis on regarde ses résultats — reposer la question entre les deux serait du travail en plus
 * pour rien.
 *
 * ELLE SE CHOISIT PAR SEMAINE, PUIS PAR FORMATION — et non dans un menu déroulant. Le menu
 * alignait soixante lignes « CODE — Titre · date · N inscrits » qu'il fallait lire une à une,
 * fermées sur elles-mêmes : on ne voyait jamais ce qu'il y avait à noter cette semaine-là, ni
 * combien de formations tournaient en parallèle. Or une école pense en SEMAINES — c'est l'unité
 * de ses sessions, de ses feuilles d'émargement et de son classement d'archives.
 *
 * MÊME ARBORESCENCE QUE LE COFFRE DOCUMENTAIRE (Suivi → Archives) : semaine, puis formation,
 * aux mêmes couleurs. Deux écrans qui rangent la même réalité doivent la ranger pareil, sans
 * quoi on apprend deux fois le même classement.
 */

const tonePct = (p) => (p == null ? "n" : p >= 75 ? "g" : p >= 50 ? "a" : "r");

/** Une note « points / max » avec sa barre. `—` quand il n'y a rien à montrer. */
function Note({ n, titre }) {
  if (!n || !n.max) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="mono" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{n.points} / {n.max}</span>
      <ProgressPct percent={n.percent} width={58} titre={titre || `${n.points} points sur ${n.max}`} />
    </span>
  );
}

function Notation() {
  const [sessions, setSessions] = useState(null);
  const [choisie, setChoisie] = useState("");
  const [vue, setVue] = useState("note");   // "note" | "resultat"
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getSessionsANoter()
      .then((r) => {
        const l = r.data || [];
        setSessions(l);
        if (l.length) setChoisie(l[0].id);
      })
      .catch((e) => { setSessions([]); setStatus({ type: "error", message: e.message }); });
  }, []);

  /* Les résultats ne sont chargés QUE pour la section qui les montre : ouvrir la page pour
     noter ne doit pas interroger la moitié de la base au passage. */
  useEffect(() => {
    if (!choisie || vue !== "resultat") return;
    let vivant = true;
    setData(null);
    getNotationSession(choisie)
      .then((r) => { if (vivant) setData(r.data); })
      .catch((e) => { if (vivant) setStatus({ type: "error", message: e.message }); });
    return () => { vivant = false; };
  }, [choisie, vue]);

  const stagiaires = data?.stagiaires || [];
  const sessionChoisie = useMemo(
    () => (sessions || []).find((s) => s.id === choisie) || null,
    [sessions, choisie]);


  /* La moyenne de la promotion, sur les seuls dossiers qui ont une note : ceux qui n'ont rien
     passé ne doivent pas la tirer vers le bas. */
  const moyenne = useMemo(() => {
    const notes = stagiaires.map((s) => s.total).filter((t) => t && t.max > 0);
    if (!notes.length) return null;
    const pts = notes.reduce((a, t) => a + t.points, 0);
    const max = notes.reduce((a, t) => a + t.max, 0);
    return { percent: Math.round((pts / max) * 100), n: notes.length };
  }, [stagiaires]);

  const cols = [
    {
      k: "nom", t: "Stagiaire", principal: true,
      cell: (s) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
          <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
            {initials(s.first_name, s.last_name)}
          </span>
          <Link to={`/stagiaires/${s.learner_id}`} style={{ fontWeight: 600, color: "var(--text)" }}>
            {s.nom || "—"}
          </Link>
        </span>
      ),
    },
    {
      k: "qcm", t: "QCM",
      cell: (s) => (s.qcm && s.qcm.max ? (
        <>
          <Note n={s.qcm} />
          {s.qcm.quiz.length > 1 && (
            <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
              {s.qcm.quiz.length} questionnaires
            </span>
          )}
        </>
      ) : null),
    },
    { k: "evaluation", t: "Évaluation pratique", cell: (s) => <Note n={s.evaluation} /> },
    {
      k: "total", t: "Total",
      cell: (s) => (s.total.max > 0 ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Badge tone={tonePct(s.total.percent)} className="mono">{s.total.percent}&nbsp;%</Badge>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {s.total.points} / {s.total.max}
          </span>
          {/* PARTIEL SE DIT : le total est juste, mais il ne porte pas encore sur tout ce qui
              sera évalué. Sans ce mot, « 80 % » se lit comme un résultat final. */}
          {s.total.partiel && <Badge tone="n" title="Toutes les épreuves n'ont pas été passées">partiel</Badge>}
        </span>
      ) : null),
    },
    {
      k: "jury", t: "Jury",
      cell: (s) => (s.jury ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: 13 }}>{s.jury.validees} / {s.jury.total}</span>
          {s.jury.verdict?.avis === "FAVORABLE" && <Badge tone="g">Favorable</Badge>}
          {s.jury.verdict?.avis === "DEFAVORABLE" && <Badge tone="r">Défavorable</Badge>}
          {s.jury.verdict?.rattrapage ? <Badge tone="a">Rattrapage</Badge> : null}
        </span>
      ) : null),
    },
  ];

  return (
    <>
      <PageHead eyebrow="Qualité" title="Notation"
        lead="Noter un groupe, puis lire ce que ça donne. Le total additionne les QCM notés et l'évaluation pratique ; l'avis du jury est rendu à côté, parce qu'il valide des compétences et ne se compte pas en points." />
      <StatusMessage status={status} />

      {sessions === null ? (
        <Squelette lignes={3} h={64} />
      ) : sessions.length === 0 ? (
        <Card><EmptyState icon="calendar" title="Aucune session à noter"
          text="Les sessions apparaissent ici dès qu'un stagiaire y est inscrit." /></Card>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "0 0 14px" }}>
            <SelecteurSession sessions={sessions} valeur={choisie} onChoisir={setChoisie} />
            <div className="seg">
              <button type="button" className={"seg-btn" + (vue === "note" ? " on" : "")} onClick={() => setVue("note")}>Note</button>
              <button type="button" className={"seg-btn" + (vue === "resultat" ? " on" : "")} onClick={() => setVue("resultat")}>Résultat</button>
            </div>
          </div>

          {vue === "note" ? (
            /* `key` : changer de session doit REMONTER l'écran de saisie, sinon les notes du
               groupe précédent resteraient affichées le temps du chargement — et une coche à cet
               instant partirait sur le mauvais dossier. */
            <SessionEvaluation key={choisie} sessionId={choisie} />
          ) : !data ? (
            <Squelette lignes={4} h={56} />
          ) : (
            <Card
              title={sessionChoisie ? `${sessionChoisie.code || ""} ${sessionChoisie.title || ""}`.trim() : "Résultats"}
              more={
                <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                  {moyenne && (
                    <span className="hint" style={{ margin: 0 }}>
                      Moyenne&nbsp;: <b>{moyenne.percent}&nbsp;%</b> sur {moyenne.n} noté(s)
                    </span>
                  )}
                  <Link to={`/sessions/${choisie}`} className="card-more">Ouvrir la session →</Link>
                </span>
              }>
              <DataTable
                rows={stagiaires}
                rowKey={(s) => s.enrollment_id}
                cols={cols}
                vide={<EmptyState icon="users">Aucun stagiaire inscrit à cette session.</EmptyState>}
              />

              {/* LA LÉGENDE EXPLIQUE LES DEUX CHOSES QU'ON NE DEVINE PAS en regardant le tableau :
                  pourquoi une colonne est vide, et pourquoi le jury n'est pas dans le total. */}
              <p className="hint" style={{ marginBottom: 0 }}>
                <b>Ce qui n'a pas été passé ne compte pas pour zéro</b> — une case vide veut dire
                « pas encore », et le total ne porte que sur les épreuves réellement notées.
                {" "}L'avis du jury reste hors du total
                <HelpDot text={"Le jury VALIDE DES COMPÉTENCES selon une règle (« 5 critères sur 6 dont C2.3 »), il ne pose pas de points.\n\nLe convertir en points ferait apparaître un nombre que personne n'a calculé et qui ne figure sur aucun document signé."} />.
                {" "}Les notes se saisissent dans <b>Note</b>, les QCM depuis le dossier du stagiaire,
                et l'avis du jury dans l'espace de l'intervenant.
              </p>
            </Card>
          )}
        </>
      )}
    </>
  );
}

export default Notation;
