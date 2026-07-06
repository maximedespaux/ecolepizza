// Association « type de document » → fichier modèle Word réel (dossier /templates).
// Les modèles proviennent de Template.zip (École Pizza). Le choix dépend du
// financement (particulier / entreprise), de la certification (RS7404) et de la
// durée (feuilles d'émargement 2J → 5J, + hygiène).

import fs from "fs";
import path from "path";

export const TEMPLATES_DIR = path.join(process.cwd(), "templates");

export interface TemplateCtx {
  financement: string; // PARTICULIER | PROFESSIONNEL
  rsCode?: string | null; // ex. RS7404 (certifiante)
  jours: number;
  hygiene: boolean;
}

export function templateFileFor(type: string, ctx: TemplateCtx): string | null {
  const pro = ctx.financement === "PROFESSIONNEL";
  const rs = !!ctx.rsCode;

  switch (type) {
    case "DEVIS":
      return rs
        ? "Devis Fabriquer des pizzas artisanales RS7404.docx"
        : pro ? "Devis Entreprise.docx" : "Devis Particulier_.docx";
    case "CONTRAT":
      return rs
        ? "Contrat Fabriquer des pizzas artisanales RS7404.docx"
        : pro ? "Convention.docx" : "Contrat.docx";
    case "CONVOCATION": return "Convocation.docx";
    case "INVITATION": return "Invitation.docx";
    case "DROIT_IMAGE": return "Droit Image.docx";
    case "EMARGEMENT": {
      if (ctx.hygiene && ctx.jours >= 5) return "Feuille d_émargement 5J + hygiène.docx";
      const j = Math.min(5, Math.max(2, ctx.jours));
      return `Feuille d_émargement ${j}J.docx`;
    }
    case "ATTESTATION_HYGIENE": return "Attestation Hygiène.docx";
    case "CERTIFICAT_REALISATION": return "Certificat de réalisation.docx";
    case "EVALUATION_FINANCEUR": return "Évaluation Financeur.docx";
    case "EVALUATION_MANAGEUR": return "Évaluation Manageur.docx";
    case "CGV": return "CGV.docx";
    case "TEST_POSITIONNEMENT": return "Testez vos connaissances en hygiène.docx";
    case "FICHE_SEMAINE": return "Fiche Semaine.docx";
    // PROGRAMME : non fourni dans Template.zip (se trouve dans les déroulés Archive).
    case "PROGRAMME": return null;
    default: return null;
  }
}

export function templatePath(filename: string): string {
  return path.join(TEMPLATES_DIR, filename);
}

export function templateExists(filename: string): boolean {
  return fs.existsSync(templatePath(filename));
}

export function loadTemplate(filename: string): Buffer {
  return fs.readFileSync(templatePath(filename));
}
