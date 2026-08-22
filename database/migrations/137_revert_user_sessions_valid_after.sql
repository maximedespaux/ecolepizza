/* Revert de 137 : retire la borne d'invalidation des sessions. Sans risque — au pire, un jeton
   qui aurait dû être coupé redevient valable jusqu'à son expiration naturelle. */
ALTER TABLE user DROP COLUMN IF EXISTS sessions_valid_after;
