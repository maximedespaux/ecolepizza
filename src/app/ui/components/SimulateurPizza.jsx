import { useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";
import { Paton, doughLook } from "./LivePizza.jsx";
// Échap : ce jeu était la modale qui l'avait oublié (cf. lib/useEchap.js).
import { useEchap } from "../lib/useEchap.js";

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

/* Un objectif = une fenêtre idéale par axe (des manuels) + un briefing qualitatif qui GUIDE
   sans donner les chiffres — c'est au joueur de traduire « farine forte » en un W. */
const OBJECTIFS = [
  {
    id: "classique", nom: "Classique", emoji: "🍕",
    intro: "La pizza de tous les jours, cornicione léger.",
    brief: { type: "faite avec la farine de tous les jours, ni la plus blanche ni une complète",
             force: "qui lève en quelques heures, sans attendre le lendemain",
             hydra: "facile à étaler, ni collante ni sèche",
             temp: "et qui cuise tranquillement, en cinq ou six minutes" },
    type: { ok: [1, 2], tol: [0, 3], why: "T55/T65 : la farine du quotidien, ni trop raffinée ni complète." },
    force: { ok: [200, 250], tol: [180, 280], why: "W ~220 : une fermentation courte ne demande pas une farine forte." },
    hydra: { ok: [55, 62], tol: [52, 66], why: "55-62 % : souple pour s'étaler, assez ferme pour un four moyen." },
    temp: { ok: [320, 360], tol: [300, 380], why: "320-360 °C : la cuisson classique, 5-6 min." },
  },
  {
    id: "napolitaine", nom: "Napolitaine AVPN", emoji: "🔥",
    intro: "Cuisson éclair à très haute température. La reine, la plus exigeante.",
    brief: { type: "faite d'une farine très blanche, presque sans son",
             force: "qui tienne une longue maturation sans s'affaisser",
             hydra: "souple, mais pas noyée : le disque doit tenir sur la pelle",
             temp: "et qui soit saisie en une minute, dans un four brûlant" },
    type: { ok: [0, 1], tol: [0, 2], why: "Tipo 00 (T45/T55) : faible taux de cendres, la farine de la vraie napolitaine." },
    force: { ok: [280, 310], tol: [260, 330], why: "W 280-310 : la pâte doit encaisser une longue maturation sans s'affaisser." },
    hydra: { ok: [57, 65], tol: [55, 68], why: "57-65 % : le disciplinare AVPN 2024. Trop d'eau et le disque ne tient pas." },
    temp: { ok: [430, 485], tol: [400, 485], why: "430-485 °C (manuel Niveau II) : sous 400 °C, ce n'est pas une napolitaine." },
  },
  {
    id: "contemporaine", nom: "Contemporaine", emoji: "🫧",
    intro: "Cornicione haut et alvéolé. Farine forte, fermentation indirecte.",
    brief: { type: "faite d'une farine qui a du caractère, un peu plus cendrée",
             force: "assez forte pour porter une biga ou une poolish sans lâcher",
             hydra: "bien hydratée, pour une mie ouverte et un bord qui monte",
             temp: "et qui cuise plus chaud que la classique, pour lever le bord d'un coup" },
    type: { ok: [2, 2], tol: [1, 3], why: "T65 : plus de goût et de tenue pour une longue fermentation indirecte." },
    force: { ok: [320, 380], tol: [300, 400], why: "W 320-380 : une farine forte porte la biga ou la poolish sans lâcher." },
    hydra: { ok: [65, 75], tol: [60, 78], why: "65-75 % : plus d'eau que la classique, pour la mie ouverte du cornicione." },
    temp: { ok: [360, 400], tol: [340, 430], why: "360-400 °C : pour lever le bord d'un coup." },
  },
  {
    id: "teglia", nom: "In teglia", emoji: "🍞",
    intro: "Pizza en plaque, al taglio. Très haute hydratation.",
    brief: { type: "faite d'une farine de caractère, capable de porter la structure",
             force: "solide, parce qu'elle va boire énormément",
             hydra: "très hydratée, presque coulante — c'est sa signature",
             temp: "et qui cuise longuement, dans un four plus doux" },
    type: { ok: [2, 3], tol: [1, 3], why: "T65 à complète : la structure doit porter 75-80 % d'eau." },
    force: { ok: [300, 360], tol: [280, 380], why: "W 300-360 : sans force, la pâte gorgée d'eau s'effondre." },
    hydra: { ok: [75, 82], tol: [70, 85], why: "75-82 % : c'est ce qui fait la mie aérée de la teglia." },
    temp: { ok: [300, 340], tol: [280, 360], why: "300-340 °C, cuisson longue en plaque, l'inverse de la napolitaine." },
  },
];

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   LA COMMANDE D'UN CLIENT, PAS UNE CARTE À CHOISIR.

   L'écran de choix montrait quatre pavés — « Classique », « Napolitaine AVPN »… — et le
   briefing détaillait ensuite ce qu'il fallait viser. On prenait toujours le même, et comme le
   style était NOMMÉ, la réponse s'apprenait par cœur : quatre jeux de quatre réglages, et le
   simulateur ne simulait plus rien.

   Désormais la partie s'ouvre sur une COMMANDE, tirée au sort. Le client ne dit pas « une
   contemporaine à 70 % d'hydratation », il dit « j'ai vu vos photos, le bord bien alvéolé » —
   c'est au pizzaïolo de traduire. C'est le geste du comptoir, et c'est le seul qui s'apprenne :
   reconnaître ce qu'on vous demande.

   ⚠ L'ALÉATOIRE NE TOUCHE PAS AUX VALEURS. Les fenêtres (W, hydratation, températures) viennent
   des manuels et du disciplinare AVPN : les tirer au hasard produirait des napolitaines à 300 °C
   et enseignerait du faux. Ce qui varie, c'est la FORMULATION et l'ordre de passage — trois
   commandes par style, douze ouvertures possibles, et le style lui-même n'est révélé qu'au
   verdict.

   Le briefing reste : il guide en mots (« une farine 00, peu cendrée ») sans donner un chiffre.
   C'est lui qui rend la commande soluble sans la nommer. */
const COMMANDES = {
  classique: [
    "Bonjour ! Une margherita toute simple, c'est pour ce midi.",
    "Trois pizzas pour la famille, rien de compliqué.",
    "Comme d'habitude, la maison — celle de tous les jours.",
  ],
  napolitaine: [
    "Je rentre de Naples… vous faites la vraie, celle qui gonfle ?",
    "Votre four à bois est chaud ? Alors une napolitaine, la vraie.",
    "On m'a dit que vous étiez certifiés. Une AVPN, s'il vous plaît.",
  ],
  contemporaine: [
    "J'ai vu vos photos : le bord bien alvéolé, c'est ça que je veux.",
    "Vous travaillez en biga ? Je prends ce que ça donne.",
    "Une pizza à la mie ouverte, avec un cornicione qui monte haut.",
  ],
  teglia: [
    "Deux parts de la plaque, à emporter s'il vous plaît.",
    "Une pizza al taglio, comme à Rome — bien aérée.",
    "Vous avez de la pizza en plaque, coupée au ciseau ?",
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   CINQ MANCHES, ET UN SEUL ENFOURNEMENT PAR MANCHE.

   La partie tenait en UNE pizza qu'on pouvait retenter trois fois, en gardant la meilleure
   fournée. On pouvait donc corriger axe par axe jusqu'à tomber juste — les retours disent
   eux-mêmes dans quel sens — et trois étoiles finissaient par tomber sans qu'on ait rien
   reconnu. Cinq commandes d'affilée, un seul essai chacune, mesurent autre chose : savoir lire
   ce qu'on vous demande, du premier coup, cinq fois de suite.

   LES CŒURS SORTENT DE CE JEU. Ils donnaient les trois essais ; sans reprise, ils ne modélisent
   plus rien. Et ils ne pourraient pas revenir tels quels : un score CUMULÉ se ferait grossir à
   volonté si l'on pouvait rejouer une manche, et les seuils ci-dessous ne voudraient plus rien
   dire. Les trois autres jeux de l'arcade les gardent (cf. `lib/coeurs.js`).

   LE BARÈME EST SUR 20 — quatre réglages × cinq manches. La plage JUSTE vaut 1 point, la
   TOLÉRANCE une demi. Garder la demi-mesure importe : « 62 % au lieu de 65 » n'est pas la même
   faute que « 62 % au lieu de 80 », et les trois couleurs du retour disent déjà cette nuance.
   Une note sur 20 avec des demi-points, c'est aussi la façon dont on note en France.

   Les seuils sont ceux demandés : 18 et plus, trois étoiles ; 11 à 17, deux ; 5 à 10, une.
   Écrits en `>=` pour que les demi-points tombent du bon côté — 17,5 reste à deux étoiles. */
const MANCHES = 5;
const POINTS_MAX = MANCHES * 4;

function etoilesPour(points) {
  if (points >= 18) return 3;
  if (points >= 11) return 2;
  if (points >= 5) return 1;
  return 0;
}

/* Cinq commandes tirées de sorte que LES QUATRE STYLES PASSENT. Un tirage indépendant à chaque
   manche pouvait donner cinq fois la même : une partie qui ne montre qu'un style n'apprend
   qu'un quart du programme, et le hasard le ferait arriver une fois sur 256. On mélange donc les
   quatre, puis on complète par un cinquième au hasard. */
function tirerPartie() {
  const styles = [...OBJECTIFS];
  for (let i = styles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [styles[i], styles[j]] = [styles[j], styles[i]];
  }
  styles.push(OBJECTIFS[Math.floor(Math.random() * OBJECTIFS.length)]);
  return styles.map((o) => {
    const lignes = COMMANDES[o.id] || [o.intro];
    return { obj: o, dit: lignes[Math.floor(Math.random() * lignes.length)] };
  });
}

/* Note d'un axe : 2 = plage juste, 1 = tolérance, 0 = raté. Les POINTS en découlent (1 et ½) —
   la note à trois niveaux reste, c'est elle qui colore le retour. */
function noteAxe(val, axe) {
  if (val >= axe.ok[0] && val <= axe.ok[1]) return 2;
  if (val >= axe.tol[0] && val <= axe.tol[1]) return 1;
  return 0;
}
const pointsDe = (note) => (note === 2 ? 1 : note === 1 ? 0.5 : 0);
/* « 3,5 » et non « 3.5 » : c'est une note, en français. */
const fmtPts = (n) => String(n).replace(".", ",");
const SENS = (val, axe) => (val < axe.ok[0] ? "trop bas" : val > axe.ok[1] ? "trop haut" : "juste");
const SENS_TYPE = (idx, axe) => (idx < axe.ok[0] ? "trop raffinée" : idx > axe.ok[1] ? "trop cendrée" : "juste");

export default function SimulateurPizza({ onClose, onFinish, objectifId = null }) {
  /* ON OUVRE SUR UN SERVICE : cinq commandes tirées d'avance. `objectifId` reste honoré s'il
     est fourni — lancement depuis une formation — et impose alors le style des cinq. */
  const [partie, setPartie] = useState(() => {
    const impose = OBJECTIFS.find((o) => o.id === objectifId);
    if (!impose) return tirerPartie();
    const lignes = COMMANDES[impose.id] || [impose.intro];
    return Array.from({ length: MANCHES }, (_, i) => ({ obj: impose, dit: lignes[i % lignes.length] }));
  });
  const [manche, setManche] = useState(0);          // 0 → 4
  const [acquis, setAcquis] = useState([]);         // points de chaque manche jouée
  /* APRÈS LA DERNIÈRE MANCHE, `manche` vaut 5 et `partie[5]` N'EXISTE PAS — la partie en compte
     cinq, indices 0 à 4. `cmd.obj` levait alors, et React démontait la modale : le service se
     jouait entièrement puis l'écran de fin disparaissait au lieu de s'afficher. On retient la
     dernière commande, qui est justement celle dont ce résumé parle. */
  const cmd = partie[Math.min(manche, MANCHES - 1)];
  const obj = cmd.obj;
  const pointsTotal = acquis.reduce((a, b) => a + b, 0);
  const [type, setType] = useState(1);   // index dans TYPES (T55 par défaut)
  const [force, setForce] = useState(280);
  const [hydra, setHydra] = useState(62);
  const [temp, setTemp] = useState(400);
  const [verdict, setVerdict] = useState(null);
  /* PLUS DE CŒURS ICI : ils donnaient les trois essais d'une même pizza. Un seul enfournement
     par manche les rend sans objet — et ils rendraient le score cumulé extensible à volonté. */
  const fini = manche >= MANCHES;
  const etoiles = etoilesPour(pointsTotal);

  /* Dès qu'un score existe, TOUTES les sorties le valident — la croix, le voile et Échap.
     Elles appelaient `onClose`, qui referme sans rien enregistrer : l'écran affichait les étoiles
     obtenues et fermer par la croix les jetait. C'est le geste le plus naturel devant un
     résultat, et c'était le seul qui perdait le score. Avant la première vérification il n'y a
     rien à garder : la croix abandonne, comme avant. */
  /* Dès qu'une manche est jouée, sortir VALIDE ce qui est acquis — fermer par la croix ne doit
     pas jeter quatre manches réussies. Avant la première, il n'y a rien à garder. */
  const fermer = acquis.length ? () => onFinish(etoiles) : onClose;
  useEchap(fermer);

  // La couleur/le grain du pâton suivent le TYPE choisi (Tipo 00 clair → complète foncée).
  const look = useMemo(() => doughLook(TYPES[type].water, [], []), [type]);

  function valider() {
    const axes = [
      { key: "type", label: "Type de farine", val: TYPES[type].lbl, note: noteAxe(type, obj.type), sens: SENS_TYPE(type, obj.type), why: obj.type.why },
      { key: "force", label: "Force (W)", val: `${force} W`, note: noteAxe(force, obj.force), sens: SENS(force, obj.force), why: obj.force.why },
      { key: "hydra", label: "Hydratation", val: `${hydra} %`, note: noteAxe(hydra, obj.hydra), sens: SENS(hydra, obj.hydra), why: obj.hydra.why },
      { key: "temp", label: "Four (température)", val: `${temp} °C`, note: noteAxe(temp, obj.temp), sens: SENS(temp, obj.temp), why: obj.temp.why },
    ];
    const points = axes.reduce((s, a) => s + pointsDe(a.note), 0);   // sur 4
    setVerdict({ axes, points });
    setAcquis((l) => [...l, points]);
  }

  /* Passer à la suite : la manche d'après, ou l'écran de fin quand les cinq sont jouées. */
  function suivante() {
    setVerdict(null);
    setManche((m) => m + 1);
  }
  function rejouer() {
    setPartie(tirerPartie()); setManche(0); setAcquis([]); setVerdict(null);
    setType(1); setForce(280); setHydra(62); setTemp(400);
  }

  return (
    <div className="overlay" onClick={fermer}>
      <div className="modal sim" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3><Icon name="pizza" size={18} /> Fais ta pizza</h3>
          <button className="x" onClick={fermer} aria-label="Fermer">×</button>
        </div>

        {fini ? (
          /* FIN DE SERVICE — le seul endroit où les étoiles se comptent. Le détail des cinq
             manches y figure : une note globale sans le détail ne dit pas OÙ l'on a perdu, et
             c'est précisément ce qu'on vient chercher. */
          <>
            <div className="mbody sim-result">
              <div className="sim-stars" aria-label={`${etoiles} étoiles sur 3`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < etoiles ? "on" : ""}>★</span>)}
              </div>
              <p className="sim-verdict-t">
                Service terminé — <b>{fmtPts(pointsTotal)} / {POINTS_MAX}</b>
              </p>
              <p className="sim-etait" style={{ justifyContent: "center" }}>
                {etoiles === 3 ? "Sans faute ou presque : tu lis une commande comme un pro."
                  : etoiles === 2 ? "Bon service. Les styles sont là, les réglages se peaufinent."
                  : etoiles === 1 ? "Le service passe, mais relis les fenêtres du manuel."
                  : "Rude soirée. Reprends les quatre styles, ils reviennent tous."}
              </p>
              <ol className="sim-manches">
                {partie.slice(0, acquis.length).map((c, i) => (
                  <li key={i}>
                    <span className="sim-obj-e" aria-hidden="true">{c.obj.emoji}</span>
                    <span style={{ flex: 1 }}>{c.obj.nom}</span>
                    <b className="chiffres">{fmtPts(acquis[i])} / 4</b>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={rejouer}>
                <Icon name="refresh" size={14} /> Rejouer un service
              </button>
              <button className="btn primary" onClick={() => onFinish(etoiles)}>
                <Icon name="check" size={15} /> Valider ({etoiles} ★)
              </button>
            </div>
          </>
        ) : verdict ? (
          <>
            <div className="mbody sim-result">
              {/* PAS D'ÉTOILES ICI. Elles ne se comptent qu'en fin de service, sur les cinq
                  manches : en afficher par manche laisserait croire qu'on les gagne à l'unité. */}
              <p className="sim-manche-n">Commande {manche + 1} / {MANCHES}</p>
              <p className="sim-verdict-t">
                {verdict.points === 4 ? "Parfait, c'est exactement ça !"
                  : verdict.points >= 3 ? "Bien joué, presque parfait."
                  : verdict.points >= 1.5 ? "Ça part, mais revois les points en rouge."
                  : "Raté, mais regarde pourquoi, c'est là qu'on apprend."}
                {" "}<b>{fmtPts(verdict.points)} / 4</b>
              </p>
              {/* CE QUE LE CLIENT DEMANDAIT — À CHAQUE FOIS, RÉUSSI OU NON.
                  Le nom du style ne tombait qu'au sans-faute : en ratant, on ne savait donc
                  jamais ce qu'il aurait fallu reconnaître, et c'est justement là qu'on apprend.
                  Cacher le nom pendant le réglage rend le jeu instructif ; le cacher au verdict
                  le rendrait seulement obscur. */}
              <p className="sim-etait">
                <span className="sim-obj-e" aria-hidden="true">{obj.emoji}</span>
                Le client demandait une <b>{obj.nom}</b> — {obj.intro}
              </p>
              <ul className="sim-feedback">
                {verdict.axes.map((a) => (
                  <li key={a.key} className={a.note === 2 ? "ok" : a.note === 1 ? "mid" : "ko"}>
                    <Icon name={a.note === 2 ? "check-circle" : a.note === 1 ? "info" : "x-circle"} size={15} />
                    <span>
                      <b>{a.label}</b> : {a.val}
                      {/* L'ESPACE EST DANS LA CHAÎNE, pas entre les accolades : JSX supprime un
                          saut de ligne qui sépare deux expressions, et « 65 % » se collait à
                          « parfait ». L'autre branche s'en tirait par hasard — elle commence par
                          sa propre virgule. */}
                      {a.note === 2 ? " parfait." : `, ${a.sens}.`}
                      <em>{a.why}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {/* PAS DE « RÉESSAYER » : le score est CUMULÉ, une reprise le ferait grossir à
                volonté et les seuils ne voudraient plus rien dire. Une commande, un
                enfournement — c'est ce que mesure le jeu. */}
            <div className="mfoot">
              <span className="hint" style={{ flex: 1 }}>Total {fmtPts(pointsTotal)} / {POINTS_MAX}</span>
              <button className="btn primary" onClick={suivante}>
                {manche + 1 < MANCHES
                  ? <><Icon name="chevron-right" size={15} /> Commande suivante</>
                  : <><Icon name="check" size={15} /> Voir le service</>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mbody sim-play">
              {/* LES CŒURS SE LISENT PENDANT LE RÉGLAGE, et pas seulement après la fournée. Ils
                  n'apparaissaient qu'avec le verdict : on réglait sa farine sans savoir s'il
                  restait deux essais ou un seul, alors que c'est exactement ce qui décide entre
                  tenter un coup et sécuriser. Une information qui arrive après la décision
                  n'informe rien. */}
              {/* LE STYLE N'EST PAS NOMMÉ ICI, et c'est tout l'intérêt : « Napolitaine AVPN »
                  écrit en gras transformait le jeu en table de correspondance. Le client parle,
                  le briefing ci-dessous guide en mots, et le nom du style ne tombe qu'au verdict
                  — au moment où il apprend quelque chose plutôt qu'il ne dispense de chercher. */}
              <div className="sim-goal">
                <span className="sim-obj-e" aria-hidden="true">🧑‍🍳</span>
                <span style={{ flex: 1 }} className="sim-cmd">« {cmd.dit} »</span>
                <span className="sim-manche-n chiffres">{manche + 1}/{MANCHES}</span>
              </div>

              {/* Instructions : ce qu'il faut viser, en mots. Ça guide sans donner les chiffres —
                  c'est au stagiaire de traduire « farine forte » en un W. */}
              {/* CE QUE LE CLIENT ATTEND, DIT PAR LUI — pas une fiche technique.
                  Le bloc s'écrivait en télégramme : « Farine, Une farine courante, T55 ou T65.
                  Force moyenne, pas besoin qu'elle tienne des heures. » Deux défauts d'un coup.
                  La forme d'abord : un intitulé, une virgule, deux phrases collées — personne ne
                  parle comme ça, et le jeu venait justement de mettre un client au comptoir.
                  Le fond ensuite, plus gênant : la FARINE et sa FORCE tenaient dans la MÊME
                  puce. Trois puces pour quatre réglages, et l'on cherchait le quatrième.
                  Une phrase, un souhait, un réglage — dans l'ordre des curseurs en dessous. */}
              <div className="sim-brief">
                <span className="sim-brief-t"><Icon name="message-circle" size={13} /> Ce qu'il attend</span>
                <p className="sim-brief-i">« Je voudrais une pâte…</p>
                <ul>
                  <li>{obj.brief.type},</li>
                  <li>{obj.brief.force},</li>
                  <li>{obj.brief.hydra},</li>
                  <li>{obj.brief.temp}. »</li>
                </ul>
              </div>

              <div className="sim-stage">
                <Paton hydra={hydra} w={force} look={look} patonG={260} />
              </div>

              {/* ─────────────────────────────────────────────────────────────────────────
                  PAS UN `<label>` — ET C'ÉTAIT UN VRAI DÉFAUT, pas une question de style.

                  Un `<label>` sans `for` s'associe à son PREMIER DESCENDANT CONTRÔLABLE, et un
                  `<button>` en est un. Le bloc entier étant un label, survoler n'importe où
                  dedans — une pastille, le titre — mettait la PREMIÈRE pastille en `:hover` :
                  « Tipo 00 » s'allumait quand on pointait « Complète ». C'est la spécification
                  qui le veut, aucun CSS n'y pouvait rien.
                  Au lecteur d'écran, c'était pire encore : « Type de farine » était annoncé
                  comme le NOM du premier bouton, et les trois autres n'avaient plus d'intitulé
                  de groupe du tout.
                  Un groupe de boutons exclusifs n'est pas un champ de formulaire : `role="group"`
                  nomme l'ensemble sans s'attacher à l'un d'eux. Les DEUX autres blocs, eux,
                  enveloppent un vrai curseur unique — leur `<label>` est légitime et reste. */}
              <div className="sim-ctrl" role="group" aria-labelledby="sim-t-farine">
                <span className="sim-ctrl-h" id="sim-t-farine">Type de farine <b>{TYPES[type].lbl}</b></span>
                <div className="sim-pills">
                  {TYPES.map((f) => (
                    <button key={f.idx} className={"sim-pill" + (type === f.idx ? " on" : "")} onClick={() => setType(f.idx)}>
                      {f.lbl}<span>{f.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

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
                <span className="sim-range-hint">Plus d'eau = pâte plus souple, mie plus ouverte, mais plus dure à travailler.</span>
              </label>

              {/* LE FOUR AU CURSEUR, PLUS EN TROIS PASTILLES. « Électrique 340 / Gaz 400 /
                  Bois 460 » donnait la réponse : trois valeurs, une par style, il suffisait de
                  reconnaître laquelle. Un curseur oblige à ESTIMER, comme pour le W et l'eau —
                  et c'est la même compétence : traduire « un four brûlant » en un nombre.
                  La plage 250-500 couvre les quatre styles avec de la marge (la teglia descend
                  à 280 en tolérance, l'AVPN monte à 485) sans permettre d'absurdités. */}
              <label className="sim-ctrl">
                <span className="sim-ctrl-h">Four <b>{temp} °C</b></span>
                <input type="range" min="250" max="500" step="5" value={temp} className="sim-range"
                  onChange={(e) => setTemp(Number(e.target.value))} />
                <span className="sim-range-hint">Plus le four est chaud, plus la cuisson est courte : 5-6 min à 340 °C, 60-90 s à 460 °C.</span>
              </label>
            </div>
            <div className="mfoot">
              {/* « Changer d'objectif » renvoyait au menu des quatre pavés, qui n'existe plus.
                  Il retire une commande — même geste, sans revenir à une carte. */}
              <span className="hint" style={{ flex: 1 }}>
                {manche === 0 ? "Cinq commandes, un seul enfournement chacune."
                  : `Total ${fmtPts(pointsTotal)} / ${POINTS_MAX}`}
              </span>
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
