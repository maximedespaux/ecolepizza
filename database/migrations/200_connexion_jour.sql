/* STATISTIQUES DE CONNEXION — une ligne par (compte, jour) de connexion (demandé le 2026-10-02).

   `user.last_login_at` ne garde que la DERNIÈRE connexion : impossible d'en tirer une COURBE dans le
   temps. On enregistre donc, à chaque connexion réussie, le JOUR — une seule ligne par compte et par
   jour (INSERT IGNORE sur la clé primaire, les connexions suivantes du jour ne changent rien).
   `est_stagiaire` est figé à la connexion (le rôle du compte ce jour-là) pour séparer stagiaires et
   équipe SANS jointure. La page Statistiques (Qualité & conformité) en tire les connexions par jour
   sur deux semaines.

   Sans la table, rien ne casse : la connexion n'écrit pas (requête à part, tolérée), et la page
   n'affiche pas la courbe — le reste (la répartition par récence, lue sur `last_login_at`) marche. */
CREATE TABLE IF NOT EXISTS connexion_jour (
    user_id         uuid       NOT NULL,
    jour            date       NOT NULL,
    organization_id uuid       NOT NULL,
    est_stagiaire   tinyint(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, jour),
    KEY idx_cj_org_jour (organization_id, jour)
);
