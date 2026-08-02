/* 117_revert_billing_profile_is_org.sql
   Retour arriere de 117.

   Apres ce retrait, on ne distingue plus l'entite « organisme » des autres : elle redevient une
   entite ordinaire, supprimable, et le semis retombe sur l'ancien comportement (seulement si
   aucune entite n'existe). Les entites elles-memes ne sont pas touchees. */

ALTER TABLE billing_profile
    DROP COLUMN IF EXISTS is_organization;
