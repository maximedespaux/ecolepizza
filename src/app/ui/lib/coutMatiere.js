/**
 * LE COÛT MATIÈRE — l'arithmétique de gestion de l'organisme, en un seul endroit.
 *
 * Elle n'appartient pas au jeu qui l'a fait naître (« Le juste prix ») : c'est la même question
 * qui se pose à une fiche recette, à une carte, et à l'assistant Garniture. Le volet Gestion du
 * manuel la pose d'ailleurs le premier — notion « Le coût matière ». La laisser dans un composant
 * de jeu, c'était garantir qu'elle serait réécrite ailleurs, un peu différemment. Même raison qui
 * a sorti le référentiel des allergènes de « La commande piège ».
 *
 * LA RÈGLE QUE TOUT LE FICHIER PROTÈGE : le ratio se calcule sur le prix HORS TAXES. Diviser par
 * le TTC est l'erreur naturelle — le TTC est le chiffre affiché, celui qu'on a sous les yeux — et
 * elle flatte le ratio de trois points, exactement dans la zone où se décide « ça tient » ou
 * « ça dérive ». Un ratio calculé sur le TTC dit 25 % quand la réalité est 27,5 %.
 *
 * LA CIBLE ET LA TVA SONT DES CONSTANTES NOMMÉES, à changer d'une ligne. Le manuel écrit « vise 25
 * à 30 % du prix de vente HT » et « prix TTC = prix HT × 1,10 (TVA restauration 10 %) ». Une école
 * qui travaille en livraison serre la cible — les commissions de plateforme ponctionnent le prix
 * de vente, c'est écrit dans la même notion. C'est un réglage d'organisme, pas une loi.
 */
import { GARN_BASES, GARN_PRODUITS, GARN_DAIRY } from "./garnitures.js";
import { computeBuild, DP_DEFAULT } from "./dough.js";

/* La cible du manuel — notion « Le coût matière · L'objectif ». */
export const CIBLE_BASSE = 0.25;
export const CIBLE_HAUTE = 0.30;

/* TVA restauration, consommation immédiate. Notion « Le coût matière · Le calcul ». */
export const TVA = 1.10;

/**
 * LE COÛT DU PÂTON VIENT DE `computeBuild`, la fonction de l'assistant Pâte.
 *
 * On aurait pu écrire 0,22 € en dur. Le jour où l'école corrige le prix de la farine, ce chiffre
 * serait devenu faux en silence — et un coût matière faux se propage à toute une carte sans que
 * rien ne le signale. Recette de référence : le pâton de 250 g du preset Classique.
 */
export const COUT_PATON = computeBuild({
  servings: 10, paton_g: 250, flour_price: 1.2, dough_params: { ...DP_DEFAULT, mode: "patons" },
}).costPerPaton;

/** Les garnitures utilisables, à plat. `qty` est en g/pizza et `price` en €/kg. */
export const BASES = GARN_BASES.filter((b) => b.key !== "autre");
export const GARNITURES = [...GARN_PRODUITS, ...GARN_DAIRY];

/** Ce que coûte un ingrédient SUR UNE PIZZA : sa quantité (g) au prix du kilo. */
export const coutIngredient = (i) => (i.qty / 1000) * i.price;

/**
 * Le coût matière d'une pizza. LE PÂTON EN FAIT PARTIE — le manuel est explicite : « pâton + base
 * + garniture ». L'oublier retire deux à trois points de ratio à chaque pizza d'une carte, une
 * erreur invisible et répétée partout.
 */
export const coutPizza = (ingredients) =>
  COUT_PATON + ingredients.reduce((s, i) => s + coutIngredient(i), 0);

/** Le prix hors taxes, à partir du prix affiché. */
export const ht = (ttc) => ttc / TVA;

/** Ratio de coût matière — SUR LE HT, jamais sur le TTC. C'est la règle centrale du fichier. */
export const ratio = (cout, ttc) => cout / ht(ttc);

/**
 * La marge BRUTE, en euros. Le manuel prévient deux fois plutôt qu'une :
 *  · ce n'est pas le bénéfice — restent les salaires, le loyer, l'énergie et les charges ;
 *  · c'est en euros qu'on la compte, pas en pourcentage (notion « La matrice BCG »). Une pizza au
 *    meilleur ratio rapporte souvent MOINS d'euros, parce qu'elle est bon marché — et ce sont des
 *    euros qui paient le loyer.
 */
export const marge = (cout, ttc) => ht(ttc) - cout;

/** Prix de vente HT conseillé pour un objectif de ratio. Manuel : coût matière ÷ objectif. */
export const prixConseille = (cout, objectif = 0.275) => cout / objectif;

/** Arrondi commercial : une carte affiche 8,50 €, jamais 8,47 €. */
export const auDemi = (p) => Math.round(p * 2) / 2;

/**
 * Le verdict sur un prix affiché : « bas » (la pizza mange la marge), « bon », « cher » (hors
 * marché). Toujours DÉDUIT du prix réel — un appelant qui a tiré ce prix pour obtenir un verdict
 * donné doit repasser par ici, parce que l'arrondi commercial déplace le ratio.
 */
export function verdictPrix(cout, ttc) {
  const r = ratio(cout, ttc);
  return r > CIBLE_HAUTE ? "bas" : r < CIBLE_BASSE ? "cher" : "bon";
}
