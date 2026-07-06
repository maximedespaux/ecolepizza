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

/** Convertit un .docx en PDF via Gotenberg (LibreOffice). */
export async function docxToPdf(docx: Buffer, filename = "document.docx"): Promise<Buffer> {
  const url = (process.env.GOTENBERG_URL ?? "http://localhost:3001") + "/forms/libreoffice/convert";
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(docx)]), filename);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Conversion PDF échouée: ${res.status}`);
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
