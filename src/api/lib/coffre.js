/**
 * LE COFFRE DOCUMENTAIRE, CHIFFRÉ AU REPOS — les trois gestes, au même endroit.
 *
 * POURQUOI CE FICHIER PLUTÔT QUE DEUX APPELS À `encryptBytes`. Ranger un PDF dans le coffre
 * demande TROIS écritures indissociables : les octets chiffrés, l'empreinte du contenu en
 * clair, et sa taille en clair. Oublier les deux dernières ne casse rien de visible — l'écran
 * de stockage continue de s'afficher, il cesse simplement de repérer les doublons et compte des
 * octets faux. C'est exactement le genre de panne qu'on ne remarque pas. `aRanger()` rend les
 * trois d'un coup : on ne peut plus en écrire une sans les autres.
 *
 * POURQUOI MÉMORISER L'EMPREINTE. AES-GCM tire un IV au hasard à chaque chiffrement : deux
 * exemplaires du MÊME document donnent deux chiffrés différents. Toute comparaison faite en
 * base sur `file` — `MD5(file)`, `SHA2(file, 256)` — devient donc aveugle dès que le contenu
 * est chiffré. L'empreinte se calcule sur le clair, AVANT, et se range à côté.
 *
 * CE QU'ELLE NE RÉVÈLE PAS. Un SHA-256 ne rend pas le document : il ne sert qu'à dire que deux
 * lignes portent le même. Il permet en revanche de CONFIRMER qu'un document qu'on possède déjà
 * est dans le coffre — ce qui n'apprend rien à qui a déjà le document.
 */
const crypto = require('crypto');
const { encryptBytes, decryptBytes } = require('./crypto.js');
const { colonneExiste } = require('./colonnes.js');

/** Empreinte du contenu EN CLAIR — la seule qui reste comparable d'un exemplaire à l'autre. */
function empreinteClaire(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Ce qu'il faut écrire pour un document entrant.
 * @returns {{file: Buffer, empreinte: string, octets: number}}
 */
function aRanger(buf) {
    return { file: encryptBytes(buf), empreinte: empreinteClaire(buf), octets: buf.length };
}

/**
 * Le contenu d'une ligne, prêt à servir.
 *
 * `decryptBytes` rend le tampon TEL QUEL s'il ne porte pas le marqueur de chiffrement : une
 * ligne pas encore reprise se sert donc normalement, sans condition à écrire ici. `null`
 * signifie « illisible » — clé changée ou contenu altéré (le tag GCM le détecte) — et ne doit
 * jamais être confondu avec un document vide.
 */
function aServir(file) {
    return decryptBytes(file);
}

/** Les colonnes de mesure sont-elles en base ? (migration 153 — le code marche avant et après.) */
function mesureDisponible(conn) {
    return colonneExiste(conn, 'archive_document', 'empreinte');
}

module.exports = { aRanger, aServir, empreinteClaire, mesureDisponible };
