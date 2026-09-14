import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import HelpDot from "./HelpDot.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { Squelette } from "./Squelette.jsx";
import { getGrilleEvaluation, saveGrilleEvaluation } from "../api/apiClient.js";
import { secondesEnMinSec, minSecEnSecondes } from "../lib/format.js";

/**
 * GRILLE D'ÉVALUATION PRATIQUE D'UNE FORMATION — ce qu'on note, et comment on le compte.
 *
 * QUATRE BARÈMES, parce qu'on ne note pas un temps de façonnage comme un geste d'hygiène.
 * Le formateur saisira une MESURE (un chrono, une note, un geste acquis) ; c'est cette grille
 * qui dit ce que cette mesure vaut en points. Le calcul reste au serveur — l'écran ne fait
 * qu'afficher d'avance ce qu'il en fera.
 */
const BAREMES = [
  { value: "POINTS", label: "Points directs", aide: "Le formateur saisit un nombre de points, borné par le maximum." },
  { value: "TEMPS", label: "Temps → paliers", aide: "Le formateur saisit un chrono ; le palier atteint donne les points." },
  { value: "BINAIRE", label: "Acquis / non acquis", aide: "Acquis = le maximum, non acquis = zéro." },
  { value: "NIVEAUX", label: "Appréciation à niveaux", aide: "Une échelle nommée : chaque niveau vaut ses points." },
];
const AIDE_BAREME = Object.fromEntries(BAREMES.map((b) => [b.value, b.aide]));

const PALIERS_TEMPS = [{ max_s: 60, points: 100 }, { max_s: 120, points: 50 }, { max_s: null, points: 0 }];
const PALIERS_NIVEAUX = [
  { label: "Maîtrisé", points: 20 }, { label: "Acquis", points: 15 },
  { label: "En cours d'acquisition", points: 8 }, { label: "Non acquis", points: 0 },
];

/* Maximum RÉELLEMENT atteignable. Même règle qu'au serveur (api/lib/bareme.js) : sur un barème
   à paliers, le maximum EST le meilleur palier. Le recalculer ici évite d'annoncer un total
   que la saisie ne pourra jamais atteindre. */
function maximumExercice(ex) {
  if (ex.bareme === "TEMPS" || ex.bareme === "NIVEAUX") {
    const p = Array.isArray(ex.paliers) ? ex.paliers : [];
    if (!p.length) return Math.max(0, Number(ex.max_points) || 0);
    return p.reduce((m, x) => Math.max(m, Math.max(0, Number(x && x.points) || 0)), 0);
  }
  return Math.max(0, Number(ex.max_points) || 0);
}

const vide = () => ({ id: null, label: "", consigne: "", bareme: "POINTS", max_points: 20, paliers: [] });

