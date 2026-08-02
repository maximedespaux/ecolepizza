import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { useEchap } from "../lib/useEchap.js";

/**
 * LA COMMANDE PIÈGE — soixante secondes au comptoir, les allergènes en pleine bourre.
 *
 * CE QU'IL ENTRAÎNE. Le QCM demande « quels sont les 14 allergènes ». Le comptoir demande
 * « allergie au lait, la Margherita ça passe ? » — et il le demande pendant qu'une autre commande
 * sort du four. Entre les deux il y a un RÉFLEXE : lire une composition et trancher tout de suite.
 * C'est ce réflexe qui manque quand ça arrive pour de vrai, pas la liste des quatorze.
 *
 * LA CARTE SE CONSULTE, ELLE NE S'AFFICHE PAS. Posée en permanence, elle transformait le jeu en
 * exercice de lecture : la réponse était toujours sous les yeux, il n'y avait plus rien à savoir.
 * Derrière un bouton, elle recrée l'arbitrage réel du comptoir — je me souviens, ou je vérifie ?
 * ET LE CHRONO NE S'ARRÊTE PAS pendant la consultation. C'est tout l'intérêt : vérifier coûte du
 * temps, exactement comme aller chercher le classeur derrière le comptoir. Ce qu'on apprend, ce
 * n'est pas à éviter de vérifier — c'est à savoir QUAND c'est nécessaire.
 *
 * TROIS RÉPONSES, ET LA TROISIÈME EST LA PLUS IMPORTANTE. « À vérifier » n'est pas une échappatoire :
 * c'est la bonne réponse chaque fois que l'allergène dépend du FOURNISSEUR — le manuel écrit
 * lui-même « souvent des sulfites (le jambon) ». Un stagiaire qui répond « non » avec aplomb sur
 * une charcuterie a tort, même quand il tombe juste. On sanctionne donc l'aplomb, pas l'ignorance.
 *
 * UNE ERREUR COÛTE DU TEMPS (−4 s) plutôt que des points : sur un allergène, se tromper vite est
 * pire que répondre lentement. C'est la seule pénalité qui enseigne quelque chose.
 *
 * ⚠️ LA CARTE EST UNE CARTE DE JEU. Les dix pizzas et leurs compositions sont écrites ici, pas
 * tirées d'un référentiel de l'école — `garnitures.js` ne déclare aucun allergène, la table
 * produit → allergène n'existe nulle part dans le projet. Ce qui est affirmé reste donc dans deux
 * catégories seulement :
 *   · ce qui découle de la COMPOSITION affichée (la pâte porte le gluten, la mozzarella le lait,
 *     l'anchois le poisson) — vérifiable en lisant la ligne ;
 *   · ce que le manuel nomme lui-même (les 14, les sulfites « souvent » dans les charcuteries et
 *     le balsamique, la contamination croisée, substitution ≠ éviction).
 * Tout le reste est « à vérifier ». Le jour où l'école publie sa vraie carte et sa table
 * d'allergènes, elles remplacent celles-ci sans toucher au reste du jeu.
 */

/* Les ingrédients qui PORTENT un allergène de façon certaine, par lecture de la composition.
   `verifier` = l'allergène dépend du fournisseur : la bonne réponse devient « à vérifier ». */
