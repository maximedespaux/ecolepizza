/**
 * LES CŒURS DE L'ARCADE — et pourquoi ceux-ci n'ont rien à voir avec ceux qu'on a supprimés.
 *
 * CE QUI AVAIT ÉTÉ RETIRÉ. Les cœurs de Pizza Quest (migrations 104 puis 115) étaient un CAPITAL
 * PERSISTANT : échouer un chapitre coûtait un cœur, et à court de cœurs le stagiaire ne pouvait
 * plus rien lancer avant d'en avoir récupéré un — `quest_regen_minutes`, table
 * `learner_quest_life`. Ils ont été supprimés le 2026-07-28 pour une raison qui n'a pas bougé :
 * PUNIR QUELQU'UN QUI VEUT RÉVISER n'a pas de sens dans une école.
 *
 * POURQUOI CEUX-CI NE RECRÉENT PAS LE DÉFAUT, et c'est la seule chose à retenir de ce fichier :
 *  · ils valent POUR UNE PARTIE et repartent au maximum à la suivante ;
 *  · il n'existe AUCUN état par stagiaire — ni table, ni colonne, ni compteur à régénérer. Rien
 *    à bloquer, donc : on rejoue tout de suite, autant de fois qu'on veut ;
 *  · ils ne touchent PAS aux chapitres. Les chapitres sont la révision ; l'arcade, ce sont les
 *    défis — et une vie qui s'épuise est la grammaire attendue d'un défi, pas d'une révision.
 *
 * CE QU'UN CŒUR COÛTE, selon la forme du jeu — les quatre n'ont pas la même :
 *  · JEUX CHRONOMÉTRÉS (La commande piège, Le juste prix) : une mauvaise réponse coûte un cœur.
 *    À zéro, la partie s'arrête et les étoiles sont comptées sur ce qui a été fait.
 *  · JEUX À SOUMISSION (Le Constructeur, Fais ta pizza) : chaque essai imparfait coûte un cœur.
 *    À zéro, on garde le MEILLEUR score obtenu. Ces deux jeux n'avaient qu'une seule tentative :
 *    les cœurs leur en donnent trois, ce qui est plus généreux qu'avant et non moins.
 *
 * LES CŒURS REMPLACENT LE MALUS DE TEMPS des jeux chronométrés (−4 s par erreur), ils ne s'y
 * ajoutent pas. Deux sanctions pour une même faute — le chrono qui fond ET la partie qui se
 * rapproche de sa fin — se cumulent sans qu'on puisse dire laquelle a coûté quoi, et rendent le
 * réglage impossible à calibrer. Une faute, une conséquence.
 */

/** Trois cœurs par partie, dans les quatre jeux de l'arcade. */
export const COEURS_MAX = 3;

/** Reste-t-il de quoi jouer ? Une partie s'arrête quand le dernier cœur est perdu. */
export const encoreEnVie = (perdus) => perdus < COEURS_MAX;

/** Ce qu'il reste, jamais négatif — l'affichage ne doit pas pouvoir montrer −1. */
export const restants = (perdus) => Math.max(0, COEURS_MAX - perdus);
