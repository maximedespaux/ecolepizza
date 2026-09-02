/* 141_revert_piece_type_limits.sql

   Retire les limites par type de pièce. Sans risque : les colonnes n'étaient lues que sous sonde
   (repli sur les plafonds codés — 3 Mo, JPEG/PNG/WebP/PDF). Après revert, toutes les pièces
   repassent à ces plafonds communs. */
ALTER TABLE piece_type
    DROP COLUMN IF EXISTS max_octets,
    DROP COLUMN IF EXISTS mimes;
