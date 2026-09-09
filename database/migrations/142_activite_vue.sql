/*
 * MARQUE DE LECTURE DE L'ACTIVITÉ — une date par personne, et rien de plus.
 *
 * LE PROBLÈME. Le carillon sonne dès qu'une autre personne de l'organisme modifie quelque
 * chose, mais il ne dit PAS quoi. On entend, on ne sait pas. La cloche doit donc lister les
 * changements — et le journal d'audit les contient déjà tous (une centaine de points d'appel :
 * qui, quoi, quand). On n'écrit donc AUCUNE notification supplémentaire : on relit `audit_log`.
 *
 * POURQUOI PAS UNE LIGNE `notification` PAR ACTION. Ce serait doubler l'écriture de chaque
 * mutation de l'application pour recopier une information déjà en base, avec le risque
 * classique de la copie : deux vérités qui divergent. Et `notification.is_read` est une colonne
 * UNIQUE, partagée — sur une notification d'organisme, la première personne qui lit efface la
 * pastille de TOUT LE MONDE. Tolérable pour quatre alertes, faux pour un flux d'activité.
 *
 * D'OÙ CETTE COLONNE. Un flux ne se lit pas ligne à ligne, il se lit « jusqu'ici ». Une seule
 * date par utilisateur suffit donc : est non lu ce qui est postérieur. Pas de table de liaison
 * qui grossirait comme le produit (personnes × actions), pas d'état par ligne à maintenir.
 *
 * AVANT LA MIGRATION, le code lit l'absence de colonne et considère toute l'activité comme
 * DÉJÀ LUE : la rubrique s'affiche, aucune pastille n'apparaît, aucun compteur ne saute. La
 * fonctionnalité reste simplement en sommeil jusqu'à ce que cette migration soit jouée.
 *
 * LE DÉFAUT PAR MAINTENANT, ET POURQUOI. À NULL, tout l'historique deviendrait « non lu » d'un
 * coup : la cloche afficherait « 9+ » dès la migration jouée, pour trente actions déjà vieilles
 * que personne n'a manquées. Le flux doit commencer à l'instant où il existe. CURRENT_TIMESTAMP
 * en défaut vaut aussi pour les COMPTES CRÉÉS ENSUITE — sans lui, chaque nouvelle recrue
 * hériterait d'un arriéré d'un mois le jour de son arrivée.
 *
 * L'UPDATE qui suit rattrape les lignes qu'un ADD COLUMN n'aurait pas garnies, et se rejoue
 * sans dommage : il ne touche que ce qui est resté NULL.
 */
ALTER TABLE user ADD COLUMN IF NOT EXISTS activity_seen_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE user SET activity_seen_at = NOW() WHERE activity_seen_at IS NULL;
