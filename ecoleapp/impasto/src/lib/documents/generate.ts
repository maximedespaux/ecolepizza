// Module documents — génération réelle (point 5).
// Remplit un template .docx avec docxtemplater (délimiteurs { }), puis convertit
// en PDF via Gotenberg (LibreOffice headless). Tout est exécuté côté serveur.

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { DOCXTEMPLATER_DELIMITERS } from "./tokens";

/** Remplit un template .docx (Buffer) avec les variables de fusion → .docx (Buffer). */
export function renderDocx(templateBuffer: Buffer, data: Record<string, unknown>): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: DOCXTEMPLATER_DELIMITERS,
    paragraphLoop: true,
    linebreaks: true,
    // Variable absente → chaîne vide plutôt qu'une erreur bloquante.
    nullGetter: () => "",
  });
  doc.render(data as Record<string, string>);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

const GOTENBERG = () => process.env.GOTENBERG_URL ?? "http://localhost:3001";

/** Convertit un .docx en PDF via Gotenberg (LibreOffice). */
export async function docxToPdf(docx: Buffer, filename = "document.docx"): Promise<Buffer> {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(docx)]), filename);
  const res = await fetch(GOTENBERG() + "/forms/libreoffice/convert", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Conversion PDF échouée: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Le moteur PDF (Gotenberg) répond-il ? Court timeout pour ne pas bloquer l'UI. */
export async function gotenbergAvailable(): Promise<boolean> {
  try {
    const ctrl = AbortSignal.timeout(1500);
    const res = await fetch(GOTENBERG() + "/health", { signal: ctrl });
    return res.ok;
  } catch {
    return false;
  }
}

/** Convertit une page HTML en PDF via Gotenberg (Chromium). */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  const res = await fetch(GOTENBERG() + "/forms/chromium/convert/html", { method: "POST", body: form });
  if (!res.ok) throw new Error(`HTML→PDF échoué: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Fusionne plusieurs PDF en un seul (Gotenberg pdfengines). */
export async function mergePdfs(pdfs: Buffer[]): Promise<Buffer> {
  const form = new FormData();
  pdfs.forEach((p, i) => form.append("files", new Blob([new Uint8Array(p)], { type: "application/pdf" }), `${String(i).padStart(3, "0")}.pdf`));
  const res = await fetch(GOTENBERG() + "/forms/pdfengines/merge", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Fusion PDF échouée: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Nom de fichier classé selon la convention « {num}. {Type} {NOM Prénom} ». */
export function buildFileName(num: string, type: string, nom: string, prenom?: string) {
  return `${num}. ${type} ${nom}${prenom ? " " + prenom : ""}`.trim() + ".docx";
}

/** Chemin Drive « Documents formation/{annee}/SEM {semaine}/{NOM Prénom} ». */
export function buildDrivePath(annee: number, semaine: number, nom: string, prenom?: string) {
  return ["Documents formation", String(annee), `SEM ${semaine}`, `${nom}${prenom ? " " + prenom : ""}`];
}
