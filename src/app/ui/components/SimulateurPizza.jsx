import { useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";
import { Paton, doughLook } from "./LivePizza.jsx";

/**
 * « Fais ta pizza » — simulateur-jeu. On tire un objectif (napolitaine, classique…), un briefing
 * dit CE QU'IL FAUT viser (qualitatif, pas les chiffres), puis on règle quatre choses : le TYPE
 * de farine (cendres/couleur), sa FORCE (W), l'HYDRATATION, le FOUR. Le pâton réagit en direct —
 * il fonce avec une farine complète, s'étale quand on l'hydrate, ouvre ses alvéoles avec le W.
 * À la validation, chaque axe est noté CONTRE LES VRAIES VALEURS DES MANUELS, avec le pourquoi.
 *
 * ⚠️ Type ET force sont SÉPARÉS : dans la vraie vie une T55 peut être faible ou forte. Les
 * confondre (« T65 = W280 ») serait faux et n'apprendrait pas le bon réflexe.
 *
 * Sources : lib/dough.js (W/hydratation par style) + manuel Niveau II (napolitaine AVPN
 * 400-485 °C) + manuel Niveau I (types France/Italie, cendres, cuisson).
 */

/* Les types de farine, du plus raffiné au plus cendré. `water` (0-8) pilote la couleur du pâton
   via doughLook : Tipo 00 reste clair, une complète fonce et pique de son. */
const TYPES = [
  { idx: 0, lbl: "Tipo 00", sub: "très raffinée", water: 0 },
  { idx: 1, lbl: "T55", sub: "raffinée", water: 2 },
  { idx: 2, lbl: "T65", sub: "semi-complète", water: 4 },
  { idx: 3, lbl: "Complète", sub: "cendrée", water: 7 },
];
const FOURS = [
  { lbl: "Électrique", sub: "340 °C", t: 340 },
  { lbl: "Gaz", sub: "400 °C", t: 400 },
  { lbl: "Bois", sub: "460 °C", t: 460 },
];

/* Un objectif = une fenêtre idéale par axe (des manuels) + un briefing qualitatif qui GUIDE
   sans donner les chiffres — c'est au joueur de traduire « farine forte » en un W. */
const OBJECTIFS = [
  {
    id: "classique", nom: "Classique", emoji: "🍕",
    intro: "La pizza de tous les jours, cornicione léger.",
    brief: { type: "Une farine courante, T55 ou T65.", force: "Force moyenne — pas besoin qu'elle tienne des heures.", hydra: "Hydratation modérée, facile à étaler.", temp: "Four moyen." },
    type: { ok: [1, 2], tol: [0, 3], why: "T55/T65 : la farine du quotidien, ni trop raffinée ni complète." },
    force: { ok: [200, 250], tol: [180, 280], why: "W ~220 : une fermentation courte ne demande pas une farine forte." },
    hydra: { ok: [55, 62], tol: [52, 66], why: "55-62 % : souple pour s'étaler, assez ferme pour un four moyen." },
    temp: { ok: [320, 360], tol: [300, 380], why: "320-360 °C : la cuisson classique, 5-6 min." },
  },
  {
    id: "napolitaine", nom: "Napolitaine AVPN", emoji: "🔥",
    intro: "Cuisson éclair à très haute température. La reine, la plus exigeante.",
    brief: { type: "Une farine 00, peu cendrée.", force: "Assez forte pour tenir la longue maturation.", hydra: "Maîtrisée — le disque doit tenir à 480 °C.", temp: "Un four brûlant." },
    type: { ok: [0, 1], tol: [0, 2], why: "Tipo 00 (T45/T55) : faible taux de cendres, la farine de la vraie napolitaine." },
    force: { ok: [280, 310], tol: [260, 330], why: "W 280-310 : la pâte doit encaisser une longue maturation sans s'affaisser." },
    hydra: { ok: [57, 65], tol: [55, 68], why: "57-65 % : le disciplinare AVPN 2024. Trop d'eau et le disque ne tient pas." },
    temp: { ok: [430, 485], tol: [400, 485], why: "430-485 °C (manuel Niveau II) : sous 400 °C, ce n'est pas une napolitaine." },
  },
  {
    id: "contemporaine", nom: "Contemporaine", emoji: "🫧",
    intro: "Cornicione haut et alvéolé. Farine forte, fermentation indirecte.",
    brief: { type: "Une T65, un peu plus de caractère.", force: "Farine forte, elle porte le biga/poolish.", hydra: "Généreuse, pour la mie ouverte.", temp: "Plus chaud que la classique." },
    type: { ok: [2, 2], tol: [1, 3], why: "T65 : plus de goût et de tenue pour une longue fermentation indirecte." },
    force: { ok: [320, 380], tol: [300, 400], why: "W 320-380 : une farine forte porte la biga ou la poolish sans lâcher." },
    hydra: { ok: [65, 75], tol: [60, 78], why: "65-75 % : plus d'eau que la classique, pour la mie ouverte du cornicione." },
    temp: { ok: [360, 400], tol: [340, 430], why: "360-400 °C : pour lever le bord d'un coup." },
  },
  {
    id: "teglia", nom: "In teglia", emoji: "🍞",
    intro: "Pizza en plaque, al taglio. Très haute hydratation.",
    brief: { type: "T65 ou une farine de caractère.", force: "Solide, pour tenir beaucoup d'eau.", hydra: "Très haute — c'est sa signature.", temp: "Four plus doux, cuisson longue." },
    type: { ok: [2, 3], tol: [1, 3], why: "T65 à complète : la structure doit porter 75-80 % d'eau." },
    force: { ok: [300, 360], tol: [280, 380], why: "W 300-360 : sans force, la pâte gorgée d'eau s'effondre." },
    hydra: { ok: [75, 82], tol: [70, 85], why: "75-82 % : c'est ce qui fait la mie aérée de la teglia." },
    temp: { ok: [300, 340], tol: [280, 360], why: "300-340 °C, cuisson longue en plaque — l'inverse de la napolitaine." },
  },
];

/* Note d'un axe : 2 = plage juste, 1 = tolérance, 0 = raté. */
function noteAxe(val, axe) {
  if (val >= axe.ok[0] && val <= axe.ok[1]) return 2;
  if (val >= axe.tol[0] && val <= axe.tol[1]) return 1;
  return 0;
}
const SENS = (val, axe) => (val < axe.ok[0] ? "trop bas" : val > axe.ok[1] ? "trop haut" : "juste");
const SENS_TYPE = (idx, axe) => (idx < axe.ok[0] ? "trop raffinée" : idx > axe.ok[1] ? "trop cendrée" : "juste");

export default function SimulateurPizza({ onClose, onFinish, objectifId = null }) {
  // Ouverture directe sur un objectif quand le jeu est lancé depuis une formation.
  const [obj, setObj] = useState(() => OBJECTIFS.find((o) => o.id === objectifId) || null);
  const [type, setType] = useState(1);   // index dans TYPES (T55 par défaut)
  const [force, setForce] = useState(280);
  const [hydra, setHydra] = useState(62);
  const [temp, setTemp] = useState(400);
  const [verdict, setVerdict] = useState(null);

  // La couleur/le grain du pâton suivent le TYPE choisi (Tipo 00 clair → complète foncée).
  const look = useMemo(() => doughLook(TYPES[type].water, [], []), [type]);

  function valider() {
    const axes = [
      { key: "type", label: "Type de farine", val: TYPES[type].lbl, note: noteAxe(type, obj.type), sens: SENS_TYPE(type, obj.type), why: obj.type.why },
      { key: "force", label: "Force (W)", val: `${force} W`, note: noteAxe(force, obj.force), sens: SENS(force, obj.force), why: obj.force.why },
      { key: "hydra", label: "Hydratation", val: `${hydra} %`, note: noteAxe(hydra, obj.hydra), sens: SENS(hydra, obj.hydra), why: obj.hydra.why },
      { key: "temp", label: "Four (température)", val: `${temp} °C`, note: noteAxe(temp, obj.temp), sens: SENS(temp, obj.temp), why: obj.temp.why },
    ];
    const total = axes.reduce((s, a) => s + a.note, 0);          // sur 8
    const stars = total >= 8 ? 3 : total >= 6 ? 2 : total >= 3 ? 1 : 0;
    setVerdict({ axes, total, stars });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal sim" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3><Icon name="pizza" size={18} /> Fais ta pizza</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        {!obj ? (
          <div className="mbody">
            <p className="hint" style={{ marginTop: 0 }}>Choisis ta pizza à réussir. Tu régleras la farine, sa force, l'eau et le four — comme en vrai.</p>
            <div className="sim-objs">
              {OBJECTIFS.map((o) => (
                <button key={o.id} className="sim-obj" onClick={() => { setObj(o); setVerdict(null); }}>
                  <span className="sim-obj-e" aria-hidden="true">{o.emoji}</span>
                  <b>{o.nom}</b>
                  <span className="sim-obj-d">{o.intro}</span>
                </button>
              ))}
            </div>
          </div>
        ) : verdict ? (
          <>
            <div className="mbody sim-result">
              <div className="sim-stars" aria-label={`${verdict.stars} étoiles sur 3`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < verdict.stars ? "on" : ""}>★</span>)}
              </div>
              <p className="sim-verdict-t">
                {verdict.stars === 3 ? "Parfait — c'est une vraie " + obj.nom + " !"
                  : verdict.stars === 2 ? "Bien joué, presque parfait."
                  : verdict.stars === 1 ? "Ça part, mais revois les points en rouge."
                  : "Raté — mais regarde pourquoi, c'est là qu'on apprend."}
              </p>
              <ul className="sim-feedback">
                {verdict.axes.map((a) => (
                  <li key={a.key} className={a.note === 2 ? "ok" : a.note === 1 ? "mid" : "ko"}>
                    <Icon name={a.note === 2 ? "check-circle" : a.note === 1 ? "info" : "x-circle"} size={15} />
                    <span>
                      <b>{a.label}</b> : {a.val}
                      {a.note === 2 ? " — parfait." : ` — ${a.sens}.`}
                      <em>{a.why}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => { setObj(null); setVerdict(null); }}>Autre pizza</button>
              <button className="btn" onClick={() => setVerdict(null)}>Réessayer</button>
              <button className="btn primary" onClick={() => onFinish(verdict.stars)}>
                <Icon name="check" size={15} /> Valider ({verdict.stars} ★)
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mbody sim-play">
              <div className="sim-goal">
                <span className="sim-obj-e" aria-hidden="true">{obj.emoji}</span>
                <span>Objectif : <b>{obj.nom}</b> — {obj.intro}</span>
              </div>

              {/* Instructions : ce qu'il faut viser, en mots. Ça guide sans donner les chiffres —
                  c'est au stagiaire de traduire « farine forte » en un W. */}
              <div className="sim-brief">
                <span className="sim-brief-t"><Icon name="compass" size={13} /> Ce qu'il te faut</span>
                <ul>
                  <li><b>Farine</b> — {obj.brief.type} {obj.brief.force}</li>
                  <li><b>Eau</b> — {obj.brief.hydra}</li>
                  <li><b>Four</b> — {obj.brief.temp}</li>
                </ul>
              </div>

              <div className="sim-stage">
                <Paton hydra={hydra} w={force} look={look} patonG={260} />
              </div>

              <label className="sim-ctrl">
                <span className="sim-ctrl-h">Type de farine <b>{TYPES[type].lbl}</b></span>
                <div className="sim-pills">
                  {TYPES.map((f) => (
                    <button key={f.idx} className={"sim-pill" + (type === f.idx ? " on" : "")} onClick={() => setType(f.idx)}>
                      {f.lbl}<span>{f.sub}</span>
                    </button>
                  ))}
                </div>
              </label>

              <label className="sim-ctrl">
                <span className="sim-ctrl-h">Force de la farine <b>{force} W</b></span>
                <input type="range" min="150" max="400" step="10" value={force} className="sim-range"
                  onChange={(e) => setForce(Number(e.target.value))} />
                <span className="sim-range-hint">Le W (force boulangère) dit combien de temps la pâte tient : plus il est haut, plus la fermentation peut être longue.</span>
              </label>

              <label className="sim-ctrl">
                <span className="sim-ctrl-h">Hydratation <b>{hydra} %</b></span>
                <input type="range" min="50" max="85" value={hydra} className="sim-range"
                  onChange={(e) => setHydra(Number(e.target.value))} />
                <span className="sim-range-hint">Plus d'eau = pâte plus souple, mie plus ouverte — mais plus dure à travailler.</span>
              </label>

              <label className="sim-ctrl">
                <span className="sim-ctrl-h">Four <b>{temp} °C</b></span>
                <div className="sim-pills">
                  {FOURS.map((f) => (
                    <button key={f.t} className={"sim-pill" + (temp === f.t ? " on" : "")} onClick={() => setTemp(f.t)}>
                      {f.lbl}<span>{f.sub}</span>
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => setObj(null)}>Changer d'objectif</button>
              <button className="btn primary" onClick={valider}>
                <Icon name="flame" size={15} /> Enfourner et noter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
