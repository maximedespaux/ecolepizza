/**
 * LES PIÈCES JOINTES D'UN MÉMO (migration 193) — ce que le serveur accepte de garder.
 *
 * Demandé le 2026-09-30 : « joindre une image au mémo, deux au plus (une image collée, ou un PDF) ».
 * Un pense-bête renvoie souvent à ce qu'on a sous les yeux — une capture d'écran, un bon de
 * livraison photographié, le PDF d'un devis reçu.
 *
 * Du JavaScript pur : les tests le lisent sans base. Trois règles, tenues ICI parce que l'écran ne
 * fait que les annoncer :
 *   · DEUX par mémo, pas davantage : un mémo n'est pas un dossier ;
 *   · le TYPE est celui que les octets PROUVENT — JPEG, PNG, WebP ou PDF. Le type déclaré par
 *     l'envoi vient de l'appelant, et le fichier est resservi tel quel sous le type gardé ici : un
 *     « image/png » posé sur une page HTML s'ouvrirait dans le navigateur d'un collègue ;
 *   · le POIDS : une image est réduite par le navigateur avant de partir (lib/image.js, profil
 *     `memo`), un PDF ne se réduit pas. Deux plafonds, donc, et un refus qui dit lequel.
 */
const { formatImage } = require('./formatImage.js');

const MAX_FICHIERS_MEMO = 2;
/* Au-dessus du plafond DUR du profil `memo` de l'écran (900 Ko) : une image réduite dans les règles
   ne doit pas être refusée à l'arrivée — reduction-images.test.js confronte les deux. */
const MAX_IMAGE_MEMO = 1024 * 1024;
const MAX_PDF_MEMO = 5 * 1024 * 1024;
const MAX_NOM = 120;
const PIECES_INDISPONIBLES = 'Les pièces jointes des mémos arrivent avec la migration 193 (non jouée).';

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Le type que les octets prouvent : une image que tout navigateur affiche, ou un PDF. `null` sinon. */
function typeDuFichier(b) {
    const image = formatImage(b);
    if (image) return image;
    if (Buffer.isBuffer(b) && b.length > 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
    return null;
}

/**
 * Le nom à garder et à resservir : sans chemin, sans caractère de contrôle, borné, et avec
 * l'extension du type PROUVÉ — « capture.png » réduite en WebP par le navigateur s'appelle
 * « capture.webp », sinon le nom mentirait sur ce qu'on télécharge.
 */
function nomPropre(nom, mime) {
    const ext = EXTENSION[mime];
    const base = String(nom == null ? '' : nom)
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .split(/[\\/]/).pop()
        .replace(/\.[A-Za-z0-9]{1,5}$/, '')
        .replace(/["<>:|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_NOM - ext.length - 1);
    return `${base || (mime === 'application/pdf' ? 'document' : 'image')}.${ext}`;
}

/**
 * Les fichiers reçus (multer, en mémoire) → `{ fichiers }` ou `{ erreur, statut }`.
 *
 * `noms` : le nom de chaque fichier, envoyé À PART en texte. multer lit les noms de fichier en
 * latin1 — « Relevé.pdf » y arriverait « RelevÃ©.pdf » —, un champ de texte, lui, arrive en UTF-8.
 */
function lireFichiers(recus, noms = []) {
    const liste = Array.isArray(recus) ? recus : [];
    if (liste.length > MAX_FICHIERS_MEMO) {
        return { erreur: `Un mémo porte ${MAX_FICHIERS_MEMO} pièces jointes au plus.`, statut: 422 };
    }
    const fichiers = [];
    for (let i = 0; i < liste.length; i++) {
        const f = liste[i];
        const contenu = f && f.buffer;
        if (!Buffer.isBuffer(contenu) || !contenu.length) return { erreur: 'Pièce jointe vide.', statut: 422 };
        const mime = typeDuFichier(contenu);
        if (!mime) return { erreur: 'Pièce jointe refusée : une image (JPEG, PNG, WebP) ou un PDF.', statut: 415 };
        const nom = nomPropre(noms[i] || f.originalname, mime);
        const max = mime === 'application/pdf' ? MAX_PDF_MEMO : MAX_IMAGE_MEMO;
        if (contenu.length > max) {
            return { erreur: `« ${nom} » est trop lourd : ${mime === 'application/pdf' ? '5 Mo au plus pour un PDF' : '1 Mo au plus pour une image'}.`, statut: 413 };
        }
        fichiers.push({ nom, mime, octets: contenu.length, contenu });
    }
    return { fichiers };
}

/** Les noms envoyés à part (un tableau JSON, en texte) — illisible, on s'en passe : le nom du fichier suffit. */
function lireNoms(v) {
    if (Array.isArray(v)) return v.map((n) => String(n == null ? '' : n));
    if (typeof v !== 'string' || !v) return [];
    try { const t = JSON.parse(v); return Array.isArray(t) ? t.map((n) => String(n == null ? '' : n)) : []; }
    catch { return []; }
}

module.exports = {
    MAX_FICHIERS_MEMO, MAX_IMAGE_MEMO, MAX_PDF_MEMO, PIECES_INDISPONIBLES,
    typeDuFichier, nomPropre, lireFichiers, lireNoms,
};
