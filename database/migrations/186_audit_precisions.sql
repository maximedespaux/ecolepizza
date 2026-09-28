/*
  186_audit_precisions.sql

  CE QUE DÉSIGNE UNE LIGNE DU JOURNAL, quand ce qu'elle désigne n'existe plus (demandé le 2026-09-28).

  POURQUOI. La cloche disait « Document signé ×2 », « Document supprimé » : QUOI, jamais LEQUEL. Le
  journal ne porte qu'un code et un identifiant (`action`, `entity`, `entity_id`). Désormais la cloche
  et le journal NOMMENT ce que désigne chaque ligne — « Document signé (Devis particulier) » — et le
  stagiaire concerné, en relisant l'identifiant là où l'objet vit (src/api/lib/precisionsActivite.js).
  Cela marche sans cette migration, et pour les lignes d'avant, TANT QUE L'OBJET EXISTE.

  Ce qui vient d'être SUPPRIMÉ n'a plus de nom à relire : un document effacé n'a plus de titre, et plus
  de stagiaire. Ces deux colonnes les gardent, écrites au moment du geste par l'appelant, qui a la ligne
  sous la main (logAudit, 5e argument) :
    · libelle    : le nom de l'objet À CET INSTANT — le titre du document, le questionnaire, la session
                   d'un retrait. Jamais le nom d'une personne : un stagiaire effacé ne doit pas survivre
                   dans le journal (droit à l'effacement) ;
    · learner_id : le stagiaire concerné. Son NOM n'est pas copié : il se relit dans sa fiche à
                   l'affichage, et disparaît avec elle. Pas de clé étrangère, exprès : le journal garde
                   sa ligne quand la fiche part, et une clé en cascade l'effacerait.

  NULLES PAR DÉFAUT : les lignes existantes n'ont rien de figé, et n'en ont pas besoin tant que leur
  objet existe. Un seul ALTER : les deux colonnes arrivent ensemble ou pas du tout — le code ne sonde
  que la première.

  LE CODE MARCHE AVANT ET APRÈS. Sans elles, une trace avec précisions est gardée SANS ses précisions
  (la console le dit une fois), et la cloche nomme tout ce qui existe encore ; seul un document supprimé
  reste « Document supprimé », sans nom — comme aujourd'hui.

  Vérification par l'API, sans SQL : supprimer un document d'un stagiaire, puis GET /api/audit — la
  ligne `document.delete` porte `objet` (le titre) et `stagiaire`. Ou une requête, qui doit rendre 2 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='audit_log' AND column_name IN ('libelle','learner_id');
*/

ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS libelle varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS learner_id uuid DEFAULT NULL;
