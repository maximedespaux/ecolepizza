/*
  REVERT DE LA 215 : retirer les sous-groupes d'entreprise.

  CE QUI SE PERD : la répartition des inscriptions en groupes séparés d'une même entreprise + session,
  et le numéro de groupe porté par les documents. Tout retombe en « groupe 1 » (un seul groupe par
  entreprise), comme avant la 215. Les inscriptions, les documents, les signatures et les fichiers ne
  sont PAS touchés — seuls les documents d'un 2ᵉ groupe, jusque-là séparés, se retrouvent réunis au
  même jalon (comme une entreprise à un seul groupe).
*/

ALTER TABLE enrollment DROP COLUMN IF EXISTS company_group;

ALTER TABLE generated_document DROP COLUMN IF EXISTS company_group;
