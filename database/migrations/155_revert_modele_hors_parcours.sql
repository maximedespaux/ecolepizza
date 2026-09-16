/* 155_revert_modele_hors_parcours.sql

   ⚠ CE REVERT RÉACTIVE LES MODÈLES MIS DE CÔTÉ. Sans la colonne, le code retombe sur l'ancien
   défaut — « actif dans toutes les formations qui correspondent » — et les modèles créés depuis
   la 155 réapparaissent d'un coup dans tous les parcours. Ce ne sont pas des données perdues,
   c'est une intention perdue : plus rien ne dira lesquels devaient rester en dehors.

   Pour relever ceux qui sont concernés AVANT de reverter :
     SELECT slug, label FROM document_template WHERE parcours_defaut = 0; */

ALTER TABLE document_template
    DROP COLUMN IF EXISTS parcours_defaut;
