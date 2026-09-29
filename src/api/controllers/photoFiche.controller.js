/**
 * LA PHOTO D'UNE FICHE TECHNIQUE (migration 191) : la poser, la servir, la retirer.
 *
 * Un contrôleur À PART, et pas trois routes de plus dans recipe.controller.js, pour une raison qui
 * ne se devine pas : l'API ne met RIEN en cache par défaut (`no-store`, server.js), et seuls les
 * fichiers qui servent des IMAGES D'ÉCRAN ont le droit de rouvrir le cache — la liste est gelée
 * par cache-documents.test.js. Une photo de fiche revient à chaque passage dans la liste et dans
 * la Communauté : la retélécharger à chaque fois serait précisément le « gras » que l'école ne
 * voulait pas. Mais ouvrir le cache à tout recipe.controller.js, c'était l'ouvrir aussi à la
 * prochaine route qui y servirait un document.
 */
const crypto = require('crypto');
const db = require('../config/database.js');
const { encryptBytes, decryptBytes } = require('../lib/crypto.js'); // photos chiffrées au repos
const { formatImage } = require('../lib/formatImage.js');
const { accessibleRecipe } = require('../lib/ficheAccessible.js');
const { MAX_PHOTO_FICHE, PHOTOS_INDISPONIBLES, noTable } = require('../lib/photoFiche.js');

/**
 * PUT /api/recipes/:id/photo — pose ou remplace la photo de la fiche (auteur uniquement).
 *
 * Le FORMAT se lit dans les octets (`formatImage`), jamais dans le type que l'envoi déclare :
 * l'image est resservie telle quelle, avec le type enregistré ici.
 */
const savePhoto = async (req, res) => {
    try {
        const f = req.file;
        if (!f || !f.buffer || !f.buffer.length) return res.status(422).json({ message: 'Photo requise.' });
        if (f.buffer.length > MAX_PHOTO_FICHE) {
            return res.status(413).json({ message: `Photo trop lourde (${MAX_PHOTO_FICHE / 1024} Ko au plus).` });
        }
        const mime = formatImage(f.buffer);
        if (!mime) return res.status(415).json({ message: 'Format accepté : WebP, JPEG ou PNG.' });
        const conn = db.promise();
        const [[cur]] = await conn.query('SELECT author_user_id FROM recipe WHERE id = ?', [req.params.id]);
        if (!cur) return res.status(404).json({ message: 'Recette introuvable.' });
        if (cur.author_user_id !== req.user.id) return res.status(403).json({ message: 'Seul l\'auteur peut changer la photo.' });
        const empreinte = crypto.createHash('sha256').update(f.buffer).digest('hex').slice(0, 12);
        // Une seule photo par fiche : la nouvelle REMPLACE l'ancienne.
        await conn.query(
            `INSERT INTO recipe_photo (recipe_id, mime, bytes, octets, empreinte) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mime = VALUES(mime), bytes = VALUES(bytes), octets = VALUES(octets), empreinte = VALUES(empreinte)`,
            [req.params.id, mime, encryptBytes(f.buffer), f.buffer.length, empreinte]);
        res.json({ data: { photo_v: empreinte } });
    } catch (err) {
        if (noTable(err)) return res.status(503).json({ message: PHOTOS_INDISPONIBLES });
        console.error('Erreur photo de fiche :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/recipes/:id/photo — sert la photo, à qui peut ouvrir la fiche : son auteur, ou tout
 * compte de l'organisme si elle est partagée. 404 pour le reste, sans dire si elle existe.
 */
const getPhoto = async (req, res) => {
    try {
        const conn = db.promise();
        if (!await accessibleRecipe(conn, req.params.id, req.user)) return res.status(404).end();
        const [[p]] = await conn.query('SELECT mime, bytes FROM recipe_photo WHERE recipe_id = ?', [req.params.id]);
        if (!p) return res.status(404).end();
        const clair = decryptBytes(p.bytes);
        if (clair === null) return res.status(404).end();
        res.set('Content-Type', p.mime);
        // L'adresse porte l'empreinte (`?v=`) : une photo remplacée change d'adresse, le cache
        // long ne ressert donc jamais une ancienne photo.
        res.set('Cache-Control', 'private, max-age=86400');
        res.send(clair);
    } catch (err) {
        if (noTable(err)) return res.status(404).end();
        console.error('Erreur lecture photo de fiche :', err);
        res.status(500).end();
    }
};

/** DELETE /api/recipes/:id/photo — retire la photo (auteur uniquement). */
const deletePhoto = async (req, res) => {
    try {
        const conn = db.promise();
        const [[cur]] = await conn.query('SELECT author_user_id FROM recipe WHERE id = ?', [req.params.id]);
        if (!cur) return res.status(404).json({ message: 'Recette introuvable.' });
        if (cur.author_user_id !== req.user.id) return res.status(403).json({ message: 'Seul l\'auteur peut retirer la photo.' });
        await conn.query('DELETE FROM recipe_photo WHERE recipe_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.json({ success: true }); // sans la 191, il n'y a rien à retirer
        console.error('Erreur retrait photo de fiche :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { savePhoto, getPhoto, deletePhoto };
