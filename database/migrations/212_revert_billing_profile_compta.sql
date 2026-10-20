/* Revert 212 — retire les paramètres de gestion par entité.

   Les sources de CA cochées et les cibles propres à chaque entité sont PERDUES : la Comptabilité
   revient aux cibles globales de l'organisme et montre les trois sources pour toutes les entités.
   Les factures, ventes, dépenses et autres écritures ne sont pas touchées. */
ALTER TABLE billing_profile
    DROP COLUMN IF EXISTS revenue_inscriptions,
    DROP COLUMN IF EXISTS revenue_materiel,
    DROP COLUMN IF EXISTS revenue_divers,
    DROP COLUMN IF EXISTS compta_targets,
    DROP COLUMN IF EXISTS compta_dividende;
