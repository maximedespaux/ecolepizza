import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { PRESETS, SUBSTITUTIONS, LEVURE_TYPES, LEVURE_TABLE, recoLevure, yeastLabel } from "../lib/dough.js";
import { useEchap } from "../lib/useEchap.js";

/**
 * « COMPLÈTE LA PÂTE » — la fiche d'empâtement, cinq fois, en grammes.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ON Y APPREND, ET QUI NE S'APPREND PAS AILLEURS DANS L'ARCADE.
 *
 * Le pourcentage boulanger se calcule TOUJOURS sur le poids de farine, jamais sur le poids
 * total : 2 % de sel sur 2 kg de farine font 40 g, quelle que soit l'eau. C'est l'erreur de
 * débutant la plus tenace, et elle ne se voit qu'en pesant.
 *
 * ET LA LEVURE SE DOSE À DEUX ENTRÉES, pas une : la TEMPÉRATURE de la farine (plus elle est
 * chaude, moins on en met — manuel p.21) ET le TYPE. « Fraîche = sèche active ; sèche
 * instantanée = moitié » : une conversion ratée double ou divise par deux la fermentation, et
 * la pâte est perdue avant même le pointage. C'est le seul ingrédient dont la quantité dépend
 * d'autre chose que du poids de farine.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * AUCUNE VALEUR N'EST INVENTÉE. Les pourcentages d'hydratation, de sel et d'huile viennent de
 * `PRESETS` ; le dosage de la levure de `LEVURE_TABLE` (manuel p.21) via `recoLevure` ; les
 * compléments de bassinage de `SUBSTITUTIONS` (manuel p.32). Le jeu tire un énoncé et vérifie
 * une pesée.
 *
 * DEUX CONTRAINTES DE TIRAGE, qui viennent d'un contrôle exhaustif des 2 925 énoncés possibles :
 *  · la farine est un MULTIPLE DE 2 000 g — sinon la sèche instantanée à 0,175 % tombe sur deux
 *    décimales (1,75 g sur 1 kg), ce qu'on ne demande à personne de saisir ;
 *  · tout le reste tient sur une décimale au plus. La levure se pèse au dixième de gramme : ce
 *    n'est pas une concession, c'est le geste réel.
 *
 * L'HUILE PEUT VALOIR ZÉRO, et c'est voulu : une napolitaine n'en porte pas. Répondre « 0 » est
 * la bonne réponse, et le savoir fait partie du métier.
 */

const MANCHES = 5;
const POINTS_MAX = MANCHES * 4;
const etoilesPour = (p) => (p >= 18 ? 3 : p >= 11 ? 2 : p >= 5 ? 1 : 0);

const FARINES = [2000, 4000, 6000];
/* Les températures tombent une par tranche de `LEVURE_TABLE` : on balaie la table plutôt que de
   tirer un nombre au hasard qui retomberait cinq fois dans la même ligne. */
const TEMPS = [14, 18, 23, 28, 33];
const SUBS = SUBSTITUTIONS.filter((f) => !f.wheat);

const alea = (n) => Math.floor(Math.random() * n);
const tireDans = (l) => l[alea(l.length)];
/* « 3,5 » et non « 3.5 » : c'est une pesée, en français. */
const fmt = (n) => String(n).replace(".", ",");

function tirerProbleme() {
  const preset = tireDans(PRESETS);
  const farine = tireDans(FARINES);
  const flourTemp = tireDans(TEMPS);
  const levType = tireDans(LEVURE_TYPES);
  /* UNE FOIS SUR TROIS, une substitution — pour que le bassinage revienne sans devenir le
     sujet. Le pourcentage reste sous le plafond conseillé de la farine. */
  const sub = alea(3) === 0 ? tireDans(SUBS) : null;
  const subPct = sub ? 5 * (1 + alea(Math.min(sub.max, 20) / 5)) : 0;
  const bassinage = sub ? sub.bass10 * (subPct / 10) * (farine / 1000) : 0;
  const levPct = recoLevure(flourTemp, levType.k);
  return {
    preset, farine, flourTemp, levType, sub, subPct, bassinage, levPct,
    reponses: {
      eau: (farine * preset.hydra) / 100 + bassinage,
      sel: (farine * preset.sel) / 100,
      huile: (farine * preset.huile) / 100,
      levure: (farine * levPct) / 100,
    },
  };
}

