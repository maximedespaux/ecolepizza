/**
 * Espace d'échange de la Communauté — les QUESTIONS des stagiaires et les ANNONCES de l'école.
 *
 * Table à part de `recipe`, et c'est délibéré : une question n'a ni ingrédient, ni rendement,
 * ni coût. La raison complète est écrite dans la migration 114. Côté écran le fil reste
 * UNIQUE — les deux sources sont fusionnées et triées par date par le front.
 *
 * Ce qui distingue une réponse d'un commentaire de fiche : l'AUTEUR de la question peut en
 * marquer une « ça m'a aidé ». Une seule, et lui seul — un vote collectif classerait les
 * gens, pas les réponses.
 */
const crypto = require('crypto');
const db = require('../config/database.js');
const { enrichirAuteurs } = require('../lib/auteurs.js');

// Migration 114 non jouée : les tables n'existent pas encore. Même garde que partout ailleurs.
const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const listeCadres = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const nomDe = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || 'Stagiaire';

/* Les deux règles vivent dans `lib/moderation.js` : `estStaff` pour ce qui ENGAGE l'école —
   publier une ANNONCE, épingler — et `peutModerer` pour l'entretien du fil, qui s'accorde
   nominativement (`cap:moderate-community`, bouton boussole d'Équipe & accès).

   Elles ont quitté ce contrôleur le jour où `recipe.controller` en a eu besoin pour les
   COMMENTAIRES de fiche : c'est le même fil public, et deux copies d'un droit de suppression
   divergent sans qu'on le voie.

   L'histoire de cette liste, à ne pas re-découvrir : elle a d'abord contenu 'ADMIN', un rôle
   QUI N'EXISTE PAS (le vrai est ADMIN_ORGANISME), ce qui traitait un administrateur d'organisme
   comme un simple stagiaire ; puis INTERVENANT, qui est du côté des STAGIAIRES — même layout —
   et à qui elle donnait le droit de parler au nom de l'école. */
const { estStaff, peutModerer } = require('../lib/moderation.js');

/**
 * GET /api/community/posts — le fil.
 *
 * Renvoie l'auteur AVEC son avatar, son cadre et son nombre de formations terminées, comme le
 * fait déjà la liste des fiches : sans quoi une question s'afficherait avec un rond gris au
 * milieu d'un fil où tout le monde a un visage.
 */
