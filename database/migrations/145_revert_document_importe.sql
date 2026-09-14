/*
 * Revert de la 145. ATTENTION : cette table contient les DOCUMENTS EUX-MÊMES — conventions
 * signées, accords de prise en charge, tout ce qui est revenu par courriel. Rien ailleurs ne les
 * double : les supprimer les perd définitivement, et les étapes correspondantes resteront au
 * statut SIGNÉ sans plus rien pour le prouver.
 * À ne jouer que si la migration vient d'être passée par erreur, avant tout import.
 */
DROP TABLE IF EXISTS document_fichier;
