-- 025_platform_owner.sql
-- Rôle « propriétaire de plateforme » (au-dessus des organismes) : provisionne les
-- nouveaux organismes et leur premier administrateur. organization_id = NULL.
ALTER TABLE user MODIFY COLUMN role
    enum('PLATFORM_OWNER','SUPER_ADMIN','ADMIN_ORGANISME','SECRETARIAT','FORMATEUR',
         'STAGIAIRE','ENTREPRISE','FINANCEUR','AUDITEUR')
    NOT NULL DEFAULT 'SECRETARIAT';
