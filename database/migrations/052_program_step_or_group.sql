-- 052_program_step_or_group.sql
-- Regroupement « OU » MANUEL des étapes d'un parcours de formation : les étapes
-- partageant la même valeur `or_group` (non nulle) forment une seule étape à choix
-- (le dossier n'en suit qu'une, selon ses conditions). NULL = étape autonome.
ALTER TABLE program_step
    ADD COLUMN IF NOT EXISTS or_group varchar(60) DEFAULT NULL;
