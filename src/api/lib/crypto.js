const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', 'config', '.env') });

// Chiffrement réversible des données personnelles sensibles (ex. n° de sécurité
// sociale). AES-256-GCM : confidentialité + intégrité (tag d'authentification).
// La clé vient de SSN_ENC_KEY (idéalement 64 caractères hexadécimaux = 32 octets).
const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:';

function getKey() {
    const raw = process.env.SSN_ENC_KEY || '';
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
    }
    // En production, refuser de démarrer avec une clé faible/absente : les données
    // sensibles (n° de sécurité sociale) seraient chiffrées avec une clé connue.
    if (process.env.NODE_ENV === 'production' && !raw) {
        throw new Error('SSN_ENC_KEY manquante : définissez une clé de 64 caractères hexadécimaux en production.');
    }
    if (!raw) console.warn('[sécurité] SSN_ENC_KEY absente — clé de développement utilisée (NE PAS utiliser en production).');
    /* Dérive une clé de 32 octets depuis la valeur fournie (ou un défaut de dev).
       ⚠ CES DEUX CHAÎNES NE SE RENOMMENT PAS — elles ont gardé « impasto » après le passage à
       Impastio, et ce n'est pas un oubli. Le sel entre dans la dérivation de la clé : le changer
       d'un seul caractère produit une AUTRE clé, et tous les numéros de sécurité sociale déjà
       chiffrés (`enc:…`) deviennent alors définitivement illisibles — AES-GCM refuse de
       déchiffrer, il ne rend pas du charabia. Le renommage cosmétique de la marque n'a pas à
       toucher un secret cryptographique. Cf. la même mise en garde dans `pdfseal.js`. */
    return crypto.scryptSync(raw || 'impasto-dev-key', 'impasto-ssn-salt', 32);
}

/** Chiffre une valeur en clair -> chaîne « enc:iv:tag:ciphertext ». null/'' -> null. */
function encrypt(plain) {
    if (plain === null || plain === undefined || plain === '') return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

/** Déchiffre une valeur produite par encrypt(). Renvoie la valeur telle quelle
 *  si elle n'est pas chiffrée (compat. données existantes), null si illisible. */
function decrypt(value) {
    if (value === null || value === undefined) return null;
    const str = String(value);
    if (!str.startsWith(PREFIX)) return value; // clair / hérité
    try {
        const [, ivH, tagH, dataH] = str.split(':');
        const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivH, 'hex'));
        decipher.setAuthTag(Buffer.from(tagH, 'hex'));
        return Buffer.concat([
            decipher.update(Buffer.from(dataH, 'hex')),
            decipher.final(),
        ]).toString('utf8');
    } catch {
        return null;
    }
}

/* CHIFFREMENT BINAIRE — pour les OCTETS d'un fichier (pièces justificatives : scans de carte
   d'identité, etc.) et non du texte. `encrypt`/`decrypt` ci-dessus passent par `String(...)`/utf8
   et corromperaient des octets bruts ; on chiffre donc le Buffer directement. Format :
   [marqueur "encb1" | iv(12) | tag(16) | ciphertext]. Non chiffré / hérité → renvoyé tel quel. */
const BYTES_MARQUEUR = Buffer.from('encb1');

/** Chiffre un Buffer -> Buffer. Buffer vide/absent renvoyé tel quel. */
function encryptBytes(buf) {
    if (!buf || !buf.length) return buf;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
    const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
    return Buffer.concat([BYTES_MARQUEUR, iv, cipher.getAuthTag(), enc]);
}

/** Déchiffre un Buffer produit par encryptBytes(). Renvoie le clair, le Buffer TEL QUEL s'il n'est
 *  pas au format chiffré (compat. d'éventuelles données antérieures), ou null si illisible (clé
 *  changée, corruption — le tag GCM détecte toute altération). */
function decryptBytes(buf) {
    if (!buf || !buf.length) return buf;
    const m = BYTES_MARQUEUR.length;
    if (buf.length < m + 28 || !buf.subarray(0, m).equals(BYTES_MARQUEUR)) return buf; // clair / hérité
    try {
        const iv = buf.subarray(m, m + 12);
        const tag = buf.subarray(m + 12, m + 28);
        const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(buf.subarray(m + 28)), decipher.final()]);
    } catch { return null; }
}

/** Masque un numéro pour l'affichage en liste (ne garde que les 4 derniers). */
function mask(plain) {
    if (!plain) return null;
    const s = String(plain).replace(/\s/g, '');
    return s.length <= 4 ? '••••' : '•••• •••• ' + s.slice(-4);
}

/** Génère un mot de passe aléatoire lisible (sans caractères ambigus). */
function generatePassword(length = 10) {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
    return out;
}

module.exports = { encrypt, decrypt, encryptBytes, decryptBytes, mask, generatePassword };
