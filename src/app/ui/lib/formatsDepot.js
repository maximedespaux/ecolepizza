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
