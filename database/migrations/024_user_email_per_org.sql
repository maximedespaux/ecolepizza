-- 024_user_email_per_org.sql
-- L'unicité de l'e-mail devient PAR ORGANISME (et non plus globale) : un stagiaire
-- (ou tout compte) peut ainsi exister dans plusieurs organismes avec la même adresse.
-- La connexion est alors levée d'ambiguïté par le code organisme (cf. auth.controller).
ALTER TABLE user DROP INDEX IF EXISTS uq_user_email;

ALTER TABLE user
    ADD UNIQUE KEY IF NOT EXISTS uq_user_org_email (organization_id, email);
