const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middlewares/auth.middleware.js');
const {
    listPosts, getPost, createPost, updatePost, deletePost,
    addAnswer, deleteAnswer, savePostImage, getPostImage,
} = require('../controllers/community.controller.js');

const router = express.Router();

/* Photo d'une publication. Le navigateur redimensionne et compresse avant l'envoi (mêmes
   règles que la photo de profil) ; `multer` garde l'image EN MÉMOIRE, elle part en base
   aussitôt — rien n'est jamais écrit sur le disque du serveur.
   La limite de multer est volontairement au-dessus de celle du contrôleur (600 Ko) : le
   contrôleur peut ainsi répondre un 413 lisible plutôt qu'une erreur brute de multer. */
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 800 * 1024, files: 1 } });

router.use(authenticateToken);

router.get('/posts', listPosts);
router.post('/posts', createPost);
router.get('/posts/:id', getPost);
router.patch('/posts/:id', updatePost);
router.delete('/posts/:id', deletePost);

router.post('/posts/:id/answers', addAnswer);
router.delete('/answers/:id', deleteAnswer);

router.post('/posts/:id/image', imageUpload.single('image'), savePostImage);
router.get('/posts/:id/image', getPostImage);

module.exports = router;
