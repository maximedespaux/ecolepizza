/* 115_drop_quest_hearts.sql
   Retrait des CŒURS de Pizza Quest.

   POURQUOI. Le jeu de QCM reprenait la mecanique de vies des applications d'apprentissage :
   un echec coutait un coeur, et a court de coeurs le stagiaire ne pouvait plus lancer de
   chapitre avant d'en avoir recupere un. Elle a ete retiree le 2026-07-28.

   La raison tient en une phrase : PUNIR QUELQU'UN QUI VEUT REVISER n'a pas de sens dans une
   ecole. Un stagiaire qui se trompe trois fois de suite est precisement celui qui a le plus
   besoin de recommencer ; l'application lui repondait « revenez dans 25 minutes ». La
   mecanique est faite pour etaler l'usage d'une application de loisir, pas pour accompagner
   un apprentissage.

   Elle etait de toute facon DEJA MORTE cote stagiaire : `setHearts` n'etait plus appele
   nulle part, si bien que trois coeurs s'affichaient en permanence sans jamais bouger. Seul
   l'ecran d'administration continuait d'enregistrer des reglages que plus personne ne lisait.

   Ce que la progression recompense a la place : les CADRES d'avatar, gagnes sur les
   formations reellement terminees (cf. migration 113). Ce qui se voit recompense donc le fait
   de venir, et non le temps passe a cliquer.

   PARTENT AVEC :
   · `learner_quest_life` — l'etat des coeurs de chaque stagiaire. Rien a conserver : c'est un
     compteur qui se reconstituait tout seul avec le temps, pas un historique.
   · `organization.quest_max_hearts` et `quest_regen_minutes` — les deux reglages.
   · cote code : `api/lib/questlives.js`, les routes /quest/vies, l'onglet « Coeurs » de
     l'ecran Pizza Quest, et la CSS `.pq-hearts` / `.pq-nohearts`.

   ATTENTION : ce retrait est DESTRUCTIF et ne se recalcule pas. Le retour arriere recree les
   colonnes et la table, mais vides — chaque stagiaire repartirait avec ses coeurs pleins.
   C'est sans gravite pour un compteur qui se reconstitue seul, mais autant le dire.

   Commentaires en blocs : memes raisons qu'en 101/102. */

DROP TABLE IF EXISTS learner_quest_life;

ALTER TABLE organization
    DROP COLUMN IF EXISTS quest_max_hearts;

ALTER TABLE organization
    DROP COLUMN IF EXISTS quest_regen_minutes;
