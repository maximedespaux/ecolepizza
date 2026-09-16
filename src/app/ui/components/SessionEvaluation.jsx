import { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "./Card.jsx";
import Badge from "./Badge.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { Squelette } from "./Squelette.jsx";
import ProgressPct from "./ProgressPct.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { getEvaluationSession, saveNoteEvaluation } from "../api/apiClient.js";
import { dureeLisible, lireDuree, dureeSaisissable } from "../lib/format.js";

/**
 * SAISIE DES NOTES D'ÉVALUATION PRATIQUE — l'écran du formateur, sur la page de la session.
 *
 * ICI ET PAS AILLEURS : le formateur a son groupe devant lui, chronomètre en main, et la
 * session est l'endroit où il vient déjà (émargement, intervenants). Une page d'évaluation
 * rangée à part ne s'ouvrirait que quand on la cherche.
 *
 * DEUX SENS DE LECTURE, parce que deux façons de faire passer un examen coexistent. « Par
 * exercice » suit le déroulé réel d'un atelier — tout le monde façonne, puis tout le monde
 * enfourne ; « par stagiaire » sert au rattrapage et à la relecture d'un dossier.
 *
 * LES POINTS NE SONT JAMAIS ENVOYÉS. On transmet la MESURE et le serveur applique le barème ;
 * les totaux affichés sont RELUS du serveur après chaque saisie, jamais recalculés ici. Une
 * deuxième implémentation du barème dans le navigateur finirait par diverger de la vraie — et
 * c'est l'écran qu'on croirait.
 */

const lirePaliers = (brut) => {
  if (Array.isArray(brut)) return brut;
  try { const v = JSON.parse(brut || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};

function SessionEvaluation({ sessionId }) {
  const { user } = useContext(UserContext);
  const peutConfigurer = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"].includes(user?.role);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [status, setStatus] = useState(null);
  const [sens, setSens] = useState("exercice"); // "exercice" | "stagiaire"
  const [choisi, setChoisi] = useState(null);   // exercice ou dossier mis en avant
  const [brouillon, setBrouillon] = useState({}); // saisies en cours, clé `${eid}|${exid}`
  const [enCours, setEnCours] = useState(null);   // clé en cours d'enregistrement

  async function charger(silencieux) {
    try {
      const r = await getEvaluationSession(sessionId, silencieux);
      setData(r.data);
      setErreur(null);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); }, [sessionId]);

  const exercices = useMemo(
    () => (data?.grille?.exercices || []).filter((e) => e.active),
    [data]);
  const stagiaires = data?.stagiaires || [];

  /* Le premier élément est choisi d'office : ouvrir sur « rien de sélectionné » imposerait un
     clic avant toute saisie, sur un écran dont c'est l'unique fonction.
     MAIS SEULEMENT SI LE CHOIX COURANT N'EXISTE PLUS. Cet effet se rejoue après CHAQUE note —
     les totaux sont relus du serveur — et ramenait donc le formateur sur le premier exercice
     dès qu'il en notait un autre : il fallait re-cliquer entre chaque stagiaire. */
  useEffect(() => {
    const ids = sens === "exercice" ? exercices.map((e) => e.id) : stagiaires.map((s) => s.enrollment_id);
    if (!ids.includes(choisi)) setChoisi(ids[0] || null);
  }, [sens, exercices, stagiaires, choisi]);

  async function noter(enrollmentId, exerciceId, valeur) {
    const cle = `${enrollmentId}|${exerciceId}`;
    setEnCours(cle);
    setStatus(null);
    try {
      await saveNoteEvaluation({ enrollment_id: enrollmentId, exercice_id: exerciceId, valeur });
      setBrouillon((b) => { const n = { ...b }; delete n[cle]; return n; });
      await charger(true); // les totaux viennent du serveur, pas d'un calcul d'écran
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally { setEnCours(null); }
  }

  if (erreur) {
    return (
      <Card title="Évaluation pratique">
        <p className="hint" style={{ margin: 0 }}>{erreur}</p>
      </Card>
    );
  }
  if (!data) return <Card title="Évaluation pratique"><Squelette lignes={2} h={48} /></Card>;

  if (!data.grille) {
    return (
      <Card title="Évaluation pratique">
        <p className="hint" style={{ margin: 0 }}>
          Aucune grille d'évaluation pour {data.session?.title || "cette formation"}.
          {peutConfigurer && <> <Link to="/formations" className="card-more">La définir dans Formations →</Link></>}
        </p>
      </Card>
    );
  }
  if (!exercices.length) {
    return (
      <Card title={data.grille.label || "Évaluation pratique"}>
        <p className="hint" style={{ margin: 0 }}>
          La grille ne contient aucun exercice.
          {peutConfigurer && <> <Link to="/formations" className="card-more">La compléter dans Formations →</Link></>}
        </p>
      </Card>
    );
  }
  if (!stagiaires.length) {
    return (
      <Card title={data.grille.label || "Évaluation pratique"}>
        <p className="hint" style={{ margin: 0 }}>Aucun stagiaire inscrit à évaluer.</p>
      </Card>
    );
  }

  const seuil = data.grille.pass_score;
  const champ = (st, ex) => (
    <ChampNote key={`${st.enrollment_id}|${ex.id}`} ex={ex}
      note={st.notes ? st.notes[ex.id] : null}
      brouillon={brouillon[`${st.enrollment_id}|${ex.id}`]}
      occupe={enCours === `${st.enrollment_id}|${ex.id}`}
      onBrouillon={(v) => setBrouillon((b) => ({ ...b, [`${st.enrollment_id}|${ex.id}`]: v }))}
      onNoter={(v) => noter(st.enrollment_id, ex.id, v)} />
  );

  const exChoisi = exercices.find((e) => e.id === choisi) || exercices[0];
  const stChoisi = stagiaires.find((s) => s.enrollment_id === choisi) || stagiaires[0];

  return (
    <Card title={data.grille.label || "Évaluation pratique"}
      more={<span className="hint" style={{ margin: 0 }}>
        {exercices.length} exercice{exercices.length > 1 ? "s" : ""}
        {seuil != null && <> · réussite à {seuil} %</>}
      </span>}>
      <StatusMessage status={status} />

      <div className="seg" style={{ marginBottom: 12 }}>
        <button type="button" className={"seg-btn" + (sens === "exercice" ? " on" : "")} onClick={() => setSens("exercice")}>Par exercice</button>
        <button type="button" className={"seg-btn" + (sens === "stagiaire" ? " on" : "")} onClick={() => setSens("stagiaire")}>Par stagiaire</button>
      </div>

      {sens === "exercice" ? (
        <>
          <div className="eval-onglets" style={{ marginBottom: 10 }}>
            {exercices.map((ex) => {
              const faits = stagiaires.filter((s) => s.notes && s.notes[ex.id]).length;
              return (
                <button type="button" key={ex.id} onClick={() => setChoisi(ex.id)}
                  className={"btn sm" + (ex.id === exChoisi.id ? " primary" : " ghost")}
                  style={{ whiteSpace: "nowrap" }}>
                  {ex.label} <span className="arch-count">{faits}/{stagiaires.length}</span>
                </button>
              );
            })}
          </div>
          {exChoisi.consigne && <p className="hint" style={{ marginTop: 0 }}>{exChoisi.consigne}</p>}
          <Bareme ex={exChoisi} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {stagiaires.map((st) => (
              <div key={st.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
                <b style={{ flex: "1 1 160px", minWidth: 0 }}>{st.nom || "—"}</b>
                {champ(st, exChoisi)}
                <Totaux st={st} seuil={seuil} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="eval-onglets" style={{ marginBottom: 10 }}>
            {stagiaires.map((st) => (
              <button type="button" key={st.enrollment_id} onClick={() => setChoisi(st.enrollment_id)}
                className={"btn sm" + (st.enrollment_id === stChoisi.enrollment_id ? " primary" : " ghost")}
                style={{ whiteSpace: "nowrap" }}>
                {st.nom || "—"} <span className="arch-count">{st.totaux?.notes || 0}/{exercices.length}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <b style={{ flex: 1 }}>{stChoisi.nom}</b>
            <Totaux st={stChoisi} seuil={seuil} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {exercices.map((ex) => (
              <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <b>{ex.label}</b>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}><Bareme ex={ex} enLigne /></span>
                </span>
                {champ(stChoisi, ex)}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/** Le barème en une phrase — le formateur doit savoir ce qu'il saisit, pas le deviner. */
function Bareme({ ex, enLigne }) {
  let texte = "";
  if (ex.bareme === "POINTS") texte = `Note directe, sur ${ex.max_points} points.`;
  else if (ex.bareme === "BINAIRE") texte = `Acquis = ${ex.max_points} points, non acquis = 0.`;
  else if (ex.bareme === "TEMPS") {
    const p = [...lirePaliers(ex.paliers)].sort((a, b) => {
      if (a.max_s == null) return 1;
      if (b.max_s == null) return -1;
      return a.max_s - b.max_s;
    });
    texte = p.map((x) => (x.max_s == null ? `au-delà : ${x.points} pts` : `≤ ${dureeLisible(x.max_s)} : ${x.points} pts`)).join(" · ");
  } else if (ex.bareme === "NIVEAUX") {
    texte = lirePaliers(ex.paliers).map((x) => `${x.label} : ${x.points} pts`).join(" · ");
  }
  if (!texte) return null;
  if (enLigne) return <>{texte}</>;
  return <p className="hint" style={{ marginTop: 0 }}>{texte}</p>;
}

function Totaux({ st, seuil }) {
  const t = st.totaux || { points: 0, max: 0, percent: 0, notes: 0 };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="mono" style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
        {t.points} / {t.max || 0}
      </span>
      <ProgressPct percent={t.percent} width={64} titre={`${t.points} points sur ${t.max || 0} — ${t.notes} exercice(s) noté(s)`} />
      {/* « En cours » PLUTÔT QUE RIEN quand le verdict n'est pas prononçable : tant que tout
          n'est pas noté et que le seuil n'est pas déjà atteint, le serveur ne tranche pas —
          une case vide ferait croire à un oubli d'affichage. */}
      {seuil != null && (
        st.reussi === null || st.reussi === undefined
          ? <Badge tone="n" title="Tous les exercices ne sont pas notés">En cours</Badge>
          : <Badge tone={st.reussi ? "g" : "r"}>{st.reussi ? "Réussi" : "Échec"}</Badge>
      )}
    </span>
  );
}

/**
 * LE CHAMP DE SAISIE, une forme par barème. Il envoie la MESURE, jamais des points.
 *
 * Les listes (acquis / niveaux) enregistrent au CHANGEMENT, les champs libres à la SORTIE du
 * champ : enregistrer à chaque frappe enverrait « 1 », « 12 », « 120 » pour une seule durée,
 * et les deux premières valeurs seraient notées avant d'être corrigées.
 */
function ChampNote({ ex, note, brouillon, occupe, onBrouillon, onNoter }) {
  const valeur = note ? note.valeur : "";
  const points = note && note.points !== null && note.points !== undefined ? note.points : null;
  const marque = (
    <span className="mono" style={{ fontSize: 12, color: points === null ? "var(--muted)" : "var(--text)", minWidth: 58, textAlign: "right" }}>
      {occupe ? "…" : points === null ? "non noté" : `${points} pts`}
    </span>
  );

  if (ex.bareme === "BINAIRE" || ex.bareme === "NIVEAUX") {
    const options = ex.bareme === "BINAIRE"
      ? [{ v: "OUI", l: "Acquis" }, { v: "NON", l: "Non acquis" }]
      : lirePaliers(ex.paliers).map((p, i) => ({ v: String(i), l: p.label || `Niveau ${i + 1}` }));
    return (
      <>
        <select className="inp" style={{ width: 190 }} value={valeur == null ? "" : String(valeur)}
          onChange={(e) => onNoter(e.target.value)} disabled={occupe}>
          <option value="">— Non noté —</option>
          {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        {marque}
      </>
    );
  }

  if (ex.bareme === "TEMPS") {
    /* LA BASE STOCKE DES SECONDES, le formateur a tapé « 1:40 ». Réafficher « 100 » au
       rechargement lui ferait relire sa propre saisie dans une autre unité — et douter de ce
       qu'il a noté. On la lui rend telle qu'il l'a pensée. */
    const saisi = brouillon !== undefined ? brouillon : dureeSaisissable(valeur);
    const secondes = lireDuree(saisi);
    return (
      <>
        {/* PAS `inputMode="numeric"` — le pavé numérique d'un téléphone N'A PAS de deux-points.
            Le champ accepte pourtant « 12:33 », « 12'33 » et « 12m33 » : aucun de ces trois
            séparateurs n'était atteignable au doigt, et la notation se fait justement sur le
            terrain, au téléphone, chronomètre en main. Signalé le 2026-09-16.
            `text` ouvre un clavier complet, où le deux-points est à une bascule « 123 ».
            On a écarté `decimal`, qui garderait le pavé chiffré en ajoutant un séparateur
            décimal : « 12.5 » se lirait alors 12 min 05 s alors que tout le monde comprend
            12 min 30 s. Un raccourci qui ment à moitié est pire que deux taps de plus. */}
        <input className="inp" style={{ width: 96 }} value={saisi} placeholder="1:30" inputMode="text"
          onChange={(e) => onBrouillon(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onBlur={() => {
            const s = String(saisi).trim();
            if (s === "") { if (valeur !== "" && valeur != null) onNoter(""); return; }
            if (secondes === null) return; // saisie incompréhensible : on ne devine pas
            if (String(secondes) !== String(valeur)) onNoter(secondes);
          }}
          disabled={occupe} />
        {/* L'AIDE DIT LES DEUX CHEMINS. Un nombre nu vaut des SECONDES et n'a jamais eu besoin
            du deux-points : « 753 » note la même chose que « 12:33 ». Personne ne pouvait le
            deviner tant que l'aide n'annonçait que « min:s ». */}
        <span className="hint" style={{ margin: 0, minWidth: 96, fontSize: 12 }}>
          {saisi.trim() === "" ? "min:s — ou des secondes" : secondes === null ? "durée illisible" : `= ${dureeLisible(secondes)}`}
        </span>
        {marque}
      </>
    );
  }

  const saisi = brouillon !== undefined ? brouillon : (valeur === "" || valeur == null ? "" : String(valeur));
  return (
    <>
      <input className="inp" type="number" min="0" max={ex.max_points} style={{ width: 84 }} value={saisi}
        onChange={(e) => onBrouillon(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        onBlur={() => { if (String(saisi).trim() !== String(valeur == null ? "" : valeur)) onNoter(saisi); }}
        disabled={occupe} />
      <span className="hint" style={{ margin: 0, fontSize: 12 }}>/ {ex.max_points}</span>
      {marque}
    </>
  );
}

export default SessionEvaluation;
