-- 044_notification_link.sql
-- Redirection au clic sur une notification (chemin de l'app, ex. /stagiaires/<id>).
ALTER TABLE notification
    ADD COLUMN IF NOT EXISTS link varchar(255) DEFAULT NULL;
