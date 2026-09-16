/* 156_qcm_hors_parcours.sql
   LES QCM REJOIGNENT LA RÈGLE DES MODÈLES (migration 155) : un QCM neuf n'entre plus d'office
   dans le parcours des formations.

   LE CAS QUI POSAIT PROBLÈME. Un QCM est proposé au parcours des formations selon son
   rattachement : `program_id = <formation>` OU `program_id IS NULL`. Le second cas — un QCM NON
   rattaché — est donc candidat dans TOUTES les formations, et il y était ACTIF par défaut
   (`active: o ? !!o.active : true`). Créer un QCM, ou simplement en DUPLIQUER un — la
   duplication le crée volontairement non rattaché, « pour pouvoir l'ajouter partout » —
   l'ajoutait du même coup au parcours de chaque formation.

   DEUX NOTIONS QUI ÉTAIENT CONFONDUES, et que cette colonne sépare :
     · `program_id` dit QUI PEUT l'utiliser — l'éligibilité ;
     · `parcours_defaut` dit s'il EST DANS le parcours sans qu'on l'ait demandé — l'appartenance.
   L'éligibilité entraînait l'appartenance. Ce n'est plus le cas, exactement comme pour les
   modèles de documents.

   1 POUR TOUT CE QUI EXISTE : aucun parcours ne bouge, aucune formation ne perd son test de
   positionnement ni ses évaluations formatives. Seuls les QCM créés à partir de maintenant
   naissent à 0, et s'activent d'un clic dans la formation voulue.

   UN QCM DÉSACTIVÉ N'EST PAS UN QCM HORS PARCOURS : `quiz.active` dit s'il existe encore,
   `parcours_defaut` s'il entre tout seul. Les deux colonnes ne se remplacent pas. */

ALTER TABLE quiz
    ADD COLUMN IF NOT EXISTS parcours_defaut TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Ce QCM entre-t-il dans le parcours des formations sans exception ? 1 = oui (existant), 0 = opt-in';
