import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { SUBSTITUTIONS } from "../lib/dough.js";
import { useEchap } from "../lib/useEchap.js";

/**
 * « LA SUBSTITUTION » — cinq problèmes de fiche technique, à la calculette ou de tête.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE JEU-LÀ. C'est le calcul que le manuel pose noir sur blanc (p.32), et celui qu'on
 * refait à chaque fiche technique :
 *
 *     « W330 avec 10 % de soja : 900 g de blé + 100 g de soja. Eau = 570 g de coulage (57 %)
 *       + 30 g de bassinage = 600 g au total. Si tu mets de la farine complète à la place du
 *       soja, elle boit plus : +40 g au lieu de +30 → 610 g. »
 *
 * Tout y est : la substitution remplace une PART à poids constant, et chaque farine boit
 * différemment. Les deux erreurs classiques sont d'AJOUTER la farine de substitution au lieu de
 * la substituer (le poids total dérive, et la recette avec), et d'oublier le bassinage.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * AUCUNE VALEUR N'EST INVENTÉE. `SUBSTITUTIONS` (lib/dough.js) porte les compléments de
 * bassinage du manuel — soja et semi-complète +30 g pour 10 %, complète +40 g — et le plafond
 * conseillé par farine. Le jeu ne fait que TIRER un énoncé et vérifier l'arithmétique.
 *
 * ET IL TOMBE TOUJOURS SUR DES ENTIERS. Le poids de farine est un multiple de 1 000 g et les
 * pourcentages vont de 5 en 5 : les 828 combinaisons possibles ont été éprouvées, aucune ne
 * donne de décimale. Un problème de maths à virgules serait pénible sans rien apprendre de plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE BARÈME EST CELUI DE « FAIS TA PIZZA » — quatre réponses × cinq problèmes = 20, et les
 * mêmes seuils. Ici PAS de demi-point : un nombre est juste ou faux, la tolérance n'a pas de
 * sens sur une pesée.
 */

const MANCHES = 5;
const POINTS_MAX = MANCHES * 4;

const etoilesPour = (p) => (p >= 18 ? 3 : p >= 11 ? 2 : p >= 5 ? 1 : 0);

/* Les farines de blé sont écartées : substituer du blé par du blé est un vrai geste de métier,
   mais l'énoncé se lirait « 850 g de blé + 150 g de blé », ce qui embrouille au lieu d'enseigner.
   On garde les farines qui changent visiblement la pâte. */
const FARINES = SUBSTITUTIONS.filter((f) => !f.wheat);

const alea = (n) => Math.floor(Math.random() * n);
const tireDans = (l) => l[alea(l.length)];

/**
 * Un énoncé, et sa solution.
 *
 * LE POURCENTAGE NE DÉPASSE JAMAIS LE PLAFOND de la farine (`max` : soja 20 %, seigle 30 %…).
 * Poser un problème à 40 % de soja donnerait un calcul juste sur une pâte qui n'existe pas —
 * on entraînerait à calculer une faute professionnelle.
 */
function tirerProbleme() {
  const f = tireDans(FARINES);
  const plafond = Math.min(f.max, 30);
  const pct = 5 * (1 + alea(plafond / 5));          // 5, 10, … jusqu'au plafond
  const farine = 1000 * (1 + alea(3));              // 1, 2 ou 3 kg
  const hydra = tireDans([55, 57, 58, 60, 62, 65]);
  const sub = (farine * pct) / 100;
  return {
    f, pct, farine, hydra,
    reponses: {
      ble: farine - sub,
      sub,
      coulage: (farine * hydra) / 100,
      /* `bass10` est donné POUR 10 % ET PAR KILO de farine (manuel p.32) : d'où les deux
         proportions. C'est exactement `substWaterG` de lib/dough.js, écrit ici en clair
         parce que c'est le raisonnement qu'on demande au joueur de refaire. */
      bassinage: f.bass10 * (pct / 10) * (farine / 1000),
    },
  };
}

/* Les quatre questions, dans l'ordre où on les pose sur une fiche : la farine d'abord, l'eau
   ensuite. `aide` explique le calcul APRÈS coup — c'est la seule chose qu'on retient d'un
   problème raté. */
const CHAMPS = [
  { cle: "ble", label: "Farine de blé", unite: "g",
    aide: (p) => `${p.farine} g au total − ${p.reponses.sub} g de ${p.f.label.toLowerCase()} = ${p.reponses.ble} g. La substitution REMPLACE, elle ne s'ajoute pas.` },
  { cle: "sub", label: (p) => p.f.label, unite: "g",
    aide: (p) => `${p.pct} % de ${p.farine} g = ${p.reponses.sub} g.` },
  { cle: "coulage", label: "Eau de coulage", unite: "g",
    aide: (p) => `${p.hydra} % de ${p.farine} g = ${p.reponses.coulage} g. L'hydratation se calcule sur le poids TOTAL de farine, substitution comprise.` },
  { cle: "bassinage", label: "Eau de bassinage", unite: "g",
    aide: (p) => `${p.f.label} boit ${p.f.bass10} g de plus par kilo et par tranche de 10 % : ${p.f.bass10} × ${p.pct / 10} × ${p.farine / 1000} = ${p.reponses.bassinage} g.` },
];

const libelle = (c, p) => (typeof c.label === "function" ? c.label(p) : c.label);

