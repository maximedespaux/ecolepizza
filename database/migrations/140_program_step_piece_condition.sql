/* 140_program_step_piece_condition.sql

   CONDITION « OU » D'UNE PIÈCE À FOURNIR, PAR FORMATION.

   « Pièce d'identité OU justificatif » : le stagiaire ne fournit que la variante qui correspond
   à son dossier. Comme pour les documents, ce choix se règle par une CONDITION (financement,
   RS, condition perso…). Mais les pièces n'ont AUCUNE définition globale porteuse de conditions
   — il n'existe pas d'écran « référentiel des pièces » où l'accrocher. La condition vit donc
   sur `program_step`, PAR FORMATION, à côté de `or_group` (migration 052) qui, lui, regroupe
   les variantes d'un même choix.

   RÉSERVÉ aux étapes « pièce » (slug « piece:… »). Les documents gardent leur condition GLOBALE
   (définition du modèle) ; `program_step.applies_when` les ignore. Ce mécanisme est volontairement
   DISTINCT des équivalences d'organisme (`document_equivalence`), réservées aux documents.

   `ADD COLUMN IF NOT EXISTS` → rejouable sans risque. NULL = aucune condition : la pièce
   s'applique toujours (variante par défaut du groupe, choisie quand aucune autre ne correspond).
   Le code lit la colonne EN CASCADE et fonctionne avant comme après cette migration. */
ALTER TABLE program_step
    ADD COLUMN IF NOT EXISTS applies_when text DEFAULT NULL;
