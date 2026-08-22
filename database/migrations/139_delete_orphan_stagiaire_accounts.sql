/* Nettoyage : supprime les COMPTES DE CONNEXION « stagiaire » ORPHELINS.

   POURQUOI. Supprimer la FICHE d'un stagiaire (table learner) ne supprimait PAS son COMPTE de
   connexion (table user). Un compte de rôle STAGIAIRE pouvait donc rester en base sans aucune
   fiche ni entreprise qui le référence — invisible dans l'interface (plus de fiche pour le gérer),
   mais il continue de RÉSERVER SON E-MAIL : impossible de réutiliser l'adresse ailleurs, on obtient
   « e-mail déjà utilisé » (typiquement en voulant la donner à un autre compte).

   CE QUE ÇA SUPPRIME. UNIQUEMENT les comptes de rôle STAGIAIRE qu'AUCUNE fiche (learner) et AUCUNE
   entreprise (company.user_id) ne référence — des comptes morts. Les comptes du bureau (admin,
   formateur, secrétariat, auditeur) et les représentants d'entreprise ne sont JAMAIS touchés :
   ils ne sont pas de rôle STAGIAIRE, ou bien une entreprise les référence.

   REJOUABLE. Un second passage ne trouve plus rien à supprimer (no-op).

   IRRÉVERSIBLE. On ne ressuscite pas une ligne supprimée : le revert est un no-op documenté.

   Le code applique désormais le même nettoyage à la suppression d'une fiche (deleteLearner), pour
   qu'aucun nouvel orphelin ne se crée à l'avenir. */

DELETE u FROM user AS u
 WHERE u.role = 'STAGIAIRE'
   AND NOT EXISTS (SELECT 1 FROM learner  l WHERE l.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM company  c WHERE c.user_id = u.id);
