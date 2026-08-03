/* 136_revert_partner_disclosure_colonnes.sql
   REPREND LES COLONNES AJOUTÉES PAR LA 136.

   ⚠ À NE JOUER QUE SI L'ON SAIT QUE LA TABLE LES AVAIT DÉJÀ. Ce fichier est le revert d'un
   RATTRAPAGE : si les colonnes venaient de la migration 130 d'origine, les reprendre casse le
   journal des transmissions, qui ne saura plus dire ce qui est parti ni à combien de personnes.

   Et le contenu de `champs_envoyes` est PERDU : c'est une trace de ce qui a réellement été
   communiqué, qu'aucun recalcul ne peut reconstituer — les champs transmis en mars ne sont pas
   ceux d'aujourd'hui. */

ALTER TABLE partner_disclosure
    DROP COLUMN IF EXISTS session_id,
    DROP COLUMN IF EXISTS learner_ids,
    DROP COLUMN IF EXISTS learners_count,
    DROP COLUMN IF EXISTS champs_envoyes,
    DROP COLUMN IF EXISTS envoye_par;
