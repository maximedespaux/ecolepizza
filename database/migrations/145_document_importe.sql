/*
 * UN DOCUMENT REÇU PAR E-MAIL, RATTACHÉ À SON ÉTAPE DU DOSSIER.
 *
 * LE BESOIN. Le parcours documentaire génère les documents et les fait signer dans
 * l'application. Mais certains reviennent AUTREMENT : un stagiaire sans accès, une entreprise qui
 * renvoie la convention scannée, un OPCO qui transmet son accord par courriel. Jusqu'ici ces
 * pièces-là n'avaient nulle part où aller : l'étape restait « à faire » alors que le document
 * existait, et le dossier paraissait incomplet pendant que le classeur, lui, était complet.
 *
 * L'import d'archives Qualiopi (`archive_document`) ne pouvait pas servir : il range par année,
 * semaine et NOM EN TEXTE, sans lien vers l'étape ni vers le stagiaire. C'est un dépôt d'archives
 * anciennes, pas un rattachement au dossier vivant.
 *
 * UNE TABLE À PART, ET PAS UNE COLONNE SUR `generated_document`. La très grande majorité des
 * documents n'ont pas de fichier — ils se rendent à la volée depuis leur modèle. Mettre un
 * `longblob` sur la table des étapes ferait porter le poids à tout le monde pour quelques-uns, et
 * chaque `SELECT *` du dossier traînerait des mégaoctets. Même forme que `piece_fichier`, qui
 * résout le même problème pour les pièces.
 *
 * UN SEUL FICHIER PAR ÉTAPE (clé unique) : c'est LE document signé, pas une collection. Réimporter
 * remplace — on corrige un mauvais envoi sans accumuler des versions dont personne ne saurait
 * dire laquelle fait foi.
 *
 * CHIFFRÉ AU REPOS comme les pièces : une convention signée porte un nom, une adresse et une
 * image de signature. Le même `encryptBytes` que les scans d'identité ; `taille` garde la taille
 * CLAIRE, pour l'afficher sans déchiffrer.
 *
 * QUI A IMPORTÉ, ET QUAND. C'est la moitié qui compte : l'étape passera à SIGNÉ et comptera dans
 * le score de conformité, alors qu'AUCUNE signature électronique n'a eu lieu dans l'application.
 * Le dossier doit donc porter la différence — sans quoi on ne saurait plus, six mois plus tard,
 * distinguer un document signé ici d'un document reçu par courriel. On n'invente jamais un tracé
 * de signature qui n'existe pas.
 */
CREATE TABLE IF NOT EXISTS document_fichier (
    id            uuid         NOT NULL DEFAULT uuid(),
    document_id   uuid         NOT NULL,
    nom           varchar(200) DEFAULT NULL,
    mime          varchar(60)  NOT NULL,
    bytes         longblob     NOT NULL,
    taille        int          NOT NULL DEFAULT 0,
    importe_par   uuid         DEFAULT NULL,
    importe_le    timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_document_fichier (document_id),
    CONSTRAINT fk_document_fichier_doc FOREIGN KEY (document_id)
        REFERENCES generated_document (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
