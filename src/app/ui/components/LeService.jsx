import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { PRESETS } from "../lib/dough.js";
import { PATONS_PAR_KG_FARINE } from "../lib/materiel.js";
import { useEchap } from "../lib/useEchap.js";

/**
 * « LE SERVICE » — remonter du nombre de pizzas au poids de farine.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * C'EST LE CHAÎNON QUI MANQUAIT. « Complète la pâte » donne le poids de farine et demande les
 * ingrédients ; ici il faut TROUVER ce poids à partir du service. Les deux bout à bout couvrent
 * la chaîne entière : combien de pizzas → combien de farine → combien de chaque chose.
 *
 * Le manuel pose l'exemple mot pour mot :
 *
 *     « Tu as besoin de 60 pâtons de 280 g pour le service. 60 ÷ 6 = 10 unités de calcul
 *       → 10 kg de farine, 6,2 kg d'eau (62 %), 200 g de sel (2 %), 250 g d'huile (2,5 %),
 *       30 g de levure. Tu n'as rien recalculé : tu as juste multiplié par 10. »
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE PÂTON RESTE À 280 g, ET C'EST DÉLIBÉRÉ. Le manuel écrit « 1 unité de calcul (1 kg de
 * farine) → ENVIRON 6 pâtons de 280 g ». C'est un repère, pas une identité : il ne tient qu'à ce
 * poids-là. Faire varier le pâton donnerait des divisions justes sur une règle fausse — on
 * enseignerait une généralisation que le manuel ne fait pas. Ce qui varie, c'est le NOMBRE de
 * pizzas et le style, donc les pourcentages.
 *
 * `PATONS_PAR_KG_FARINE` vient de lib/materiel.js, les pourcentages de `PRESETS`. En revanche
 * `kgPateDepuisPizzas` est ÉCARTÉE : elle arrondit au dixième de kilo, ce qui convient à
 * l'affichage du conseil matériel mais fausse une réponse au gramme (cf. le calcul du poids de
 * pâte). Une fonction juste pour un usage l'est rarement pour tous.
 */

const MANCHES = 5;
const POINTS_MAX = MANCHES * 4;
const etoilesPour = (p) => (p >= 18 ? 3 : p >= 11 ? 2 : p >= 5 ? 1 : 0);

const PATON_G = 280;   // le poids du repère du manuel — cf. l'en-tête
/* Des services réalistes, tous multiples de 6 : la division par le repère doit tomber juste,
   sinon l'énoncé demanderait « 8,33 unités », qui ne veut rien dire en labo. */
const SERVICES = [30, 42, 48, 60, 72, 90, 120];

const alea = (n) => Math.floor(Math.random() * n);
const tireDans = (l) => l[alea(l.length)];
const fmt = (n) => String(n).replace(".", ",");

function tirerProbleme() {
  const preset = tireDans(PRESETS);
  const pizzas = tireDans(SERVICES);
  const unites = pizzas / PATONS_PAR_KG_FARINE;
  const farine = unites * 1000;
  return {
    preset, pizzas, unites, farine,
    reponses: {
      unites,
      farine,
      eau: (farine * preset.hydra) / 100,
      /* ⚠ PAS `kgPateDepuisPizzas` ICI, et c'est un piège dans lequel je suis tombé. Cette
         fonction arrondit au dixième de KILO (`toFixed(1)`) : très bien pour l'affichage du
         conseil matériel, faux au gramme. 72 pâtons de 280 g pèsent 20 160 g, elle rendait
         20 200. Le jeu aurait donc marqué FAUX un stagiaire calculant juste — sur un écran qui
         existe pour lui apprendre à calculer. Ici, la multiplication, exacte. */
      pate: pizzas * PATON_G,
    },
  };
}

const CHAMPS = [
  { cle: "unites", label: "Unités de calcul", unite: "",
    aide: (p) => `${p.pizzas} pâtons ÷ ${PATONS_PAR_KG_FARINE} = ${p.unites} unités. Le repère du manuel : 1 unité (1 kg de farine) donne environ ${PATONS_PAR_KG_FARINE} pâtons de ${PATON_G} g.` },
  { cle: "farine", label: "Farine", unite: "g",
    aide: (p) => `1 unité de calcul = 1 kg de farine, donc ${p.unites} unités = ${fmt(p.farine)} g.` },
  { cle: "eau", label: "Eau", unite: "g",
    aide: (p) => `${fmt(p.preset.hydra)} % de ${fmt(p.farine)} g = ${fmt(p.reponses.eau)} g. Tu n'as rien recalculé : tu as multiplié le kilo de référence.` },
  { cle: "pate", label: "Pâte au total", unite: "g",
    aide: (p) => `${p.pizzas} pâtons × ${PATON_G} g = ${fmt(p.reponses.pate)} g. C'est ce qui sort du pétrin — toujours plus que la farine seule.` },
];

