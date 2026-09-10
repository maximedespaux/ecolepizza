/*
 * Revert de la 144. ATTENTION : cette colonne contient des PREUVES — ce qui a été posé au
 * stagiaire et ce qu'il a répondu, mot pour mot. Rien ailleurs ne les double : les supprimer les
 * perd définitivement, y compris pour les réponses déjà enregistrées depuis la 144.
 * À ne jouer que si la migration vient d'être passée par erreur, avant toute réponse.
 */
ALTER TABLE quiz_response
    DROP COLUMN IF EXISTS snapshot;
