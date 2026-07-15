-- Revert 092_program_company_steps.sql
ALTER TABLE training_program
    DROP COLUMN IF EXISTS company_steps;
