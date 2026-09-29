/* 191_revert_fiche_photo.sql
   Retour arrière de la 191 : les photos des fiches techniques disparaissent.

   ⚠️ CE QUI SE PERD : toutes les photos, et elles seules — les fiches, leurs ingrédients et leur
   procédé ne bougent pas. L'éditeur redit « pas encore disponible » et les listes s'affichent
   sans photo.

   Sans risque si la 191 n'a jamais été jouée. */
DROP TABLE IF EXISTS recipe_photo;
