// Module storage — Google Drive (point 4). Côté serveur uniquement.
// Crée l'arborescence « Documents formation/{annee}/SEM {n}/{NOM Prénom} » et y
// dépose les documents générés et les PDF signés. (Implémentation Phase 2.)

import { google } from "googleapis";

function driveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

/** Crée (ou retrouve) un sous-dossier et renvoie son id. */
export async function ensureFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const drive = driveClient(accessToken);
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    parentId ? `'${parentId}' in parents` : "",
  ].filter(Boolean).join(" and ");

  const found = await drive.files.list({ q, fields: "files(id)" });
  if (found.data.files?.[0]?.id) return found.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined },
    fields: "id",
  });
  return created.data.id!;
}

/** Crée toute l'arborescence d'un dossier stagiaire et renvoie l'id du dossier final. */
export async function ensureLearnerFolder(accessToken: string, segments: string[], rootId?: string): Promise<string> {
  let parent = rootId;
  for (const seg of segments) parent = await ensureFolder(accessToken, seg, parent);
  return parent!;
}

/** Dépose un fichier (PDF/DOCX) dans un dossier Drive. */
export async function uploadFile(accessToken: string, folderId: string, name: string, mimeType: string, data: Buffer) {
  const drive = driveClient(accessToken);
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Buffer.from(data) as unknown as NodeJS.ReadableStream },
    fields: "id, webViewLink",
  });
  return res.data;
}
