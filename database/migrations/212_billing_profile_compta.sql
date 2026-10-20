/* 212_billing_profile_compta.sql — DES PARAMÈTRES DE GESTION PAR ENTITÉ ÉMETTRICE, lus par la page
   Comptabilité quand une entité est sélectionnée. Demandé le 2026-10-20.

   POURQUOI. La Comptabilité se filtre par entité (Organisme / Boutique) depuis la 210, mais deux
   choses restaient GLOBALES à l'organisme : les CIBLES (budgets de dépenses en % du CA + dividende
   visé), et l'hypothèse qu'une entité a TOUJOURS les trois sources de chiffre d'affaires. Or une
   Boutique ne fait QUE de la vente de matériel — pas de formations (inscriptions), pas de produits
   divers —, et ses objectifs de gestion diffèrent de ceux de l'organisme.

   On ajoute donc à chaque entité (billing_profile) :
   - revenue_inscriptions / revenue_materiel / revenue_divers : les sources de CA qu'elle a. Sur la
     Comptabilité, quand cette entité est sélectionnée, une source NON cochée est MASQUÉE — mais
     jamais si elle porte un montant réel (on ne cache pas de l'argent). Par défaut 1 : une entité
     existante garde ses trois sources, comportement d'avant.
   - compta_targets (JSON des budgets par poste, en %) / compta_dividende (%) : ses cibles propres.
     NULL = on retombe sur les cibles GLOBALES de l'organisme (accounting_settings), comme avant.

   LE CODE MARCHE AVANT ET APRÈS. Sans ces colonnes : la Comptabilité reste globale (le serveur
   sonde `colonneExiste`), et l'écran Facturation masque les nouveaux champs. Rien ne casse. */
ALTER TABLE billing_profile
    ADD COLUMN IF NOT EXISTS revenue_inscriptions TINYINT(1)   NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS revenue_materiel     TINYINT(1)   NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS revenue_divers       TINYINT(1)   NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS compta_targets       TEXT             NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS compta_dividende     DECIMAL(5,2)     NULL DEFAULT NULL;
