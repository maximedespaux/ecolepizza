/* 161_remise_sans_objet.sql
   UNE REMISE QUI NE CONCERNE PAS CETTE PERSONNE-LA.

   POURQUOI. Une remise cochee dans un parcours s'applique a TOUS les stagiaires de la formation.
   Or l'ecole a des cas ou elle ne concerne qu'une partie d'entre eux — un diplome obtenu
   ailleurs, une carte professionnelle que certains ont deja. L'etape restait alors « a faire »
   pour des gens qui n'attendaient rien, et le dossier paraissait incomplet a vie.

   POURQUOI PAS `applies_when`, QUI EXISTE DEJA (migration 140). Cette colonne porte une REGLE,
   evaluee sur les donnees de la fiche : « seulement si le financement est X ». Elle repond
   parfaitement quand la distinction se lit dans une donnee. Ici, l'utilisateur a decrit l'autre
   cas : « ca depend des personnes » — un jugement au cas par cas, qu'aucune regle n'anticipe.
   Les deux mecanismes coexistent donc sans se remplacer.

   UN DRAPEAU, PAS UN STATUT DE PLUS. « Sans objet » est ORTHOGONAL a l'etat de la remise : on
   peut l'exclure avant tout depot, et le retablir ensuite sans avoir rien perdu. En faire une
   valeur de `statut` aurait ecrase l'etat precedent, et rendu le retour en arriere impossible.

   CE QUE CA CHANGE AU COMPTAGE, et c'est le point delicat : une etape sans objet n'est pas
   « faite », elle est HORS DU DECOMPTE. La compter comme faite gonflerait le score de
   conformite du dossier ; la compter comme due l'empecherait a jamais d'atteindre cent pour
   cent. Elle sort donc du numerateur ET du denominateur.

   Le code marche avant et apres : colonne sondee, et sans elle aucune remise n'est exclue —
   c'est-a-dire le comportement d'aujourd'hui. */

ALTER TABLE remise_document
    ADD COLUMN IF NOT EXISTS sans_objet TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Cette remise ne concerne pas ce stagiaire : hors du decompte. Cf. migration 161.';
