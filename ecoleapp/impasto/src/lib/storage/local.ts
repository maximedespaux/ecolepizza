// Stockage de fichiers géré par l'application (mini-Drive local).
// Les fichiers vivent hors du dossier public, dans `.storage/` (non versionné) ;
// ils ne sont servis qu'à travers des routes authentifiées. Chaque fichier a une
// clé stable « {organizationId}/{enrollmentId}/{nom} » → rangement par stagiaire.
//
// Abstraction volontairement minimale : on pourra brancher Google Drive ou S3
// plus tard en réimplémentant save/read/exists derrière la même interface.

import fs from "fs";
import path from "path";

export const STORAGE_ROOT = path.join(process.cwd(), ".storage");

function abs(key: string): string {
  // Empêche toute remontée de dossier (../) dans la clé.
  const safe = key.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..").join("/");
  return path.join(STORAGE_ROOT, safe);
}

export function saveFile(key: string, data: Buffer): string {
  const full = abs(key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  return key;
}

export function readFile(key: string): Buffer | null {
  const full = abs(key);
  return fs.existsSync(full) ? fs.readFileSync(full) : null;
}

export function fileExists(key: string): boolean {
  return fs.existsSync(abs(key));
}

export function removeFile(key: string): void {
  const full = abs(key);
  if (fs.existsSync(full)) fs.rmSync(full);
}

// Clé de rangement d'un document généré : par organisme puis par dossier.
export function documentKey(organizationId: string, enrollmentId: string, docId: string, ext: "docx" | "pdf"): string {
  return `${organizationId}/${enrollmentId}/${docId}.${ext}`;
}

// Clé du PDF signé (document + attestation de signature).
export function signedKey(organizationId: string, enrollmentId: string, docId: string): string {
  return `${organizationId}/${enrollmentId}/${docId}.signed.pdf`;
}
