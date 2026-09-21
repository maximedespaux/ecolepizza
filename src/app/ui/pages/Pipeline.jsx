import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSessions, getSessionBoard } from "../api/apiClient.js";
import { lienDossier } from "../lib/lienDossier.js";
import SelecteurSemaine from "../components/SelecteurSemaine.jsx";
import EnTeteSession from "../components/EnTeteSession.jsx";
import PageHead from "../components/PageHead.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
/* LE MÊME rangement que Notation et les Résultats QCM, importé et non recopié. */
import { grouperParSemaine, semaineParDefaut } from "../lib/sessions.js";

/**
 * PIPELINE — où en est chaque stagiaire, étape par étape, pour TOUTES les sessions d'une semaine.
 *
 * POURQUOI LA SEMAINE, ET POURQUOI CE N'EST PAS CONTRADICTOIRE AVEC CE QUE CE FICHIER DISAIT.
 * Quand Notation est passé au choix par semaine, le Pipeline est resté au choix par SESSION, avec
 * une raison écrite : « il suit UNE session étape par étape : choisir la session EST son sujet ».
 * La raison visait le TABLEAU, pas le SÉLECTEUR — et le tableau ne change pas. Chaque session
 * garde le sien, avec ses propres colonnes ; on les voit simplement tous d'un coup au lieu de les
 * ouvrir l'un après l'autre. Deux sessions tournaient en S38 le 2026-09-17 (NIV1H et RS7404).
 *
 * UN TABLEAU PAR SESSION, JAMAIS UN TABLEAU FUSIONNÉ. Les colonnes sont les étapes du parcours de
 * la FORMATION, et deux formations n'ont pas le même : NIV1H en compte dix-sept, RS7404 seize.
 * Fusionner obligerait à inventer des colonnes communes qui n'existent dans aucun parcours.
 *
 * ET L'ÉCRAN S'OUVRAIT EN DÉCEMBRE. Il prenait `r.data[0]`, la PREMIÈRE session rendue — or le
 * serveur trie par date DÉCROISSANTE : c'était la plus lointaine, un NIV2 du 14 décembre, un
 * 17 septembre. Le défaut que Notation avait déjà payé ; même remède, `semaineParDefaut`.
 */
function Pipeline() {
  const [sessions, setSessions] = useState([]);
  const [semaine, setSemaine] = useState("");
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getSessions()
      .then((r) => {
        const l = r.data || [];
        setSessions(l);
        setSemaine(semaineParDefaut(grouperParSemaine(l)) || "");
      })
      .catch((e) => setStatus({ type: "error", message: e.message }));
  }, []);

  const semaines = useMemo(() => grouperParSemaine(sessions), [sessions]);
  const groupe = useMemo(() => semaines.find((g) => g.cle === semaine) || null, [semaines, semaine]);

  return (
    <>
      <PageHead
        eyebrow="Secrétariat · Suivi"
        title="Pipeline de session"
        lead="Où en est chaque stagiaire de la semaine, étape par étape — un tableau par session."
        actions={
          <SelecteurSemaine sessions={sessions} valeur={semaine} onChoisir={setSemaine}
            label="Choisir la semaine à afficher" vide="Aucune session." />
        }
      />
      <StatusMessage status={status} />

      {!groupe ? (
        <p className="lead">Sélectionnez une semaine.</p>
      ) : (
        /* `key` = l'identifiant de la SESSION, pas sa position. Sans lui, passer de S38 à S42
           réutiliserait le composant du premier tableau pour une autre session : ses bandes
           dépliées et son tableau précédent resteraient affichés le temps du chargement. */
        groupe.sessions.map((s) => <TableauSession key={s.id} session={s} onErreur={setStatus} />)
      )}
    </>
  );
}

/**
 * Le tableau d'UNE session : colonnes = étapes du parcours de sa formation, cartes = stagiaires
 * positionnés sur leur prochain document.
 *
 * SON ÉTAT DE REPLI LUI APPARTIENT, et c'est la raison de ce composant. Les bandes d'étapes vides
 * se repèrent par l'indice de leur première colonne (« v3 »). Tant qu'il n'y avait qu'un tableau,
 * une clé par page suffisait. Empilés, deux tableaux ont chacun leur « v3 » : déplier l'un aurait
 * déplié l'autre. Porté ici, chaque tableau a son propre état — la collision est impossible par
 * construction, pas évitée par une clé composée qu'on pourrait oublier.
 */