const listPosts = async (req, res) => {
    try {
        const conn = db.promise();
        /* L'HEURE, pas seulement le jour : sur un fil d'entraide, trois questions du même jour
         * s'affichaient toutes « 2026-08-01 » — on ne savait plus laquelle venait d'arriver.
         * Le format reste ISO : le fil TRIE sur cette valeur en comparant des chaînes, et en
         * jj-mm-aaaa le tri se ferait sur le JOUR d'abord. C'est l'écran qui met en français
         * (cf. `dateHeure` dans lib/format.js) — le format est affaire d'affichage, pas de
         * transport. Un commentaire de ce genre ne peut PAS vivre dans le littéral SQL juste
         * en dessous : ses backticks y fermeraient la chaîne. */
        const [rows] = await conn.query(
            `SELECT p.id, p.kind, p.title, p.body, p.pinned, p.author_user_id, p.resolved_answer_id,
                    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), p.author_name) AS author_name,
                    DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i') AS created_at,
                    DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i') AS updated_at,
                    (SELECT COUNT(*) FROM community_answer a WHERE a.post_id = p.id) AS answers,
                    (SELECT COUNT(*) FROM community_image i WHERE i.post_id = p.id) AS has_image
               FROM community_post p
               LEFT JOIN user u ON u.id = p.author_user_id
              WHERE p.organization_id = ?
              ORDER BY p.pinned DESC, p.created_at DESC`,
            [req.user.organization_id]
        );
        /* Avatar, cadre et parcours des auteurs. La résolution vit dans `lib/auteurs.js` : les
         * réponses d'une question et les commentaires d'une fiche en ont besoin à l'identique,
         * et trois copies auraient divergé au premier changement — il y en a déjà eu un, le
         * personnel de l'organisme, qui n'a pas de fiche `learner` (migration 126). */
        await enrichirAuteurs(conn, rows);
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] }); // migration 114 non jouée
        console.error('Erreur fil communauté :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/community/posts/:id — une publication et ses réponses. */
const getPost = async (req, res) => {
    try {
        const conn = db.promise();
        /* Le NOM de l'auteur se recalcule ici comme dans la liste. `p.*` rend la colonne
         * `author_name` FIGÉE à la publication — souvent l'e-mail, pour un compte créé sans
         * prénom ni nom. La carte du fil affichait donc « Admin École Pizza » et son détail
         * « admin@ecole-pizza.com » : deux identités pour une seule personne, à un clic d'écart.
         * Même famille que l'avatar manquant : le détail était plus pauvre que la liste. */
        const [[p]] = await conn.query(
            `SELECT p.*, DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i') AS created_at,
                    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), p.author_name) AS author_name
               FROM community_post p
               LEFT JOIN user u ON u.id = p.author_user_id
              WHERE p.id = ? AND p.organization_id = ?`,
            [req.params.id, req.user.organization_id]);
        if (!p) return res.status(404).json({ message: 'Publication introuvable.' });
        const [answers] = await conn.query(
            `SELECT a.id, a.user_id, a.body,
                    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), a.author_name) AS author_name,
                    DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS created_at
               FROM community_answer a LEFT JOIN user u ON u.id = a.user_id
              WHERE a.post_id = ? ORDER BY a.created_at`,
            [req.params.id]);
        // `mine` évite au front de comparer des identifiants : la même information, décidée
        // là où l'utilisateur courant est connu de source sûre.
        answers.forEach((a) => { a.mine = a.user_id === req.user.id; });
        /* Les réponses n'avaient QUE le nom de leur auteur. Dans un fil où chaque publication
         * porte un visage, la conversation qui suit repassait à des lignes anonymes — et on ne
         * voyait pas qui répond, alors que c'est là que se joue l'entraide. */
        await enrichirAuteurs(conn, answers, 'user_id');
        /* ET LA PUBLICATION ELLE-MÊME. Elle vient d'un `SELECT p.*` qui ne connaît ni avatar ni
         * cadre : l'en-tête du détail retombait donc sur les initiales, alors que la CARTE du
         * fil, juste avant le clic, montrait le visage. Le cadre, lui, s'affichait quand même —
         * il se résout côté écran pour l'utilisateur courant — d'où un défaut qui se lisait
         * « le cadre oui, la photo non ». */
        await enrichirAuteurs(conn, [p]);
        const [[img]] = await conn.query('SELECT id FROM community_image WHERE post_id = ? LIMIT 1', [req.params.id]);
        /* `can_moderate` manquait, et c'est ce qui rendait toute la modération INVISIBLE : le
         * serveur autorisait depuis toujours le bureau à supprimer la publication d'un autre,
         * mais le front n'affichait le bouton que sur `mine` — personne n'a donc jamais pu
         * modérer quoi que ce soit depuis un écran. */
        res.json({ data: { ...p, answers, has_image: img ? 1 : 0,
            mine: p.author_user_id === req.user.id, can_moderate: await peutModerer(req.user) } });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: 'Migration 114 non jouée.' });
        console.error('Erreur publication :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/community/posts — poser une question (ou publier une annonce, pour le bureau). */
const createPost = async (req, res) => {
    try {
        const conn = db.promise();
        const titre = String(req.body?.title || '').trim();
        if (!titre) return res.status(422).json({ message: 'Un titre est nécessaire.' });
        if (titre.length > 200) return res.status(422).json({ message: 'Titre trop long (200 caractères maximum).' });
        // Une ANNONCE engage l'école : elle est réservée au bureau, et elle seule s'épingle.
        const kind = req.body?.kind === 'ANNONCE' && estStaff(req.user) ? 'ANNONCE' : 'QUESTION';
        const pinned = kind === 'ANNONCE' && req.body?.pinned ? 1 : 0;
        const id = crypto.randomUUID();
        await conn.query(
            `INSERT INTO community_post (id, organization_id, author_user_id, author_name, kind, title, body, pinned)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, req.user.id, nomDe(req.user), kind, titre,
             String(req.body?.body || '').trim() || null, pinned]);
        res.status(201).json({ data: { id } });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: 'Migration 114 non jouée.' });
        console.error('Erreur création publication :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/community/posts/:id — modifier sa publication, ou désigner la réponse qui a aidé.
 *
 * Les deux gestes passent par la même route parce qu'ils obéissent à la même règle : SEUL
 * L'AUTEUR décide. Le bureau peut corriger le texte d'une publication (modération), mais pas
 * désigner la réponse à sa place — lui seul sait ce qui l'a débloqué.
 */
const updatePost = async (req, res) => {
    try {
        const conn = db.promise();
        /* Le NOM de l'auteur se recalcule ici comme dans la liste. `p.*` rend la colonne
         * `author_name` FIGÉE à la publication — souvent l'e-mail, pour un compte créé sans
         * prénom ni nom. La carte du fil affichait donc « Admin École Pizza » et son détail
         * « admin@ecole-pizza.com » : deux identités pour une seule personne, à un clic d'écart.
         * Même famille que l'avatar manquant : le détail était plus pauvre que la liste. */
        const [[p]] = await conn.query(
            'SELECT author_user_id FROM community_post WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!p) return res.status(404).json({ message: 'Publication introuvable.' });
        const auteur = p.author_user_id === req.user.id;
        if (!auteur && !await peutModerer(req.user)) return res.status(403).json({ message: 'Publication d\'un autre stagiaire.' });

        if (req.body?.resolved_answer_id !== undefined) {
            if (!auteur) return res.status(403).json({ message: 'Seul l\'auteur désigne la réponse qui l\'a aidé.' });
            const rid = req.body.resolved_answer_id || null;
            if (rid) {
                const [[a]] = await conn.query('SELECT id FROM community_answer WHERE id = ? AND post_id = ?', [rid, req.params.id]);
                if (!a) return res.status(422).json({ message: 'Cette réponse n\'appartient pas à la publication.' });
            }
            await conn.query('UPDATE community_post SET resolved_answer_id = ? WHERE id = ?', [rid, req.params.id]);
        }
        const champs = [], vals = [];
        if (req.body?.title !== undefined) { champs.push('title = ?'); vals.push(String(req.body.title).trim().slice(0, 200)); }
        if (req.body?.body !== undefined) { champs.push('body = ?'); vals.push(String(req.body.body).trim() || null); }
        if (req.body?.pinned !== undefined && estStaff(req.user)) { champs.push('pinned = ?'); vals.push(req.body.pinned ? 1 : 0); }
        if (champs.length) await conn.query(`UPDATE community_post SET ${champs.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: 'Migration 114 non jouée.' });
        console.error('Erreur modification publication :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/community/posts/:id — l'auteur, ou le bureau (modération). */
const deletePost = async (req, res) => {
    try {
        const conn = db.promise();
        /* Le NOM de l'auteur se recalcule ici comme dans la liste. `p.*` rend la colonne
         * `author_name` FIGÉE à la publication — souvent l'e-mail, pour un compte créé sans
         * prénom ni nom. La carte du fil affichait donc « Admin École Pizza » et son détail
         * « admin@ecole-pizza.com » : deux identités pour une seule personne, à un clic d'écart.
         * Même famille que l'avatar manquant : le détail était plus pauvre que la liste. */
        const [[p]] = await conn.query(
            'SELECT author_user_id FROM community_post WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!p) return res.status(404).json({ message: 'Publication introuvable.' });
        if (p.author_user_id !== req.user.id && !await peutModerer(req.user)) {
            return res.status(403).json({ message: 'Publication d\'un autre stagiaire.' });
        }
        // Réponses et image partent avec, par ON DELETE CASCADE (migration 114).
        await conn.query('DELETE FROM community_post WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: 'Migration 114 non jouée.' });
        console.error('Erreur suppression publication :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/community/posts/:id/answers — répondre. */
const addAnswer = async (req, res) => {
    try {
        const conn = db.promise();
        const body = String(req.body?.body || '').trim();
        if (!body) return res.status(422).json({ message: 'Réponse vide.' });
        const [[p]] = await conn.query(
            'SELECT id FROM community_post WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!p) return res.status(404).json({ message: 'Publication introuvable.' });
        const id = crypto.randomUUID();
        await conn.query(
            'INSERT INTO community_answer (id, post_id, user_id, author_name, body) VALUES (?, ?, ?, ?, ?)',
            [id, req.params.id, req.user.id, nomDe(req.user), body]);
        res.status(201).json({ data: { id } });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: 'Migration 114 non jouée.' });
        console.error('Erreur réponse :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/community/answers/:id — son propre message, ou modération. */
const deleteAnswer = async (req, res) => {
    try {
        const conn = db.promise();
        const [[a]] = await conn.query(
            `SELECT a.user_id, p.organization_id FROM community_answer a
               JOIN community_post p ON p.id = a.post_id WHERE a.id = ?`,
            [req.params.id]);
        if (!a || a.organization_id !== req.user.organization_id) return res.status(404).json({ message: 'Réponse introuvable.' });
        if (a.user_id !== req.user.id && !await peutModerer(req.user)) return res.status(403).json({ message: 'Réponse d\'un autre stagiaire.' });
        // `resolved_answer_id` passe à NULL tout seul (ON DELETE SET NULL) : supprimer la
        // réponse retenue ne doit pas emporter la question.
        await conn.query('DELETE FROM community_answer WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: 'Migration 114 non jouée.' });
        console.error('Erreur suppression réponse :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/community/posts/:id/image — la photo du résultat.
 *
 * Mêmes règles que la photo de profil (migration 094) : le NAVIGATEUR redimensionne et
 * compresse, le serveur ne fait que valider et stocker. Aucun traitement d'image côté serveur,
 * donc aucune dépendance native à installer.
 *
 * Limite à 600 Ko, contre 300 pour un avatar : une photo de pizza est en paysage et mérite
 * plus de définition qu'une vignette ronde de 500 px.
 */
const savePostImage = async (req, res) => {
    try {
        const f = req.file;
        if (!f || !f.buffer || !f.buffer.length) return res.status(422).json({ message: 'Image requise.' });
        if (f.buffer.length > 600 * 1024) return res.status(413).json({ message: 'Image trop lourde (600 Ko maximum).' });
        const mime = String(f.mimetype || '');
        if (!['image/webp', 'image/jpeg', 'image/png'].includes(mime)) {
            return res.status(415).json({ message: 'Format accepté : WebP, JPEG ou PNG.' });
        }
        const conn = db.promise();
        /* Le NOM de l'auteur se recalcule ici comme dans la liste. `p.*` rend la colonne
         * `author_name` FIGÉE à la publication — souvent l'e-mail, pour un compte créé sans
         * prénom ni nom. La carte du fil affichait donc « Admin École Pizza » et son détail
         * « admin@ecole-pizza.com » : deux identités pour une seule personne, à un clic d'écart.
         * Même famille que l'avatar manquant : le détail était plus pauvre que la liste. */
        const [[p]] = await conn.query(
            'SELECT author_user_id FROM community_post WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!p) return res.status(404).json({ message: 'Publication introuvable.' });
        if (p.author_user_id !== req.user.id) return res.status(403).json({ message: 'Publication d\'un autre stagiaire.' });
        // Une seule photo par publication : on remplace plutôt que d'accumuler.
        await conn.query('DELETE FROM community_image WHERE post_id = ?', [req.params.id]);
        await conn.query(
            'INSERT INTO community_image (id, post_id, organization_id, mime, bytes) VALUES (?, ?, ?, ?, ?)',
            [crypto.randomUUID(), req.params.id, req.user.organization_id, mime, f.buffer]);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: 'Migration 114 non jouée.' });
        console.error('Erreur photo de publication :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/community/posts/:id/image — sert la photo.
 *
 * Ouvert à tout compte authentifié de l'ORGANISATION, comme la photo de profil : les
 * publications sont visibles de toute la promotion, leur illustration aussi. Le contrôle porte
 * sur l'organisation et non sur l'auteur.
 */
const getPostImage = async (req, res) => {
    try {
        const conn = db.promise();
        const [[i]] = await conn.query(
            'SELECT mime, bytes FROM community_image WHERE post_id = ? AND organization_id = ? LIMIT 1',
            [req.params.id, req.user.organization_id]);
        if (!i) return res.status(404).end();
        res.set('Content-Type', i.mime);
        // Photo immuable : une publication n'a qu'une image et la remplacer crée une autre
        // ligne. Un cache long évite de la retélécharger à chaque passage dans le fil.
        res.set('Cache-Control', 'private, max-age=86400');
        res.send(i.bytes);
    } catch (err) {
        if (noTable(err)) return res.status(404).end();
        console.error('Erreur image publication :', err);
        res.status(500).end();
    }
};

module.exports = {
    listPosts, getPost, createPost, updatePost, deletePost,
    addAnswer, deleteAnswer, savePostImage, getPostImage,
};
