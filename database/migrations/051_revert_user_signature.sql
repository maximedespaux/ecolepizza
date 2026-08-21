-- 051_revert_user_signature.sql — ROLLBACK MANUEL de 051_user_signature.sql.
ALTER TABLE user DROP COLUMN IF EXISTS signature_image;
