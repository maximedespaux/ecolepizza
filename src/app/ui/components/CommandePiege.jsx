import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { useEchap } from "../lib/useEchap.js";
import Coeurs from "./Coeurs.jsx";
import { COEURS_MAX, encoreEnVie } from "../lib/coeurs.js";
import { GARN_BASES, GARN_PRODUITS, GARN_DAIRY } from "../lib/garnitures.js";
import { ALLERGENES, nomAllergene, verdict } from "../lib/allergenes.js";

/**
 * LA COMMANDE PIÈGE — deux minutes au comptoir, les allergènes en pleine bourre.
 *
 * CE QU'IL ENTRAÎNE. Le QCM demande « quels sont les 14 allergènes ». Le comptoir demande
 * « allergie au lait, la Margherita ça passe ? » — et il le demande pendant qu'une autre commande
 * sort du four. Entre les deux il y a un RÉFLEXE : lire une composition et trancher tout de suite.
 * C'est ce réflexe qui manque quand ça arrive pour de vrai, pas la liste des quatorze.
 *
 * LA CARTE EST AFFICHÉE EN PERMANENCE, à droite. C'est le classeur ouvert sur le comptoir, et ce
 * n'est pas ce qui rend le jeu facile : le chrono passe, et surtout LA CARTE NE RÉPOND PAS À
 * TOUT. Les pièges de service — la planche qui a servi au saumon, la pâte à la châtaigne prise
 * pour une pâte sans gluten, l'extra qui prend seul une commande — ne s'y lisent nulle part. Et
 * les sulfites n'y sont pas non plus : « souvent » n'est pas une composition, c'est une question
 * à poser au fournisseur. Ce qui se lit sur la carte, on le lit ; le reste, on le sait ou on le
 * vérifie.
 *
 * TROIS RÉPONSES, ET LA TROISIÈME EST LA PLUS IMPORTANTE. « À vérifier » n'est pas une échappatoire :
 * c'est la bonne réponse chaque fois que l'allergène dépend du FOURNISSEUR — le manuel écrit
 * lui-même « souvent des sulfites (le jambon) ». Un stagiaire qui répond « non » avec aplomb sur
 * une charcuterie a tort, même quand il tombe juste. On sanctionne donc l'aplomb, pas l'ignorance.
 *
 * UNE ERREUR COÛTE UN CŒUR, et à zéro le service s'arrête. Elle coûtait auparavant quatre
 * secondes de chrono ; les deux ensemble puniraient deux fois la même faute — le temps qui fond ET
 * la partie qui se rapproche de sa fin — sans qu'on puisse dire laquelle a coûté quoi. Une faute,
 * une conséquence. Et sur un allergène, la conséquence juste n'est pas de perdre du temps : c'est
 * que le service s'arrête, parce que c'est ce qui arrive pour de vrai.
 *
 * REJOUER RESTE IMMÉDIAT ET ILLIMITÉ — cf. `lib/coeurs.js`. Ces cœurs-là ne sont pas ceux qu'on a
 * supprimés en 2026 : rien ne persiste, rien ne se régénère, rien ne bloque.
 *
 * LA CARTE EST TIRÉE AU SORT À CHAQUE PARTIE, sur les 44 produits de `garnitures.js` — ceux de
 * l'organisme, pas une liste inventée pour le jeu. Dix pizzas neuves à chaque service : on
 * n'apprend plus « la Reine contient du jambon » par cœur, on apprend à LIRE une composition.
 * C'était la limite de la version précédente, dont les dix pizzas étaient figées : au bout de
 * trois parties, on répondait de mémoire.
 *
 * LES ALLERGÈNES VIENNENT DE `lib/allergenes.js`, une donnée de l'organisme et non du jeu — la
 * même question se pose aux fiches recettes et à la carte. Deux niveaux y sont distingués : ce
 * qui est CERTAIN par composition (un chèvre est un fromage) et ce qui DÉPEND DU FOURNISSEUR
 * (« souvent des sulfites », dit le manuel). C'est ce second cas qui fait exister « à vérifier ».
 */

/* Les produits utilisables, à plat, avec leur catégorie — c'est elle qui porte le défaut
   d'allergène (cf. `lib/allergenes.js`). Les bases et les fromages n'ont pas de `cat` dans
   `garnitures.js` : on la leur donne ici, sinon leur défaut serait introuvable. */
