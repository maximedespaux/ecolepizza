-- 100_revert_exam_session.sql
-- Ordre inverse de la création : exam_result porte la clé étrangère vers exam_session.
DROP TABLE IF EXISTS exam_result;
DROP TABLE IF EXISTS exam_session;