export default function LeService({ onClose, onFinish }) {
  const [partie] = useState(() => Array.from({ length: MANCHES }, tirerProbleme));
  const [manche, setManche] = useState(0);
  const [saisie, setSaisie] = useState({});
  const [verdict, setVerdict] = useState(null);
  const [acquis, setAcquis] = useState([]);

  /* Index borné : après la cinquième, `partie[5]` n'existe pas — le dépassement qui faisait
     disparaître l'écran de fin dans les jeux voisins. */
  const p = partie[Math.min(manche, MANCHES - 1)];
  const fini = manche >= MANCHES;
  const pointsTotal = acquis.reduce((a, b) => a + b, 0);
  const etoiles = etoilesPour(pointsTotal);

  const fermer = acquis.length ? () => onFinish(etoiles) : onClose;
  useEchap(fermer);

  const complet = CHAMPS.every((c) => String(saisie[c.cle] ?? "").trim() !== "");

  function valider() {
    const details = CHAMPS.map((c) => {
      const donne = Number(String(saisie[c.cle]).replace(",", ".").trim());
      return { ...c, donne, attendu: p.reponses[c.cle], juste: donne === p.reponses[c.cle] };
    });
    setVerdict({ details, points: details.filter((d) => d.juste).length });
    setAcquis((l) => [...l, details.filter((d) => d.juste).length]);
  }
  const suivante = () => { setVerdict(null); setSaisie({}); setManche((m) => m + 1); };

  return (
    <div className="overlay" onClick={fermer}>
      <div className="modal sim" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3><Icon name="calculator" size={18} /> Le service</h3>
          {!fini && <span className="sim-manche-n chiffres">Service {manche + 1}/{MANCHES}</span>}
          <button className="x" onClick={fermer} aria-label="Fermer">×</button>
        </div>

        {fini ? (
          <>
            <div className="mbody sim-result">
              <div className="sim-stars" aria-label={`${etoiles} étoiles sur 3`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < etoiles ? "on" : ""}>★</span>)}
              </div>
              <p className="sim-verdict-t">Services préparés — <b>{pointsTotal} / {POINTS_MAX}</b></p>
              <p className="sim-etait">
                {etoiles === 3 ? "Tu sais partir du service pour remonter à la farine."
                  : etoiles === 2 ? "La chaîne est là, quelques multiplications à assurer."
                  : etoiles === 1 ? "Revois le repère : 1 unité de calcul = 1 kg de farine."
                  : "Reprends l'exemple des unités de calcul, tout y est."}
              </p>
              <ol className="sim-manches">
                {partie.slice(0, acquis.length).map((x, i) => (
                  <li key={i}>
                    <span style={{ flex: 1 }}>{x.pizzas} pizzas, {x.preset.nom.toLowerCase()}</span>
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
                {verdict.points === 4 ? "Service prêt, au gramme près."
                  : verdict.points >= 2 ? "Presque : deux ou trois lignes à revoir."
                  : "Reprends la chaîne depuis le nombre de pâtons."}
                {" "}<b>{verdict.points} / 4</b>
              </p>
              <ul className="sim-feedback">
                {verdict.details.map((d) => (
                  <li key={d.cle} className={d.juste ? "ok" : "ko"}>
                    <Icon name={d.juste ? "check-circle" : "x-circle"} size={15} />
                    <span>
                      <b>{d.label}</b> : {fmt(d.attendu)}{d.unite ? " " + d.unite : ""}
                      {d.juste ? "." : ` — tu as répondu ${Number.isFinite(d.donne) ? fmt(d.donne) : "—"}.`}
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
                  ? <><Icon name="chevron-right" size={15} /> Service suivant</>
                  : <><Icon name="check" size={15} /> Voir le résultat</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mbody sim-play">
              <div className="sim-brief">
                <span className="sim-brief-t"><Icon name="users" size={13} /> La commande du soir</span>
                <p className="sim-brief-i">Il te faut, pour le service…</p>
                <ul>
                  <li><b className="chiffres">{p.pizzas} pizzas</b>, en pâtons de <b className="chiffres">{PATON_G} g</b>,</li>
                  <li>en empâtement <b>{p.preset.nom.toLowerCase()}</b>,</li>
                  <li>hydratation <b className="chiffres">{fmt(p.preset.hydra)} %</b>.</li>
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
                      <b>{c.unite || "u"}</b>
                    </span>
                  </label>
                ))}
              </div>

              <p className="hint sub-rappel">
                <Icon name="info" size={12} /> Le repère du manuel : <b>1 unité de calcul = 1 kg de
                farine</b>, soit environ {PATONS_PAR_KG_FARINE} pâtons de {PATON_G} g.
              </p>
            </div>
            <div className="mfoot">
              <span className="hint" style={{ flex: 1 }}>
                {manche === 0 ? "Cinq services, quatre lignes chacun."
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
