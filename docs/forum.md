# Forum communauté — contrat back ↔ front

But : faire évoluer la page **Communauté** (aujourd'hui une galerie de fiches partagées) vers un
**forum de posts**. Un **post** = texte libre + images (optionnelles) + un **build attaché**
(optionnel : un empâtement / une garniture / une réalisation = une ligne `recipe`).

Ce document est le **contrat** entre le back (ton frère) et le front (Maxime + Claude). Chacun peut
avancer en parallèle : le front code contre ces formes JSON, le back les implémente à l'identique.

Conventions du projet à respecter : UUID `CHAR(36)`, colonnes `organization_id` + `author_user_id`
+ `author_name`, `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, FK `ON DELETE CASCADE`, middleware
`authenticateToken`, réponses `{ data: … }` (comme `recipe.controller.js`). Prochaine migration : **076**.

---

## 1. Modèle de données — `database/migrations/076_forum.sql`

```sql
-- 076_forum.sql — Forum communauté : posts, images, likes, commentaires, wishlist.
CREATE TABLE IF NOT EXISTS post (
    id              CHAR(36) NOT NULL PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    author_user_id  CHAR(36) NOT NULL,
    author_name     VARCHAR(160) NULL,
    body            VARCHAR(4000) NOT NULL DEFAULT '',
    recipe_id       CHAR(36) NULL,               -- build attaché (facultatif)
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_post_recipe FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE SET NULL,
    INDEX idx_post_org (organization_id, created_at)
);

CREATE TABLE IF NOT EXISTS post_image (
    id         CHAR(36) NOT NULL PRIMARY KEY,
    post_id    CHAR(36) NOT NULL,
    url        VARCHAR(500) NOT NULL,            -- chemin servi, ex. /uploads/posts/<file>.webp
    position   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_img_post FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE,
    INDEX idx_img_post (post_id, position)
);

CREATE TABLE IF NOT EXISTS post_like (
    post_id    CHAR(36) NOT NULL,
    user_id    CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    CONSTRAINT fk_plike_post FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_comment (
    id          CHAR(36) NOT NULL PRIMARY KEY,
    post_id     CHAR(36) NOT NULL,
    user_id     CHAR(36) NOT NULL,
    author_name VARCHAR(160) NULL,
    body        VARCHAR(2000) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pcomment_post FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE,
    INDEX idx_pcomment_post (post_id, created_at)
);

-- Wishlist : « mettre de côté » un build (recipe). Remplace le localStorage actuel du front.
CREATE TABLE IF NOT EXISTS recipe_wishlist (
    recipe_id  CHAR(36) NOT NULL,
    user_id    CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recipe_id, user_id),
    CONSTRAINT fk_wish_recipe FOREIGN KEY (recipe_id) REFERENCES recipe(id) ON DELETE CASCADE
);
```

Fournir aussi le `076_revert_forum.sql` (DROP des 5 tables, dans l'ordre inverse). **Ne pas appliquer
en prod automatiquement** : Maxime applique la migration lui-même (comme d'habitude).

---

## 2. Endpoints API (`src/api/routes/post.routes.js` + `post.controller.js`)

Tous derrière `authenticateToken`, montés sur `/api/posts`. Réponses : `{ data }`. Portée = l'org du
token (`req.user.organization_id`). Seul l'auteur peut modifier/supprimer son post/commentaire.

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/posts` | Fil de l'org, plus récents d'abord. Query : `?q=` (recherche), `?kind=PATE\|PREPARATION\|RECETTE` (type du build attaché), `?wishlist=1` (posts dont le build est en wishlist), `?page=&limit=`. |
| `GET` | `/api/posts/:id` | Détail d'un post (images + build + likes + commentaires). |
| `POST` | `/api/posts` | Créer. Body : `{ body, recipe_id?, image_urls?: string[] }` (`image_urls` = URLs déjà uploadées, voir §4). |
| `PUT` | `/api/posts/:id` | Éditer son post (`{ body, recipe_id?, image_urls? }`). |
| `DELETE` | `/api/posts/:id` | Supprimer son post (cascade images/likes/commentaires). |
| `POST` | `/api/posts/:id/like` | Toggle j'aime → `{ liked, like_count }`. |
| `POST` | `/api/posts/:id/comments` | Ajouter `{ body }` → le commentaire créé. |
| `PUT` | `/api/posts/:id/comments/:cid` | Éditer le sien. |
| `DELETE` | `/api/posts/:id/comments/:cid` | Supprimer le sien. |
| `POST` | `/api/uploads/image` | **Upload d'une image** (multipart). Voir §4 → `{ url }`. |
| `POST` | `/api/recipes/:id/wishlist` | Toggle wishlist d'un build → `{ wished }`. |
| `GET` | `/api/recipes/wishlist` | Les `recipe_id` en wishlist de l'utilisateur → `{ data: string[] }`. |

---

## 3. Formes JSON

**Post (liste)** — chaque élément de `GET /api/posts` :
```json
{
  "id": "uuid", "author_user_id": "uuid", "author_name": "Nom Prénom",
  "author_avatar": "emoji|#hex ou null",
  "body": "Ma pâte 72 h #napolitaine",
  "images": ["/uploads/posts/ab12.webp"],
  "recipe": { "id": "uuid", "kind": "PATE", "name": "Pâte 72h", "type": "Napolitaine" },
  "like_count": 3, "liked": false, "comment_count": 2,
  "recipe_wished": true,
  "created_at": "2026-07-13"
}
```
`recipe` = `null` si aucun build attaché. Réutiliser l'avatar auteur comme pour `getAuthorProfile`.

**Détail** — `GET /api/posts/:id` ajoute `comments: [{ id, author_name, body, created_at, mine }]`
(même forme que `recipe_comment`), et éventuellement les ingrédients/coût du build attaché (ou le
front rappelle `GET /api/recipes/:id`, déjà existant).

---

## 4. Upload d'images (le morceau back côté frère)

Le seul point que le front **ne peut pas** faire seul. Recommandation simple et auto-hébergée :

- **multer** (déjà l'écosystème Node) → stockage disque dans `uploads/posts/`, servi en statique
  (`app.use('/uploads', express.static(...))`).
- Contraintes : types `image/jpeg|png|webp`, **max ~5 Mo**, 1 image par requête (le front en envoie
  plusieurs en parallèle). Idéalement re-encoder en **webp** + redimensionner (max 1600 px) avec
  `sharp` pour alléger.
- Réponse : `{ "data": { "url": "/uploads/posts/<uuid>.webp" } }`.
- Le front upload d'abord chaque image → récupère les `url` → les passe dans `image_urls` à la
  création du post. (On ne stocke jamais l'image en base ; seulement son URL.)
- `.gitignore` : ajouter `uploads/`. Prévoir la même logique de suppression fichier à la suppression
  du post si tu veux éviter les orphelins (optionnel V1).

---

## 5. Wishlist — remplacer le localStorage

Le front a déjà une wishlist en **localStorage** (`impasto.wishlist`, sur les `recipe_id`). Quand les
2 endpoints wishlist existent, je bascule dessus (chargement au montage via `GET /api/recipes/wishlist`,
toggle via `POST /api/recipes/:id/wishlist`), avec repli localStorage si l'API échoue. Aucune donnée à
migrer (le localStorage est par navigateur).

---

## 6. Côté front (Claude/Maxime)

- `apiClient.js` : `getPosts(params)`, `getPost(id)`, `createPost(body)`, `updatePost`, `deletePost`,
  `likePost`, `addPostComment`/`update`/`delete`, `uploadImage(file)`, `toggleWishlist(recipeId)`,
  `getWishlist()`.
- `Communaute.jsx` : le fil devient une liste de **posts** (carte : auteur, texte, images en vignettes,
  build attaché cliquable, barre like/commentaire/wishlist). Réutilise `CommentThread`, `AuthorChip`,
  `kindMeta`, la modale détail.
- **Composer de post** (`PostComposer`) : textarea + upload d'images (aperçu) + « Attacher un build »
  (picker parmi mes fiches) → `createPost`.
- **« Publier » depuis un builder** (`FicheRecette`) : crée un post avec `recipe_id` = la fiche + une
  légende. (Le toggle `visibility: "SHARED"` actuel peut coexister ou être remplacé par ce flux.)

---

## 7. Répartition proposée

- **Ton frère (back)** : migration 076 + `post.controller/routes` + `/api/uploads/image` (multer/sharp)
  + les 2 endpoints wishlist. C'est le chemin critique (les images en dépendent).
- **Claude/Maxime (front)** : `apiClient`, refonte de `Communaute` en fil de posts, `PostComposer`,
  bouton « Publier » dans les builders, bascule de la wishlist sur l'API.
- **Parallélisable** : je peux coder tout le front contre ces formes en **simulant l'upload** (URL
  factice) tant que `/api/uploads/image` n'est pas prêt, puis brancher le vrai endpoint en 1 ligne.

---

## 8. Migration douce des fiches partagées existantes (optionnel)

Aujourd'hui les fiches ont `visibility = 'SHARED'` + likes/commentaires sur `recipe`. Deux options :
1. **Cohabitation** : garder le partage de fiches tel quel ; les posts sont un flux en plus. Le plus
   rapide, zéro rupture.
2. **Tout en posts** : à l'application de 076, générer un `post` par fiche partagée (`body` = sa
   description, `recipe_id` = la fiche) et reporter likes/commentaires. Plus propre à terme.

Recommandation : démarrer en **cohabitation** (option 1), basculer plus tard si besoin.
