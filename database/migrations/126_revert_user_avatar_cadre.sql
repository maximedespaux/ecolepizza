/* 126_revert_user_avatar_cadre.sql
   Retour arriere de 126. Les avatars et cadres choisis par le PERSONNEL sont DETRUITS.

   Sans gravite : purement cosmetique, et le navigateur de chacun garde son choix en
   localStorage (`impasto.avatar.<uid>` / `impasto.cadre.<uid>`) — l'interesse continuera donc
   de voir son avatar chez lui. Ce sont les AUTRES qui ne le verront plus : les publications de
   l'ecole dans la Communaute retomberont sur les initiales.

   Les stagiaires ne sont pas concernes : leur avatar vit sur `learner`, intact. */

ALTER TABLE user
    DROP COLUMN IF EXISTS avatar;

ALTER TABLE user
    DROP COLUMN IF EXISTS cadre;