const BASES = GARN_BASES.filter((b) => b.key !== "autre")
  .map((b) => ({ cle: b.key, label: b.label, categorie: "Base", pairs: b.pairs || [] }));
const GARNITURES = [
  ...GARN_PRODUITS.map((p) => ({ cle: p.key, label: p.label, categorie: p.cat, pairs: p.pairs || [] })),
  ...GARN_DAIRY.map((f) => ({ cle: f.key, label: f.label, categorie: "Fromage", pairs: f.pairs || [] })),
];

const alea = (n) => Math.floor(Math.random() * n);
const tireDans = (l) => l[alea(l.length)];

/**
 * Compose une pizza plausible : une base, puis deux ou trois garnitures TIRÉES PAR AFFINITÉ.
 *
 * Le tirage purement aléatoire donnait « crème + anchois + miel » — une carte absurde décrédibilise
 * l'exercice avant même la première question, et un stagiaire cesse d'y chercher un vrai réflexe.
 * `garnitures.js` porte déjà une table d'affinités curée (`pairs`) : on s'en sert pour choisir la
 * suite, et on ne retombe au hasard que lorsqu'elle ne propose rien de disponible.
 */
function composer(nom) {
  const base = tireDans(BASES);
  const choisies = [];
  const dispo = () => GARNITURES.filter((g) => !choisies.some((c) => c.cle === g.cle));
  const combien = 2 + alea(2);
  for (let i = 0; i < combien; i++) {
    const dernier = choisies[choisies.length - 1] || base;
    const amies = dispo().filter((g) => (dernier.pairs || []).includes(g.cle));
    choisies.push(amies.length ? tireDans(amies) : tireDans(dispo()));
  }
  return { nom, ing: [base, ...choisies] };
}

/* Dix noms de maison, et AUCUN ne nomme un ingrédient ou un style. « La Marine » tirée au sort
   sans poisson, ou « La Napolitaine » avec du cheddar, se lisent comme un défaut de génération
   plutôt que comme une leçon — et la leçon se perd. Ces noms-là ne promettent rien : c'est à la
   composition de parler, et c'est exactement le réflexe qu'on entraîne. */
const NOMS = ["La Maison", "L'Ardente", "La Dorée", "La Généreuse", "La Rustique",
  "La Complice", "La Bella", "La Nera", "La Fumée", "La Signature"];

/* Les contraintes tirables : celles qui peuvent se lire sur une composition. Le gluten en est
   exclu — la pâte en porte toujours, la réponse serait connue d'avance et n'apprendrait rien. Il
   a sa propre situation, une fois, parmi les pièges de service. */
const CONTRAINTES = ALLERGENES
  .filter((a) => ["lait", "poissons", "fruits_a_coque", "oeufs", "sulfites", "moutarde", "soja"].includes(a.cle))
  .map((a) => ({ cle: a.cle, mot: a.cle === "sulfites" ? "intolérance aux sulfites" : `allergie ${motDe(a.cle)}` }));

function motDe(cle) {
  return { lait: "au lait", poissons: "au poisson", fruits_a_coque: "aux fruits à coque",
    oeufs: "aux œufs", moutarde: "à la moutarde", soja: "au soja" }[cle] || `à « ${nomAllergene(cle)} »`;
}

/* TROIS RÉPONSES, ET CHACUNE SON PICTOGRAMME. « Ça passe » disait la même chose que « Oui » en
   plus long et en plus mou : au comptoir on répond oui ou non. Le pictogramme fait le reste du
   travail — à deux minutes de chrono, on reconnaît une coche, une croix et une loupe avant
   d'avoir lu le mot, et c'est la loupe qui compte : « à vérifier » est la réponse qu'on oublie,
   elle a désormais une forme à elle.

   `ic` n'existe que sur CES trois réponses. Les questions de comparaison portent leur propre
   `choix` — des noms de pizzas — et une coche devant « La Nera » ne voudrait rien dire. */
