/**
 * LA PHOTO D'UNE FICHE TECHNIQUE (migration 191) — ce que les listes et la route partagent.
 *
 * Un fichier par fiche, en base, chiffré au repos : le modèle de `community_image` (114). PAS
 * « GRASSE », demandé par l'école : le navigateur la réduit (lib/image.js, profil `fiche`,
 * 1 000 px) et le serveur REFUSE au-delà de `MAX_PHOTO_FICHE`. Ce plafond reste sous la limite de
 * multer (recipe.routes.js), pour répondre un 413 lisible plutôt qu'une erreur brute ; un test
 * tient les trois d'accord (reduction-images.test.js).
 */
const MAX_PHOTO_FICHE = 250 * 1024;
const PHOTOS_INDISPONIBLES = 'Photos des fiches pas encore disponibles (migration 191 non jouée).';

const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

/**
 * `photo_v` sur chaque fiche : l'empreinte de sa photo, ou `null`. Elle entre dans l'adresse de
 * l'image (`?v=`), si bien qu'une photo remplacée change d'adresse et que le cache du navigateur
 * ne ressert pas l'ancienne. Rend `false` sans la migration 191 — les listes ne tombent pas pour
 * autant : aucune fiche n'a de photo, voilà tout.
 */
async function ajouterPhotos(conn, rows) {
    rows.forEach((r) => { r.photo_v = null; });
    const ids = rows.map((r) => r.id);
    if (!ids.length) return true;
    try {
        const [ph] = await conn.query('SELECT recipe_id, empreinte FROM recipe_photo WHERE recipe_id IN (?)', [ids]);
        const parId = new Map(ph.map((p) => [p.recipe_id, p.empreinte]));
        rows.forEach((r) => { r.photo_v = parId.get(r.id) || null; });
        return true;
    } catch (e) {
        if (noTable(e)) return false;
        throw e;
    }
}

module.exports = { MAX_PHOTO_FICHE, PHOTOS_INDISPONIBLES, ajouterPhotos, noTable };
