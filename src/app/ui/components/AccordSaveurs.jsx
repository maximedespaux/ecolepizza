import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { GARN_BASES, GARN_PRODUITS, GARN_DAIRY, GARN_TIPS, pairSuggestions, prodOf } from "../lib/garnitures.js";
import { useEchap } from "../lib/useEchap.js";

/**
 * « L'ACCORD DES SAVEURS » — ce que l'école associe, et pourquoi.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA QUESTION EST « QUE SUGGÈRE L'ÉCOLE ? », JAMAIS « QU'EST-CE QUI EST FAUX ? »
 *
 * C'est la seule formulation que la donnée autorise, et la distinction n'est pas un détail. Les
 * affinités de `garnitures.js` sont des SUGGESTIONS, pas une table de vérité : l'absence de
 * « jambon » dans les accords de la sauce tomate ne dit pas que l'accord est mauvais — il dit
 * qu'il n'est pas listé. Un jeu qui demanderait « lequel détonne ? » marquerait donc faux des
 * accords parfaitement classiques, sur un sujet où le goût se discute.
 *
 * On demande donc de reconnaître l'accord DOCUMENTÉ, et le retour dit toujours QUI le suggère.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LES RELATIONS SONT ASYMÉTRIQUES — 70 symétriques contre 168 qui ne le sont pas. « A va avec B »
 * n'implique pas « B va avec A ». On passe donc par `pairSuggestions`, qui part des produits
 * DÉJÀ POSÉS et remonte leurs propres listes, plutôt que de chercher à l'envers.
 *
 * Ce moteur rend aussi `matches` — les produits qui ont suggéré le candidat — et c'est lui qui
 * fournit la justification. Il filtre au passage les quatre affinités qui pointent vers un
 * produit inexistant (`harissa`, `fenouil`, `cumin`, `soja_sauce`), absentes du catalogue.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * DIX QUESTIONS, UN POINT CHACUNE. La forme est un choix unique, pas une pesée : le barème sur
 * 20 des jeux de calcul n'a rien à y faire. Les seuils gardent les mêmes proportions — 90 %,
 * 55 %, 25 % — soit 9, 6 et 3.
 */

const QUESTIONS = 10;
const etoilesPour = (p) => (p >= 9 ? 3 : p >= 6 ? 2 : p >= 3 ? 1 : 0);

const PRODUITS = [...GARN_PRODUITS, ...GARN_DAIRY].filter((p) => p.label && p.cat);