const REPONSES = [
  { v: "oui", label: "Oui", ic: "check" },
  { v: "non", label: "Non", ic: "x" },
  { v: "verifier", label: "À vérifier", ic: "search" },
];

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
  { q: "Ton fournisseur de mozzarella a changé le mois dernier. Ta fiche allergènes date de l'an passé.", rep: "non",
    pourquoi: "« Vérification des fournisseurs » et « mise à jour régulière » sont deux bonnes "
      + "pratiques du manuel, et elles vont ensemble : une fiche juste l'an dernier peut être fausse "
      + "aujourd'hui. Une information périmée est pire qu'absente — on s'y fie.",
    source: "Manuel — Les allergènes · Bonnes pratiques" },
  { q: "Ta fiche allergènes couvre les pizzas. Le client commande un tiramisu maison.", rep: "non",
    pourquoi: "« Tous les plats concernés », dit le manuel. Desserts, entrées, sauces et boissons "
      + "comprises : un dessert maison porte typiquement œufs, lait et gluten, et l'oublier parce "
      + "que ce n'est pas une pizza est l'angle mort classique.",
    source: "Manuel — Les allergènes · Points de vigilance" },
  { q: "« C'est bon, je tolère un peu de lait. » Il te demande la pizza aux quatre fromages.", rep: "verifier",
    pourquoi: "Ce n'est pas au professionnel d'évaluer le seuil de tolérance de quelqu'un — mais ce "
      + "n'est pas non plus à lui de refuser une commande que le client assume. On l'informe "
      + "précisément de ce que contient le plat, et il décide en connaissance de cause.",
    source: "Manuel — Les allergènes · Modalités d'affichage (information du client)" },
];

const DUREE = 120;         // secondes — deux minutes de service

/** Une carte de dix pizzas, composée pour ce service. */
const dresserCarte = () => NOMS.map((n) => composer(n));

/**
 * LA CONTRAINTE SE CHOISIT D'APRÈS LA PIZZA, et c'est une mesure qui l'a imposé.
 *
 * Tirée uniformément parmi les allergènes, elle donnait 73,7 % de « ça passe » sur 20 000
 * tirages — répondre oui à tout aurait suffi à faire 74 %. Sur des allergènes, « toujours oui »
 * est précisément la réponse dangereuse : le jeu aurait entraîné le contraire de ce qu'il vise.
 * Deux allergènes étaient par ailleurs quasi inutiles (œufs : 99 % de oui, un seul produit en
 * porte).
 *
 * On répartit donc les trois verdicts à parts comparables. Le verdict reste DÉDUIT de la
 * composition — on ne truque pas la réponse, on choisit la question.
 */
function contraintePour(pizza) {
  const parVerdict = { non: [], verifier: [], oui: [] };
  for (const c of CONTRAINTES) parVerdict[verdict(pizza.ing, c.cle).rep].push(c);
  // Ordre de préférence tiré au sort, puis on prend la première classe non vide : sur une pizza
  // sans aucun allergène, « non » et « à vérifier » n'existent pas, et il faut bien poser une
  // question.
  const ordre = alea(100) < 35 ? ["non", "verifier", "oui"]
    : alea(100) < 46 ? ["verifier", "non", "oui"] : ["oui", "non", "verifier"];
  for (const v of ordre) if (parVerdict[v].length) return tireDans(parVerdict[v]);
  return tireDans(CONTRAINTES);
}

/**
 * « ET SI ON RETIRE ? » — la question qu'on pose vraiment au comptoir.
 *
 * « Sans la burrata, ça passe ? » : parfois oui, souvent non, parce qu'un DEUXIÈME ingrédient
 * porte le même allergène — une crème sous le fromage, un pesto sous les pignons. Retirer une
 * garniture visible en laissant la base est l'erreur qu'on voit tous les jours, et une réponse
 * en oui/non ne l'attrape pas : il faut avoir relu la composition entière.
 */
