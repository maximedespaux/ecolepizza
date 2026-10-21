/* 213_intervenant_plages_extra.sql — LES INTERVENANTS AVEC DES PAUSES, ET LEURS HEURES QUI COMPTENT
   DANS LE TOTAL. Demandé le 2026-10-21 (feuille d'émargement NIV1H, intervenant hygiène PENE).

   POURQUOI. Depuis la 181, un intervenant externe a UNE plage continue par demi-journée
   (heure_debut / heure_fin). Or l'expert hygiène fait « 16h15 à 16h30, pause, 16h45 à 18h15 » :
   plusieurs créneaux avec des pauses. Et ses heures ne sont pas comprises dans les demi-journées du
   stagiaire — elles viennent EN PLUS (NIV1H = 37 h de pizza + l'hygiène = 44 h). La feuille ne
   totalisait que les demi-journées (37 h), jamais ces heures-là.

   Deux colonnes :
   - session_intervenant_slot.plages (JSON) : la LISTE des créneaux d'une demi-journée, pauses
     comprises — [{"debut":"16:15:00","fin":"16:30:00"}, {"debut":"16:45:00","fin":"18:15:00"}].
     NULL = on retombe sur la plage unique heure_debut/heure_fin (181), comportement d'avant. Les
     heures nettes d'une demi-journée = la somme des créneaux (pauses exclues).
   - session_intervenant.extra (tinyint, 0 par défaut) : cet intervenant enseigne-t-il un temps EN
     PLUS des demi-journées du stagiaire ? À 1, ses heures nettes s'AJOUTENT au total de la feuille.
     À 0 (défaut), il enseigne dans les heures normales et ne s'ajoute pas — rien ne change.

   LE CODE MARCHE AVANT ET APRÈS : les colonnes sont sondées (`colonneExiste`) ; sans la 213, un
   intervenant garde sa plage unique et ne compte pas en plus, exactement comme avant. */
ALTER TABLE session_intervenant_slot
    ADD COLUMN IF NOT EXISTS plages text NULL DEFAULT NULL;

ALTER TABLE session_intervenant
    ADD COLUMN IF NOT EXISTS extra tinyint(1) NOT NULL DEFAULT 0;
