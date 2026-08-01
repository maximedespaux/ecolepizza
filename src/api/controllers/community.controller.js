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

// Migration 114 non jouée : les tables n'existent pas encore. Même garde que partout ailleurs.
const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const listeCadres = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const nomDe = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email || 'Stagiaire';

// L'école parle au nom de l'école : seul le bureau peut publier une ANNONCE, et elle seule
// peut être épinglée. Un stagiaire qui pourrait épingler passerait devant tout le monde.
/* DEUX CORRECTIONS SUR CETTE LISTE.
 *
 * 'ADMIN_ORGANISME' et non 'ADMIN' : ce role n'existe pas. La valeur reelle est ADMIN_ORGANISME
 * (cf. auth.middleware, ROLE_LABELS) — un administrateur d'organisme etait donc traite comme un
 * simple stagiaire par les QUATRE controles que `estStaff` commande : publier une annonce,
 * epingler, modifier ou supprimer la publication d'un autre. Le defaut passait inapercu tant que
 * seul l'espace stagiaire ouvrait cette page ; il devient bloquant des que l'ecole y accede.
 *
 * INTERVENANT RETIRE. Il est du cote des STAGIAIRES, pas du bureau — il entre d'ailleurs par le
 * meme layout (cf. main.jsx : `isStudent || isIntervenant`). Le laisser ici lui donnait le droit
 * de parler AU NOM DE L'ECOLE, d'epingler devant tout le monde, et de modifier ou supprimer la
 * publication de n'importe qui. Il participe au fil comme les autres.
 *
 * DEPUIS, `estStaff` ne commande plus que les DEUX gestes qui engagent l'ecole : publier une
 * ANNONCE et epingler. Modifier ou supprimer la publication d'un autre releve de `peutModerer`,
 * qui s'accorde nominativement (voir plus bas). */
const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'];
const estStaff = (u) => STAFF.includes(u.role);

/**
 * MODÉRER n'est plus réservé au bureau.
 *
 * `estStaff` commandait quatre gestes très différents sous une seule condition : parler au nom
 * de l'école (ANNONCE), épingler, corriger le texte d'un autre, et supprimer. Les deux premiers
 * ENGAGENT l'école ; les deux derniers sont de l'entretien de fil, que quelqu'un doit pouvoir
 * faire au quotidien sans pour autant s'exprimer au nom de l'organisme.
 *
 * D'où la capacité `cap:moderate-community`, accordée nominativement dans Équipe & accès (le
 * bouton boussole) — même mécanique que `cap:reveal-money`, stockée dans `user.nav_access`.
 *
 * On la relit EN BASE à chaque appel, sans la mettre dans le jeton : c'est déjà le choix fait
 * par `sectionAccess.middleware`, et pour la même raison — retirer la capacité à quelqu'un doit
 * prendre effet tout de suite, pas à l'expiration de son jeton (jusqu'à 7 jours).
 */
const CAP_MODERER = 'cap:moderate-community';
const aLaCapacite = (navAccess, cap) => {
    if (!navAccess) return false;
    let map = navAccess;
    if (typeof map === 'string') { try { map = JSON.parse(map); } catch { return false; } }
    if (Array.isArray(map)) return map.includes(cap);              // ancien format = tout accordé
    return !!map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, cap);
};
const peutModerer = async (user) => {
    if (estStaff(user)) return true;
    try {
        const [[row]] = await db.promise().query('SELECT nav_access FROM user WHERE id = ?', [user.id]);
        return aLaCapacite(row && row.nav_access, CAP_MODERER);
    } catch { return false; } // en cas de doute, on ne modère pas : refuser est réversible
};

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
        const [rows] = await conn.query(
            `SELECT p.id, p.kind, p.title, p.body, p.pinned, p.author_user_id, p.resolved_answer_id,
                    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), p.author_name) AS author_name,
                    DATE_FORMAT(p.created_at, '%Y-%m-%d') AS created_at,
                    DATE_FORMAT(p.updated_at, '%Y-%m-%d') AS updated_at,
                    (SELECT COUNT(*) FROM community_answer a WHERE a.post_id = p.id) AS answers,
                    (SELECT COUNT(*) FROM community_image i WHERE i.post_id = p.id) AS has_image
               FROM community_post p
               LEFT JOIN user u ON u.id = p.author_user_id
              WHERE p.organization_id = ?
              ORDER BY p.pinned DESC, p.created_at DESC`,
            [req.user.organization_id]
        );
        // Avatar, cadre et parcours des auteurs — une seule requête pour tout le fil plutôt
        // qu'une jointure par ligne. Séparée du SELECT principal pour la même raison qu'ailleurs :
        // ces colonnes dépendent de migrations (070, 113) qui peuvent ne pas être jouées.
        const uids = [...new Set(rows.map((r) => r.author_user_id).filter(Boolean))];
        if (uids.length) {
            try {
                const [ls] = await conn.query(
                    'SELECT user_id, avatar, completed_levels, cadre, cadres_exclusifs FROM learner WHERE user_id IN (?)',
                    [uids]);
                const par = Object.fromEntries(ls.map((x) => [x.user_id, x]));
                rows.forEach((r) => {
                    const l = par[r.author_user_id];
                    r.author_avatar = (l && l.avatar) || null;
                    r.author_done = listeCadres(l && l.completed_levels).length;
                    r.author_cadre = (l && l.cadre) || null;
                    r.author_cadres_ex = listeCadres(l && l.cadres_exclusifs);
                });
            } catch (e) { if (!noTable(e)) throw e; }
            /* Le PERSONNEL n'a pas de fiche `learner` : ses annonces s'affichaient avec un rond
             * gris et des initiales, seule silhouette anonyme d'un fil où chacun a sa pizza.
             * Son avatar vit sur `user` (migration 126). Requête séparée et try/catch : le code
             * doit marcher avant comme après. */
            try {
                const [us] = await conn.query('SELECT id, avatar, cadre FROM user WHERE id IN (?)', [uids]);
                const parU = Object.fromEntries(us.map((x) => [x.id, x]));
                rows.forEach((r) => {
                    const u = parU[r.author_user_id];
                    if (!u) return;
                    if (!r.author_avatar) r.author_avatar = u.avatar || null;
                    if (!r.author_cadre) r.author_cadre = u.cadre || null;
                    // Le cadre « école » n'est adossé à aucune formation : il faut le déclarer
                    // « possédé », sinon `cadrePorteDe` le rejetterait et retomberait sur rien.
                    if (u.cadre === 'ecole') r.author_cadres_ex = [...(r.author_cadres_ex || []), 'ecole'];
                });
            } catch (e) { if (!noTable(e)) throw e; } // migration 126 non jouée
        }
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
        const [[p]] = await conn.query(
            `SELECT p.*, DATE_FORMAT(p.created_at, '%Y-%m-%d') AS created_at
               FROM community_post p WHERE p.id = ? AND p.organization_id = ?`,
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
