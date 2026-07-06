// Hachage de mot de passe (scrypt) pour les accès stagiaires.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  try {
    const [salt, hash] = stored.split(":");
    const test = scryptSync(pw, salt, 32);
    return timingSafeEqual(Buffer.from(hash, "hex"), test);
  } catch { return false; }
}

// Mot de passe lisible (ex. « Napoli-4827 ») à communiquer au stagiaire.
export function generatePassword(): string {
  const words = ["Pizza", "Napoli", "Teglia", "Impasto", "Forno", "Farina", "Basilic", "Fornaio"];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(1000 + Math.random() * 9000)}`;
}
