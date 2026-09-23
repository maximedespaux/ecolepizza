import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import HelpDot from "./HelpDot.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { Squelette } from "./Squelette.jsx";
import { getGrilleEvaluation, saveGrilleEvaluation, retirerGrilleEvaluation, getTemplates, poserModelesJury } from "../api/apiClient.js";
import { grilleDepart } from "../lib/grilleRS7404.js";
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

/**
 * PLUSIEURS GRILLES POUR UNE MÊME FORMATION, côté formateur (2026-09-23). `grilleId` dit laquelle
 * on configure : un identifiant, `"nouvelle"` pour une grille encore vierge, ou rien pour la
 * première. `onGrilles` remonte la liste au parent, qui affiche le choix — c'est le MÊME appel
 * qui charge la grille et donne la liste, donc rien à recharger pour savoir s'il y en a deux.
 */
function GrilleEvaluation({ programId, programTitle, role = "FORMATEUR", grilleId = null, onGrilles }) {
  const jury = role === "JURY";
  const neuve = grilleId === "nouvelle";
  const [idCourant, setIdCourant] = useState(neuve ? null : grilleId);
  const [grilles, setGrilles] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [status, setStatus] = useState(null);
  const [label, setLabel] = useState("Évaluation pratique");
  const [seuil, setSeuil] = useState("");
  const [exercices, setExercices] = useState([]);
  const [ouvert, setOuvert] = useState(null); // exercice dont la consigne est dépliée
  const [competences, setCompetences] = useState([]);
  const [slug, setSlug] = useState("");        // modèle de document produit à la clôture
  const [modeles, setModeles] = useState([]);

  useEffect(() => {
    let vivant = true;
    /* UNE GRILLE ENCORE VIERGE NE SE CHARGE PAS : elle n'existe qu'à l'enregistrement. On part
       d'un écran vide, avec l'intitulé à écrire — c'est lui qui la distinguera des autres. */
    if (neuve) {
      setLabel(""); setSeuil(""); setSlug("");
      setExercices([]); setCompetences([]); setIdCourant(null); setChargement(false);
      return () => { vivant = false; };
    }
    setChargement(true);
    getGrilleEvaluation(programId, role, grilleId).then((r) => {
      if (!vivant) return;
      const g = r.data;
      setGrilles(r.grilles || []);
      if (onGrilles) onGrilles(r.grilles || [], g ? g.id : null);
      setIdCourant(g ? g.id : null);
      if (g) {
        setLabel(g.label || "Évaluation pratique");
        setSeuil(g.pass_score == null ? "" : String(g.pass_score));
        setSlug(g.template_slug || "");
        /* Même règle que pour les exercices : les compétences DÉSACTIVÉES ne remontent pas —
           les renvoyer telles quelles les ressusciterait à l'enregistrement. */
        setCompetences((g.competences || []).filter((c) => c.active).map((c) => ({
          ...c, criteres: (c.criteres || []).filter((x) => x.active).map((x) => ({ ...x })),
        })));
        /* Les exercices DÉSACTIVÉS ne remontent pas à l'écran : ils ne comptent plus, mais
           gardent leurs notes en base. Les réafficher inviterait à les réactiver par
           mégarde — et les renvoyer tels quels les ressusciterait à l'enregistrement. */
        /* `!e.competence_id` : LES CRITÈRES SONT DES EXERCICES, mais ils appartiennent à leur
           compétence et sont renvoyés par elle. Sans cette exclusion ils remontaient AUSSI dans
           la liste plate et repartaient en double à l'enregistrement — une fois comme critère,
           une fois comme exercice libre, donc détachés de leur compétence. */
        setExercices((g.exercices || []).filter((e) => e.active && !e.competence_id).map((e) => ({
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
    /* `onGrilles` N'EST PAS DANS LES DÉPENDANCES, et c'est voulu : c'est une fonction du parent,
       recréée à chaque rendu. La suivre relancerait le chargement à chaque rendu du parent —
       donc en boucle, puisque ce chargement appelle `onGrilles`, qui fait rendre le parent.
       `neuve` n'est qu'une lecture de `grilleId`, déjà dans la liste. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, role, grilleId]);

  /* Les modèles ne servent qu'à DEUX cas : la grille de jury (son document de clôture) et une
     formation à plusieurs grilles, où il faut dire quel document imprime laquelle. Ailleurs, on
     ne charge rien — un formateur à grille unique n'a aucun choix à faire. */
  useEffect(() => {
    if (!jury && grilles.length < 2) return;
    getTemplates().then((r) => setModeles(r.data || [])).catch(() => {});
  }, [jury, grilles.length]);

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

  /* Pose le modèle livré, puis le sélectionne : l'utilisateur voulait un document, pas une
     liste rafraîchie. */
  async function poserModele() {
    setStatus(null);
    try {
      const r = await poserModelesJury();
      const rt = await getTemplates();
      setModeles(rt.data || []);
      setSlug("grille-jury");
      setStatus({ type: "success", message: (r.data?.poses || []).length
        ? "Modèle « Grille d'évaluation du jury » créé. Vous pouvez le retoucher dans Modèles."
        : "Le modèle existait déjà, il n'a pas été modifié." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function enregistrer() {
    if (jury) {
      const c = competences.findIndex((x) => !String(x.label).trim());
      if (c >= 0) { setStatus({ type: "error", message: `Nommez la compétence n° ${c + 1}.` }); return; }
      const vide = competences.find((x) => (x.criteres || []).some((y) => !String(y.label).trim()));
      if (vide) { setStatus({ type: "error", message: `Un critère de « ${vide.label} » n'a pas d'intitulé.` }); return; }
    } else {
      const manquant = exercices.findIndex((e) => !String(e.label).trim());
      if (manquant >= 0) { setStatus({ type: "error", message: `Nommez l'exercice n° ${manquant + 1}.` }); return; }
    }
    setStatus(null);
    try {
      const r = await saveGrilleEvaluation(programId, {
        role,
        /* L'IDENTIFIANT DIT QUELLE GRILLE ON ÉCRIT, et `nouvelle` en demande une de plus. Sans
           l'un ni l'autre, le serveur reprend la première — ce qu'il faisait déjà, et ce qui
           reste juste pour le jury, qui n'en a qu'une. */
        id: neuve ? undefined : (idCourant || undefined),
        nouvelle: neuve ? true : undefined,
        label,
        pass_score: seuil === "" ? null : Number(seuil),
        template_slug: jury || grilles.length > 1 ? (slug || null) : undefined,
        competences: jury ? competences.map((c) => ({
          id: c.id, code: c.code, label: c.label, min_valides: c.min_valides,
          criteres: (c.criteres || []).map((x) => ({ id: x.id, label: x.label, obligatoire: x.obligatoire ? 1 : 0 })),
        })) : undefined,
        exercices: exercices.map((e) => ({
          id: e.id, label: e.label, consigne: e.consigne || null,
          bareme: e.bareme, max_points: e.max_points, paliers: e.paliers,
        })),
      });
      /* On REPREND les identifiants renvoyés : sans cela, un deuxième enregistrement
         recréerait les exercices tout juste créés au lieu de les mettre à jour. */
      const g = r.data;
      setGrilles(r.grilles || []);
      if (onGrilles) onGrilles(r.grilles || [], g ? g.id : null);
      if (g) {
        /* ON REPREND AUSSI L'IDENTIFIANT DE LA GRILLE : une grille tout juste créée n'en avait
           pas, et un second « Enregistrer » en créerait une deuxième, identique. */
        setIdCourant(g.id);
        setExercices((g.exercices || []).filter((e) => e.active && !e.competence_id).map((e) => ({
          ...e, consigne: e.consigne || "",
          paliers: (() => { try { return typeof e.paliers === "string" ? JSON.parse(e.paliers) || [] : (e.paliers || []); } catch { return []; } })(),
        })));
        setCompetences((g.competences || []).filter((c) => c.active).map((c) => ({
          ...c, criteres: (c.criteres || []).filter((x) => x.active).map((x) => ({ ...x })),
        })));
      }
      setStatus({ type: "success", message: "Grille enregistrée." });
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    }
  }

  /* RETIRER N'EST OFFERT QUE S'IL EN RESTE UNE : une formation sans grille ne note plus rien, et
     ce serait un effacement déguisé. La grille est désactivée, ses notes restent lisibles. */
  const peutRetirer = !jury && !neuve && !!idCourant && grilles.length > 1;
  async function retirerLaGrille() {
    const nom = label || "cette grille";
    if (!window.confirm(`Retirer « ${nom} » de cette formation ?\n\nLes notes déjà saisies restent lisibles sur les dossiers évalués ; la grille cesse d'être proposée.`)) return;
    setStatus(null);
    try {
      await retirerGrilleEvaluation(idCourant);
      const r = await getGrilleEvaluation(programId, role);
      setGrilles(r.grilles || []);
      if (onGrilles) onGrilles(r.grilles || [], r.data ? r.data.id : null);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  if (chargement) return <Squelette lignes={3} h={64} />;

  return (
    <>
      <StatusMessage status={status} />
      <p className="hint" style={{ marginTop: 0 }}>
        {jury ? (
          <>Ce que le jury cochera le jour de l'examen pour {programTitle ? <b>{programTitle}</b> : "cette formation"}.
            Chaque critère vaut <b>1 point</b>&nbsp;: acquis ou non. C'est la <b>compétence</b> qui se valide,
            selon la règle que vous posez ci-dessous.</>
        ) : (
          <>Ce que le formateur notera sur le terrain pour {programTitle ? <b>{programTitle}</b> : "cette formation"}, et ce que chaque mesure vaut en points.
            Il saisira un chrono ou une appréciation&nbsp;: <b>les points sont calculés ici</b>, jamais tapés à la main.</>
        )}
      </p>

      <div className="row2" style={{ alignItems: "flex-start" }}>
        <div className="field">
          <label>Intitulé de la grille</label>
          <input className="inp" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder={jury ? "Grille d'évaluation — jury" : "Évaluation pratique"} />
        </div>
        {!jury && grilles.length > 1 ? (
          /* QUAND UNE FORMATION A PLUSIEURS GRILLES, un document qui porte {NoteTotale} doit
             savoir LAQUELLE il imprime : deux grilles n'ont ni le même maximum ni le même sens,
             et rien sur le papier ne dirait que c'est l'autre. Le modèle désigné ici reçoit les
             résultats de cette grille ; les autres documents retombent sur la première. */
          <div className="field">
            <label>
              Document qui imprime cette grille
              <HelpDot text={"Cette formation a plusieurs grilles. Un document porteur des jetons {NoteTotale}, {NoteDétail}… imprime par défaut la PREMIÈRE.\n\nDésignez ici le modèle qui doit imprimer celle-ci : il recevra alors ses exercices, ses points et son seuil.\n\nLaisser vide : cette grille ne s'imprime sur aucun document particulier."} />
            </label>
            <select className="inp" value={slug} onChange={(e) => setSlug(e.target.value)}>
              <option value="">Aucun document</option>
              {modeles.map((m) => <option key={m.slug} value={m.slug}>{m.label || m.title || m.slug}</option>)}
            </select>
          </div>
        ) : jury ? (
          <div className="field">
            <label>
              Document produit à la clôture
              <HelpDot text={"Le modèle imprimé quand le jury clôture l'évaluation d'un candidat.\n\nIl reçoit les jetons de la grille ({JuryDétail}, {JuryCompétences}, {JuryAvis}) et se fait signer par les membres du jury, le stagiaire et l'organisme.\n\nLaisser vide : la grille se remplit quand même, elle n'imprime simplement rien."} />
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select className="inp" style={{ flex: 1, minWidth: 0 }} value={slug} onChange={(e) => setSlug(e.target.value)}>
                <option value="">Aucun document</option>
                {modeles.map((m) => <option key={m.slug} value={m.slug}>{m.label || m.title || m.slug}</option>)}
              </select>
              {/* LE MODÈLE MANQUE AU MOMENT OÙ ON LE CHERCHE : le poser depuis la liste
                  déroulante évite d'aller le monter dans un autre écran puis de revenir.
                  Il n'écrase jamais un modèle existant — le serveur le dit. */}
              {!modeles.some((m) => m.slug === "grille-jury") && (
                <button type="button" className="btn sm ghost" onClick={poserModele}>Créer le modèle</button>
              )}
            </div>
          </div>
        ) : (
          <div className="field">
            <label>
              Seuil de réussite (%)
              <HelpDot text={"Pourcentage du total à atteindre pour que l'évaluation soit réussie.\n\nLaisser vide : la grille compte les points sans prononcer de réussite.\n\nTant que tous les exercices ne sont pas notés, l'échec n'est jamais prononcé — un stagiaire à mi-parcours n'a pas échoué, il n'a pas fini."} />
            </label>
            <input className="inp" type="number" min="0" max="100" value={seuil} placeholder="Aucun"
              onChange={(e) => setSeuil(e.target.value)} style={{ maxWidth: 140 }} />
          </div>
        )}
      </div>

      {jury && (
        <CompetencesEditor competences={competences} onChange={setCompetences}
          onSemer={() => setCompetences(grilleDepart())} />
      )}

      {jury ? null : exercices.length === 0 ? (
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
        {!jury && (
          <button type="button" className="btn sm ghost" onClick={() => setExercices((xs) => [...xs, vide()])}>＋ Ajouter un exercice</button>
        )}
        <span className="hint" style={{ margin: 0 }}>
          {jury ? (
            <>{competences.length} compétence{competences.length > 1 ? "s" : ""} ·{" "}
              {competences.reduce((n, c) => n + (c.criteres || []).length, 0)} critères</>
          ) : (
            <>Total de la grille&nbsp;: <b>{total}</b> pts
              {seuil !== "" && total > 0 && <> · réussite à partir de <b>{Math.ceil((total * Number(seuil)) / 100)}</b> pts</>}</>
          )}
        </span>
        <span style={{ flex: 1 }} />
        {peutRetirer && (
          <button type="button" className="btn ghost" onClick={retirerLaGrille}>
            <Icon name="trash" size={14} /> Retirer cette grille
          </button>
        )}
        <button type="button" className="btn primary" onClick={enregistrer}>
          {neuve ? "Créer la grille" : "Enregistrer la grille"}
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        {jury
          ? "Le jury remplit ensuite cette grille depuis son espace intervenant, sur les sessions où il est affecté."
          : "La saisie des notes se fait ensuite depuis la page d'une session de cette formation."}
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

/**
 * LES COMPÉTENCES DU JURY — des critères cochables, et la règle qui les valide.
 *
 * LA RÈGLE EST LE CŒUR DE L'ÉCRAN, pas un réglage de coin. « Le candidat doit valider les 6
 * critères » et « au moins 5 sur 6, dont C2.3 » sont deux règles que rien d'autre ne distingue :
 * même nombre de critères, même compte, verdicts opposés. Elle est donc posée en clair sur
 * chaque compétence, dans les mots de la grille papier.
 */
function CompetencesEditor({ competences, onChange, onSemer }) {
  const maj = (i, patch) => onChange(competences.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const majCrit = (i, j, patch) => maj(i, {
    criteres: competences[i].criteres.map((x, m) => (m === j ? { ...x, ...patch } : x)),
  });
  const deplacer = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= competences.length) return;
    const out = [...competences];
    [out[i], out[j]] = [out[j], out[i]];
    onChange(out);
  };
  const retirer = (i) => {
    const c = competences[i];
    /* On DIT ce qui arrive aux notes : le serveur désactive, il ne supprime pas. « Supprimer »
       tout court laisserait croire que les évaluations déjà passées perdent leur trace. */
    const msg = c.id
      ? `Retirer « ${c.label || "cette compétence"} » de la grille ?\n\nLes évaluations déjà passées la gardent ; elle cesse simplement de compter pour les suivantes.`
      : "Retirer cette compétence ?";
    if (!window.confirm(msg)) return;
    onChange(competences.filter((_, k) => k !== i));
  };

  if (!competences.length) {
    return (
      <div style={{ border: "1px dashed var(--border-soft)", borderRadius: 10, padding: 16, textAlign: "center" }}>
        <p className="hint" style={{ marginTop: 0 }}>Aucune compétence.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn sm ghost" onClick={() => onChange([nouvelleCompetence(1)])}>＋ Ajouter une compétence</button>
          {/* PARTIR DU DOCUMENT EXISTANT plutôt que d'une page blanche : sept compétences et
              trente-huit critères aux libellés longs, c'est une demi-journée de saisie — et une
              faute de frappe dans un critère d'examen ne se voit qu'à la contestation. */}
          <button type="button" className="btn sm" onClick={onSemer}>Partir de la grille RS7404</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {competences.map((c, i) => {
        const n = (c.criteres || []).length;
        return (
          <div key={c.id || `c${i}`} style={{ border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, background: "var(--surface2)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="inp mono" style={{ width: 70 }} value={c.code || ""} placeholder="C1"
                onChange={(e) => maj(i, { code: e.target.value })} aria-label="Code de la compétence" />
              <input className="inp" style={{ flex: "1 1 220px", minWidth: 0 }} value={c.label}
                onChange={(e) => maj(i, { label: e.target.value })} placeholder="Fabriquer une pâte à pizza artisanale" />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
                valider
                <select className="inp" style={{ width: 130 }}
                  value={c.min_valides == null ? "" : String(c.min_valides)}
                  onChange={(e) => maj(i, { min_valides: e.target.value === "" ? null : Number(e.target.value) })}>
                  {/* « TOUS » N'EST PAS « N = le nombre actuel ». Écrire 6 en dur deviendrait faux
                      en silence au septième critère ajouté ; « tous » reste juste. */}
                  <option value="">tous les critères</option>
                  {Array.from({ length: Math.max(n, 1) }, (_, k) => k + 1).map((k) => (
                    <option key={k} value={k}>au moins {k} sur {n}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="iconbtn" title="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}>↑</button>
              <button type="button" className="iconbtn" title="Descendre" disabled={i === competences.length - 1} onClick={() => deplacer(i, 1)}>↓</button>
              <button type="button" className="iconbtn del" title="Retirer" onClick={() => retirer(i)}><Icon name="trash" size={15} /></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {(c.criteres || []).map((cr, j) => (
                <div key={cr.id || `x${j}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <textarea className="inp" rows={1} style={{ flex: 1, minWidth: 0, resize: "vertical" }}
                    value={cr.label} onChange={(e) => majCrit(i, j, { label: e.target.value })}
                    placeholder="C1.1 - Utilisation correcte des ingrédients de base…" />
                  {/* OBLIGATOIRE : ce que la grille papier imprime en rouge. Sans lui, « 5 sur 6 »
                      et « 5 sur 6 dont le bon » seraient la même règle. */}
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: cr.obligatoire ? "var(--ember1)" : "var(--muted)", whiteSpace: "nowrap" }}
                    title="Sans ce critère, la compétence tombe quel que soit le compte">
                    <input type="checkbox" checked={!!cr.obligatoire}
                      onChange={(e) => majCrit(i, j, { obligatoire: e.target.checked ? 1 : 0 })} />
                    obligatoire
                  </label>
                  <button type="button" className="iconbtn del" title="Retirer ce critère"
                    onClick={() => maj(i, { criteres: c.criteres.filter((_, m) => m !== j) })}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
              <div>
                <button type="button" className="btn sm ghost"
                  onClick={() => maj(i, { criteres: [...(c.criteres || []), { id: null, label: "", obligatoire: 0 }] })}>
                  ＋ Critère
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <div>
        <button type="button" className="btn sm ghost"
          onClick={() => onChange([...competences, nouvelleCompetence(competences.length + 1)])}>
          ＋ Ajouter une compétence
        </button>
      </div>
    </div>
  );
}

const nouvelleCompetence = (n) => ({ id: null, code: `C${n}`, label: "", min_valides: null, criteres: [] });

export default GrilleEvaluation;
