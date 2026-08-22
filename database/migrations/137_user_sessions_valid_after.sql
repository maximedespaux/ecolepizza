/* 137_user_sessions_valid_after.sql
   ─────────────────────────────────────────────────────────────────────────────────────────────
   COUPER TOUTES LES SESSIONS D'UN COMPTE À LA DEMANDE.

   Les jetons de session sont des JWT SANS ÉTAT : signés, valables jusqu'à expiration (7 jours),
   impossibles à révoquer un par un. Or la fonctionnalité « annuler un changement » (mot de passe
   ou e-mail modifié par un tiers) n'a de sens que si l'on peut, du même geste, DÉCONNECTER la
   session du pirate — sinon il garde l'accès via son cookie jusqu'à une semaine.

   Cette colonne est la borne : un JWT n'est accepté que si sa date d'émission (`iat`) est
   POSTÉRIEURE à `sessions_valid_after`. La passer à NOW() invalide donc, d'un coup, tous les
   jetons émis avant — toutes les sessions ouvertes. NULL (défaut) = aucune invalidation, tous les
   jetons valables : les comptes existants ne sont pas affectés.

   Le code fonctionne AVANT comme APRÈS : le middleware d'auth lit la colonne avec repli
   (try/catch sur ER_BAD_FIELD_ERROR), et le contrôleur ignore l'échec du UPDATE si la colonne
   n'existe pas encore. Sans la migration, la coupure de session est simplement un no-op. */
ALTER TABLE user ADD COLUMN IF NOT EXISTS sessions_valid_after TIMESTAMP NULL DEFAULT NULL;
