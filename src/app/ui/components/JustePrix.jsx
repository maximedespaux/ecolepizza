import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { useEchap } from "../lib/useEchap.js";
import Coeurs from "./Coeurs.jsx";
import { COEURS_MAX, encoreEnVie } from "../lib/coeurs.js";
import { euroFixe as euro } from "../lib/format.js";
import {
  BASES, GARNITURES, coutPizza, ht, ratio, marge, auDemi, verdictPrix, TVA,
} from "../lib/coutMatiere.js";

/**
 * LE JUSTE PRIX — deux minutes pour auditer une carte.
 *
 * CE QU'IL ENTRAÎNE. Le manuel donne la formule : ratio = coût matière ÷ prix de vente HT, cible
 * 25 à 30 %. La lire prend dix secondes ; l'appliquer à SA carte, personne ne le fait — parce que
 * ça demande de diviser huit fois, et qu'entre-temps le fournisseur a augmenté la burrata. Ce jeu
 * ne demande pas de réciter la formule : il pose une carte réelle, avec ses prix qui ont dérivé,
 * et fait passer dessus. C'est l'audit qu'on ne fait jamais.
 *
 * LA CARTE EST DÉJÀ FAUSSE, et c'est le sujet. Ses huit pizzas ne sont pas toutes bien tarifées :
 * certaines mangent la marge, d'autres sont hors marché. Un jeu qui ne montrerait que des prix
 * justes n'entraînerait rien — dans une vraie pizzeria, la dérive est l'état normal d'une carte
 * qu'on n'a pas reprise depuis la dernière hausse des matières.
 *
 * LA CARTE RESTE OUVERTE À DROITE, avec le coût matière et le prix de chaque pizza. Ce n'est pas
 * ce qui rend le jeu facile : tout y est SAUF le ratio, qui est précisément ce qu'on demande. On
 * ne cherche pas une information, on fait une division — et c'est celle-là qu'on veut voir devenir
 * un réflexe. Le classeur du gérant, comme la carte des allergènes est celui du comptoir.
 *
 * TROIS RÉPONSES, ET « ÇA TIENT » EST LA PLUS DURE. Encadrer un ratio entre 25 et 30 % demande une
 * division, pas une impression. Répondre « trop cher » sur une pizza chère est le réflexe naturel
 * et il est faux une fois sur deux : c'est le RAPPORT au coût qui décide, jamais le prix seul.
 *
 * LE PIÈGE CENTRAL EST DANS LE MANUEL, écrit en toutes lettres dans la notion BCG : « la marge se
 * compte en euros, pas en % ». Une pizza à 30 % de ratio rapporte souvent moins d'euros qu'une
 * pizza à 33 % vendue plus cher — et ce sont des euros qui paient le loyer, pas des pourcentages.
 * D'où une forme de question entièrement consacrée à cette confusion.
 *
 * TOUT VIENT DES DONNÉES DE L'ORGANISME, rien n'est inventé pour le jeu : les €/kg de
 * `garnitures.js`, le coût du pâton calculé par `computeBuild` — la MÊME fonction que l'assistant
 * Pâte, donc les deux écrans ne pourront pas se contredire — et les règles de `notions.js`
 * (volet Gestion : coût matière, ticket moyen, Omnès, BCG). Si l'école corrige un prix de
 * mercuriale, le jeu suit.
 *
 * MISE EN PAGE : les classes `cp-*` sont celles de « La commande piège ». Les deux jeux ont
 * exactement la même forme — bandeau chrono, énoncé, trois réponses, classeur à droite, débriefing
 * — et cette feuille-là a été réglée au pixel pour tenir sans défilement sur un téléphone. La
 * dupliquer sous un autre nom, c'était dupliquer ce réglage. Seuls les chiffres alignés à droite
 * sont propres à ce jeu (`jp-*`).
 */

/* L'ARITHMÉTIQUE EST DANS `lib/coutMatiere.js`, pas ici : ratio sur le HT, marge en euros, cible
   25-30 %, coût du pâton. C'est un savoir de l'organisme — la même question se pose à une fiche
   recette et à une carte — et le jeu n'en est que le premier client. Même partage que le
   référentiel des allergènes, sorti de « La commande piège » pour la même raison. */

const alea = (n) => Math.floor(Math.random() * n);
const tireDans = (l) => l[alea(l.length)];
const entre = (a, b) => a + Math.random() * (b - a);
/* Fisher-Yates, et pas `sort(() => Math.random() - 0.5)` : ce dernier est BIAISÉ, et ici le biais
   se verrait — les bandes de prix sont mélangées en même temps que les noms, donc « La Nera »
   finirait par tomber « trop chère » plus souvent que les autres d'une partie à l'autre. */
