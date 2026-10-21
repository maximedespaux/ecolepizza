/* Revert 213 — retire les créneaux multiples et le drapeau « heures en plus ».

   Les créneaux multiples (pauses) reviennent à la plage unique heure_debut/heure_fin (181) — la
   première plage, gardée en parallèle à chaque enregistrement ; les pauses saisies sont perdues.
   Les intervenants « extra » cessent de compter dans le total : la feuille revient aux seules
   demi-journées du stagiaire. Les demi-journées et signatures ne sont pas touchées. */
ALTER TABLE session_intervenant_slot
    DROP COLUMN IF EXISTS plages;

ALTER TABLE session_intervenant
    DROP COLUMN IF EXISTS extra;
