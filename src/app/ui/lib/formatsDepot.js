/**
 * CE QUE LE SÉLECTEUR DE FICHIERS PROPOSE — aligné sur ce que le serveur ACCEPTE.
 *
 * LE DÉFAUT QUE ÇA FERME. L'entrée de la fiche stagiaire annonçait `.doc,.docx` pour une PIÈCE
 * justificative, que le serveur refuse en 415 (`piece.controller`, dont le commentaire dit
 * pourquoi : « une pièce justificative se lit, elle ne s'édite pas, et accepter du .docx
 * ouvrirait la porte aux macros »). Le secrétariat choisissait donc un fichier que le navigateur
 * lui présentait comme valide, et se prenait un refus sans comprendre — le pire des messages,
 * puisqu'il contredit ce que l'écran venait d'offrir.
 *
 * ⚠️ `accept` N'EST PAS UN CONTRÔLE. Il filtre ce que la fenêtre de choix MONTRE, rien de plus :
 * on peut toujours y taper un nom, glisser un fichier, ou poster sans navigateur. La garde reste
 * celle du serveur, des deux côtés. Ce qui suit ne sert qu'à ne pas PROPOSER ce qui sera refusé.
 *
 * LES EXTENSIONS EN PLUS DES TYPES MIME, volontairement : un fichier venu d'un scanner ou d'une
 * clé USB arrive parfois sans type déclaré, et un `accept` en MIME seul le grise dans la fenêtre
 * alors qu'il passerait très bien.
 *
 * Un test confronte ces deux listes à celles du serveur (`MIMES_CONNUS` pour les pièces,
 * `MIMES_IMPORT` pour les documents reçus) : elles ne peuvent plus diverger en silence.
 */

/** Pièce justificative, et remise : image ou PDF. Aucun format bureautique. */
export const ACCEPT_PIECE = "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";

/**
 * Document REÇU rattaché à une étape : le traitement de texte est admis ici, et seulement ici.
 * Une convention signée revient souvent en .docx par messagerie, et cet écran sert justement à
 * la rattacher au dossier — c'est un document d'archive, pas une pièce d'identité à vérifier.
 */
export const ACCEPT_DOCUMENT = `${ACCEPT_PIECE},.doc,.docx`
  + ",application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * LES TYPES ET LE POIDS QU'ADMET LE SERVEUR pour un document reçu (`MIMES_IMPORT`,
 * `MAX_IMPORT_OCTETS`, document.controller.js — un test les confronte). Pas pour remplacer sa garde :
 * pour VÉRIFIER un fichier AVANT un geste qui ne se défait pas seul. Sur la fiche entreprise, une
 * étape jamais préparée l'est avant l'import ; un fichier refusé ensuite laisserait derrière lui un
 * document préparé que personne n'a demandé.
 */
export const TYPES_DOCUMENT = [
  "application/pdf", "image/png", "image/jpeg", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword",
];
export const MAX_DOCUMENT_OCTETS = 20 * 1024 * 1024;

/** Le motif de refus d'un document reçu, dans les mots du serveur — ou `null` s'il passera. */
export function refusDocumentRecu(file) {
  if (!file) return "Aucun fichier reçu.";
  if (!TYPES_DOCUMENT.includes(file.type)) return "Format refusé : PDF, image (PNG, JPEG, WebP) ou document Word.";
  // Une image est réduite avant l'envoi (`reduireSiImage`) : son poids d'origine ne dit rien.
  if (!file.type.startsWith("image/") && file.size > MAX_DOCUMENT_OCTETS) {
    return `Fichier trop lourd (${MAX_DOCUMENT_OCTETS / 1024 / 1024} Mo maximum).`;
  }
  return null;
}
