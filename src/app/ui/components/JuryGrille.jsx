import { useEffect, useMemo, useState } from "react";
import Card from "./Card.jsx";
import Badge from "./Badge.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { Squelette } from "./Squelette.jsx";
import { Icon } from "./Icon.jsx";
import { getMaGrilleJury, noterJury, verdictJury } from "../api/apiClient.js";

/**
 * LA GRILLE DU JURY — l'écran du membre externe, dans son espace.
 *
 * IL COCHE, IL NE NOTE PAS. Chaque critère vaut 1 point : acquis, ou non. C'est la COMPÉTENCE
 * qui se valide, selon une règle que le serveur applique — « les 6 critères », « au moins 5
 * sur 6 dont C2.3 ». L'écran n'en refait aucun calcul : il affiche ce que le serveur a conclu
 * après chaque clic. Une seconde implémentation de la règle finirait par diverger, et c'est
 * l'écran qu'on croirait.
 *
 * UN CANDIDAT À LA FOIS, à la différence de l'écran du formateur. Le jury évalue une personne,
 * la regarde faire, écrit sa remarque, puis passe à la suivante — et le document qu'il signera
 * est nominatif.
 *
 * LA REMARQUE EST UNE COLONNE DE LA GRILLE PAPIER, pas un ajout : « Remarque / recommandation /
 * axe de progression éventuel ». Elle est souvent la seule chose que le candidat relira.
 */

const ETIQUETTE = { true: "Validée", false: "Non validée", null: "En cours" };
const TON = { true: "g", false: "r", null: "n" };