const INGREDIENTS = {
  pate: { nom: "pâte", allergenes: ["gluten"] },
  tomate: { nom: "sauce tomate", allergenes: [] },
  creme: { nom: "crème", allergenes: ["lait"] },
  mozzarella: { nom: "mozzarella", allergenes: ["lait"] },
  chevre: { nom: "chèvre", allergenes: ["lait"] },
  gorgonzola: { nom: "gorgonzola", allergenes: ["lait"] },
  parmesan: { nom: "parmesan", allergenes: ["lait"] },
  burrata: { nom: "burrata", allergenes: ["lait"] },
  anchois: { nom: "anchois", allergenes: ["poisson"] },
  thon: { nom: "thon", allergenes: ["poisson"] },
  saumon: { nom: "saumon", allergenes: ["poisson"] },
  oeuf: { nom: "œuf", allergenes: ["oeufs"] },
  pignons: { nom: "pignons de pin", allergenes: ["fruits a coque"] },
  pesto: { nom: "pesto", allergenes: ["fruits a coque", "lait"] },
  // Charcuteries et balsamique : le manuel écrit « SOUVENT des sulfites ». Donc à vérifier.
  jambon: { nom: "jambon", verifier: ["sulfites"] },
  chorizo: { nom: "chorizo", verifier: ["sulfites"] },
  jambon_cru: { nom: "jambon cru", verifier: ["sulfites"] },
  balsamique: { nom: "vinaigre balsamique", verifier: ["sulfites"] },
  champignon: { nom: "champignons", allergenes: [] },
  olives: { nom: "olives", allergenes: [] },
  basilic: { nom: "basilic", allergenes: [] },
  roquette: { nom: "roquette", allergenes: [] },
  origan: { nom: "origan", allergenes: [] },
  ail: { nom: "ail", allergenes: [] },
  huile: { nom: "huile d'olive", allergenes: [] },
  oignon: { nom: "oignon", allergenes: [] },
  poivron: { nom: "poivron", allergenes: [] },
  aubergine: { nom: "aubergine", allergenes: [] },
  courgette: { nom: "courgette", allergenes: [] },
  miel: { nom: "miel", allergenes: [] },
  pomme_de_terre: { nom: "pomme de terre", allergenes: [] },
  artichaut: { nom: "artichaut", allergenes: [] },
};

/* LA CARTE — dix pizzas. `pate` n'est pas listée : elle est sous toutes, et l'ajouter à chaque
   ligne noierait ce qui distingue une pizza d'une autre. Le gluten est donc TOUJOURS présent, et
   c'est précisément ce que la première question apprend. */
const CARTE = [
  { nom: "Marinara", ing: ["tomate", "ail", "origan", "huile"] },
  { nom: "Margherita", ing: ["tomate", "mozzarella", "basilic"] },
  { nom: "Reine", ing: ["tomate", "mozzarella", "jambon", "champignon"] },
  { nom: "Napolitaine", ing: ["tomate", "mozzarella", "anchois", "olives", "origan"] },
  { nom: "Quatre fromages", ing: ["mozzarella", "gorgonzola", "chevre", "parmesan"] },
  { nom: "Végétarienne", ing: ["tomate", "mozzarella", "poivron", "aubergine", "courgette", "oignon"] },
  { nom: "Chèvre-miel", ing: ["creme", "chevre", "miel", "roquette"] },
  { nom: "Pescatore", ing: ["tomate", "thon", "oignon", "olives", "ail"] },
  { nom: "Diavola", ing: ["tomate", "mozzarella", "chorizo", "poivron"] },
  { nom: "Bella", ing: ["tomate", "burrata", "jambon_cru", "roquette", "pesto", "balsamique"] },
];

/* Les contraintes qu'un client peut poser. `mot` sert à formuler la question, `cle` à interroger
   la composition. Le gluten n'est pas dans la liste des tirages « pizza » : la réponse serait
   toujours « non », et une question dont on connaît la réponse d'avance n'apprend rien — il a sa
   propre situation, une seule fois, en ouverture. */
const CONTRAINTES = [
  { cle: "lait", mot: "allergie au lait" },
  { cle: "poisson", mot: "allergie au poisson" },
  { cle: "fruits a coque", mot: "allergie aux fruits à coque" },
  { cle: "oeufs", mot: "allergie aux œufs" },
  { cle: "sulfites", mot: "intolérance aux sulfites" },
];

const REPONSES = [
  { v: "oui", label: "Ça passe" },
  { v: "non", label: "Non" },
  { v: "verifier", label: "À vérifier" },
];

