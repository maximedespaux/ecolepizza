-- 017_partners_followup.sql
-- Suivi des partenaires : ce qu'ils proposent (offre) + notes de suivi, et lien
-- des commissions (produit divers) à un partenaire pour le suivi par partenaire.
-- Idempotent (MariaDB 10.2+).

ALTER TABLE partner
    ADD COLUMN IF NOT EXISTS offer varchar(500) DEFAULT NULL AFTER discount_pct,   -- ce que le partenaire propose
    ADD COLUMN IF NOT EXISTS notes text         DEFAULT NULL AFTER offer;           -- notes de suivi

ALTER TABLE revenue_extra
    ADD COLUMN IF NOT EXISTS partner_id uuid DEFAULT NULL AFTER category;           -- commission liée à un partenaire
