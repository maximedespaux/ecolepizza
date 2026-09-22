/* 176_memos.sql
   LES MÉMOS DU PERSONNEL — un pense-bête et une liste de choses à faire (demandé le 2026-09-22).

   CE QUI EXISTAIT NE CONVENAIT PAS. Les notes de `enrollment_note` sont attachées à un DOSSIER
   (enrollment_id obligatoire) : « rappeler le fournisseur de farine » ou « préparer la session du
   5 octobre » n'appartiennent à aucun stagiaire. D'où une table à part.

   CE QUE L'ÉCOLE A CHOISI, et ce que chaque colonne porte :
   · un mémo appartient à son AUTEUR, qui seul le voit — sauf s'il le PARTAGE avec l'équipe
     (`partage`), et alors tout le personnel de l'organisme le voit et peut le cocher. Seul
     l'auteur peut le supprimer ou cesser de le partager.
   · une ÉCHÉANCE facultative, une date sans heure. Échu ou dû aujourd'hui, le mémo se compte sur
     le bouton de la barre du haut, comme la cloche des notifications. Rien n'est envoyé : le
     rappel est un compteur et une couleur, pas un message.
   · cocher, c'est FAIRE, pas supprimer. `fait_le` et `fait_par` gardent quand et par qui — sur un
     mémo partagé, ce n'est pas forcément l'auteur. Supprimer efface pour de bon.

   ON DELETE CASCADE SUR L'AUTEUR : un mémo est une note personnelle, il part avec le compte qui
   l'a écrit. Les comptes du personnel se désactivent plus qu'ils ne se suppriment, si bien que la
   cascade ne joue qu'au vrai départ de quelqu'un — et un pense-bête privé n'a pas à lui survivre.

   AUCUNE LIGNE N'EST CRÉÉE : la table naît vide. Le code marche AVANT la migration — la liste et
   le compteur répondent « pas encore disponible », l'écriture est refusée avec la même phrase — et
   APRÈS. Rejouable sans risque (IF NOT EXISTS). */
CREATE TABLE IF NOT EXISTS memo (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    auteur_id       uuid          NOT NULL,
    /* Un pense-bête, pas un document : 1000 caractères, bornés aussi par le serveur. */
    texte           varchar(1000) NOT NULL,
    echeance        date          DEFAULT NULL,
    partage         TINYINT(1)    NOT NULL DEFAULT 0,
    fait_le         datetime      DEFAULT NULL,
    fait_par        uuid          DEFAULT NULL,
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    /* Les deux questions posées à chaque affichage : « mes mémos », puis « ceux de l'équipe ». */
    KEY idx_memo_auteur (organization_id, auteur_id),
    KEY idx_memo_partage (organization_id, partage),
    CONSTRAINT fk_memo_org FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_memo_auteur FOREIGN KEY (auteur_id) REFERENCES user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