const CHAMPS = [
  { cle: "eau", label: "Eau", aide: (p) => (p.sub
    ? `${p.preset.hydra} % de ${p.farine} g = ${fmt((p.farine * p.preset.hydra) / 100)} g de coulage, plus ${fmt(p.bassinage)} g de bassinage pour ${p.subPct} % de ${p.sub.label.toLowerCase()}.`
    : `${p.preset.hydra} % de ${p.farine} g = ${fmt(p.reponses.eau)} g. Le pourcentage porte sur la FARINE, jamais sur le poids total.`) },
  { cle: "sel", label: "Sel", aide: (p) => `${fmt(p.preset.sel)} % de ${p.farine} g = ${fmt(p.reponses.sel)} g.` },
  { cle: "huile", label: "Huile", aide: (p) => (p.preset.huile === 0
    ? `Aucune : une ${p.preset.nom.toLowerCase()} n'en porte pas.`
    : `${fmt(p.preset.huile)} % de ${p.farine} g = ${fmt(p.reponses.huile)} g.`) },
  { cle: "levure", label: "Levure", aide: (p) => `À ${p.flourTemp} °C de farine, le manuel donne ${fmt(p.levPct)} % en ${yeastLabel(p.levType.k).toLowerCase()}`
    + (p.levType.k === "seche_instant" ? " — la moitié de la fraîche" : "")
    + ` : ${fmt(p.levPct)} % de ${p.farine} g = ${fmt(p.reponses.levure)} g.` },
];