export default function Substitutions({ onClose, onFinish }) {
  const [partie] = useState(() => Array.from({ length: MANCHES }, tirerProbleme));
  const [manche, setManche] = useState(0);
  const [saisie, setSaisie] = useState({});
  const [verdict, setVerdict] = useState(null);
  const [acquis, setAcquis] = useState([]);

  /* Après la dernière manche, `manche` vaut 5 et `partie[5]` n'existe pas — le même piège que
     dans « Fais ta pizza », où il faisait disparaître l'écran de fin. Borné d'emblée. */
  const p = partie[Math.min(manche, MANCHES - 1)];
  const fini = manche >= MANCHES;
  const pointsTotal = acquis.reduce((a, b) => a + b, 0);
  const etoiles = etoilesPour(pointsTotal);

  /* Sortir VALIDE ce qui est acquis : fermer par la croix ne doit pas jeter quatre problèmes
     résolus. Avant le premier, il n'y a rien à garder. */
  const fermer = acquis.length ? () => onFinish(etoiles) : onClose;
  useEchap(fermer);

  const complet = CHAMPS.every((c) => String(saisie[c.cle] ?? "").trim() !== "");

  function valider() {
    const details = CHAMPS.map((c) => {
      const donne = Number(String(saisie[c.cle]).replace(",", ".").trim());
      return { ...c, donne, attendu: p.reponses[c.cle], juste: donne === p.reponses[c.cle] };
    });
    const points = details.filter((d) => d.juste).length;
    setVerdict({ details, points });
    setAcquis((l) => [...l, points]);
  }

  function suivante() {
    setVerdict(null); setSaisie({}); setManche((m) => m + 1);
  }
  function rejouer() {
    window.location.reload();   // une partie neuve = un nouveau tirage ; recharger suffit
  }

  return (
    <div className="overlay" onClick={fermer}>
      <div className="modal sim" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3><Icon name="calculator" size={18} /> La substitution</h3>
          {!fini && <span className="sim-manche-n chiffres">Problème {manche + 1}/{MANCHES}</span>}
          <button className="x" onClick={fermer} aria-label="Fermer">×</button>
        </div>

        {fini ? (
          <>
            <div className="mbody sim-result">
              <div className="sim-stars" aria-label={`${etoiles} étoiles sur 3`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < etoiles ? "on" : ""}>★</span>)}
              </div>
              <p className="sim-verdict-t">Fiches terminées — <b>{pointsTotal} / {POINTS_MAX}</b></p>
              <p className="sim-etait" style={{ justifyContent: "center" }}>
                {etoiles === 3 ? "Tes fiches techniques tiennent debout."
                  : etoiles === 2 ? "Le raisonnement est là, l'arithmétique se peaufine."
                  : etoiles === 1 ? "Relis la page des substitutions : le bassinage se calcule."
                  : "Reprends l'exemple du manuel, il contient tout le raisonnement."}
              </p>
              <ol className="sim-manches">
                {partie.slice(0, acquis.length).map((x, i) => (
                  <li key={i}>
                    <span style={{ flex: 1 }}>{x.pct} % de {x.f.label.toLowerCase()} sur {x.farine} g</span>
                    <b className="chiffres">{acquis[i]} / 4</b>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={rejouer}>
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
                {verdict.points === 4 ? "Fiche juste, au gramme près."
                  : verdict.points >= 2 ? "Presque : deux ou trois lignes à revoir."
                  : "Reprends le raisonnement ligne par ligne."}
                {" "}<b>{verdict.points} / 4</b>
              </p>
              <ul className="sim-feedback">
                {verdict.details.map((d) => (
                  <li key={d.cle} className={d.juste ? "ok" : "ko"}>
                    <Icon name={d.juste ? "check-circle" : "x-circle"} size={15} />
                    <span>
                      <b>{libelle(d, p)}</b> : {d.attendu} g
                      {d.juste ? "." : ` — tu as répondu ${Number.isFinite(d.donne) ? d.donne : "—"} g.`}
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
                  ? <><Icon name="chevron-right" size={15} /> Problème suivant</>
                  : <><Icon name="check" size={15} /> Voir le résultat</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mbody sim-play">
              {/* L'ÉNONCÉ, comme on le reçoit en atelier : un poids, une substitution, une
                  hydratation de coulage. Rien de plus — le reste se calcule. */}
              <div className="sim-brief">
                <span className="sim-brief-t"><Icon name="calculator" size={13} /> L'énoncé</span>
                <p className="sim-brief-i">Tu prépares une fiche technique…</p>
                <ul>
                  <li><b className="chiffres">{p.farine} g</b> de farine au total,</li>
                  <li>dont <b className="chiffres">{p.pct} %</b> de <b>{p.f.label.toLowerCase()}</b>,</li>
                  <li>hydratation de coulage <b className="chiffres">{p.hydra} %</b>.</li>
                </ul>
              </div>

              <div className="sub-grille">
                {CHAMPS.map((c) => (
                  <label key={c.cle} className="sub-champ">
                    <span>{libelle(c, p)}</span>
                    <span className="sub-saisie">
                      <input className="inp chiffres" inputMode="numeric" autoComplete="off"
                        value={saisie[c.cle] ?? ""}
                        onChange={(e) => setSaisie((s) => ({ ...s, [c.cle]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter" && complet) valider(); }} />
                      <b>g</b>
                    </span>
                  </label>
                ))}
              </div>

              <p className="hint sub-rappel">
                <Icon name="info" size={12} /> La substitution remplace une part du blé <b>à poids
                total constant</b>. Le bassinage s'ajoute à l'eau de coulage.
              </p>
            </div>
            <div className="mfoot">
              <span className="hint" style={{ flex: 1 }}>
                {manche === 0 ? "Cinq fiches, quatre lignes chacune."
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
