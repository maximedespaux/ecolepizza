/* 155_modele_hors_parcours.sql
   UN MODÈLE NEUF N'ENTRE PLUS DANS LES PARCOURS TOUT SEUL.

   CE QUI SE PASSAIT. Le parcours documentaire d'une formation n'est pas une liste stockée :
   il se DÉDUIT. Tous les modèles actifs de l'organisme dont les conditions correspondent à la
   formation en sont candidats, et `program_step` ne sert que d'exception — réordonner, ou
   désactiver. Sans ligne d'exception, l'étape est ACTIVE :

       active: o ? !!o.active : true

   Or un modèle qu'on vient de créer n'a aucune condition : `applies_when` vide correspond à
   TOUTES les formations. Créer un modèle l'ajoutait donc, actif, au parcours de chaque
   formation — et il fallait penser à aller le désactiver partout. Signalé par l'organisme le
   2026-09-16 : « si j'oublie de vérifier le parcours, il est toujours ajouté ».

   LE DÉFAUT S'INVERSE, POUR LES NOUVEAUX SEULEMENT. La colonne vaut 1 pour tout ce qui existe :
   aucun parcours ne bouge, aucune formation ne perd un document. Seuls les modèles créés à
   partir de maintenant naissent à 0 — hors de tous les parcours, jusqu'à ce qu'on les y active
   depuis l'écran Formations.

   POURQUOI UNE COLONNE ET NON DES LIGNES `program_step` À 0. Écrire une exception par formation
   à la création réglerait le présent et pas l'avenir : une formation créée DEMAIN n'aurait pas
   ces lignes, et le modèle y réapparaîtrait actif. La colonne porte l'intention une fois pour
   toutes, quelles que soient les formations à venir.

   CE N'EST PAS UNE RESTRICTION CODÉE EN DUR (cf. CLAUDE.md § 2.2). Aucun type de document n'est
   traité à part, rien n'est interdit : c'est la valeur PAR DÉFAUT d'un réglage que l'organisme
   garde entièrement la main de changer, formation par formation, depuis l'écran qui existe déjà.

   PRÉCÉDENT DANS LE MÊME FICHIER : les pièces justificatives et les modèles d'émargement sont
   déjà inactifs par défaut, « jamais imposés d'office à toutes les formations ». Les documents
   rejoignent cette règle pour les nouveaux venus. */

ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS parcours_defaut TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Ce modele entre-t-il dans le parcours des formations sans exception ? 1 = oui (existant), 0 = opt-in';