function GrilleEvaluation({ programId, programTitle }) {
  const [chargement, setChargement] = useState(true);
  const [status, setStatus] = useState(null);
  const [label, setLabel] = useState("Évaluation pratique");
  const [seuil, setSeuil] = useState("");
  const [exercices, setExercices] = useState([]);
  const [ouvert, setOuvert] = useState(null); // exercice dont la consigne est dépliée

  useEffect(() => {
    let vivant = true;
    setChargement(true);
    getGrilleEvaluation(programId).then((r) => {
      if (!vivant) return;
      const g = r.data;
      if (g) {
        setLabel(g.label || "Évaluation pratique");
        setSeuil(g.pass_score == null ? "" : String(g.pass_score));
        /* Les exercices DÉSACTIVÉS ne remontent pas à l'écran : ils ne comptent plus, mais
           gardent leurs notes en base. Les réafficher inviterait à les réactiver par
           mégarde — et les renvoyer tels quels les ressusciterait à l'enregistrement. */
        setExercices((g.exercices || []).filter((e) => e.active).map((e) => ({
          ...e,
          consigne: e.consigne || "",
          paliers: (() => { try { return typeof e.paliers === "string" ? JSON.parse(e.paliers) || [] : (e.paliers || []); } catch { return []; } })(),
        })));
      }
      setChargement(false);
    }).catch((e) => {
      if (!vivant) return;
      setStatus({ type: "error", message: e.message });
      setChargement(false);
    });
    return () => { vivant = false; };
  }, [programId]);

  const maj = (i, patch) => setExercices((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const majPalier = (i, j, patch) => setExercices((xs) => xs.map((x, k) => (k === i
    ? { ...x, paliers: x.paliers.map((p, m) => (m === j ? { ...p, ...patch } : p)) } : x)));

  /* CHANGER DE BARÈME sème des paliers plausibles plutôt qu'un tableau vide : une grille de
     temps sans palier ne note rien, et l'exemple montre en une ligne ce qu'on attend. */
  function changerBareme(i, bareme) {
    const ex = exercices[i];
    const paliers = bareme === "TEMPS"
      ? (ex.bareme === "TEMPS" && ex.paliers.length ? ex.paliers : PALIERS_TEMPS.map((p) => ({ ...p })))
      : bareme === "NIVEAUX"
        ? (ex.bareme === "NIVEAUX" && ex.paliers.length ? ex.paliers : PALIERS_NIVEAUX.map((p) => ({ ...p })))
        : [];
    maj(i, { bareme, paliers });
  }

  function deplacer(i, delta) {
    setExercices((xs) => {
      const j = i + delta;
      if (j < 0 || j >= xs.length) return xs;
      const out = [...xs];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  }

  function retirer(i) {
    const ex = exercices[i];
    /* UN EXERCICE DÉJÀ NOTÉ ne disparaît pas : le serveur le DÉSACTIVE, ses notes restent
       lisibles sur les dossiers évalués. On le dit — « supprimer » laisserait croire que les
       notes partent avec. */
    const msg = ex.id
      ? `Retirer « ${ex.label || "cet exercice"} » de la grille ?\n\nLes notes déjà saisies restent enregistrées sur les dossiers concernés ; l'exercice cesse simplement de compter.`
      : "Retirer cet exercice ?";
    if (!window.confirm(msg)) return;
    setExercices((xs) => xs.filter((_, k) => k !== i));
  }

  const total = exercices.reduce((s, ex) => s + maximumExercice(ex), 0);

  async function enregistrer() {
    const manquant = exercices.findIndex((e) => !String(e.label).trim());
    if (manquant >= 0) { setStatus({ type: "error", message: `Nommez l'exercice n° ${manquant + 1}.` }); return; }
    setStatus(null);
    try {
      const r = await saveGrilleEvaluation(programId, {
        label,
        pass_score: seuil === "" ? null : Number(seuil),
        exercices: exercices.map((e) => ({
          id: e.id, label: e.label, consigne: e.consigne || null,
          bareme: e.bareme, max_points: e.max_points, paliers: e.paliers,
        })),
      });
      /* On REPREND les identifiants renvoyés : sans cela, un deuxième enregistrement
         recréerait les exercices tout juste créés au lieu de les mettre à jour. */
      const g = r.data;
      if (g) setExercices((g.exercices || []).filter((e) => e.active).map((e) => ({
        ...e, consigne: e.consigne || "",
        paliers: (() => { try { return typeof e.paliers === "string" ? JSON.parse(e.paliers) || [] : (e.paliers || []); } catch { return []; } })(),
      })));
      setStatus({ type: "success", message: "Grille enregistrée." });
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    }
  }

  if (chargement) return <Squelette lignes={3} h={64} />;

  return (
    <>
      <StatusMessage status={status} />
      <p className="hint" style={{ marginTop: 0 }}>
        Ce que le formateur notera sur le terrain pour {programTitle ? <b>{programTitle}</b> : "cette formation"}, et ce que chaque mesure vaut en points.
        Il saisira un chrono ou une appréciation&nbsp;: <b>les points sont calculés ici</b>, jamais tapés à la main.
      </p>

      <div className="row2" style={{ alignItems: "flex-start" }}>
        <div className="field">
          <label>Intitulé de la grille</label>
          <input className="inp" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Évaluation pratique" />
        </div>
        <div className="field">
          <label>
            Seuil de réussite (%)
            <HelpDot text={"Pourcentage du total à atteindre pour que l'évaluation soit réussie.\n\nLaisser vide : la grille compte les points sans prononcer de réussite.\n\nTant que tous les exercices ne sont pas notés, l'échec n'est jamais prononcé — un stagiaire à mi-parcours n'a pas échoué, il n'a pas fini."} />
          </label>
          <input className="inp" type="number" min="0" max="100" value={seuil} placeholder="Aucun"
            onChange={(e) => setSeuil(e.target.value)} style={{ maxWidth: 140 }} />
        </div>
      </div>

      {exercices.length === 0 ? (
        <p className="hint">Aucun exercice. Ajoutez-en un ci-dessous.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {exercices.map((ex, i) => {
            const max = maximumExercice(ex);
            return (
              <div key={ex.id || `n${i}`} style={{ border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, background: "var(--surface2)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="arch-count" title={`Exercice ${i + 1}`}>{i + 1}</span>
                  <input className="inp" style={{ flex: "1 1 220px", minWidth: 0 }} value={ex.label}
                    onChange={(e) => maj(i, { label: e.target.value })} placeholder="Façonnage d'un pâton, étalage…" />
                  <select className="inp" style={{ width: 190 }} value={ex.bareme} onChange={(e) => changerBareme(i, e.target.value)}>
                    {BAREMES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                  {(ex.bareme === "POINTS" || ex.bareme === "BINAIRE") && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
                      sur
                      <input className="inp" type="number" min="0" style={{ width: 78 }} value={ex.max_points ?? 0}
                        onChange={(e) => maj(i, { max_points: e.target.value })} />
                      pts
                    </label>
                  )}
                  {(ex.bareme === "TEMPS" || ex.bareme === "NIVEAUX") && (
                    <span className="hint" style={{ margin: 0 }}>max&nbsp;<b>{max}</b>&nbsp;pts</span>
                  )}
                  <button type="button" className="iconbtn" title="Consigne" onClick={() => setOuvert(ouvert === i ? null : i)}>
                    <Icon name="pencil" size={15} />
                  </button>
                  <button type="button" className="iconbtn" title="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}>↑</button>
                  <button type="button" className="iconbtn" title="Descendre" disabled={i === exercices.length - 1} onClick={() => deplacer(i, 1)}>↓</button>
                  <button type="button" className="iconbtn del" title="Retirer" onClick={() => retirer(i)}><Icon name="trash" size={15} /></button>
                </div>

                <p className="hint" style={{ margin: "6px 0 0" }}>{AIDE_BAREME[ex.bareme]}</p>

                {ouvert === i && (
                  <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
                    <label>Consigne donnée au stagiaire (facultative)</label>
                    <textarea className="inp" rows={2} value={ex.consigne}
                      onChange={(e) => maj(i, { consigne: e.target.value })}
                      placeholder="Façonner un pâton de 250 g, four à 450 °C." />
                  </div>
                )}

                {ex.bareme === "TEMPS" && (
                  <PaliersTemps paliers={ex.paliers}
                    onChange={(j, patch) => majPalier(i, j, patch)}
                    onAdd={() => maj(i, { paliers: [...ex.paliers, { max_s: 180, points: 0 }] })}
                    onRemove={(j) => maj(i, { paliers: ex.paliers.filter((_, m) => m !== j) })} />
                )}
                {ex.bareme === "NIVEAUX" && (
                  <PaliersNiveaux paliers={ex.paliers}
                    onChange={(j, patch) => majPalier(i, j, patch)}
                    onAdd={() => maj(i, { paliers: [...ex.paliers, { label: "", points: 0 }] })}
                    onRemove={(j) => maj(i, { paliers: ex.paliers.filter((_, m) => m !== j) })} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" className="btn sm ghost" onClick={() => setExercices((xs) => [...xs, vide()])}>＋ Ajouter un exercice</button>
        <span className="hint" style={{ margin: 0 }}>
          Total de la grille&nbsp;: <b>{total}</b> pts
          {seuil !== "" && total > 0 && <> · réussite à partir de <b>{Math.ceil((total * Number(seuil)) / 100)}</b> pts</>}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={enregistrer}>Enregistrer la grille</button>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        La saisie des notes se fait ensuite depuis la page d'une session de cette formation.
      </p>
    </>
  );
}

/* PALIERS DE TEMPS. Le dernier palier est « au-delà », sans borne : il doit exister, sinon une
   performance plus lente que tout le reste ne correspondrait à rien. On le rend donc distinct
   et non supprimable, plutôt que de laisser saisir une borne vide qui n'en aurait pas l'air. */
function PaliersTemps({ paliers, onChange, onAdd, onRemove }) {
  const bornes = paliers.filter((p) => p.max_s !== null && p.max_s !== undefined && p.max_s !== "");
  const auDela = paliers.find((p) => p.max_s === null || p.max_s === undefined || p.max_s === "");
  const idx = (p) => paliers.indexOf(p);
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {bornes.map((p) => {
        const { min, sec } = secondesEnMinSec(p.max_s);
        const i = idx(p);
        return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ color: "var(--muted)", width: 64 }}>jusqu'à</span>
            <input className="inp" type="number" min="0" style={{ width: 62 }} value={min}
              onChange={(e) => onChange(i, { max_s: minSecEnSecondes(e.target.value, sec) })} />
            <span style={{ color: "var(--muted)" }}>min</span>
            <input className="inp" type="number" min="0" max="59" style={{ width: 62 }} value={sec}
              onChange={(e) => onChange(i, { max_s: minSecEnSecondes(min, e.target.value) })} />
            <span style={{ color: "var(--muted)" }}>s&nbsp;→</span>
            <input className="inp" type="number" min="0" style={{ width: 78 }} value={p.points ?? 0}
              onChange={(e) => onChange(i, { points: e.target.value })} />
            <span style={{ color: "var(--muted)" }}>pts</span>
            <button type="button" className="iconbtn del" title="Retirer ce palier" onClick={() => onRemove(i)}><Icon name="trash" size={14} /></button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span style={{ color: "var(--muted)", width: 64 }}>au-delà</span>
        <span className="hint" style={{ margin: 0, width: 200 }}>(toute durée plus longue)</span>
        <span style={{ color: "var(--muted)" }}>→</span>
        <input className="inp" type="number" min="0" style={{ width: 78 }} value={auDela ? auDela.points ?? 0 : 0}
          onChange={(e) => (auDela ? onChange(idx(auDela), { points: e.target.value }) : null)} disabled={!auDela} />
        <span style={{ color: "var(--muted)" }}>pts</span>
        <button type="button" className="btn sm ghost" onClick={onAdd}>＋ Palier</button>
      </div>
    </div>
  );
}

function PaliersNiveaux({ paliers, onChange, onAdd, onRemove }) {
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {paliers.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
          <input className="inp" style={{ flex: "1 1 180px", minWidth: 0 }} value={p.label || ""}
            onChange={(e) => onChange(i, { label: e.target.value })} placeholder="Acquis, En cours…" />
          <span style={{ color: "var(--muted)" }}>→</span>
          <input className="inp" type="number" min="0" style={{ width: 78 }} value={p.points ?? 0}
            onChange={(e) => onChange(i, { points: e.target.value })} />
          <span style={{ color: "var(--muted)" }}>pts</span>
          <button type="button" className="iconbtn del" title="Retirer ce niveau" onClick={() => onRemove(i)}><Icon name="trash" size={14} /></button>
        </div>
      ))}
      <div><button type="button" className="btn sm ghost" onClick={onAdd}>＋ Niveau</button></div>
    </div>
  );
}

export default GrilleEvaluation;
