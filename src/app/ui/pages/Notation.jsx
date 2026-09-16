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
import SelecteurSemaine from "../components/SelecteurSemaine.jsx";
import { getSessionsANoter, getNotationSession } from "../api/apiClient.js";
import { initials, colorOf } from "../lib/format.js";
import { grouperParSemaine, semaineParDefaut } from "../lib/sessions.js";

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
 * ON CHOISIT UNE SEMAINE, PAS UNE SESSION — et c'est le geste réel de l'école. Les épreuves
 * s'installent une fois et tout le monde passe, que les stagiaires suivent la même formation ou
 * non. Faire désigner une session revenait à faire cliquer pour dire ce que la semaine
 * détermine déjà, puis à recommencer pour la formation d'à côté. Toutes les formations de la
 * semaine sont donc à l'écran, séparées par leur badge, sans un clic de plus.
 *
 * L'ÉCRAN S'OUVRE SUR LA SEMAINE EN COURS — ou la prochaine qui a des sessions. Il s'ouvrait
 * avant sur « la plus récente » au sens du serveur, qui trie par date décroissante : donc sur
 * la plus LOINTAINE dans le futur. Mesuré le 2026-09-16 : une session de novembre, un jour de
 * semaine 38. On vient noter ce qu'on enseigne.
 *
 * MÊMES COULEURS DE FORMATION que le coffre documentaire et le suivi Qualiopi : une couleur
 * veut dire la même chose partout dans l'application.
 *
 * NOTE SE RÉPÈTE PAR FORMATION, RÉSULTAT NON — et ce n'est pas une inconséquence. On SAISIT par
 * groupe : le formateur a une promotion devant lui, ses exercices, ses stagiaires. On LIT à
 * plat : un seul tableau, badge de formation en colonne, qui se trie et se compare d'un bout à
 * l'autre de la semaine. Deux tableaux de quatre et une lignes feraient beaucoup de cadre pour
 * peu de contenu, et interdiraient la comparaison qu'on vient justement chercher.
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

/**
 * UNE FORMATION DE LA SEMAINE, avec sa grille de saisie.
 *
 * DÉPLIÉE PAR DÉFAUT : on installe les épreuves une fois et on note tout le monde, formations
 * mêlées. Un clic de plus par formation serait un clic de trop — c'est la demande même.
 *
 * REPLIABLE QUAND MÊME, et la grille n'est MONTÉE que dépliée : chaque grille interroge le
 * serveur pour elle seule. Aujourd'hui une semaine en porte une ou deux, et tout charger ne
 * coûte rien ; le jour où elle en portera quatre de douze stagiaires, refermer celles qu'on ne
 * regarde pas cessera d'être décoratif. Ça ne coûte rien de l'écrire maintenant.
 */
function CarteNote({ session }) {
  const [ouvert, setOuvert] = useState(true);
  return (
    <details className="arch" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)}
      style={{ marginBottom: 14 }}>
      <summary className="arch-sum arch-y">
        {session.code && (
          <span className="badge n mono" style={{ background: colorOf(session.code), color: "#fff", borderColor: "transparent" }}>{session.code}</span>
        )}
        {" "}{session.title || "Session"}
        <span className="arch-count">{session.inscrits} inscrit(s)</span>
      </summary>
      {/* `key` : changer de semaine doit REMONTER la grille, sinon les notes du groupe précédent
          resteraient affichées le temps du chargement — et une coche à cet instant partirait sur
          le mauvais dossier. */}
      {ouvert && <SessionEvaluation key={session.id} sessionId={session.id} />}
    </details>
  );
}

