/**
 * Réduction d'image CÔTÉ NAVIGATEUR, avant envoi.
 *
 * Le serveur ne fait aucun traitement d'image — c'est un choix assumé du projet : pas de
 * `sharp` ni d'autre dépendance native à compiler et à maintenir. Le navigateur, lui, sait
 * déjà tout faire avec un `<canvas>`.
 *
 * Une photo de téléphone pèse 3 à 8 Mo. Envoyée telle quelle, elle serait refusée par la
 * limite du serveur, et l'utilisateur n'aurait aucun moyen de comprendre pourquoi — « choisir
 * une photo » et « choisir une photo de moins de 600 Ko » ne sont pas la même demande. On
 * réduit donc AVANT, en silence.
 *
 * WebP plutôt que JPEG : à qualité perçue égale il pèse environ un tiers de moins, et tous
 * les navigateurs que l'application vise savent l'encoder. Repli JPEG si l'encodage WebP
 * échoue — `toBlob` renvoie alors du PNG, qui serait bien plus lourd.
 */

/* Plafonds de la réduction, EXPORTÉS : l'écran les annonce à l'utilisateur, et les retaper
   là-bas les ferait dériver le jour où on les change ici. `PHOTO_MAX_KO` doit rester SOUS la
   limite du serveur (600 Ko, cf. uploadPostImage) — sinon une photo réduite dans les règles se
   ferait refuser à l'arrivée, et personne ne comprendrait pourquoi. Un test le vérifie. */
export const PHOTO_MAX_KO = 550;
export const PHOTO_MAX_PX = 1400;

/** Charge un fichier en <img>, en libérant l'URL objet quoi qu'il arrive. */
function chargerImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
    img.src = url;
  });
}

const enBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

/**
 * Réduit `file` sous `maxPx` de côté et sous `maxKo`, et renvoie un Blob WebP.
 *
 * La qualité descend par PALIERS successifs plutôt qu'en une passe : une photo de plat très
 * détaillée et une photo de pâte sur fond uni ne se compressent pas au même taux, et viser
 * une qualité fixe donnerait tantôt du gâchis, tantôt un refus. On s'arrête au premier palier
 * qui passe sous la limite.
 */
export async function reduireImage(file, { maxPx = PHOTO_MAX_PX, maxKo = PHOTO_MAX_KO } = {}) {
  const img = await chargerImage(file);
  const facteur = Math.min(1, maxPx / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * facteur);
  canvas.height = Math.round(img.height * facteur);
  const ctx = canvas.getContext("2d");
  // Un fond blanc, sinon une PNG transparente devient noire une fois aplatie en WebP opaque.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const q of [0.82, 0.7, 0.58, 0.45, 0.34]) {
    const blob = await enBlob(canvas, "image/webp", q);
    if (blob && blob.type === "image/webp" && blob.size <= maxKo * 1024) return blob;
    // Le navigateur n'encode pas le WebP : on repasse en JPEG, jamais en PNG (trop lourd).
    if (blob && blob.type !== "image/webp") {
      const jpeg = await enBlob(canvas, "image/jpeg", q);
      if (jpeg && jpeg.size <= maxKo * 1024) return jpeg;
    }
  }
  throw new Error("Photo trop lourde même après réduction — essaie une image plus simple.");
}
