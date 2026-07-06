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
    // Sinon, dérive une clé de 32 octets depuis la valeur fournie (ou un défaut de dev).
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

module.exports = { encrypt, decrypt, mask, generatePassword };
