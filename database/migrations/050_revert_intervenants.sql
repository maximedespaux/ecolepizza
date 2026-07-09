-- 050_revert_intervenants.sql — ROLLBACK MANUEL de 050_intervenants.sql.
-- ⚠ Supprime les affectations d'intervenants. Repassez d'abord tout compte
--   INTERVENANT sur un autre rôle avant de restaurer l'ancien enum.
DROP TABLE IF EXISTS session_intervenant_slot;
DROP TABLE IF EXISTS session_intervenant;
ALTER TABLE user MODIFY COLUMN role
    enum('PLATFORM_OWNER','SUPER_ADMIN','ADMIN_ORGANISME','SECRETARIAT','FORMATEUR',
         'STAGIAIRE','ENTREPRISE','FINANCEUR','AUDITEUR')
    NOT NULL DEFAULT 'SECRETARIAT';