/**
 * La bonne réponse pour une pizza et une contrainte, DÉDUITE de la composition affichée.
 *
 * L'ordre compte : un allergène certain l'emporte sur un « à vérifier ». Une Bella porte du pesto
 * (fruits à coque, certain) ET du jambon cru (sulfites, à vérifier) — sur une allergie aux fruits
 * à coque, la réponse est « non », sans discussion.
 */
function attendu(pizza, contrainte) {
  const ing = pizza.ing.map((k) => INGREDIENTS[k]).filter(Boolean);
  const certain = ing.filter((i) => (i.allergenes || []).includes(contrainte.cle));
  if (certain.length) return { rep: "non", cause: certain.map((i) => i.nom).join(", ") };
  const douteux = ing.filter((i) => (i.verifier || []).includes(contrainte.cle));
  if (douteux.length) return { rep: "verifier", cause: douteux.map((i) => i.nom).join(", ") };
  return { rep: "oui", cause: null };
}

/* LES PIÈGES DE SERVICE — ils ne se lisent pas sur la carte, et c'est pour cela qu'ils comptent.
   Même grammaire à trois réponses, tirés dans le même flux. Chacun porte sa source de manuel. */
const PIEGES = [
  { q: "« Je suis cœliaque. » La Marinara n'a ni fromage ni charcuterie — ça passe ?", rep: "non",
    pourquoi: "Le gluten EST la pâte : aucune pizza de la carte n'en est exempte. Et même avec une "
      + "farine sans gluten, un four et un plan de travail couverts de farine de blé exposent à la "
      + "contamination croisée.",
    source: "Manuel — Les allergènes · Points de vigilance" },
  { q: "Tu viens de trancher du saumon sur ta planche. Une Margherita pour un allergique au poisson ?", rep: "non",
    pourquoi: "C'est le cas d'école du manuel — « attention à la planche qui a servi au poisson juste "
      + "avant ». Une pizza sans poisson préparée sur une planche à poisson contient du poisson, et "
      + "un rinçage n'enlève pas une protéine.",
    source: "Manuel — Les allergènes · exemple de la Reine" },
  { q: "« Votre pâte à la châtaigne, c'est bien sans gluten ? »", rep: "non",
    pourquoi: "Une substitution remplace une PART du poids de farine de blé, à poids total constant. "
      + "Le blé reste majoritaire : la pâte contient toujours du gluten. Confondre substitution et "
      + "éviction est l'erreur qui envoie un cœliaque aux urgences.",
    source: "Manuel — Les substitutions · Définition" },
  { q: "« Vous avez la liste des allergènes ? » Tu l'as, dans un classeur derrière le comptoir.", rep: "oui",
    pourquoi: "Un document écrit, clair et accessible suffit — carte, tableau, classeur ou support "
      + "numérique. Il faut en revanche qu'un affichage dise qu'il existe : « La liste des allergènes "
      + "est disponible sur demande. »",
    source: "Manuel — Les allergènes · Modalités d'affichage" },
  { q: "Un extra embauché ce matin prend seul une commande « allergie arachide ». Tu le laisses faire ?", rep: "non",
    pourquoi: "« Formation des équipes » et « personnel formé » sont deux points distincts du manuel. "
      + "Une liste ne remplace pas quelqu'un qui sait la lire — on reprend la commande, et on forme.",
    source: "Manuel — Les allergènes · Bonnes pratiques" },
];

const DUREE = 60;          // secondes
const MALUS = 4;           // secondes perdues sur une erreur
const alea = (n) => Math.floor(Math.random() * n);

