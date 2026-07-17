-- Revert 099_template_avail_phase.sql
ALTER TABLE document_template
    DROP COLUMN IF EXISTS avail_phase;
