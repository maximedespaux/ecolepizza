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

/**
 * UN PROFIL PAR USAGE — parce qu'une photo de plat et un scan de carte d'identité n'ont pas le
 * même métier (2026-09-23).
 *
 * LA PIÈCE JUSTIFICATIVE EST UNE PREUVE, PAS UNE ILLUSTRATION. Quelqu'un doit y LIRE un nom, une
 * date, un numéro : trop réduite, elle ne prouve plus rien, et l'on ne s'en aperçoit qu'au
 * moment du contrôle, quand le stagiaire est reparti depuis des mois. Son profil est donc large
 * en pixels ET s'arrête à une qualité PLANCHER : mieux vaut refuser une image que rendre
 * illisible une pièce que l'école croira valide.
 *
 * LE FOND BLANC N'EST PAS UNIVERSEL. Il évite qu'un PNG transparent devienne noir une fois
 * aplati — ce qu'il faut pour une photo. Sur un LOGO, il colle un rectangle blanc autour du
 * dessin, visible sur tout fond coloré et sur le thème sombre. Les profils qui gardent la
 * transparence posent donc `fond: null`.
 *
 * `maxKo` DOIT RESTER SOUS LA LIMITE DU SERVEUR de chaque route, sans quoi une image réduite
 * dans les règles se ferait refuser à l'arrivée — et personne ne comprendrait pourquoi. Un test
 * confronte chaque profil à la route qu'il alimente.
 *
 * `maxKo` EST UNE CIBLE, `maxDur` UN REFUS. La distinction est née au banc d'essai : une image
 * très détaillée peut ne jamais passer sous la cible sans franchir le plancher de qualité, et la
 * réduction répondait alors « trop lourde » — sur une PIÈCE D'IDENTITÉ parfaitement valide, que
 * le serveur aurait acceptée (il plafonne à 3 Mo, la cible est à 1,5). On envoie donc le meilleur
 * obtenu tant qu'il reste sous `maxDur`. Là où le serveur est strict (photo, e-mail, JSON), les
 * deux se confondent et le refus revient — c'est alors la bonne réponse.
 */
export const PROFILS = {
  /* Communauté : une photo de plat, vue dans un fil. */
  publication: { maxPx: PHOTO_MAX_PX, maxKo: PHOTO_MAX_KO, maxDur: 590, fond: '#fff', qualiteMin: 0.34 },
  /* Pièce justificative : on doit pouvoir la LIRE. Plancher de qualité haut, refus plutôt que bouillie. */
  piece: { maxPx: 2200, maxKo: 1500, maxDur: 2800, fond: '#fff', qualiteMin: 0.72 },
  /* Portrait de stagiaire : affiché en 40 px, jamais en grand. */
  avatar: { maxPx: 640, maxKo: 220, maxDur: 290, fond: '#fff', qualiteMin: 0.5 },
  /* Logo et cachet de l'organisme : la transparence fait tout leur intérêt. */
  marque: { maxPx: 900, maxKo: 320, maxDur: 900, fond: null, qualiteMin: 0.6 },
  /* Image glissée dans un e-mail : elle voyage en pièce jointe avec chaque message. */
  mail: { maxPx: 1200, maxKo: 400, maxDur: 590, fond: '#fff', qualiteMin: 0.45 },
  /* Illustration d'une question de QCM. PLAFOND SERRÉ, et pour une raison qui ne se devine pas :
     elle voyage dans le JSON du QCM ENTIER, dont le corps est plafonné à 2 Mo — toutes les
     questions illustrées se partagent donc ce budget. Trop grosses, elles ne font pas échouer une
     image : elles font échouer l'ENREGISTREMENT du QCM, et le message parle du QCM, pas de
     l'image. Le plafond dur tient compte du base64, qui pèse un tiers de plus que les octets
     transportés : cinq illustrations au pire entrent dans les 2 Mo. ⚠️ Au-delà d'une dizaine, le
     budget reste le vrai mur — c'est la limite du corps JSON qu'il faudrait relever, pas ce
     profil. */
  quiz: { maxPx: 1000, maxKo: 140, maxDur: 250, fond: '#fff', qualiteMin: 0.45 },
};

/* Ce que le navigateur sait rouvrir et réencoder. Un HEIC d'iPhone n'en fait PAS partie : Safari
   le convertit en JPEG à la sélection, les autres navigateurs ne le décodent pas — on le laisse
   donc passer tel quel plutôt que de le casser. */
const REENCODABLES = /^image\/(jpeg|png|webp|gif|bmp)$/i;

/**
 * Réduit ce qui peut l'être, et laisse passer le reste INTACT.
 *
 * C'est la porte d'entrée des écrans : ils envoient des pièces jointes qui sont tantôt des
 * photos, tantôt des PDF ou des .docx. Un PDF ne se recompresse pas sérieusement dans un
 * navigateur — il faudrait embarquer une bibliothèque lourde, et le réencoder risquerait de
 * l'abîmer. Il repart donc tel quel, et c'est la limite du serveur qui tranche.
 *
 * NE JETTE JAMAIS. Si la réduction échoue — format exotique, image corrompue, mémoire courte —
 * on renvoie le fichier d'origine : l'envoi continue et le serveur dira, lui, s'il est trop
 * lourd. Perdre le document de quelqu'un parce que le redimensionnement a hoqueté serait pire
 * que de l'envoyer gros.
 */
export async function reduireSiImage(file, profil = PROFILS.publication) {
  if (!file || !REENCODABLES.test(file.type || '')) return file;
  try { return await reduireImage(file, profil); } catch { return file; }
}

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

