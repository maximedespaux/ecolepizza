-- 084_revert_company_user.sql — ROLLBACK MANUEL.
ALTER TABLE company DROP COLUMN IF EXISTS user_id;