function Notation() {
  const [sessions, setSessions] = useState(null);
  const [semaine, setSemaine] = useState("");
  const [vue, setVue] = useState("note");   // "note" | "resultat"
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getSessionsANoter()
      .then((r) => {
        const l = r.data || [];
        setSessions(l);
        setSemaine(semaineParDefaut(grouperParSemaine(l)) || "");
      })
      .catch((e) => { setSessions([]); setStatus({ type: "error", message: e.message }); });
  }, []);

  const semaines = useMemo(() => grouperParSemaine(sessions), [sessions]);
  const groupe = useMemo(() => semaines.find((g) => g.cle === semaine) || null, [semaines, semaine]);
  const duGroupe = groupe ? groupe.sessions : [];

  /* Les résultats ne sont chargés QUE pour la section qui les montre : ouvrir la page pour
     noter ne doit pas interroger la moitié de la base au passage.
     UNE REQUÊTE PAR SESSION DE LA SEMAINE, en parallèle : l'API rend les résultats session par
     session, et une semaine en compte une ou deux. Les fusionner ICI évite d'ajouter une route
     « par semaine » qui referait le même travail côté serveur. */
  useEffect(() => {
    if (!semaine || vue !== "resultat" || !duGroupe.length) return;
    let vivant = true;
    setData(null);
    Promise.all(duGroupe.map((s) =>
      getNotationSession(s.id)
        .then((r) => ({ session: s, stagiaires: (r.data && r.data.stagiaires) || [] }))
        .catch(() => ({ session: s, stagiaires: [] }))))
      .then((lots) => { if (vivant) setData(lots); })
      .catch((e) => { if (vivant) setStatus({ type: "error", message: e.message }); });
    return () => { vivant = false; };
  }, [semaine, vue, duGroupe.length]);

  /* UN SEUL TABLEAU POUR LA SEMAINE, formation en colonne : on lit à plat ce qu'on a saisi par
     groupe. Le code de formation voyage avec chaque ligne, sinon deux stagiaires de formations
     différentes deviendraient indiscernables une fois mêlés. */
  const stagiaires = useMemo(
    () => (data || []).flatMap((lot) => lot.stagiaires.map((st) => ({ ...st, _code: lot.session.code }))),
    [data]);


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
      /* LA FORMATION EN PREMIÈRE COLONNE. Sans elle, deux stagiaires de promotions différentes
         deviennent indiscernables une fois mêlés dans le même tableau — et c'est précisément ce
         qu'on vient de faire en passant à la semaine. */
      k: "formation", t: "Formation",
      cell: (s) => (s._code ? (
        <span className="badge n mono" style={{ background: colorOf(s._code), color: "#fff", borderColor: "transparent" }}>{s._code}</span>
      ) : null),
    },
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
            <SelecteurSemaine sessions={sessions} valeur={semaine} onChoisir={setSemaine} />
            <div className="seg">
              <button type="button" className={"seg-btn" + (vue === "note" ? " on" : "")} onClick={() => setVue("note")}>Note</button>
              <button type="button" className={"seg-btn" + (vue === "resultat" ? " on" : "")} onClick={() => setVue("resultat")}>Résultat</button>
            </div>
          </div>

          {vue === "note" ? (
            /* UNE CARTE PAR FORMATION DE LA SEMAINE, dépliée. Toutes à l'écran : on installe les
               épreuves une fois et on note tout le monde, un clic de plus par formation serait
               un clic de trop. Repliables quand même — le jour où une semaine portera quatre
               sessions de douze, la page doit pouvoir se refermer. */
            duGroupe.length === 0 ? (
              <Card><EmptyState icon="calendar">Aucune session cette semaine-là.</EmptyState></Card>
            ) : duGroupe.map((s) => <CarteNote key={s.id} session={s} />)
          ) : !data ? (
            <Squelette lignes={4} h={56} />
          ) : (
            <Card
              title={groupe ? `Semaine ${groupe.semaine} · ${groupe.annee}` : "Résultats"}
              more={
                <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                  {moyenne && (
                    <span className="hint" style={{ margin: 0 }}>
                      Moyenne&nbsp;: <b>{moyenne.percent}&nbsp;%</b> sur {moyenne.n} noté(s)
                    </span>
                  )}
                </span>
              }>
              <DataTable
                rows={stagiaires}
                rowKey={(s) => s.enrollment_id}
                cols={cols}
                vide={<EmptyState icon="users">Aucun stagiaire inscrit cette semaine-là.</EmptyState>}
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
