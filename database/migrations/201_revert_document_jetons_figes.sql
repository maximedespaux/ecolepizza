/*
  201_revert_document_jetons_figes.sql

  CE QUI SE PERD : la photographie des données figées à l'émission de chaque document. Les documents
  non signés se remettront à se rendre depuis les données VIVANTES du dossier — leur date reste figée
  (via `sent_at`, dans le code), mais prix, adresses et dates suivraient de nouveau un changement du
  dossier survenu depuis l'envoi.

  Les documents déjà SIGNÉS gardent leur PDF figé (scellé à la signature) : seul leur rendu HTML,
  recalculé, pourrait de nouveau bouger.

  Après ce revert, le code cesse d'écrire et de lire le figé (ER_BAD_FIELD_ERROR, toléré) : rien ne
  casse, on revient au comportement « date figée, reste vivant ».
*/

ALTER TABLE generated_document
    DROP COLUMN IF EXISTS jetons_figes;
