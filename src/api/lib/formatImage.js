/**
 * LE FORMAT D'UNE IMAGE, LU DANS SES OCTETS — jamais dans ce que l'envoi en déclare.
 *
 * Le type MIME d'un fichier envoyé vient du navigateur, donc de l'appelant : rien n'empêche d'y
 * écrire « image/png » sur autre chose. Une image est ensuite RESSERVIE telle quelle, avec le
 * type enregistré. On ne garde donc que ce que les premiers octets prouvent : JPEG, PNG ou WebP,
 * les trois que les navigateurs produisent (lib/image.js réduit en WebP, repli JPEG).
 *
 * `null` pour tout le reste — y compris un HEIC d'iPhone, que la plupart des navigateurs ne
 * savent pas afficher : le garder serait servir une image cassée.
 */
function formatImage(b) {
    if (!Buffer.isBuffer(b) || b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

module.exports = { formatImage };