function questionRetrait(carte) {
  // On cherche une pizza où un allergène est CERTAIN : sans lui, il n'y a rien à retirer.
  const candidats = [];
  for (const pizza of carte) {
    for (const c of CONTRAINTES) {
      const { rep, causes } = verdict(pizza.ing, c.cle);
      if (rep === "non" && causes.length) candidats.push({ pizza, c, causes });
    }
  }
  if (!candidats.length) return null;
  const { pizza, c, causes } = tireDans(candidats);
  const retire = tireDans(causes);                       // l'ingrédient qu'on propose d'ôter
  const restant = pizza.ing.filter((i) => i.label !== retire);
  const apres = verdict(restant, c.cle);
  return {
    type: "retrait", pizza, contrainte: c, rep: apres.rep,
    q: `« ${c.mot[0].toUpperCase()}${c.mot.slice(1)}. » ${pizza.nom} SANS ${retire.toLowerCase()}, ça passe ?`,
    pourquoi: apres.rep === "oui"
      ? `Oui : ${retire.toLowerCase()} était le seul à en porter dans ${pizza.nom}.`
      : apres.rep === "non"
        ? `Non — il reste ${apres.causes.join(", ").toLowerCase()}. Retirer ce qu'on voit ne suffit `
          + "pas : c'est la composition entière qu'il faut relire, base comprise."
        : `Il reste ${apres.causes.join(", ").toLowerCase()}, dont ça dépend du fournisseur.`,
    source: "Composition de la carte",
  };
}

/**
 * « LAQUELLE DES DEUX ? » — on ne vérifie plus une pizza, on en compare deux.
 *
 * C'est l'autre geste du comptoir : le client annonce sa contrainte AVANT de choisir, et il
 * attend une recommandation. Scanner deux compositions et trancher n'est pas la même chose que
 * valider celle qu'on vous désigne — et « ni l'une ni l'autre » doit rester une réponse possible,
 * sinon on apprend à toujours en proposer une.
 */
function questionComparaison(carte) {
  const c = tireDans(CONTRAINTES);
  const a = tireDans(carte);
  const b = tireDans(carte.filter((p) => p.nom !== a.nom));
  const va = verdict(a.ing, c.cle).rep, vb = verdict(b.ing, c.cle).rep;
  const sure = (v) => v === "oui";
  // Deux pizzas également sûres ne posent pas de question : on retire ce tirage.
  if (sure(va) && sure(vb)) return null;
  const rep = sure(va) ? "a" : sure(vb) ? "b" : "aucune";
  return {
    type: "comparaison", rep,
    choix: [{ v: "a", label: a.nom }, { v: "b", label: b.nom }, { v: "aucune", label: "Ni l'une ni l'autre" }],
    q: `« ${c.mot[0].toUpperCase()}${c.mot.slice(1)}. » Tu proposes laquelle ?`,
    pourquoi: rep === "aucune"
      ? `Aucune des deux : ${a.nom} porte ${verdict(a.ing, c.cle).causes.join(", ").toLowerCase()}, `
        + `${b.nom} porte ${verdict(b.ing, c.cle).causes.join(", ").toLowerCase()}.`
      : `${rep === "a" ? a.nom : b.nom} — l'autre porte `
        + `${verdict(rep === "a" ? b.ing : a.ing, c.cle).causes.join(", ").toLowerCase()}.`,
    source: "Composition de la carte",
  };
}

/**
 * Tire la question suivante. QUATRE FORMES, et elles n'entraînent pas le même geste : valider une
 * pizza qu'on vous désigne, en recommander une parmi deux, juger un retrait, et les pièges de
 * service qui ne se lisent nulle part sur la carte. Une seule forme répétée deux minutes durant
 * s'apprend par cœur au lieu de se comprendre.
 */
function tirer(carte) {
  const d = alea(100);
  if (d < 20) return { type: "piege", ...PIEGES[alea(PIEGES.length)] };
  if (d < 40) { const q = questionRetrait(carte); if (q) return q; }
  if (d < 58) { const q = questionComparaison(carte); if (q) return q; }
  const pizza = tireDans(carte);
  const contrainte = contraintePour(pizza);
  const { rep, causes } = verdict(pizza.ing, contrainte.cle);
  const cause = causes.join(", ").toLowerCase();
  return {
    type: "carte", pizza, contrainte, rep,
    q: `« ${contrainte.mot[0].toUpperCase()}${contrainte.mot.slice(1)}. » ${pizza.nom}, ça passe ?`,
    pourquoi: rep === "non" ? `${pizza.nom} porte ${cause}.`
      : rep === "verifier"
        ? `${cause[0].toUpperCase()}${cause.slice(1)} : ça dépend du fournisseur. Le manuel écrit `
          + "« SOUVENT des sulfites » — on vérifie la fiche avant de répondre."
        : `Rien dans ${pizza.nom} ne porte cet allergène — la composition est sous tes yeux.`,
    source: rep === "verifier" ? "Manuel — Les 14 allergènes (sulfites)" : "Composition de la carte",
  };
}

