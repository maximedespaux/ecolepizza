/*
 * LE TEST DE POSITIONNEMENT ÉCHOUAIT À L'ENVOI — « Data too long for column 'value' ».
 *
 * MESURÉ DANS LE JOURNAL DE PRODUCTION le 2026-09-15 : `ER_DATA_TOO_LONG`, errno 1406, sur
 * l INSERT des réponses. La colonne `quiz_answer.value` stocke les identifiants des options
 * cochées, séparés par des virgules. Un identifiant est un UUID : 36 caractères, plus la
 * virgule, soit 37 par option. À SEPT OPTIONS COCHÉES on dépasse les 255 caractères, et
 * l enregistrement casse. Les stagiaires observés en avaient coché neuf et quatorze.
 *
 * CE QUE ÇA A PRODUIT, ET POURQUOI PERSONNE NE L A VU VENIR. La réponse (`quiz_response`) était
 * déjà écrite quand la boucle des réponses cassait : il restait donc en base une réponse
 * INCOMPLÈTE, le document n était jamais passé à SIGNÉ — d où les stagiaires marqués « En
 * cours » alors qu ils avaient bel et bien répondu — et l écran, voyant une réponse existante,
 * leur annonçait « déjà répondu » et refusait de les laisser recommencer. Ils étaient bloqués.
 *
 * POURQUOI `TEXT` ET PAS UN VARCHAR PLUS LARGE. Le nombre d options d une question n a aucune
 * borne dans le schéma : choisir 1000, c est refaire le même pari, et le perdre le jour où
 * quelqu un pose une question à trente propositions. Le stockage ne change pas — MariaDB ne
 * réserve rien pour un TEXT court — et aucun index ne porte cette colonne.
 *
 * LE CODE MARCHE AVANT ET APRÈS : il écrivait déjà une chaîne, il écrit toujours une chaîne.
 * Seule disparaît, du côté applicatif, une troncature à 255 caractères qui coupait EN SILENCE
 * les réponses de grille — un défaut plus vicieux que celui-ci, puisqu il ne levait rien.
 */

ALTER TABLE quiz_answer MODIFY COLUMN value TEXT DEFAULT NULL;
