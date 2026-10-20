/* 210_compta_entite.sql
   RATTACHER LES ÉCRITURES COMPTABLES À UNE ENTITÉ ÉMETTRICE — demandé le 2026-10-20.

   POURQUOI. La page Comptabilité additionnait tout l'organisme : le chiffre d'affaires des FORMATIONS
   (dossiers facturés), des ventes BOUTIQUE (material_sale) et des PRODUITS DIVERS (revenue_extra),
   moins les DÉPENSES (expense). L'école facture pourtant sous DEUX entités (billing_profile :
   l'organisme, la boutique), chacune une identité de vendeur RÉELLE avec son SIRET et sa propre
   séquence de numéros (migration 113). Pour tenir une comptabilité PAR entité — un vrai résultat par
   société —, chaque écriture doit savoir à quelle entité elle appartient. Seule la FACTURE le savait
   (invoice.billing_profile_id) ; les ventes, les produits divers et les dépenses, non.

   CE QUE FAIT CETTE MIGRATION. Une colonne `billing_profile_id` (NULLABLE) sur `material_sale`,
   `revenue_extra`, `expense` ET `partner_contribution`. NULL = NON RATTACHÉE : l'écriture compte dans
   la vue « Toutes les entités » mais JAMAIS dans celle d'une entité précise — ainsi les écritures
   d'avant la migration, et celles qu'on ne rattache pas, restent visibles dans le total sans fausser
   le détail d'une entité. Le CA des FORMATIONS, lui, se rattache par la facture du dossier
   (invoice.billing_profile_id, déjà là) : rien à stocker de ce côté.

   LES APPORTS DE PARTENAIRES (partner_contribution — les « cadeaux » en nature) se rattachent À LA
   MAIN à l'une ou l'autre entité : un même partenaire peut servir deux buts (l'organisme, la
   boutique), l'école choisit à la saisie. Même chose pour une commission cash (revenue_extra) et une
   dépense (expense).

   PAS DE CLÉ ÉTRANGÈRE ICI, à la différence d'`invoice` (113) — et c'est VOLONTAIRE. Une FK obligeait
   à entourer l'ADD COLUMN d'un `DROP FOREIGN KEY ... ; ADD CONSTRAINT ...` pour rester rejouable ; or
   MariaDB transforme `IF EXISTS` / `IF NOT EXISTS` en AVERTISSEMENTS (pas en erreurs), si bien que le
   rejeu crachait « Can't DROP FOREIGN KEY » et « Duplicate column name » — bruyant, inquiétant, pour
   rien. L'application n'a pas besoin de l'intégrité référentielle ici : une entité supprimée disparaît
   simplement du filtre, l'écriture retombe dans « Toutes ». On garde donc la seule forme rejouable
   SANS bruit : `ADD COLUMN IF NOT EXISTS`.

   LE CODE MARCHE AVANT ET APRÈS : sans la colonne, la caisse et les formulaires n'écrivent pas
   d'entité (sonde `colonneExiste` / try-catch sur ER_BAD_FIELD_ERROR), et la Comptabilité ignore le
   filtre par entité — tout reste « Toutes les entités ». */

ALTER TABLE material_sale ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;
ALTER TABLE revenue_extra ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;
ALTER TABLE expense ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;
ALTER TABLE partner_contribution ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;