function TableauSession({ session, onErreur }) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ouvert, setOuvert] = useState(true);
  const [deplies, setDeplies] = useState({});

  useEffect(() => {
    let vivant = true;
    setLoading(true);
    getSessionBoard(session.id)
      .then((r) => { if (vivant) setBoard(r.data); })
      .catch((e) => { if (vivant) onErreur?.({ type: "error", message: e.message }); })
      .finally(() => { if (vivant) setLoading(false); });
    return () => { vivant = false; };
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Colonnes du parcours + une colonne finale « Terminé ».
  const columns = useMemo(() => {
    if (!board) return [];
    return [...board.columns, { index: board.columns.length, key: "__done", label: "Terminé", final: true }];
  }, [board]);
  const cardsByCol = useMemo(() => {
    const m = {};
    for (const c of (board?.cards || [])) (m[c.column] = m[c.column] || []).push(c);
    return m;
  }, [board]);

  /* DIX-NEUF COLONNES, DIX-HUIT VIDES. Un parcours complet compte autant d'étapes qu'il y a de
     documents ; avec un ou deux stagiaires, presque toutes annoncent « Personne à cette étape ».
     Retrouver où en est quelqu'un demandait alors près de CINQ MILLE PIXELS de défilement
     horizontal — la question à laquelle ce tableau doit répondre d'un coup d'œil.

     Les étapes vides QUI SE SUIVENT sont donc repliées en une seule bande étroite. Repliées et
     non masquées : le parcours reste une suite, et sauter des étapes sans le dire ferait croire
     qu'elles n'existent pas. La bande se déplie au clic. */
  const groupes = useMemo(() => {
    const out = [];
    for (const col of columns) {
      const items = cardsByCol[col.index] || [];
      if (items.length > 0) { out.push({ type: "col", col, items }); continue; }
      const prec = out[out.length - 1];
      if (prec && prec.type === "vide") prec.cols.push(col);
      else out.push({ type: "vide", cle: `v${col.index}`, cols: [col] });
    }
    return out;
  }, [columns, cardsByCol]);

  return (
    <details className="arch" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)} style={{ marginBottom: 14 }}>
      <summary className="arch-sum arch-y"><EnTeteSession session={session} /></summary>
      {!ouvert ? null : loading ? (
        <p className="lead">Chargement…</p>
      ) : !board ? (
        <p className="lead">Tableau indisponible.</p>
      ) : board.columns.length === 0 ? (
        <p className="lead">Aucune étape à afficher.</p>
      ) : (
        <div className="pipe">
          {groupes.map((g) => {
            if (g.type === "vide" && !deplies[g.cle]) {
              return (
                <button type="button" className="pipe-plie" key={g.cle}
                  onClick={() => setDeplies((d) => ({ ...d, [g.cle]: true }))}
                  title={g.cols.map((c) => c.label).join(" · ")}>
                  <b className="chiffres">{g.cols.length}</b>
                  <span>étape{g.cols.length > 1 ? "s" : ""} sans personne</span>
                </button>
              );
            }
            const cols = g.type === "col" ? [g.col] : g.cols;
            return cols.map((col) => {
              const items = cardsByCol[col.index] || [];
              return (
                <div className={"pipe-col" + (col.final ? " pipe-done" : "")} key={col.key}>
                  {/* Le libellé vient du MODÈLE de document (choisi par l'école) et peut faire
                      trois lignes — « Contrat de formation / Convention de formation
                      simplifiée ». Il s'affichait tronqué net au bord de la colonne, sans
                      infobulle : on ne savait pas de quelle étape il s'agissait. Il tient
                      maintenant sur deux lignes, le reste en points de suspension, et le titre
                      complet reste lisible au survol. */}
                  <div className="pipe-head">
                    <span className="pipe-head-t" title={col.label}>{col.ic ? `${col.ic} ` : ""}{col.label}</span>
                    <b className="chiffres pipe-n">{items.length}</b>
                  </div>
                  <div className="pipe-body">
                    {items.length === 0 ? (
                      // Un « — » nu ne dit pas si l'étape est vide ou si rien n'a chargé.
                      <p className="pipe-vide">Personne à cette étape</p>
                    ) : items.map((r) => (
                      <div className="pipe-card" key={r.enrollment_id}>
                        {/* La fiche s'ouvre sur le dossier de CETTE carte, pas sur le premier (lib/lienDossier.js). */}
                        <Link to={lienDossier(r.learner_id, r.enrollment_id)} className="pipe-name">{r.name}</Link>
                        <div className="pipe-docs" style={{ marginTop: 6 }}>Étape {Math.min((r.etape ?? r.done) + 1, r.total)}/{r.total}{r.percent != null ? ` · ${r.percent}%` : ""}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })}
        </div>
      )}
    </details>
  );
}

export default Pipeline;
