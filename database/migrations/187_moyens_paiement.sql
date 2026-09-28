/*
  187_moyens_paiement.sql

  LES MOYENS DE PAIEMENT DE L'ÉCOLE, en UNE liste, chacun avec SON modèle de facture (demandé le
  2026-09-28 : « dans Facturation, choisir quel modèle de FACTURE utiliser pour chaque moyen de
  paiement, avec la possibilité d'en ajouter »).

  POURQUOI. Les moyens vivaient en texte, séparés par des virgules, dans DEUX endroits qui ne se
  parlaient pas : chaque entité émettrice (`billing_profile.payment_methods`, que lit la caisse) et
  les anciens réglages boutique (`shop_settings.payment_methods`, que lisait encore la facturation
  d'une demande boutique — et que plus aucun écran ne permet de modifier). Un moyen ajouté sur une
  entité n'apparaissait donc pas en facturant une demande. Et le modèle de facture se choisissait à
  la main à CHAQUE vente, alors qu'il suit le plus souvent la façon dont on est payé (une facture
  acquittée pour des espèces, le RIB pour un virement).

  Décidé par l'école le 2026-09-28 : une SEULE liste, dans Paramètres → Facturation ; choisir un
  moyen à la caisse ou en facturant une demande PRÉ-SÉLECTIONNE son modèle, qui reste modifiable ;
  quand le règlement est ventilé, c'est la PREMIÈRE ligne qui décide.

  UNE LIGNE PAR MOYEN :
    · libelle       : ce qui s'imprime sur la facture ({Règlement}). 30 caractères au plus — la
                      taille de `invoice.payment_method`, pour qu'un moyen seul n'y soit jamais coupé.
                      Unique dans l'organisme, casse et accents confondus (« Cheque » = « Chèque ») ;
    · template_slug : le modèle FACTURE à pré-sélectionner. NULL = « Automatique » : la règle
                      d'avant (selon l'acheteur). Pas de clé étrangère : un modèle se désigne par
                      son slug, et s'il disparaît, le moyen retombe simplement en automatique ;
    · sort_order    : l'ordre d'affichage — le premier est proposé d'office à la caisse.

  AUCUNE DONNÉE ICI : la table naît VIDE, et le code la remplit à la PREMIÈRE LECTURE avec les moyens
  déjà en usage — ceux de l'entité par défaut d'abord, puis des autres entités, puis des réglages
  boutique, sans doublon — ou Espèces, CB, Virement, Chèque s'il n'y en avait aucun
  (src/api/lib/moyensPaiement.js). Découper une liste à virgules en SQL aurait demandé une requête
  récursive impossible à éprouver hors de la base de production ; en JavaScript, elle est testée.

  LE CODE MARCHE AVANT ET APRÈS. Sans la table, la caisse et les demandes proposent les moyens des
  listes d'avant (réunies), Facturation dit « migration 187 non jouée » et n'offre pas de modifier,
  et aucun modèle n'est pré-sélectionné.

  Vérification par l'API, sans SQL : ouvrir Paramètres → Facturation, puis GET /api/moyens-paiement —
  la réponse porte `disponible: true` et la liste. Ou une requête, qui doit rendre 1 :
  SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='moyen_paiement';
*/

CREATE TABLE IF NOT EXISTS moyen_paiement (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    libelle         varchar(30)  NOT NULL,
    template_slug   varchar(60)  DEFAULT NULL,
    sort_order      int          NOT NULL DEFAULT 0,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_moyen_paiement_libelle (organization_id, libelle),
    KEY idx_moyen_paiement_ordre (organization_id, sort_order),
    CONSTRAINT fk_moyen_paiement_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
