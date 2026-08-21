/* 131_revert_partner_recoit_coordonnees.sql
   RETOUR EN ARRIÈRE — et il n'est pas neutre, contrairement à la plupart des reverts.

   Reprendre cette colonne ne casse rien : le code retombe sur « tous les partenaires sont
   destinataires », qui est le comportement d'avant la 131. Mais c'est précisément ce qui le rend
   dangereux — ON REVIENT À UNE LISTE PLUS LARGE, pas à une liste vide. Les partenaires que l'école
   avait volontairement écartés redeviennent destinataires, en silence, sans qu'aucune décision
   n'ait été prise.

   Et le choix lui-même est PERDU : `DROP COLUMN` efface les cases cochées. Rejouer la 131 ensuite
   remettra tout le monde à 0, et il faudra recocher un par un.

   À ne jouer que pour revenir à un état antérieur connu, et en sachant que la sélection est à
   refaire. */

   LE SUIVI DES CONTRATS DISPARAÎT AVEC, et le même piège s'applique en pire : les partenaires
   dont le contrat avait expiré redeviennent actifs. Leurs offres réapparaissent aux stagiaires et
   l'export cesse de les refuser — sans qu'aucun contrat n'ait été renouvelé. Les dates saisies
   sont perdues, donc irrécupérables au rejeu.

   Noter les échéances AVANT de jouer ce fichier si l'on compte revenir en arrière. */

ALTER TABLE partner
    DROP COLUMN IF EXISTS recoit_coordonnees,
    DROP COLUMN IF EXISTS contrat,
    DROP COLUMN IF EXISTS contrat_debut,
    DROP COLUMN IF EXISTS contrat_duree_mois;
