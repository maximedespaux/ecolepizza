-- Revert 093_custom_token_category.sql
ALTER TABLE custom_token
    DROP COLUMN IF EXISTS category;
