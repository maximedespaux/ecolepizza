-- 094_revert_learner_avatar_image.sql
-- Annule 094_learner_avatar_image.sql.
-- ⚠️ Détruit les photos de profil importées par les stagiaires (elles ne vivent nulle part
-- ailleurs). Les stagiaires concernés gardent la valeur « img » dans learner.avatar : la
-- ligne ci-dessous les rebascule sur l'avatar illustré par défaut pour éviter un profil vide.
UPDATE learner SET avatar = NULL WHERE avatar LIKE 'img%';

DROP TABLE IF EXISTS learner_avatar;