/** Tire la question suivante : une lecture de carte trois fois sur quatre, un piège sinon. */
function tirer() {
  if (alea(4) === 0) {
    const p = PIEGES[alea(PIEGES.length)];
    return { type: "piege", ...p };
  }
  const pizza = CARTE[alea(CARTE.length)];
  const contrainte = CONTRAINTES[alea(CONTRAINTES.length)];
  const { rep, cause } = attendu(pizza, contrainte);
  return {
    type: "carte", pizza, contrainte, rep,
    q: `« ${contrainte.mot[0].toUpperCase()}${contrainte.mot.slice(1)}. » La ${pizza.nom}, ça passe ?`,
    pourquoi: rep === "non" ? `La ${pizza.nom} porte ${cause}.`
      : rep === "verifier" ? `${cause[0].toUpperCase()}${cause.slice(1)} : le manuel écrit « SOUVENT des sulfites ». `
        + "Ça dépend du fournisseur — on vérifie la fiche avant de répondre."
        : `Rien dans la ${pizza.nom} ne porte cet allergène — la composition est sous tes yeux.`,
    source: rep === "verifier" ? "Manuel — Les 14 allergènes (sulfites)" : "Composition de la carte",
  };
}

const NOTE = (justes) => (justes >= 18 ? 3 : justes >= 12 ? 2 : justes >= 6 ? 1 : 0);

