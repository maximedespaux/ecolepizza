-- 080_condition_field_purposes.sql
-- Sépare les deux usages d'un « champ du dossier » : servir de JETON (imprimé dans un document)
-- et/ou servir de CONDITION (test « ce document ne s'applique que si… »). Jusqu'ici un seul
-- interrupteur `enabled` gérait les deux. On garde `enabled` = usage JETON et on ajoute
-- `enabled_condition` = usage CONDITION. Reprise : on copie l'existant pour ne rien changer.
ALTER TABLE condition_field
    ADD COLUMN IF NOT EXISTS enabled_condition TINYINT(1) NULL DEFAULT NULL;

UPDATE condition_field SET enabled_condition = enabled WHERE enabled_condition IS NULL;
