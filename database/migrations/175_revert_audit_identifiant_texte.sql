/* 175_revert_audit_identifiant_texte.sql
   Retour arrière de la 175 : audit_log.entity_id redevient uuid.

   ⚠️ CE QUI SE PERD : l'IDENTIFIANT de chaque ligne qui n'est pas un UUID. Le slug des modèles
   enregistrés, téléversés, dupliqués, réinitialisés ou supprimés, le nom des rôles système
   personnalisés. La LIGNE reste (qui, quoi, quand) : seul son identifiant passe à NULL.

   POURQUOI ON LES EFFACE D'ABORD, au lieu de laisser faire l'ALTER. Une colonne uuid ne peut pas
   contenir « grille-jury ». Laissé à lui-même, l'ALTER échouerait en mode strict dès la première
   de ces lignes, et le revert ne se jouerait pas. Hors mode strict, il les passerait à NULL sans
   un mot. On le fait donc EXPLICITEMENT, avant, et le motif dit ce qui part : tout ce qui n'a pas
   la forme d'un UUID, 32 chiffres hexadécimaux en groupes de 8, 4, 4, 4 et 12. Majuscules
   comprises, écrites dans le motif : la colonne uuid les accepte, et le motif ne doit pas
   dépendre de la collation de la table.

   APRÈS CE REVERT, les actions désignées par un slug ou un nom perdent de nouveau leur
   identifiant à l'écriture : le code garde la ligne sans lui (cf. lib/audit.js), comme avant la
   175. Sans dommage si la 175 n'a jamais été jouée : l'UPDATE ne trouve rien à effacer.

   AUCUN POINT-VIRGULE dans les commentaires ni les chaînes, AUCUNE BARRE OBLIQUE INVERSE dans le
   motif (cf. la 146 et la 166). */

UPDATE audit_log
   SET entity_id = NULL
 WHERE entity_id IS NOT NULL
   AND entity_id NOT RLIKE '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

ALTER TABLE audit_log
    MODIFY COLUMN entity_id uuid DEFAULT NULL;