export default function CommandePiege({ onClose, onFinish }) {
  useEchap(onClose);
  const [phase, setPhase] = useState("pret");   // pret | jeu | fin
  const [reste, setReste] = useState(DUREE);
  const [q, setQ] = useState(null);
  const [flash, setFlash] = useState(null);     // { juste, pourquoi, source } — retour bref
  const [carte, setCarte] = useState(false);    // la carte est-elle ouverte ?
  const [justes, setJustes] = useState(0);
  const [rates, setRates] = useState([]);       // les erreurs, pour le débriefing final
  const tic = useRef(null);

  useEffect(() => {
    if (phase !== "jeu") return undefined;
    tic.current = setInterval(() => {
      setReste((r) => { if (r <= 1) { clearInterval(tic.current); setPhase("fin"); return 0; } return r - 1; });
    }, 1000);
    return () => clearInterval(tic.current);
  }, [phase]);

  function demarrer() { setJustes(0); setRates([]); setReste(DUREE); setQ(tirer()); setFlash(null); setCarte(false); setPhase("jeu"); }

  function repondre(v) {
    if (!q || flash) return;
    const juste = v === q.rep;
    if (juste) setJustes((n) => n + 1);
    else {
      // L'erreur coûte du TEMPS, pas des points : se tromper vite sur un allergène est pire que
      // répondre lentement, et c'est la seule pénalité qui enseigne quelque chose.
      setReste((r) => Math.max(0, r - MALUS));
      setRates((l) => (l.length >= 8 ? l : [...l, { q: q.q, pourquoi: q.pourquoi, source: q.source, donne: v, rep: q.rep }]));
    }
    setFlash({ juste, pourquoi: q.pourquoi, source: q.source });
    // Le retour est BREF : le chrono tourne, et une explication qui bloque la partie casserait le
    // rythme qu'on cherche justement à entraîner. Le détail vient au débriefing.
    setTimeout(() => { setFlash(null); setQ(tirer()); }, juste ? 550 : 1500);
  }

  const stars = NOTE(justes);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="shield" size={17} /> La commande piège
          </h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>

        {phase === "pret" && (
          <div className="mbody" style={{ textAlign: "center", padding: "22px 20px" }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Soixante secondes au comptoir.</p>
            <p className="hint" style={{ margin: "0 0 4px" }}>
              Un client annonce sa contrainte, tu réponds. La carte est consultable à tout moment —
              mais le chrono ne s'arrête pas pendant que tu la lis.
            </p>
            <p className="hint" style={{ margin: "0 0 18px" }}>
              Une erreur coûte <b>{MALUS} secondes</b>. « À vérifier » est la bonne réponse quand
              l'allergène dépend du fournisseur.
            </p>
            <button className="btn primary" onClick={demarrer} autoFocus>
              <Icon name="play" size={15} /> Ouvrir le service
            </button>
          </div>
        )}

        {phase === "jeu" && q && (
          <div className="mbody">
            <div className="cp-bandeau">
              <div className="pq-progress"><span style={{ width: `${(reste / DUREE) * 100}%`, background: reste <= 10 ? "var(--red)" : "var(--ember1)" }} /></div>
              <span className={"cp-chrono" + (reste <= 10 ? " urgent" : "")}>{reste}s</span>
              <span className="cp-score"><Icon name="check" size={13} /> {justes}</span>
            </div>

            <p className="cp-client">{q.q}</p>

            <div className="cp-reponses">
              {REPONSES.map((r) => (
                <button key={r.v} className="pq-choice cp-rep" onClick={() => repondre(r.v)} disabled={!!flash}>
                  {r.label}
                </button>
              ))}
            </div>

            {flash && (
              <div className={"cp-expl" + (flash.juste ? " ok" : "")}>
                <b>{flash.juste ? "Exact." : "Non."}</b> {flash.pourquoi}
                <span className="cp-src"><Icon name="book-open" size={12} /> {flash.source}</span>
              </div>
            )}

            {/* LA CARTE SE CONSULTE. Le chrono continue de tourner pendant ce temps — vérifier
                coûte, comme aller chercher le classeur derrière le comptoir. La pizza demandée est
                mise en avant : on cherche une composition, pas une ligne dans une liste. */}
            <button type="button" className="cp-consulter" onClick={() => setCarte((c) => !c)}
              aria-expanded={carte}>
              <Icon name={carte ? "chevron-down" : "book-open"} size={14} />
              {carte ? "Refermer la carte" : "Consulter la carte"}
              <span className="hint">{carte ? "le chrono tourne toujours" : "si tu ne te souviens plus"}</span>
            </button>
            {carte && (
              <div className="cp-carte">
                <ul>
                  {CARTE.map((p) => (
                    <li key={p.nom} className={q.type === "carte" && q.pizza.nom === p.nom ? "on" : ""}>
                      <b>{p.nom}</b>
                      <span>{p.ing.map((k) => INGREDIENTS[k]?.nom || k).join(", ")}</span>
                    </li>
                  ))}
                </ul>
                <p className="hint">Toutes les pâtes contiennent du gluten.</p>
              </div>
            )}
          </div>
        )}

        {phase === "fin" && (
          <div className="mbody" style={{ textAlign: "center", padding: "22px 20px" }}>
            <div className="pq-fin-stars" aria-label={`${stars} étoile${stars > 1 ? "s" : ""} sur 3`}>
              {[0, 1, 2].map((n) => (
                <Icon key={n} name="star" size={38} fill={n < stars ? "currentColor" : "none"}
                  className={n < stars ? "on" : ""} style={{ animationDelay: `${n * 0.14}s` }} />
              ))}
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>{justes} bonne{justes > 1 ? "s" : ""} réponse{justes > 1 ? "s" : ""}</p>
            <p className="hint" style={{ marginTop: 0 }}>
              {stars === 3 ? "C'est le rythme du comptoir."
                : stars === 2 ? "Bien. Les sulfites et la contamination croisée font la différence."
                  : "Relis la fiche « Les allergènes » dans Notions, puis retente."}
            </p>

            {/* LE DÉBRIEFING EST LE VRAI COURS. Pendant la partie le retour est bref parce que le
                chrono tourne ; ici on reprend chaque erreur, avec sa source. */}
            {rates.length > 0 && (
              <div className="cp-debrief">
                <div className="cp-carte-t">Ce qui a coûté du temps</div>
                {rates.map((r, i) => (
                  <div key={i} className="cp-rate">
                    <b>{r.q}</b>
                    <span className="cp-rate-r">
                      Tu as répondu « {REPONSES.find((x) => x.v === r.donne)?.label} », la réponse est
                      « {REPONSES.find((x) => x.v === r.rep)?.label} ».
                    </span>
                    <span>{r.pourquoi}</span>
                    <span className="cp-src"><Icon name="book-open" size={12} /> {r.source}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
              <button className="btn ghost" onClick={demarrer}><Icon name="refresh" size={14} /> Rejouer</button>
              <button className="btn primary" onClick={() => onFinish(stars)}>
                <Icon name="check" size={15} /> Valider
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