export default function CompleterPate({ onClose, onFinish }) {
  const [partie] = useState(() => Array.from({ length: MANCHES }, tirerProbleme));
  const [manche, setManche] = useState(0);
  const [saisie, setSaisie] = useState({});
  const [verdict, setVerdict] = useState(null);
  const [acquis, setAcquis] = useState([]);

  /* Index borné : après la cinquième, `manche` vaut 5 et `partie[5]` n'existe pas — le
     dépassement qui faisait disparaître l'écran de fin dans les jeux voisins. */
  const p = partie[Math.min(manche, MANCHES - 1)];
  const fini = manche >= MANCHES;
  const pointsTotal = acquis.reduce((a, b) => a + b, 0);
  const etoiles = etoilesPour(pointsTotal);

  const fermer = acquis.length ? () => onFinish(etoiles) : onClose;
  useEchap(fermer);

  const complet = CHAMPS.every((c) => String(saisie[c.cle] ?? "").trim() !== "");

  function valider() {
    const details = CHAMPS.map((c) => {
      /* La virgule française acceptée comme le point : on saisit « 3,5 » sur un clavier d'ici. */
      const donne = Number(String(saisie[c.cle]).replace(",", ".").trim());
      return { ...c, donne, attendu: p.reponses[c.cle], juste: donne === p.reponses[c.cle] };
    });
    const points = details.filter((d) => d.juste).length;
    setVerdict({ details, points });
    setAcquis((l) => [...l, points]);
  }

  const suivante = () => { setVerdict(null); setSaisie({}); setManche((m) => m + 1); };

  return (
    <div className="overlay" onClick={fermer}>
      <div className="modal sim" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3><Icon name="wheat" size={18} /> Complète la pâte</h3>
          {!fini && <span className="sim-manche-n chiffres">Fiche {manche + 1}/{MANCHES}</span>}
          <button className="x" onClick={fermer} aria-label="Fermer">×</button>
        </div>

        {fini ? (
          <>
            <div className="mbody sim-result">
              <div className="sim-stars" aria-label={`${etoiles} étoiles sur 3`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < etoiles ? "on" : ""}>★</span>)}
              </div>
              <p className="sim-verdict-t">Empâtements terminés — <b>{pointsTotal} / {POINTS_MAX}</b></p>
              <p className="sim-etait">
                {etoiles === 3 ? "Tes pesées sont bonnes, y compris sur la levure."
                  : etoiles === 2 ? "Presque : revois le dosage de la levure selon la température."
                  : etoiles === 1 ? "Le pourcentage boulanger se calcule sur la FARINE, jamais sur le total."
                  : "Reprends la page des unités de calcul, tout y est."}
              </p>
              <ol className="sim-manches">
                {partie.slice(0, acquis.length).map((x, i) => (
                  <li key={i}>
                    <span style={{ flex: 1 }}>{x.preset.nom}, {x.farine} g, levure {yeastLabel(x.levType.k).toLowerCase()}</span>
                    <b className="chiffres">{acquis[i]} / 4</b>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => window.location.reload()}>
                <Icon name="refresh" size={14} /> Rejouer
              </button>
              <button className="btn primary" onClick={() => onFinish(etoiles)}>
                <Icon name="check" size={15} /> Valider ({etoiles} ★)
              </button>
            </div>
          </>
        ) : verdict ? (
          <>
            <div className="mbody sim-result">
              <p className="sim-verdict-t">
                {verdict.points === 4 ? "Fiche juste, au dixième de gramme."
                  : verdict.points >= 2 ? "Presque : deux ou trois pesées à revoir."
                  : "Reprends les pourcentages, ligne par ligne."}
                {" "}<b>{verdict.points} / 4</b>
              </p>
              <ul className="sim-feedback">
                {verdict.details.map((d) => (
                  <li key={d.cle} className={d.juste ? "ok" : "ko"}>
                    <Icon name={d.juste ? "check-circle" : "x-circle"} size={15} />
                    <span>
                      <b>{d.label}</b> : {fmt(d.attendu)} g
                      {d.juste ? "." : ` — tu as répondu ${Number.isFinite(d.donne) ? fmt(d.donne) : "—"} g.`}
                      <em>{d.aide(p)}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mfoot">
              <span className="hint" style={{ flex: 1 }}>Total {pointsTotal} / {POINTS_MAX}</span>
              <button className="btn primary" onClick={suivante}>
                {manche + 1 < MANCHES
                  ? <><Icon name="chevron-right" size={15} /> Fiche suivante</>
                  : <><Icon name="check" size={15} /> Voir le résultat</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mbody sim-play">
              <div className="sim-brief">
                <span className="sim-brief-t"><Icon name="wheat" size={13} /> La fiche à compléter</span>
                <p className="sim-brief-i">Empâtement {p.preset.nom.toLowerCase()}…</p>
                <ul>
                  <li><b className="chiffres">{p.farine} g</b> de farine
                    {p.sub && <> — dont <b className="chiffres">{p.subPct} %</b> de <b>{p.sub.label.toLowerCase()}</b></>},
                  </li>
                  <li>hydratation <b className="chiffres">{fmt(p.preset.hydra)} %</b>,
                    sel <b className="chiffres">{fmt(p.preset.sel)} %</b>,
                    huile <b className="chiffres">{fmt(p.preset.huile)} %</b>,</li>
                  <li>farine à <b className="chiffres">{p.flourTemp} °C</b>,
                    levure <b>{yeastLabel(p.levType.k).toLowerCase()}</b>.</li>
                </ul>
              </div>

              <div className="sub-grille">
                {CHAMPS.map((c) => (
                  <label key={c.cle} className="sub-champ">
                    <span>{c.label}</span>
                    <span className="sub-saisie">
                      <input className="inp chiffres" inputMode="decimal" autoComplete="off"
                        value={saisie[c.cle] ?? ""}
                        onChange={(e) => setSaisie((s) => ({ ...s, [c.cle]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter" && complet) valider(); }} />
                      <b>g</b>
                    </span>
                  </label>
                ))}
              </div>

              {/* LA TABLE DE LA LEVURE EST DONNÉE, et ce n'est pas de la triche : on ne demande
                  pas de retenir cinq lignes par cœur, on demande de savoir LIRE la bonne — et de
                  ne pas oublier que l'instantanée vaut la moitié. C'est ce qu'on fait en labo,
                  la fiche est affichée au mur. */}
              <details className="pate-table">
                <summary><Icon name="yeast" size={13} /> La table du manuel (p.21)</summary>
                <table>
                  <thead><tr><th>Farine</th>{LEVURE_TYPES.map((y) => <th key={y.k}>{y.label}</th>)}</tr></thead>
                  <tbody>
                    {LEVURE_TABLE.map((r, i) => (
                      <tr key={r.tmax} className={p.flourTemp <= r.tmax
                        && (i === 0 || p.flourTemp > LEVURE_TABLE[i - 1].tmax) ? "on" : ""}>
                        <td>{r.tmax === 999 ? "au-delà de 31 °C" : `jusqu'à ${r.tmax} °C`}</td>
                        {LEVURE_TYPES.map((y) => <td key={y.k} className="chiffres">{fmt(r[y.k])} %</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>

              <p className="hint sub-rappel">
                <Icon name="info" size={12} /> Le pourcentage boulanger se calcule sur le poids de
                <b> farine</b>, jamais sur le poids total de la pâte.
              </p>
            </div>
            <div className="mfoot">
              <span className="hint" style={{ flex: 1 }}>
                {manche === 0 ? "Cinq fiches, quatre pesées chacune."
                  : `Total ${pointsTotal} / ${POINTS_MAX}`}
              </span>
              <button className="btn primary" disabled={!complet} onClick={valider}>
                <Icon name="check" size={15} /> Vérifier
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