function JuryGrille({ sessionId }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [status, setStatus] = useState(null);
  const [candidat, setCandidat] = useState(null);
  const [occupe, setOccupe] = useState(null);       // critère en cours d'enregistrement
  const [remarques, setRemarques] = useState({});    // saisies en cours, clé exercice
  const [observations, setObservations] = useState("");

  async function charger(silencieux) {
    try {
      const r = await getMaGrilleJury(sessionId, silencieux);
      setData(r.data);
      setErreur(null);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); }, [sessionId]);

  const competences = useMemo(
    () => (data?.grille?.competences || []).filter((c) => c.active),
    [data]);
  const candidats = data?.stagiaires || [];

  /* Le premier candidat est ouvert d'office, et le choix NE SAUTE PAS à chaque coche : les
     résultats sont relus du serveur après chaque clic, donc cet effet se rejoue constamment. */
  useEffect(() => {
    const ids = candidats.map((s) => s.enrollment_id);
    if (!ids.includes(candidat)) setCandidat(ids[0] || null);
  }, [candidats, candidat]);

  const courant = candidats.find((s) => s.enrollment_id === candidat) || candidats[0] || null;
  const verdict = courant?.verdict || null;
  const fige = !!(verdict && verdict.cloture_le);

  useEffect(() => { setObservations(verdict?.observations || ""); }, [candidat, verdict?.observations]);

  async function cocher(exerciceId, valeur, commentaire) {
    if (!courant || fige) return;
    setOccupe(exerciceId);
    setStatus(null);
    try {
      await noterJury({
        enrollment_id: courant.enrollment_id, exercice_id: exerciceId, valeur,
        commentaire: commentaire === undefined ? undefined : commentaire,
      });
      await charger(true);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setOccupe(null); }
  }

  async function prononcer(patch) {
    if (!courant || fige) return;
    setStatus(null);
    try {
      await verdictJury({
        enrollment_id: courant.enrollment_id, grille_id: data.grille.id,
        avis: verdict?.avis || null, rattrapage: verdict?.rattrapage || 0,
        observations, ...patch,
      });
      await charger(true);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  if (erreur) return <Card title="Évaluation du jury"><p className="hint" style={{ margin: 0 }}>{erreur}</p></Card>;
  if (!data) return <Card title="Évaluation du jury"><Squelette lignes={2} h={48} /></Card>;
  if (!data.grille || !competences.length) return null; // pas de grille de jury : rien à montrer
  if (!candidats.length) {
    return <Card title={data.grille.label || "Évaluation du jury"}>
      <p className="hint" style={{ margin: 0 }}>Aucun candidat inscrit à cette session.</p>
    </Card>;
  }

  const jury = courant?.jury || { validees: 0, total: competences.length, complet: false, details: [] };

  return (
    <Card title={data.grille.label || "Évaluation du jury"}
      more={<span className="hint" style={{ margin: 0 }}>{data.session?.code} · {candidats.length} candidat{candidats.length > 1 ? "s" : ""}</span>}>
      <StatusMessage status={status} />

      <div className="eval-onglets" style={{ marginBottom: 10 }}>
        {candidats.map((s) => (
          <button type="button" key={s.enrollment_id} onClick={() => setCandidat(s.enrollment_id)}
            className={"btn sm" + (s.enrollment_id === courant.enrollment_id ? " primary" : " ghost")}
            style={{ whiteSpace: "nowrap" }}>
            {s.nom || "—"} <span className="arch-count">{s.jury?.validees ?? 0}/{competences.length}</span>
          </button>
        ))}
      </div>

      {fige && (
        <p className="hint" style={{ marginTop: 0, color: "var(--ember1)" }}>
          <Icon name="check-circle" size={14} /> Évaluation clôturée le {verdict.cloture_le} — la grille n'est plus modifiable.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {competences.map((c) => {
          const d = (jury.details || []).find((x) => x.id === c.id) || {};
          const criteres = (c.criteres || []).filter((x) => x.active);
          return (
            <div key={c.id} style={{ border: "1px solid var(--border-soft)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface2)", flexWrap: "wrap" }}>
                <b style={{ flex: "1 1 200px", minWidth: 0 }}>
                  {c.code ? <span className="mono" style={{ color: "var(--muted)" }}>{c.code} </span> : null}{c.label}
                </b>
                <span className="hint" style={{ margin: 0 }}>
                  {/* LA RÈGLE EST ÉCRITE, pas devinée. C'est ce que la grille papier imprime en
                      rouge sous chaque bloc ; sans elle, le jury ne sait pas quand il a fini. */}
                  {d.valides ?? 0} / {d.total ?? criteres.length} ·{" "}
                  {c.min_valides == null ? "tous requis" : `${c.min_valides} requis`}
                </span>
                <Badge tone={TON[String(d.validee)]}>{ETIQUETTE[String(d.validee)]}</Badge>
              </div>

              <div>
                {criteres.map((cr) => {
                  const note = courant.notes ? courant.notes[cr.id] : null;
                  const acquis = note && note.points === 1;
                  const rate = note && note.points === 0;
                  const cle = cr.id;
                  const remarque = remarques[cle] !== undefined ? remarques[cle] : (note?.commentaire || "");
                  return (
                    <div key={cr.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", borderTop: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
                      <span style={{ flex: "1 1 280px", minWidth: 0, fontSize: 14 }}>
                        {cr.label}
                        {/* OBLIGATOIRE : ce que la grille imprime en rouge. Sans lui, « 5 sur 6 »
                            et « 5 sur 6 dont le bon » seraient la même règle. */}
                        {cr.obligatoire ? <span style={{ color: "var(--ember1)", fontWeight: 700 }}> · obligatoire</span> : null}
                      </span>
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        <button type="button" disabled={fige || occupe === cr.id}
                          className={"btn sm" + (acquis ? " primary" : " ghost")}
                          onClick={() => cocher(cr.id, acquis ? "" : "OUI")}
                          title="Critère acquis">✓</button>
                        <button type="button" disabled={fige || occupe === cr.id}
                          className={"btn sm" + (rate ? " danger" : " ghost")}
                          onClick={() => cocher(cr.id, rate ? "" : "NON")}
                          title="Critère non acquis">✕</button>
                      </span>
                      <input className="inp" style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13 }}
                        placeholder="Remarque / axe de progression" value={remarque} disabled={fige || !note}
                        title={note ? "" : "Cochez d'abord le critère"}
                        onChange={(e) => setRemarques((r) => ({ ...r, [cle]: e.target.value }))}
                        onBlur={() => {
                          if (!note || remarque === (note.commentaire || "")) return;
                          setRemarques((r) => { const n = { ...r }; delete n[cle]; return n; });
                          cocher(cr.id, note.valeur, remarque);
                        }} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* LE PIED DE LA GRILLE PAPIER, dans le même ordre : le compte, puis l'avis, puis le
          rattrapage. Le compte se CALCULE ; l'avis et le rattrapage se PRONONCENT. */}
      <div style={{ marginTop: 14, borderTop: "2px solid var(--border-soft)", paddingTop: 12, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <b>Compétences validées : <span className="mono">{jury.validees} / {jury.total}</span></b>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          Avis
          <button type="button" disabled={fige} className={"btn sm" + (verdict?.avis === "FAVORABLE" ? " primary" : " ghost")}
            onClick={() => prononcer({ avis: verdict?.avis === "FAVORABLE" ? null : "FAVORABLE" })}>Favorable</button>
          <button type="button" disabled={fige} className={"btn sm" + (verdict?.avis === "DEFAVORABLE" ? " danger" : " ghost")}
            onClick={() => prononcer({ avis: verdict?.avis === "DEFAVORABLE" ? null : "DEFAVORABLE" })}>Défavorable</button>
        </span>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          <input type="checkbox" disabled={fige} checked={!!verdict?.rattrapage}
            onChange={(e) => prononcer({ rattrapage: e.target.checked ? 1 : 0 })} /> Rattrapage
        </label>
      </div>

      <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
        <label>Observations du jury</label>
        <textarea className="inp" rows={2} value={observations} disabled={fige}
          onChange={(e) => setObservations(e.target.value)}
          onBlur={() => { if (observations !== (verdict?.observations || "")) prononcer({}); }}
          placeholder="Axes de progression, réserves, motif d'un avis défavorable…" />
      </div>

      {!jury.complet && !fige && (
        <p className="hint" style={{ marginBottom: 0 }}>
          Il reste des critères à cocher : {jury.total - (jury.details || []).filter((d) => d.validee !== null).length} compétence(s) en cours.
        </p>
      )}
    </Card>
  );
}

export default JuryGrille;
