/*
 * Retour en arrière de la 151.
 *
 * ⚠️ CE REVERT TRONQUE. Toute réponse dépassant 255 caractères — sept options cochées suffisent —
 * serait coupée par MariaDB, ou refusée en mode strict. Les réponses déjà enregistrées depuis la
 * 151 peuvent donc être PERDUES, et l on retomberait sur l erreur d envoi d origine.
 */

ALTER TABLE quiz_answer MODIFY COLUMN value varchar(255) DEFAULT NULL;
