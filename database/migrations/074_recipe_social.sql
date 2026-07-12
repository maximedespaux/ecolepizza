-- 074_recipe_social.sql
-- Interactions communauté sur les fiches techniques partagées : « j'aime » (cœur) + commentaires.
-- Une ligne recipe_like = un utilisateur a aimé une fiche (unique par couple). Les commentaires
-- sont horodatés et rattachés à l'auteur. Suppression en cascade avec la fiche.
CREATE TABLE IF NOT EXISTS recipe_like (
    recipe_id  CHAR(36) NOT NULL,
    user_id    CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recipe_id, user_id),
    CONSTRAINT fk_like_recipe FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recipe_comment (
    id          CHAR(36) NOT NULL PRIMARY KEY,
    recipe_id   CHAR(36) NOT NULL,
    user_id     CHAR(36) NOT NULL,
    author_name VARCHAR(160) NULL,
    body        VARCHAR(2000) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_comment_recipe FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE,
    INDEX idx_comment_recipe (recipe_id, created_at)
);
