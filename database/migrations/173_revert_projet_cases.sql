/* 173_revert_projet_cases.sql
   Retire les quinze cases de « Votre projet » ajoutées par la 173.

   ⚠ Ce qui y était coché est PERDU. Les neuf cases d'avant (création, reprise, four et son type,
   camion, recherche de poste, perfectionnement) restent. Le code d'avant ne lit pas ces colonnes, et
   le code d'après s'en passe (liste blanche filtrée, lectures tolérantes). */

ALTER TABLE learner
    DROP COLUMN IF EXISTS project_dine_in,
    DROP COLUMN IF EXISTS project_takeaway,
    DROP COLUMN IF EXISTS project_by_slice,
    DROP COLUMN IF EXISTS project_vending,
    DROP COLUMN IF EXISTS project_catering,
    DROP COLUMN IF EXISTS project_add_on,
    DROP COLUMN IF EXISTS project_kneader,
    DROP COLUMN IF EXISTS project_sheeter,
    DROP COLUMN IF EXISTS project_fridge_counter,
    DROP COLUMN IF EXISTS project_oven_owned,
    DROP COLUMN IF EXISTS project_premises,
    DROP COLUMN IF EXISTS project_funded,
    DROP COLUMN IF EXISTS project_opening_soon,
    DROP COLUMN IF EXISTS project_support,
    DROP COLUMN IF EXISTS project_more_training;
