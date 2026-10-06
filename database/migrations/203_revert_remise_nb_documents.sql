/* ============================================================================================
   REVERT 203 — retire le nombre de documents par type de remise.

   Les types reviennent à « sans limite, sans requis » (le comportement d'avant la 203) : un dépôt
   ne plafonne plus, un accusé de réception ne demande plus un nombre minimum. Les fichiers déjà
   déposés et les accusés déjà donnés RESTENT — on ne retire qu'un réglage, jamais une preuve.
   ============================================================================================ */

ALTER TABLE remise_type
    DROP COLUMN IF EXISTS nb_documents,
    DROP COLUMN IF EXISTS nb_mode;