/**
 * L'ORIENTATION D'UNE PHOTO DE TÉLÉPHONE VIT DANS SON EXIF, pas dans ses pixels.
 *
 * Un cliché pris en portrait est enregistré couché, avec une étiquette « tourner de 90° ». Un
 * `<canvas>` ne dessine que les pixels : sans précaution, une carte d'identité photographiée
 * debout ressort à l'horizontale, et c'est l'image COUCHÉE qui part au serveur — impossible à
 * rattraper ensuite, l'étiquette ayant disparu au réencodage.
 *
 * `createImageBitmap(file, { imageOrientation: "from-image" })` applique l'étiquette AVANT de
 * nous rendre l'image. Repli sur `<img>` là où l'option n'existe pas : les navigateurs récents
 * appliquent de toute façon l'orientation au décodage, les anciens ne la respectaient nulle part
 * — le repli ne fait donc jamais pire que ce qui se passait déjà.
 */
async function chargerRedressee(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { /* option refusée : on retombe sur l'<img>, ci-dessous */ }
  }
  return chargerImage(file);
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
export async function reduireImage(file, { maxPx = PHOTO_MAX_PX, maxKo = PHOTO_MAX_KO, maxDur, fond = "#fff", qualiteMin = 0.34 } = {}) {
  const dur = (maxDur || maxKo) * 1024;
  const img = await chargerRedressee(file);
  const facteur = Math.min(1, maxPx / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * facteur);
  canvas.height = Math.round(img.height * facteur);
  const ctx = canvas.getContext("2d");
  /* Un fond, sinon une PNG transparente devient noire une fois aplatie en WebP opaque. `fond:
     null` le saute et garde la transparence : c'est ce qu'il faut à un logo, qui se pose sur des
     fonds clairs ET sombres. */
  if (fond) {
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (img.close) img.close(); // ImageBitmap : la mémoire se rend à la main

  /* NE JAMAIS RENDRE PLUS LOURD QUE L'ORIGINAL. Un logo de 12 Ko, une capture d'écran en PNG à
     plat, un scan déjà optimisé : réencodés, ils GROSSISSENT — et on aurait perdu de la qualité
     pour rien. Si le fichier tient déjà dans les deux plafonds, il part tel quel. */
  const dejaLeger = file.size <= maxKo * 1024 && facteur === 1;
  if (dejaLeger) return file;

  /* LES PALIERS S'ARRÊTENT AU PLANCHER DU PROFIL. Descendre jusqu'à 0,34 convient à une photo de
     plat ; sur une carte d'identité, c'est là que le numéro cesse de se lire. */
  let meilleur = null; // le plus petit obtenu, même au-dessus de la cible
  for (const q of [0.82, 0.7, 0.58, 0.45, 0.34].filter((q) => q >= qualiteMin)) {
    const blob = await enBlob(canvas, "image/webp", q);
    if (blob && (!meilleur || blob.size < meilleur.size)) meilleur = blob;
    /* COMPARÉ À L'ORIGINAL : au premier palier, une image déjà compressée peut ressortir plus
       lourde qu'elle n'est entrée. On garde alors l'original — meilleur ET plus petit. Sauf si
       l'on a RÉDUIT les dimensions : le fichier sert alors aussi à ne pas envoyer du 4000 px. */
    if (blob && blob.type === "image/webp" && blob.size <= maxKo * 1024) {
      return blob.size < file.size || facteur < 1 ? blob : file;
    }
    /* Le navigateur n'encode pas le WebP : on repasse en JPEG, jamais en PNG (trop lourd).
       ⚠️ Le JPEG n'a PAS de transparence : le repli d'un profil qui la garde repeint donc un
       fond blanc, faute de quoi le dessin sortirait sur du noir. */
    if (blob && blob.type !== "image/webp") {
      if (!fond) { ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      const jpeg = await enBlob(canvas, "image/jpeg", q);
      if (jpeg && jpeg.size <= maxKo * 1024) return jpeg;
    }
  }
  /* LE PLANCHER DE QUALITÉ EST ATTEINT SANS TOUCHER LA CIBLE. Si le meilleur obtenu reste sous
     le plafond DUR, on l'envoie : le serveur l'acceptera, et refuser une pièce d'identité valide
     parce qu'elle est détaillée serait absurde. Au-delà, on refuse pour de bon — l'envoi
     échouerait de toute façon, autant le dire ici avec un message lisible. */
  if (meilleur && meilleur.size <= dur) return meilleur;
  throw new Error("Photo trop lourde même après réduction, essaie une image plus simple.");
}

/**
 * Le même service, pour les écrans qui envoient une image EN JSON (`data:…;base64,…`) plutôt
 * qu'en pièce jointe : signature, cachet, logo, illustration de QCM.
 *
 * POURQUOI ÇA COMPTE ICI PLUS QU'AILLEURS. Le base64 pèse un TIERS de plus que les octets qu'il
 * transporte, et ces corps-là sont plafonnés à 2 Mo pour le JSON entier — un logo de 1,8 Mo ne
 * fait donc pas échouer « le logo », il fait échouer l'enregistrement de tout l'écran, souvent
 * sans message lisible. Réduire avant est ce qui rend ces formulaires utilisables depuis un
 * téléphone.
 */
export async function reduireEnDataUrl(file, profil = PROFILS.marque) {
  const blob = await reduireSiImage(file, profil);
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(new Error("Image illisible."));
    lecteur.readAsDataURL(blob);
  });
}
