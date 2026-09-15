/*
 * NETTOYER LES RÉPONSES LAISSÉES À MI-CHEMIN PAR LE DÉFAUT DE LA 151.
 *
 * ⚠️ CETTE MIGRATION SUPPRIME DES LIGNES. Elle est à jouer APRÈS la 151, et son revert ne peut
 * rien restaurer — c est écrit en toutes lettres dans le fichier inverse.
 *
 * CE QU ELLE VISE, ET RIEN D AUTRE. Une soumission réussie écrit UNE ligne de réponse PAR
 * QUESTION du questionnaire, puis passe le document à SIGNÉ. Une soumission cassée en cours de
 * route laisse donc une signature reconnaissable, et elle ne ressemble à aucune soumission
 * valide :
 *     · moins de réponses que le questionnaire ne compte de questions, ET
 *     · un document qui n est pas passé à SIGNÉ.
 * Les deux conditions ensemble, jamais l une seule : un questionnaire sans question ne doit rien
 * effacer, et un document resté à ENVOYÉ pour une autre raison non plus.
 *
 * POURQUOI SUPPRIMER PLUTÔT QUE RÉPARER. Les réponses manquantes ne sont NULLE PART : elles
 * n ont jamais été écrites. On ne peut pas reconstituer ce que le stagiaire avait coché après la
 * question qui a fait casser l envoi. Garder une copie partielle donnerait un résultat faux avec
 * l apparence d un vrai — et l écran, voyant une réponse, continuerait de refuser au stagiaire
 * de repasser son test.
 *
 * APRÈS CETTE MIGRATION, les stagiaires concernés retrouvent leur test « à faire » et peuvent le
 * repasser. Leur document redevient cohérent avec ce qu il annonce.
 */

/* Les réponses partielles, dans une table de travail : on ne supprime pas en lisant la table
   qu on supprime, et l on peut compter ce qui va partir avant de le faire. */
DROP TABLE IF EXISTS _quiz_reponses_cassees;

CREATE TABLE _quiz_reponses_cassees AS
SELECT r.id
  FROM quiz_response r
  JOIN generated_document d ON d.id = r.document_id
 WHERE d.status <> 'SIGNE'
   AND (SELECT COUNT(*) FROM quiz_question q WHERE q.quiz_id = r.quiz_id) > 0
   AND (SELECT COUNT(*) FROM quiz_answer a WHERE a.response_id = r.id)
     < (SELECT COUNT(*) FROM quiz_question q WHERE q.quiz_id = r.quiz_id);

/* Les réponses d abord : `quiz_answer` n a pas de clé étrangère vers `quiz_response` (cf. la
   migration 020), donc rien ne les emporterait toutes seules. */
DELETE FROM quiz_answer WHERE response_id IN (SELECT id FROM _quiz_reponses_cassees);
DELETE FROM quiz_response WHERE id IN (SELECT id FROM _quiz_reponses_cassees);

DROP TABLE IF EXISTS _quiz_reponses_cassees;
