/* 210_compta_entite.sql
   RATTACHER LES ÉCRITURES COMPTABLES À UNE ENTITÉ ÉMETTRICE — demandé le 2026-10-20.

   POURQUOI. La page Comptabilité additionne tout l'organisme : le chiffre d'affaires des FORMATIONS
   (dossiers facturés), des ventes BOUTIQUE (material_sale) et des PRODUITS DIVERS (revenue_extra),
   moins les DÉPENSES (expense). L'école facture pourtant sous DEUX entités (billing_profile :
   l'organisme, la boutique), chacune une identité de vendeur RÉELLE avec son SIRET et sa propre
   séquence de numéros (migration 113). Pour tenir une comptabilité PAR entité — un vrai résultat par
   société —, chaque écriture doit savoir à quelle entité elle appartient. Seule la FACTURE le savait
   (invoice.billing_profile_id) ; les ventes, les produits divers et les dépenses, non.

   CE QUE FAIT CETTE MIGRATION. Une colonne `billing_profile_id` (NULLABLE) sur `material_sale`,
   `revenue_extra`, `expense` ET `partner_contribution`, à l'image d'`invoice` (113). NULL = NON
   RATTACHÉE : l'écriture compte dans la vue « Toutes les entités » mais JAMAIS dans celle d'une entité
   précise — ainsi les écritures d'avant la migration, et celles qu'on ne rattache pas, restent
   visibles dans le total sans fausser le détail d'une entité. Le CA des FORMATIONS, lui, se rattache
   par la facture du dossier (invoice.billing_profile_id, déjà là) : rien à stocker de ce côté.

   LES APPORTS DE PARTENAIRES (partner_contribution — les « cadeaux » en nature) se rattachent À LA
   MAIN à l'une ou l'autre entité : un même partenaire peut servir deux buts (l'organisme, la
   boutique), l'école choisit à la saisie. Même chose pour une commission cash (revenue_extra) et une
   dépense (expense).

   FK ON DELETE SET NULL, comme `invoice` : retirer une entité ne doit pas effacer une pièce comptable
   qui la nomme — l'écriture survit, non rattachée. `DROP FOREIGN KEY IF EXISTS` AVANT l'`ADD` pour que
   la migration soit rejouable sans risque (un `ADD CONSTRAINT`, lui, n'est pas idempotent).

   LE CODE MARCHE AVANT ET APRÈS : sans la colonne, la caisse et les formulaires n'écrivent pas
   d'entité (sonde `colonneOuNull` / try-catch sur ER_BAD_FIELD_ERROR), et la Comptabilité ignore le
   filtre par entité — tout reste « Toutes les entités ». */

ALTER TABLE material_sale DROP FOREIGN KEY IF EXISTS fk_material_sale_billing;
ALTER TABLE material_sale ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;
ALTER TABLE material_sale ADD CONSTRAINT fk_material_sale_billing
    FOREIGN KEY (billing_profile_id) REFERENCES billing_profile (id) ON DELETE SET NULL;

ALTER TABLE revenue_extra DROP FOREIGN KEY IF EXISTS fk_revenue_extra_billing;
ALTER TABLE revenue_extra ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;
ALTER TABLE revenue_extra ADD CONSTRAINT fk_revenue_extra_billing
    FOREIGN KEY (billing_profile_id) REFERENCES billing_profile (id) ON DELETE SET NULL;

ALTER TABLE expense DROP FOREIGN KEY IF EXISTS fk_expense_billing;
ALTER TABLE expense ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;
ALTER TABLE expense ADD CONSTRAINT fk_expense_billing
    FOREIGN KEY (billing_profile_id) REFERENCES billing_profile (id) ON DELETE SET NULL;

ALTER TABLE partner_contribution DROP FOREIGN KEY IF EXISTS fk_pcontrib_billing;
ALTER TABLE partner_contribution ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;
ALTER TABLE partner_contribution ADD CONSTRAINT fk_pcontrib_billing
    FOREIGN KEY (billing_profile_id) REFERENCES billing_profile (id) ON DELETE SET NULL;