const alea = (n) => Math.floor(Math.random() * n);
const tireDans = (l) => l[alea(l.length)];
const melanger = (l) => {
  const a = [...l];
  for (let i = a.length - 1; i > 0; i--) { const j = alea(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/**
 * Une question : une base, deux produits déjà posés, et quatre candidats dont UN SEUL est
 * suggéré par ce qui est sur la pizza.
 *
 * ON PRIVILÉGIE LES ACCORDS À DEUX VOIX (`score >= 2`, suggérés à la fois par la base ET par un
 * produit) : ils ne se discutent pas. À défaut on accepte un score de 1, plutôt que de renoncer
 * à la question.
 */
function tirerQuestion() {
  for (let essai = 0; essai < 60; essai++) {
    const base = tireDans(GARN_BASES);
    const p1 = prodOf(tireDans(base.pairs || []));
    if (!p1?.label || !p1.cat) continue;
    const p2 = prodOf(tireDans(p1.pairs || []));
    if (!p2?.label || !p2.cat || p2.key === p1.key) continue;

    const sugg = pairSuggestions([p1.key, p2.key], base.key);
    if (!sugg.length) continue;
    const bon = sugg.find((s) => s.score >= 2) || sugg[0];

    /* LES LEURRES NE SONT PAS « MAUVAIS », ils sont seulement ABSENTS des suggestions — c'est
       exactement ce que la question demande de repérer, et le retour le dit ainsi. */
    const exclus = new Set([bon.key, p1.key, p2.key, ...sugg.map((s) => s.key)]);
    const leurres = melanger(PRODUITS.filter((x) => !exclus.has(x.key))).slice(0, 3);
    if (leurres.length < 3) continue;

    return { base, poses: [p1, p2], bon, choix: melanger([bon, ...leurres]) };
  }
  return null;
}

export default function AccordSaveurs({ onClose, onFinish }) {
  const [partie] = useState(() => Array.from({ length: QUESTIONS }, tirerQuestion).filter(Boolean));
  const [idx, setIdx] = useState(0);
  const [choisi, setChoisi] = useState(null);
  const [points, setPoints] = useState(0);

  const total = partie.length;
  const fini = idx >= total;
  const q = partie[Math.min(idx, total - 1)];
  const etoiles = etoilesPour(points);

  const fermer = idx > 0 ? () => onFinish(etoiles) : onClose;
  useEchap(fermer);

  function repondre(p) {
    if (choisi) return;                       // une réponse par question, pas de rattrapage
    setChoisi(p);
    if (p.key === q.bon.key) setPoints((n) => n + 1);
  }
  const suivante = () => { setChoisi(null); setIdx((i) => i + 1); };

  /* Si le tirage n'a rien produit — impossible avec le catalogue actuel, mais il changera —
     on le DIT au lieu d'afficher une modale vide. */
  if (!total) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal sim" onClick={(e) => e.stopPropagation()}>
          <div className="mhead"><h3><Icon name="heart" size={18} /> L'accord des saveurs</h3>
            <button className="x" onClick={onClose} aria-label="Fermer">×</button></div>
          <div className="mbody"><p className="hint">Aucune question ne peut être composée avec le
            catalogue actuel. Les accords se déclarent dans <b>lib/garnitures.js</b>.</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={fermer}>
      <div className="modal sim" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3><Icon name="heart" size={18} /> L'accord des saveurs</h3>
          {!fini && <span className="sim-manche-n chiffres">Question {idx + 1}/{total}</span>}
          <button className="x" onClick={fermer} aria-label="Fermer">×</button>
        </div>

        {fini ? (
          <>
            <div className="mbody sim-result">
              <div className="sim-stars" aria-label={`${etoiles} étoiles sur 3`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < etoiles ? "on" : ""}>★</span>)}
              </div>
              <p className="sim-verdict-t">Carte terminée — <b>{points} / {total}</b></p>
              <p className="sim-etait">
                {etoiles === 3 ? "Tu connais les accords de la maison."
                  : etoiles === 2 ? "Bonne base : les classiques sont là."
                  : etoiles === 1 ? "Refais un tour de la carte, les accords reviennent souvent."
                  : "Regarde les fiches produits : chacune porte ses accords."}
              </p>
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
        ) : (
          <>
            <div className="mbody sim-play">
              <div className="sim-brief">
                <span className="sim-brief-t"><Icon name="pizza" size={13} /> Sur le marbre</span>
                <p className="sim-brief-i">Tu as déjà posé…</p>
                <ul>
                  <li><b>{q.base.label}</b>,</li>
                  <li><b>{q.poses[0].label}</b> et <b>{q.poses[1].label}</b>.</li>
                </ul>
              </div>
              <p className="hint sub-rappel" style={{ marginBottom: 10 }}>
                <Icon name="info" size={12} /> Lequel l'école <b>suggère-t-elle</b> pour compléter ?
                Les autres ne sont pas mauvais — ils ne sont simplement pas dans ses accords.
              </p>

              <div className="acc-choix">
                {q.choix.map((c) => {
                  const bon = c.key === q.bon.key;
                  const etat = !choisi ? "" : bon ? " ok" : (c.key === choisi.key ? " ko" : " pale");
                  return (
                    <button key={c.key} className={"acc-opt" + etat} disabled={!!choisi}
                      onClick={() => repondre(c)}>
                      <span className="acc-emoji" aria-hidden="true">{c.emoji || "•"}</span>
                      <b>{c.label}</b>
                      {choisi && bon && <Icon name="check-circle" size={15} />}
                      {choisi && !bon && c.key === choisi.key && <Icon name="x-circle" size={15} />}
                    </button>
                  );
                })}
              </div>

              {choisi && (
                <div className="acc-pourquoi">
                  <p>
                    <b>{q.bon.label}</b> — suggéré par <b>{q.bon.matches.join(" et ")}</b>.
                  </p>
                  {GARN_TIPS[q.bon.key] && <p className="hint">{GARN_TIPS[q.bon.key]}</p>}
                </div>
              )}
            </div>
            <div className="mfoot">
              <span className="hint" style={{ flex: 1 }}>Score {points} / {total}</span>
              {choisi && (
                <button className="btn primary" onClick={suivante}>
                  {idx + 1 < total
                    ? <><Icon name="chevron-right" size={15} /> Question suivante</>
                    : <><Icon name="check" size={15} /> Voir le résultat</>}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
