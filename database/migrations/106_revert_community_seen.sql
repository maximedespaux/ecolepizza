/* 106_revert_community_seen.sql
   Retour arrière de 106.

   Ne détruit qu'une date de confort : au pire, chaque stagiaire retrouve une pastille pleine
   à sa prochaine visite, puis le compteur repart. Aucun commentaire ni aucune fiche n'est
   concerné — ils vivent dans recipe_comment et recipe, que cette migration n'a pas touchés. */

ALTER TABLE user
    DROP COLUMN IF EXISTS community_seen_at;
