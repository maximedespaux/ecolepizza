/* 107_revert_recipe_read.sql
   Retour arrière de 107.

   Ne détruit que des marques de lecture : au pire, chaque stagiaire retrouve ses fiches
   commentées signalées comme non lues à sa prochaine visite. Aucun commentaire n'est touché —
   ils vivent dans recipe_comment, que cette migration n'a pas modifiée.

   À SAVOIR AVANT DE JOUER CECI : le code retombe alors sur la seule date globale de la 106,
   donc un commentaire redevient « lu » dès qu'on ouvre la Communauté, sans avoir ouvert la
   fiche. Le comptage dégrade en silence (cf. isMissingSchema), il n'échoue pas. */

DROP TABLE IF EXISTS recipe_read;
