/*
  SOUS-GROUPES D'UNE ENTREPRISE DANS UNE SESSION (demandé le 2026-10-23).

  LE BESOIN. Un même employeur (« MORGAN SOREL ») envoie parfois plusieurs stagiaires qui ne doivent
  PAS figurer sur les mêmes documents de groupe (devis, convention, accord de prise en charge) —
  deux dossiers de prise en charge distincts, par exemple. Jusqu'ici, le « groupe » d'une entreprise
  dans une session était IMPLICITE : toutes les inscriptions de la même entreprise + session, réunies
  sur UN seul jeu de documents (scindé au plus par OPCO, migration 089). Impossible de les séparer.

  CE QU'ON AJOUTE. Un numéro de GROUPE par inscription (`enrollment.company_group`) : deux inscriptions
  d'une même entreprise + session mais de groupe DIFFÉRENT forment deux groupes séparés, chacun avec
  ses propres documents. Le même numéro est porté par le document (`generated_document.company_group`),
  à l'image de la colonne `opco` : c'est lui qui permet de dédoublonner / régénérer les documents d'UN
  groupe sans toucher au groupe voisin.

  DÉFAUT = 1 : toutes les inscriptions et tous les documents existants prennent le groupe 1. Tant qu'un
  seul groupe existe (le cas de l'immense majorité), le comportement est STRICTEMENT celui d'avant —
  un groupe unique, un jeu de documents. La séparation ne s'active qu'à partir d'un 2ᵉ groupe, choisi
  à l'inscription « Via une entreprise ».

  TOLÉRANT : sans cette migration, le code retombe sur « tout en groupe 1 » (`colonneExiste`), et créer
  un 2ᵉ groupe répond « migration 215 non jouée ». Elle se vérifie par l'API, sans SQL : inscrire un
  stagiaire « Via une entreprise » en « nouveau groupe » répond 200 (et non 503), puis
  `GET /api/companies/:id/parcours?session_id=…` rend plusieurs `groups`. Ou une requête, qui doit
  rendre 2 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND ((table_name='enrollment' AND column_name='company_group')
       OR (table_name='generated_document' AND column_name='company_group'));
*/

ALTER TABLE enrollment
    ADD COLUMN IF NOT EXISTS company_group smallint NOT NULL DEFAULT 1;

ALTER TABLE generated_document
    ADD COLUMN IF NOT EXISTS company_group smallint NOT NULL DEFAULT 1;
