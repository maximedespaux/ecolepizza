/* 128_cadre_plus_large.sql
   De la place pour les cadres de Pizza Quest.

   POURQUOI. Les cadres de quete portent la COULEUR DE LA FORMATION, et l'enregistrent avec le
   palier, sur la meme forme que les avatars : « palier|#rrggbb » (cf. lib/cadresQuest.js). Le
   plus long des trois paliers actuels donne « qparfait|#dc3e37 » — SEIZE caracteres, dans une
   colonne de seize. Cela tient, au caractere pres.

   C'est precisement ce qui rend la migration necessaire : la valeur ENTRE aujourd'hui, mais le
   jour ou l'on ajoute un quatrieme palier au nom un peu plus long, MariaDB tronque en silence
   (hors mode strict) et le cadre enregistre devient une chaine invalide — l'anneau disparait
   sans erreur nulle part. Une limite qu'on frole exactement est une limite qu'on franchira.

   LE CODE FONCTIONNE AVANT COMME APRES : les trois paliers d'aujourd'hui tiennent dans les
   seize caracteres existants, la migration ne fait qu'ecarter le mur. Rien a reprendre cote
   code, aucune valeur a convertir.

   `user.cadre` (migration 126) n'est pas touchee : le personnel de l'organisme ne porte QUE le
   cadre « ecole » — les cadres de quete recompensent la progression d'un stagiaire, et le
   serveur refuse deja les deux croisements (cf. saveMyCadre).

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE learner
    MODIFY COLUMN cadre VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Cadre porte : identifiant simple ("maestro") ou "palier|#rrggbb" pour un cadre de Pizza Quest.';
