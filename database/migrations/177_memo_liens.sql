/* 177_memo_liens.sql
   CE QU'UN MÉMO DÉSIGNE — les liens écrits avec @ et # (demandé le 2026-09-22, après la 176).

   DANS LE TEXTE, ON TAPE @ OU # ET ON CHOISIT. @ trouve une personne ou une organisation — un
   stagiaire, une entreprise, un membre de l'équipe. # trouve ce qui n'en est pas une : une session,
   un partenaire, une facture. Le mémo garde alors un LIEN vers la fiche, cliquable depuis la liste.

   POURQUOI UNE TABLE, ET PAS DES MARQUEURS DANS LE TEXTE. Écrire « @[Camille BERGER](stagiaire:…) »
   dans `memo.texte` obligerait à analyser de la prose à chaque affichage, et le lien se perdrait à
   la première correction de la phrase. Ici le texte reste ce que la personne a tapé, et les liens
   vivent à côté.

   PAS DE CLÉ ÉTRANGÈRE SUR `cible_id`, et c'est la seule entorse : elle désigne selon `type` un
   stagiaire, une entreprise, un membre, une session, un partenaire ou une facture. Aucune
   contrainte ne peut viser six tables. Conséquence assumée : si la fiche disparaît, la ligne reste
   et le lien ne mène plus à rien — d'où `libelle`, le nom AU MOMENT OÙ ON L'A NOTÉ, qui reste
   lisible même alors. C'est aussi ce qui évite six jointures pour afficher trois mots.

   `vu_le` NE CONCERNE QUE LE TYPE « membre » : c'est le PING. Mentionner un collègue lui montre le
   mémo (même non partagé avec toute l'équipe) et fait apparaître une pastille sur son bouton, tant
   qu'il ne l'a pas ouvert. La pastille, c'est exactement « les lignes de type membre qui me visent
   et dont `vu_le` est NULL ».

   Le code marche AVANT la migration : les liens ne s'affichent pas, @ et # ne proposent rien, et le
   reste des mémos fonctionne. APRÈS, tout apparaît. Rejouable sans risque. */
CREATE TABLE IF NOT EXISTS memo_lien (
    memo_id  uuid         NOT NULL,
    /* stagiaire, entreprise, membre, session, partenaire, facture — la liste vit dans
       lib/memos.js, côté serveur ET côté écran, tenue par un test. */
    type     varchar(20)  NOT NULL,
    cible_id uuid         NOT NULL,
    libelle  varchar(160) NOT NULL,
    vu_le    datetime     DEFAULT NULL,
    PRIMARY KEY (memo_id, type, cible_id),
    /* La question de la pastille : « quels mémos me visent et n'ont pas encore été ouverts ? » */
    KEY idx_memo_lien_membre (type, cible_id, vu_le),
    CONSTRAINT fk_memo_lien_memo FOREIGN KEY (memo_id) REFERENCES memo (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
