/**
 * L'ÉCHÉANCE D'UN CONTRAT PARTENAIRE, côté écran (migration 131).
 *
 * POURQUOI CE CALCUL EXISTE DEUX FOIS, ici et dans `src/api/lib/contratPartenaire.js`. Le serveur
 * en a besoin pour FILTRER (une clause `WHERE`, qui doit s'exécuter en base) ; l'écran en a besoin
 * pour AFFICHER la fin pendant la saisie, avant tout enregistrement — il n'y a rien à interroger.
 *
 * La duplication est donc inévitable ; ce qui ne l'est pas, c'est qu'elle DIVERGE. Un test
 * (`test/contrat-partenaire.test.js`) fait tourner les deux implémentations sur les mêmes dates et
 * refuse le moindre écart. Sans lui, la fiche annoncerait « valable jusqu'au 28 février » pour un
 * partenaire que la requête écarte déjà — un désaccord qui ne provoque aucune erreur et que
 * personne ne va chercher.
 *
 * LES DEUX PIÈGES, identiques des deux côtés :
 *
 *  1. LE FUSEAU. `new Date('2026-01-15')` puis `toISOString()` recule d'un jour à Paris (minuit
 *     local = 22 h ou 23 h la veille en UTC). Un contrat de douze mois signé le 15 finissait le 14.
 *     On ne construit donc AUCUN objet `Date` à partir d'une chaîne : que des entiers.
 *
 *  2. LE DÉBORDEMENT DE MOIS. Le 31 janvier + 1 mois donne le 2 mars avec `setMonth`, février
 *     n'ayant pas de 31. MySQL, lui, ramène au dernier jour du mois (`DATE_ADD` → 28 février), et
 *     c'est MySQL qui filtre. On borne donc de la même façon.
 */

/** Ajoute des mois à une date ISO, en arithmétique pure. Rend `[année, mois, jour]`. */
export function ajouterMois(iso, mois) {
  const [a, m, j] = String(iso).slice(0, 10).split("-").map(Number);
  const total = (m - 1) + Number(mois);
  const annee = a + Math.floor(total / 12);
  const moisFinal = ((total % 12) + 12) % 12;
  const dernierJour = new Date(Date.UTC(annee, moisFinal + 1, 0)).getUTCDate();
  return [annee, moisFinal + 1, Math.min(j, dernierJour)];   // borné comme le fait MySQL
}

/** La date de fin en ISO (`2027-01-15`), ou `null` si l'un des deux éléments manque. */
export function finISO(debut, dureeMois) {
  if (!debut || !dureeMois || Number(dureeMois) <= 0) return null;
  const [a, m, j] = ajouterMois(debut, dureeMois);
  const d2 = (n) => String(n).padStart(2, "0");
  return `${a}-${d2(m)}-${d2(j)}`;
}

/**
 * `2027-01-15` → `15/01/2027`, PAR DÉCOUPAGE DE CHAÎNE.
 *
 * Surtout pas `new Date(iso).toLocaleDateString()` : `new Date('2027-01-15')` se lit en UTC, et
 * l'affichage se fait en heure locale — sur un fuseau négatif, la date reculerait d'un jour. Pour
 * une échéance de contrat, afficher la veille du terme est exactement le genre d'erreur qu'on ne
 * remarque qu'en la subissant.
 */
export const frISO = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

/** La même, écrite pour être lue : `15/01/2027`. Chaîne vide si elle ne peut pas se calculer. */
export function finContrat(debut, dureeMois) {
  return frISO(finISO(debut, dureeMois));
}

/**
 * L'état d'un contrat pour l'affichage : suivi ou non, complet ou non, actif, et dans combien de
 * jours il se termine.
 *
 * `jours` peut être NÉGATIF — le contrat est échu depuis autant de jours. On ne le ramène pas à
 * zéro : une convention expirée depuis huit mois n'appelle pas le même geste que depuis hier.
 *
 * UN CONTRAT COCHÉ SANS DATES N'ÉCARTE PAS le partenaire, il le SIGNALE. Bloquer sur une case
 * cochée ferait disparaître un partenaire de la boutique sans message et sans rapport visible avec
 * le clic ; un avertissement se corrige, une coupure inexpliquée se subit.
 */
export function etatContrat(p, aujourdhui = new Date()) {
  if (!p || Number(p.contrat) !== 1) return { suivi: false };
  if (!p.contrat_debut || !p.contrat_duree_mois) return { suivi: true, incomplet: true, actif: true };
  const [a, m, j] = ajouterMois(p.contrat_debut, p.contrat_duree_mois);
  const d2 = (n) => String(n).padStart(2, "0");
  // Les deux bornes sont bâties de la même façon : la soustraction porte sur deux minuits UTC.
  const jours = Math.round(
    (Date.UTC(a, m - 1, j)
      - Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate())) / 86400000);
  return { suivi: true, incomplet: false, fin: `${a}-${d2(m)}-${d2(j)}`, jours, actif: jours >= 0 };
}

/** Seuil d'alerte : en dessous, l'échéance passe en orange. Deux mois pour avoir le temps d'agir. */
export const BIENTOT_JOURS = 60;
