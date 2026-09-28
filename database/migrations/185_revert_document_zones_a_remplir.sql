/*
  185_revert_document_zones_a_remplir.sql

  CE QUI SE PERD : les réponses aux zones à remplir de TOUS les documents non signés. Leurs zones
  redeviennent des pointillés, et la signature n'attend plus qu'on les remplisse.

  Les documents déjà SIGNÉS gardent leurs réponses imprimées : leur PDF est figé (scellé à la
  signature). Seul leur rendu HTML, recalculé, les montrerait de nouveau en pointillés.

  Après ce revert, les puces « Zone à remplir » restent dans les modèles et s'impriment en
  pointillés ; l'enregistrement répond de nouveau « migration 185 non jouée » (503).
*/

ALTER TABLE generated_document
    DROP COLUMN IF EXISTS saisies;
