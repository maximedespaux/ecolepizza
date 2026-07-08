-- 029_session_trainers.sql
-- Formateurs affectés à une session (plusieurs possibles), choisis dans l'équipe.
-- Le champ texte training_session.trainer est conservé (compatibilité / affichage).
CREATE TABLE IF NOT EXISTS session_trainer (
    id         uuid      NOT NULL DEFAULT uuid(),
    session_id uuid      NOT NULL,
    user_id    uuid      NOT NULL,
    created_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_session_trainer (session_id, user_id),
    KEY idx_st_session (session_id),
    CONSTRAINT fk_st_session FOREIGN KEY (session_id) REFERENCES training_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_st_user    FOREIGN KEY (user_id)    REFERENCES user (id) ON DELETE CASCADE
);
