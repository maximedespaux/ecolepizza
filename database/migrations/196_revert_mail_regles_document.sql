/* 196_revert_mail_regles_document.sql

   Revert de la 196 : retire la table de déduplication des règles d'événement et les quatre colonnes
   ajoutées à `mail_regle`. Les règles de DATE repartent au stagiaire, sans ciblage ; les règles
   d'ÉVÉNEMENT (document envoyé / signé) restent en base mais deviennent inertes — le passage ignore
   un déclencheur qu'il ne connaît pas, et le crochet des documents ne trouve plus de colonnes à lire.

   La table se retire AVANT les colonnes (sa clé étrangère vise `mail_regle`). Sans risque à rejouer. */

DROP TABLE IF EXISTS mail_regle_doc;

ALTER TABLE mail_regle
    DROP COLUMN IF EXISTS template_slug,
    DROP COLUMN IF EXISTS destinataire,
    DROP COLUMN IF EXISTS learner_id,
    DROP COLUMN IF EXISTS company_id;
