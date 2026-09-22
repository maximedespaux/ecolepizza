/* 172_revert_projet_types_four.sql
   Retire les trois types de four de « Votre projet ».

   ⚠ Les types cochés sont PERDUS. La case « Four » elle-même reste : elle date d'avant la 172, et
   dit toujours qu'un stagiaire veut s'équiper d'un four. Le code d'avant ne lit pas ces colonnes,
   et le code d'après s'en passe (liste blanche filtrée, colonneOuNull dans l'export). */

ALTER TABLE learner
    DROP COLUMN IF EXISTS project_oven_wood,
    DROP COLUMN IF EXISTS project_oven_electric,
    DROP COLUMN IF EXISTS project_oven_gas;
