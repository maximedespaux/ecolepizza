/*
  186_revert_audit_precisions.sql

  CE QUI SE PERD : le nom et le stagiaire FIGÉS des lignes écrites depuis la migration — en pratique,
  ceux des suppressions (documents, réponses QCM, entreprises, retraits d'une session). Ces lignes
  redeviennent « Document supprimé », sans dire lequel ni pour qui.

  Tout le reste continue de se nommer : la cloche et le journal relisent l'objet là où il vit, tant
  qu'il existe. Les appels qui passent des précisions à logAudit les perdent, et la console le dit une
  fois par démarrage.
*/

ALTER TABLE audit_log
    DROP COLUMN IF EXISTS learner_id,
    DROP COLUMN IF EXISTS libelle;