function melange(l) {
  const a = [...l];
  for (let i = a.length - 1; i > 0; i--) { const j = alea(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const REPONSES = [
  { v: "bas", label: "Trop bas" },
  { v: "bon", label: "Ça tient" },
  { v: "cher", label: "Trop cher" },
];

/* ---- La carte ---------------------------------------------------------------------------- */

/**
 * Compose une pizza plausible : une base, puis trois ou quatre garnitures TIRÉES PAR AFFINITÉ
 * (`pairs` de `garnitures.js`) — même principe que « La commande piège », pour la même raison :
 * une carte absurde décrédibilise l'exercice avant la première question.
 *
 * TROIS GARNITURES AU MINIMUM, là où le jeu des allergènes en met deux. Ce n'est pas un détail de
 * goût : à deux garnitures, le coût matière descend sous l'euro et le prix qui en découle tombe à
 * 3,50 € — un chiffre qui ne ressemble à aucune carte et qui ferait douter du reste.
 */
function composer(nom) {
  const base = tireDans(BASES);
  const choisies = [];
  const dispo = () => GARNITURES.filter((g) => !choisies.some((c) => c.key === g.key));
  const combien = 3 + alea(2);
  for (let i = 0; i < combien; i++) {
    const dernier = choisies[choisies.length - 1] || base;
    const amies = dispo().filter((g) => (dernier.pairs || []).includes(g.key));
    choisies.push(amies.length ? tireDans(amies) : tireDans(dispo()));
  }
  const ing = [base, ...choisies];
  /* ARRÊTÉ AU CENTIME, et ce n'est pas cosmétique. Le coût brut vaut 1,9865 € ; affiché « 1,99 € »
     et divisé sous sa forme longue, il donnait « 1,99 ÷ 0,275 = 7,22 € HT » — alors que 1,99 ÷
     0,275 fait 7,24. Un stagiaire qui refait le calcul trouve deux centimes d'écart et cesse de
     faire confiance au reste. Le projet a déjà payé cette leçon sur les remises de facture (cf.
     `remise.test.js`) : on fige le chiffre AFFICHÉ, et tout en découle. */
  return { nom, ing, cout: Math.round(coutPizza(ing) * 100) / 100 };
}

/**
 * Bornes du coût matière retenu, en euros. Elles ne corrigent pas le calcul — elles écartent les
 * tirages qui donneraient une pizza hors carte.
 *
 * LE PLANCHER DE PRIX ÉTAIT UN MENSONGE SILENCIEUX. La borne basse valait 1,30 € et un
 * `Math.max(5,50)` rattrapait les prix absurdes qui en découlaient. Mesuré : il se déclenchait sur
 * 13 % des pizzas — et en RELEVANT le prix, il relevait le ratio, donc il CHANGEAIT le verdict. Une
 * carte dressée « deux bonnes, deux basses, deux chères » sortait à quatre bonnes, et trois pizzas
 * s'affichaient au même 5,50 €. Le jeu se corrigeait lui-même sans le dire.
 *
 * 1,90 € suffit à ce que même la pire bande (38 % de ratio) donne un prix supérieur au plancher :
 * mesuré sur 24 000 pizzas, il ne se déclenche plus jamais, les trois verdicts tombent à 33 %
 * chacun, et les prix s'étalent de 6,50 à 16,50 € (médiane 10 €). C'est une carte de pizzeria.
 */
const COUT_MIN = 1.90;
const COUT_MAX = 4.00;

function composerDansLaCarte(nom) {
  for (let i = 0; i < 40; i++) {
    const p = composer(nom);
    if (p.cout >= COUT_MIN && p.cout <= COUT_MAX) return p;
  }
  return composer(nom); // filet : jamais atteint en pratique, mais on ne boucle pas sans fin
}

/* Des noms de maison, et aucun ne nomme un ingrédient — même raison que « La commande piège » :
   c'est la composition qui doit parler, pas l'étiquette. */
const NOMS = ["La Maison", "L'Ardente", "La Dorée", "La Généreuse",
  "La Rustique", "La Complice", "La Bella", "La Nera"];

/* SIX PIZZAS, ET C'EST UNE MESURE, pas un goût. À huit, le classeur montait à 530 px pour 535 px
   de corps : la carte débordait du modal de onze pixels et le rappel du bas se coupait — sur un
   écran de 669 px de haut, donc bien avant le téléphone. Or ce classeur ne sert que s'il se lit
   d'un coup d'œil, chrono en main. Six lignes suffisent à porter les trois verdicts (deux
   chacun) et les quinze paires dont la question de marge a besoin. */
const TAILLE_CARTE = 6;

/**
 * DRESSE UNE CARTE QUI A DÉRIVÉ. Trois pizzas correctement tarifées, trois trop basses, deux trop
 * chères — puis on mélange.
 *
 * POURQUOI PAS UNE CARTE JUSTE. Sur une carte entièrement bien tarifée, « Ça tient » serait la
 * réponse à chaque fois : le jeu s'apprendrait en trois questions et n'entraînerait plus rien. Et
 * une carte qui dérive n'est pas une fiction pédagogique — c'est l'état normal d'une carte qu'on
 * n'a pas reprise depuis la dernière hausse des matières. Le jeu est un audit, il lui faut de quoi
 * auditer.
 *
 * Les bandes de ratio sont prises À DISTANCE des seuils (26–29 % et non 25–30 %) pour que
 * l'arrondi à 50 centimes ne fasse pas basculer la pizza dans la bande voisine. Quand il le fait
 * quand même, `verdictPrix` recalcule et la question reste juste : la bande ne sert qu'à répartir.
 */
function dresserCarte() {
  const noms = melange(NOMS).slice(0, TAILLE_CARTE);
  return melange(["bon", "bon", "bas", "bas", "cher", "cher"])
    .map((bande, i) => {
      const p = composerDansLaCarte(noms[i]);
      const r = bande === "bas" ? entre(0.315, 0.38)
        : bande === "bon" ? entre(0.26, 0.29) : entre(0.17, 0.235);
      // Le `Math.max` reste en filet, mais il ne se déclenche plus (cf. COUT_MIN) : il est là pour
      // qu'un réglage futur de la mercuriale ne puisse pas produire une pizza à deux euros.
      return { ...p, prix: Math.max(5.5, auDemi((p.cout / r) * TVA)) };
    });
}

/* ---- Les questions ----------------------------------------------------------------------- */

/**
 * « CE PRIX TIENT-IL ? » — le geste de base, et celui qu'on ne fait jamais.
 *
 * On équilibre les trois verdicts en choisissant la pizza, jamais la réponse : sur une carte
 * dressée à 3/3/2, tirer au hasard donnerait déjà 37 % de « trop bas ». Ici on vise le verdict le
 * moins servi depuis le début de la partie, ce qui empêche une série de trois « ça tient » de
 * suite — la série est ce qui apprend à répondre sans compter.
 */
function questionRatio(carte, servis) {
  const parVerdict = { bas: [], bon: [], cher: [] };
  for (const p of carte) parVerdict[verdictPrix(p.cout, p.prix)].push(p);
  const ordre = ["bas", "bon", "cher"]
    .filter((v) => parVerdict[v].length)
    .sort((a, b) => (servis[a] || 0) - (servis[b] || 0));
  const pizza = tireDans(parVerdict[ordre[0]]);
  const rep = verdictPrix(pizza.cout, pizza.prix);
  const pct = Math.round(ratio(pizza.cout, pizza.prix) * 100);
  return {
    type: "ratio", pizza, rep,
    q: `« ${pizza.nom} » est affichée ${euro(pizza.prix)}. Ce prix tient-il ?`,
    pourquoi: `${euro(pizza.cout)} de matière sur ${euro(ht(pizza.prix))} HT, soit ${pct} %, `
      + (rep === "bon" ? "dans la cible 25-30 %."
        : rep === "bas" ? `au-dessus de 30 % : la pizza mange la marge. Il reste ${euro(marge(pizza.cout, pizza.prix))} pour payer le reste.`
          : "sous 25 % : la marge est belle, mais ce prix-là sort du marché et la pizza ne se vendra pas."),
    source: "Manuel : Le coût matière",
  };
}

/**
 * « QUEL PRIX AFFICHER ? » — l'inverse du précédent, et ce n'est pas le même geste : reconnaître
 * un ratio faux et PRODUIRE un prix juste sont deux compétences distinctes. Le manuel donne la
 * formule pour la seconde : prix HT conseillé = coût matière ÷ objectif.
 *
 * PRÉTEXTE RÉALISTE — la hausse fournisseur. C'est le seul moment où un patron reprend un prix, et
 * ça évite de demander un prix pour une pizza qui en a déjà un affiché à droite.
 */
function questionPrix(carte) {
  /* PAS SUR UNE PIZZA DÉJÀ TROP CHÈRE. Observé en jouant : « La Nera » est affichée 12,50 € pour
     1,68 € de matière (15 % de ratio, hors marché) ; le jeu annonçait une HAUSSE du fournisseur et
     attendait 8,00 € — soit quatre euros cinquante de MOINS que le prix au mur. La consigne est
     juste au regard de la cible, et incompréhensible au regard du bon sens. On ne pose donc la
     question que sur les pizzas correctement ou insuffisamment tarifées, où la hausse fait bien
     monter le prix. */
  const posables = carte.filter((p) => verdictPrix(p.cout, p.prix) !== "cher");
  const bassin = posables.length ? posables : carte;
  for (let essai = 0; essai < 20; essai++) {
    const pizza = tireDans(bassin);
    // Une hausse de 15 à 45 % sur la matière : l'ordre de grandeur d'une vraie flambée. Arrêtée au
    // centime, pour la même raison que le coût de la carte : on divise ce qu'on affiche.
    const cout = Math.round(pizza.cout * entre(1.15, 1.45) * 100) / 100;
    const bon = Math.max(5.5, auDemi((cout / 0.275) * TVA));
    const trop = Math.max(5.5, auDemi((cout / 0.20) * TVA));
    const pas = Math.max(5.5, auDemi((cout / 0.38) * TVA));
    const choix = [pas, bon, trop];
    // On ne garde le tirage que si UNE SEULE proposition tient : l'arrondi peut en amener deux
    // dans la cible, et une question à deux bonnes réponses n'enseigne rien.
    if (new Set(choix).size !== 3) continue;
    if (choix.filter((p) => verdictPrix(cout, p) === "bon").length !== 1) continue;
    const pct = Math.round(ratio(cout, bon) * 100);
    /* L'ÉQUATION AFFICHÉE DOIT TOMBER JUSTE. Elle enchaînait « coût ÷ 0,275 = X HT » en donnant
       pour X le HT du prix ARRONDI : sur un cas réel, « 3,04 ÷ 0,275 = 10,91 € HT » alors que la
       division fait 11,05. Un stagiaire qui refait le calcul trouve autre chose que ce que le jeu
       affirme — et c'est précisément le stagiaire qu'on veut. L'arrondi commercial est une étape,
       pas un détail : on l'écrit. */
    const brutHt = cout / 0.275;
    return {
      type: "prix", pizza, rep: String(bon),
      choix: [...choix].sort((a, b) => a - b).map((p) => ({ v: String(p), label: euro(p) })),
      q: `Ton fournisseur augmente : « ${pizza.nom} » revient maintenant à ${euro(cout)} de matière. `
        + "Tu l'affiches à combien ?",
      pourquoi: `${euro(cout)} ÷ 0,275 = ${euro(brutHt)} HT, soit ${euro(brutHt * TVA)} TTC, `
        + `on affiche ${euro(bon)}, ce qui fait ${pct} % de ratio. `
        + "Le manuel donne la formule : coût matière ÷ objectif.",
      source: "Manuel : Le coût matière · Le calcul",
    };
  }
  return null;
}

/**
 * « LAQUELLE RAPPORTE LE PLUS ? » — LA question du jeu.
 *
 * Le manuel l'écrit en toutes lettres dans la notion BCG, sous un pictogramme d'avertissement :
 * « la marge se compte en euros, pas en % ». C'est la confusion la plus coûteuse du métier, parce
 * qu'elle se retourne complètement : la pizza au meilleur ratio est très souvent celle qui
 * rapporte le MOINS d'euros — elle est bon marché. Et ce sont des euros qui paient le loyer.
 *
 * On privilégie donc les paires où les deux indicateurs se contredisent : c'est là que la question
 * apprend quelque chose. Une paire où le meilleur ratio gagne aussi en euros ne fait que confirmer
 * l'intuition fausse.
 */
function questionMarge(carte) {
  const paires = [];
  for (let i = 0; i < carte.length; i++) {
    for (let j = i + 1; j < carte.length; j++) {
      const a = carte[i], b = carte[j];
      const ma = marge(a.cout, a.prix), mb = marge(b.cout, b.prix);
      // « Les deux pareil » doit rester une réponse possible, sinon on apprend à toujours trancher.
      const rep = Math.abs(ma - mb) < 0.30 ? "pareil" : ma > mb ? "a" : "b";
      // Contradictoire = celle qui rapporte le plus d'euros a le PIRE ratio.
      const contradictoire = rep !== "pareil"
        && ratio(a.cout, a.prix) > ratio(b.cout, b.prix) === (rep === "a");
      paires.push({ a, b, ma, mb, rep, contradictoire });
    }
  }
  const interessantes = paires.filter((p) => p.contradictoire);
  const { a, b, ma, mb, rep } = tireDans(interessantes.length && alea(100) < 70 ? interessantes : paires);
  const gagnante = rep === "a" ? a : b;
  return {
    type: "marge", rep,
    choix: [{ v: "a", label: a.nom }, { v: "b", label: b.nom }, { v: "pareil", label: "Les deux pareil" }],
    q: `Entre « ${a.nom} » et « ${b.nom} », laquelle te rapporte le plus ?`,
    pourquoi: rep === "pareil"
      ? `À quelques centimes près, la même chose : ${euro(ma)} contre ${euro(mb)} de marge brute.`
      : `${gagnante.nom}, ${euro(Math.max(ma, mb))} de marge brute contre ${euro(Math.min(ma, mb))}. `
        + `Son ratio est pourtant de ${Math.round(ratio(gagnante.cout, gagnante.prix) * 100)} % : `
        + "c'est en euros qu'on compte, pas en pourcentage.",
    source: "Manuel : La matrice BCG · La marge se compte en euros",
  };
}

/**
 * LES PIÈGES — ils ne se lisent pas sur la carte, et c'est pour cela qu'ils comptent. Chacun sort
 * d'une notion du volet Gestion du manuel et porte sa source ; aucun n'est inventé pour le jeu.
 * Trois réponses à chaque fois, propres à la situation.
 */
const VF = [{ v: "oui", label: "Oui" }, { v: "non", label: "Non" }, { v: "depend", label: "Ça dépend" }];

const PIEGES = [
  { q: "Ta pizza est affichée 11 € TTC et coûte 2,75 € de matière. Ton ratio est de 25 % ?", rep: "non",
    choix: VF,
    pourquoi: "Non : 25 % serait le ratio sur le TTC. Le ratio se calcule sur le prix HT, "
      + "11 ÷ 1,10 = 10 € HT, donc 2,75 ÷ 10 = 27,5 %. Diviser par le TTC flatte le ratio de "
      + "trois points et masque une dérive qui commence.",
    source: "Manuel : Le coût matière · Le calcul" },

  { q: "Une pizza à 9 € HT qui coûte 2 € de matière te laisse 7 € de bénéfice ?", rep: "non",
    choix: VF,
    pourquoi: "7 €, c'est la marge BRUTE, pas le bénéfice. Le manuel prévient : il reste les "
      + "salaires, le loyer, l'énergie et les charges à payer dessus. Confondre les deux, c'est se "
      + "croire rentable jusqu'au bilan.",
    source: "Manuel : Le coût matière · Le calcul" },

  { q: "Tu passes en livraison via une plateforme. Tu gardes le même coût matière cible ?", rep: "non",
    choix: VF,
    pourquoi: "Non : la commission de plateforme ponctionne le prix de vente. À prix affiché "
      + "identique, ce qui te revient baisse : il faut donc un coût matière PLUS SERRÉ pour s'en "
      + "sortir. La cible n'est pas une constante, elle dépend du canal.",
    source: "Manuel : Le coût matière · L'objectif" },

  { q: "Une pizza se vend très bien mais rapporte peu de marge. Tu la retires de la carte ?", rep: "non",
    choix: VF,
    pourquoi: "C'est une vache à lait : forte popularité, faible marge. On ne retire pas ce que les "
      + "clients viennent chercher : on baisse le coût matière ou on monte légèrement le prix. "
      + "Le poids mort, lui, ne se vend pas ET ne rapporte pas : celui-là se retire.",
    source: "Manuel : La matrice BCG · Les 4 cases" },

  { q: "Une pizza que personne ne prend, mais qui a une belle marge. Tu fais quoi ?", rep: "pousser",
    choix: [{ v: "retirer", label: "La retirer" }, { v: "pousser", label: "Mieux la placer" },
      { v: "baisser", label: "Baisser son prix" }],
    pourquoi: "C'est un dilemme : elle rapporte, mais personne ne la voit. On la place mieux sur la "
      + "carte, on la renomme, on la suggère. Baisser son prix détruirait justement ce qui en fait "
      + "l'intérêt, et la retirer reviendrait à jeter une marge qui existe.",
    source: "Manuel : La matrice BCG · Les 4 cases" },

  { q: "Ta pizza la moins chère est à 8 €, la plus chère à 26 €. Ton ouverture de gamme est bonne ?",
    rep: "non", choix: VF,
    pourquoi: "26 ÷ 8 = 3,25 : c'est trop large. Omnès situe l'ouverture entre 2,5 et 3. Trop serrée, "
      + "tu ne captes ni les petits budgets ni les gros ; trop large, la carte perd sa cohérence.",
    source: "Manuel : La règle d'Omnès · Ouverture de gamme" },

  { q: "Sur tes 12 pizzas, 6 sont dans la tranche de prix médiane. C'est la bonne répartition ?",
    rep: "oui", choix: VF,
    pourquoi: "Oui : Omnès vise 25 % en tranche basse, 50 % en médiane, 25 % en haute. La médiane "
      + "doit peser autant que les deux autres réunies : c'est là que le client se décide.",
    source: "Manuel : La règle d'Omnès · Dispersion des prix" },

  { q: "Tu mets une pizza en avant sur l'ardoise. Tu choisis laquelle ?", rep: "mediane",
    choix: [{ v: "basse", label: "La moins chère" }, { v: "mediane", label: "Une du milieu de gamme" },
      { v: "haute", label: "La plus chère" }],
    pourquoi: "Dans la zone médiane, là où se trouve la demande. Et le manuel insiste : un produit "
      + "en promotion n'est pas un produit à bas prix : c'est un plat proposé à un prix attractif "
      + "pour augmenter sa popularité.",
    source: "Manuel : La règle d'Omnès · La promotion" },

  { q: "Ton ticket moyen théorique est très au-dessus du réel. Qu'est-ce que ça dit ?",
    rep: "cher",
    choix: [{ v: "cher", label: "Carte perçue trop chère" }, { v: "monter", label: "Tu peux monter les prix" },
      { v: "rien", label: "Rien, c'est normal" }],
    pourquoi: "TMT > TMR, c'est un problème de positionnement : la carte est perçue trop chère par "
      + "rapport à la valeur. C'est l'inverse qui ouvrirait une marge de manœuvre pour monter les "
      + "prix. Tolérance admise : ±20 %.",
    source: "Manuel : Le ticket moyen · Lire l'écart" },

  { q: "Une Margherita coûte 0,90 € de matière. À 0,90 ÷ 0,30, tu l'affiches 3,30 € TTC ?",
    rep: "non", choix: VF,
    pourquoi: "Non. La formule donne un PLANCHER, pas un prix. À 3,30 € la marge brute est de 2,10 € "
      + "et il faut encore payer les salaires, le loyer et l'énergie dessus. Une pizza bon marché "
      + "doit porter sa part des charges comme les autres : c'est le marché qui fixe le haut, la "
      + "formule qui interdit le bas.",
    source: "Manuel : Le coût matière · marge brute" },

  { q: "Tu calcules le coût matière d'une pizza : base, garnitures, fromage. C'est complet ?",
    rep: "non", choix: VF,
    pourquoi: "Il manque le pâton. Le manuel est explicite : coût matière = pâton + base + "
      + "garniture. L'oublier retire deux à trois points de ratio à chaque pizza de la carte, une "
      + "erreur invisible, et répétée partout.",
    source: "Manuel : Le coût matière · Le ratio" },

  { q: "Deux pizzas : l'une à 24 % de ratio, l'autre à 31 %. La première est forcément la meilleure ?",
    rep: "non", choix: VF,
    pourquoi: "Non : le ratio ne dit rien des euros. Une pizza à 31 % vendue 16 € rapporte plus "
      + "qu'une pizza à 24 % vendue 8 €. On surveille le ratio pour détecter les dérives, on "
      + "compte la marge en euros pour savoir ce qu'on gagne.",
    source: "Manuel : La matrice BCG · La marge se compte en euros" },
];

/**
 * Tire la question suivante. QUATRE FORMES, et elles n'entraînent pas le même geste : juger un
 * prix, en produire un, comparer deux marges, et les règles de gestion qui ne se lisent pas sur
 * une carte. Une seule forme répétée deux minutes s'apprend par cœur au lieu de se comprendre —
 * c'est la leçon de « La commande piège », et elle vaut ici aussi.
 */
function tirerUne(carte, servis) {
  const d = alea(100);
  if (d < 25) return { type: "piege", ...PIEGES[alea(PIEGES.length)] };
  if (d < 45) { const q = questionPrix(carte); if (q) return q; }
  if (d < 65) return questionMarge(carte);
  return questionRatio(carte, servis);
}

/** Ce qui identifie une question pour l'œil du joueur : sa forme et la pizza dont elle parle. */
const signature = (q) => `${q.type}:${q.pizza?.nom || q.q.slice(0, 40)}`;

/**
 * ÉVITE DE REPOSER LA MÊME QUESTION. Observé en jouant : « La Maison » revient à 3,04 € puis, la
 * question d'après, « La Maison » revient à 3,03 € — mêmes propositions, même réponse. À six
 * pizzas et quatre formes, la répétition arrive vite, et elle se lit comme un défaut du jeu bien
 * plus que comme une révision.
 *
 * On mémorise les quatre dernières signatures et on retire au besoin. La borne d'essais évite de
 * boucler quand la carte n'a plus rien de neuf à offrir — mieux vaut une répétition qu'un écran
 * figé, le chrono tourne.
 */
function tirer(carte, servis, recents) {
  for (let i = 0; i < 12; i++) {
    const q = tirerUne(carte, servis);
    if (!recents.includes(signature(q))) return q;
  }
  return tirerUne(carte, servis);
}

/* DEUX MINUTES, ET TROIS CŒURS — la même grammaire que « La commande piège », pour que l'arcade se
   joue sans réapprendre les règles à chaque jeu. L'erreur coûtait quatre secondes de chrono ; elle
   coûte désormais un cœur, et à zéro la partie s'arrête. Les deux ensemble puniraient deux fois la
   même faute (cf. `lib/coeurs.js`). Un prix posé de travers ne fait pas perdre du temps dans la
   vraie vie : il fait perdre de l'argent jusqu'à ce qu'on ferme.
 *
 * QUATRE, HUIT, DOUZE. Plus bas que les 5/10/15 du jeu des allergènes, et pour une raison mesurée :
 * là-bas on LIT une composition, ici on fait une DIVISION. 2,45 ÷ 8,64 ne se voit pas, il se
 * calcule — et le prix HT demande d'abord de diviser par 1,10. Douze bonnes réponses en 120 s
 * laissent dix secondes par question, ce qui est le temps d'un calcul mental fait honnêtement. */
const DUREE = 120;
const NOTE = (justes) => (justes >= 12 ? 3 : justes >= 8 ? 2 : justes >= 4 ? 1 : 0);

export default function JustePrix({ onClose, onFinish }) {
  const [phase, setPhase] = useState("pret");   // pret | jeu | fin
  const [reste, setReste] = useState(DUREE);
  const [carte, setCarte] = useState(dresserCarte);
  const [q, setQ] = useState(null);
  const [flash, setFlash] = useState(null);
  const [justes, setJustes] = useState(0);
  const [rates, setRates] = useState([]);
  /* En REF autant qu'en état : le compte est lu dans le `setTimeout` qui suit la réponse, où un
     état React porterait encore la valeur d'avant. L'état ne sert qu'à l'affichage. */
  const perdus = useRef(0);
  const [coeurs, setCoeurs] = useState(0);
  const servis = useRef({ bas: 0, bon: 0, cher: 0 });  // équilibrage des verdicts sur la partie
  const recents = useRef([]);                          // les 4 dernières questions, pour ne pas se répéter
  const tic = useRef(null);

  useEffect(() => {
    if (phase !== "jeu") return undefined;
    tic.current = setInterval(() => {
      setReste((r) => { if (r <= 1) { clearInterval(tic.current); setPhase("fin"); return 0; } return r - 1; });
    }, 1000);
    return () => clearInterval(tic.current);
  }, [phase]);

  function suivante(c) {
    const next = tirer(c, servis.current, recents.current);
    if (next.type === "ratio") servis.current[next.rep] = (servis.current[next.rep] || 0) + 1;
    recents.current = [...recents.current, signature(next)].slice(-4);
    setQ(next);
  }

  function demarrer() {
    // Une carte NEUVE à chaque partie : figée, on retiendrait « La Bella est trop chère » au lieu
    // de refaire la division.
    const c = dresserCarte();
    servis.current = { bas: 0, bon: 0, cher: 0 }; recents.current = [];
    perdus.current = 0; setCoeurs(0);
    setCarte(c); setJustes(0); setRates([]); setReste(DUREE); setFlash(null); suivante(c); setPhase("jeu");
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
    /* Le retour reste affiché AVANT l'arrêt : perdre son dernier cœur sans savoir pourquoi ne
       laisse rien à apprendre — et ici l'explication porte une division qu'on vient de rater. */
    setTimeout(() => {
      setFlash(null);
      if (!encoreEnVie(perdus.current)) { setPhase("fin"); return; }
      suivante(carte);
    }, juste ? 550 : 1800);
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
  // La pizza dont on parle : mise en avant dans la carte, comme au comptoir.
  const enJeu = (p) => (q?.pizza && q.pizza.nom === p.nom)
    || (q?.choix || []).some((c) => c.label === p.nom);

  return (
    <div className="overlay" onClick={fermer}>
      <div className="modal cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="coins" size={17} /> Le juste prix
          </h3>
          <button className="x" onClick={fermer} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>

        {phase === "pret" && (
          <div className="mbody" style={{ textAlign: "center", padding: "22px 20px" }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Deux minutes pour auditer une carte.</p>
            <p className="hint" style={{ margin: "0 0 4px" }}>
              Elle a dérivé : certaines pizzas mangent la marge, d'autres sont hors marché. La carte
              reste ouverte à côté, avec le coût matière et le prix, tout sauf le ratio.
            </p>
            <p className="hint" style={{ margin: "0 0 18px" }}>
              Cible du manuel : <b>25 à 30 %</b> du prix <b>HT</b> (TTC ÷ 1,10). Tu as
              <b> {COEURS_MAX} cœurs</b> : une erreur en coûte un, et à zéro la caisse ferme.
            </p>
            <button className="btn primary" onClick={demarrer} autoFocus>
              <Icon name="play" size={15} /> Ouvrir la caisse
            </button>
          </div>
        )}

        {phase === "jeu" && q && (
          <div className="mbody cp-jeu">
            <div className="cp-col">
              <div className="cp-bandeau">
                <div className="pq-progress"><span style={{ width: `${(reste / DUREE) * 100}%`, background: reste <= 10 ? "var(--red)" : "var(--gold, #e0ac48)" }} /></div>
                <span className={"cp-chrono" + (reste <= 10 ? " urgent" : "")}>{reste}s</span>
                <span className="cp-score"><Icon name="check" size={13} /> {justes}</span>
              <Coeurs perdus={coeurs} />
              </div>

              {/* Le verdict PREND LA PLACE de l'énoncé, il ne s'ajoute pas dessous : ajouté, il
                  pousse la carte hors de l'écran sur un téléphone (mesuré sur « La commande
                  piège »). On vient de répondre, l'énoncé a fait son travail. */}
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
                    {r.label}
                  </button>
                ))}
              </div>

              {/* L'AIDE-MÉMOIRE, et il occupe une place qui était vide. La colonne de gauche
                  mesurait 154 px face à un classeur de 530 : un vide de trois cent soixante-seize
                  pixels au milieu d'un jeu chronométré. Donner la FORMULE ne donne aucune réponse
                  — c'est la division qu'on entraîne, pas sa mémorisation — et elle est de toute
                  façon dans le manuel, à deux clics. Un pizzaiolo a le droit d'avoir sa formule
                  au mur. */}
              <div className="jp-aide">
                <span><b>Ratio</b> = coût ÷ HT<i>, et HT = TTC ÷ 1,10</i></span>
                <span><b>Cible</b> 25 à 30 %<i> (au-delà, la marge est mangée)</i></span>
                <span><b>Marge brute</b> = HT − coût<i>, en euros</i></span>
              </div>
            </div>

            {/* LA CARTE DU GÉRANT — coût matière et prix affiché, jamais le ratio. Le ratio est
                exactement ce qu'on demande : l'écrire ici transformerait le jeu en lecture. */}
            <aside className="cp-carte">
              <div className="cp-carte-t"><Icon name="coins" size={12} /> La carte · coût / prix</div>
              <ul>
                {carte.map((p) => (
                  <li key={p.nom} className={enJeu(p) ? "on" : ""}>
                    <b className="jp-l"><span>{p.nom}</span><span className="jp-p tnum">{euro(p.prix)}</span></b>
                    <span className="jp-l">
                      <span className="jp-ing">{p.ing.map((i) => i.label).join(", ")}</span>
                      <span className="jp-c tnum">{euro(p.cout)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {/* Ce rappel porte SEUL la formule sur téléphone, où l'aide-mémoire est masqué —
                  d'où sa formulation courte, qui doit tenir en une ligne. */}
              <p className="hint">Prix TTC · coût pâton compris · HT = TTC ÷ 1,10</p>
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
              {stars === 3 ? "Tu tiens ta carte."
                : stars === 2 ? "Bien. C'est la marge en euros qui fait la différence, pas le ratio."
                  : "Relis « Le coût matière » dans Notions, la formule tient en une ligne."}
            </p>

            {/* LE DÉBRIEFING EST LE VRAI COURS : pendant la partie le retour est bref parce que le
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
