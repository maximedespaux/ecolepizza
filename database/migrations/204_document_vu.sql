/* ============================================================================================
   MIGRATION 204 — « reçus mais jamais vus » : l'OUVERTURE d'un document, par compte.

   POURQUOI. Un stagiaire inscrit PAR UNE ENTREPRISE reçoit des documents de GROUPE (devis,
   convention, CGV) : il peut les consulter, mais c'est l'entreprise qui les signe. La pastille
   « Mes documents » de son espace doit l'alerter de ceux qu'il n'a PAS ENCORE OUVERTS — « reçus
   mais jamais vus » — et RETOMBER dès qu'il les ouvre.

   Le statut d'un document de groupe est PARTAGÉ (une seule ligne pour toute l'entreprise) :
   impossible d'y lire « vu par CE stagiaire ». On trace donc l'OUVERTURE par compte, ici — qui a
   ouvert quel document, et quand. Rien d'autre : ni contenu, ni préférence.

   SANS CETTE MIGRATION, rien ne casse : la pastille ne compte simplement pas les documents de
   groupe (le comportement d'avant), et l'enregistrement d'une ouverture est avalé (table absente,
   try/catch côté serveur).
   ============================================================================================ */

/* document_id : le document ouvert · user_id : le compte qui l'a ouvert · vu_le : quand (trace). */
CREATE TABLE IF NOT EXISTS document_vu (
    document_id uuid     NOT NULL,
    user_id     uuid     NOT NULL,
    vu_le       datetime NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (document_id, user_id),
    CONSTRAINT fk_docvu_document FOREIGN KEY (document_id)
        REFERENCES generated_document (id) ON DELETE CASCADE,
    CONSTRAINT fk_docvu_user FOREIGN KEY (user_id)
        REFERENCES user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
