/* 211_invoice_date.sql
   LA DATE D'UNE FACTURE, distincte de l'échéance — demandé le 2026-10-20.

   POURQUOI. La date d'émission d'une facture était sa date de CRÉATION en base (`created_at`), un
   horodatage que l'école ne choisit pas. Or une facture porte une DATE (date d'émission / de
   facture) que l'on veut parfois fixer soi-même — l'antidater d'un jour, l'aligner sur un bon de
   commande — et qui n'est PAS l'ÉCHÉANCE (`due_date`, la date limite de paiement). Les deux doivent
   pouvoir différer. Le jeton {Date facture} existe déjà (lib/tokens.js) mais lisait `created_at` ;
   il lira désormais cette colonne quand elle est remplie.

   Une colonne `invoice_date` (date, NULLABLE). NULL = pas de date choisie → on retombe sur
   `created_at`, comme avant (COALESCE). Pas de clé étrangère, pas de valeur par défaut : une date
   pure, que seule la création de facture renseigne.

   LE CODE MARCHE AVANT ET APRÈS : sans la colonne, `createInvoice` ne l'écrit pas (sonde `hasColumn`),
   et {Date facture} comme la liste des factures retombent sur `created_at` (COALESCE toléré, cascade
   sur ER_BAD_FIELD_ERROR). */

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS invoice_date date DEFAULT NULL;