/* CINQ, DIX, QUINZE — et le raisonnement qui avait mené à 12/24/36 était faux.
 *
 * Il transposait les seuils d'un jeu qu'on apprend par cœur : sur une carte FIGÉE, on finit par
 * savoir que la Reine porte du jambon, et enchaîner devient possible. Ici la carte est RECOMPOSÉE
 * À CHAQUE PARTIE — aucune question ne se répond de mémoire, chacune demande de retrouver une
 * ligne et de la lire. Une comparaison en demande deux.
 *
 * 36 bonnes réponses en 120 s laissaient 2,8 s par question, retour compris : le rythme d'une
 * reconnaissance, pas d'une lecture. Quinze en laissent huit — le temps de chercher la pizza,
 * lire sa composition et répondre, c'est-à-dire le temps du geste qu'on entraîne. */
const NOTE = (justes) => (justes >= 15 ? 3 : justes >= 10 ? 2 : justes >= 5 ? 1 : 0);

export default function CommandePiege({ onClose, onFinish }) {
  const [phase, setPhase] = useState("pret");   // pret | jeu | fin
  const [reste, setReste] = useState(DUREE);
  const [carte, setCarte] = useState(dresserCarte);
  const [q, setQ] = useState(null);
  const [flash, setFlash] = useState(null);     // { juste, pourquoi, source } — retour bref
  const [justes, setJustes] = useState(0);
  const [rates, setRates] = useState([]);       // les erreurs, pour le débriefing final
  /* Les cœurs sont tenus en REF autant qu'en état : le compte doit être lu dans le `setTimeout`
     qui suit la réponse, où un état React porterait encore la valeur d'avant. L'état ne sert qu'à
     l'affichage. */
  const perdus = useRef(0);
  const [coeurs, setCoeurs] = useState(0);
  const tic = useRef(null);

  useEffect(() => {
    if (phase !== "jeu") return undefined;
    tic.current = setInterval(() => {
      setReste((r) => { if (r <= 1) { clearInterval(tic.current); setPhase("fin"); return 0; } return r - 1; });
    }, 1000);
    return () => clearInterval(tic.current);
  }, [phase]);

  function demarrer() {
    // Une carte NEUVE à chaque partie : figée, on finit par répondre de mémoire au lieu de lire.
    const c = dresserCarte();
    perdus.current = 0; setCoeurs(0);
    setCarte(c); setJustes(0); setRates([]); setReste(DUREE); setQ(tirer(c)); setFlash(null); setPhase("jeu");
  }

  function repondre(v) {
    if (!q || flash) return;
    const juste = v === q.rep;
    if (juste) setJustes((n) => n + 1);
    else {
      // L'erreur coûte un CŒUR, et rien d'autre : une faute, une conséquence.
      perdus.current += 1;
      setCoeurs(perdus.current);
      const noms = Object.fromEntries((q.choix || REPONSES).map((r) => [r.v, r.label]));
      setRates((l) => (l.length >= 8 ? l : [...l, { q: q.q, pourquoi: q.pourquoi, source: q.source,
        donne: noms[v], rep: noms[q.rep] }]));
    }
    setFlash({ juste, pourquoi: q.pourquoi, source: q.source });
    // Le retour est BREF : le chrono tourne, et une explication qui bloque la partie casserait le
    // rythme qu'on cherche justement à entraîner. Le détail vient au débriefing.
    /* Le retour reste affiché AVANT que la partie ne s'arrête : perdre son dernier cœur sans
       savoir pourquoi ne laisse rien à apprendre, et c'est la seule explication qu'on lira à coup
       sûr. Le débriefing final la reprend, mais on vient de la mériter. */
    setTimeout(() => {
      setFlash(null);
      if (!encoreEnVie(perdus.current)) { setPhase("fin"); return; }
      setQ(tirer(carte));
    }, juste ? 550 : 1500);
  }

  const stars = NOTE(justes);

  /* UNE FOIS LA PARTIE FINIE, TOUTES LES SORTIES VALIDENT — la croix, le voile et Échap.
     Elles appelaient `onClose`, qui referme sans rien enregistrer : on venait de jouer deux
     minutes, l'écran affichait les étoiles obtenues, et fermer par la croix les jetait. C'est le
     geste le plus naturel devant un écran de résultat, et c'était le seul qui perdait le score.
     Il n'y a aucune raison de proposer « abandonner ce que je viens de gagner » : tant que la
     partie n'est pas finie, la croix abandonne comme avant ; ensuite, elle valide. */
  const fermer = phase === "fin" ? () => onFinish(stars) : onClose;
  useEchap(fermer);

  return (
    <div className="overlay" onClick={fermer}>
      <div className="modal cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="shield" size={17} /> La commande piège
          </h3>
          <button className="x" onClick={fermer} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>

        {phase === "pret" && (
          <div className="mbody" style={{ textAlign: "center", padding: "22px 20px" }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Deux minutes au comptoir.</p>
            <p className="hint" style={{ margin: "0 0 4px" }}>
              Un client annonce sa contrainte, tu réponds. La carte reste ouverte à côté — mais elle
              ne répond pas à tout : la contamination croisée et les sulfites ne s'y lisent pas.
            </p>
            <p className="hint" style={{ margin: "0 0 18px" }}>
              Tu as <b>{COEURS_MAX} cœurs</b> : une erreur en coûte un, et à zéro le service
              s'arrête. « À vérifier » est la bonne réponse quand l'allergène dépend du fournisseur.
            </p>
            <button className="btn primary" onClick={demarrer} autoFocus>
              <Icon name="play" size={15} /> Ouvrir le service
            </button>
          </div>
        )}

        {phase === "jeu" && q && (
          <div className="mbody cp-jeu">
            <div className="cp-col">
            <div className="cp-bandeau">
              <div className="pq-progress"><span style={{ width: `${(reste / DUREE) * 100}%`, background: reste <= 10 ? "var(--red)" : "var(--ember1)" }} /></div>
              <span className={"cp-chrono" + (reste <= 10 ? " urgent" : "")}>{reste}s</span>
              <span className="cp-score"><Icon name="check" size={13} /> {justes}</span>
              <Coeurs perdus={coeurs} />
            </div>

            {/* LE VERDICT PREND LA PLACE DE LA QUESTION, il ne s'ajoute pas dessous. Ajouté, il
                poussait la carte hors de l'écran sur un téléphone — mesuré : 689 px de contenu
                pour 664 visibles, donc un défilement au pire moment, celui où le chrono tourne.
                Et il ne se perd rien : on vient de répondre, l'énoncé a fait son travail. */}
            {flash ? (
              <div className={"cp-client cp-expl" + (flash.juste ? " ok" : "")}>
                <span>
                  <b>{flash.juste ? "Exact." : "Non."}</b> {flash.pourquoi}
                  <span className="cp-src"><Icon name="book-open" size={12} /> {flash.source}</span>
                </span>
              </div>
            ) : (
              <p className="cp-client">{q.q}</p>
            )}

            <div className="cp-reponses">
              {(q.choix || REPONSES).map((r) => (
                <button key={r.v} className="pq-choice cp-rep" onClick={() => repondre(r.v)} disabled={!!flash}>
                  {r.ic && <Icon name={r.ic} size={15} />}{r.label}
                </button>
              ))}
            </div>

            </div>

            {/* LA CARTE, À DROITE ET TOUJOURS OUVERTE — le classeur posé sur le comptoir. La pizza
                demandée est mise en avant : on cherche une COMPOSITION, pas une ligne dans une
                liste, et à dix entrées la retrouver coûterait déjà du temps. */}
            <aside className="cp-carte">
              <div className="cp-carte-t"><Icon name="book-open" size={12} /> La carte</div>
              <ul>
                {carte.map((p) => (
                  <li key={p.nom} className={(q.choix || []).some((c) => c.label === p.nom)
                    || (q.pizza && q.pizza.nom === p.nom) ? "on" : ""}>
                    <b>{p.nom}</b>
                    <span>{p.ing.map((i) => i.label).join(", ")}</span>
                  </li>
                ))}
              </ul>
              <p className="hint">Toutes les pâtes contiennent du gluten.</p>
            </aside>
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
                      Tu as répondu « {r.donne} », la réponse est « {r.rep} ».
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
