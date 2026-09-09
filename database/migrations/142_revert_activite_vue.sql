/*
 * Revert de la 142. La colonne ne porte qu'un confort d'affichage (jusqu'où j'ai lu) :
 * la perdre ne perd aucune donnée métier — le journal d'audit, lui, reste intact.
 * Après ce revert, l'activité redevient « déjà lue » pour tout le monde.
 */
ALTER TABLE user DROP COLUMN IF EXISTS activity_seen_at;
