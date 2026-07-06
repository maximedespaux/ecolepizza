// Utilitaires du moteur de signature (démo interne).
import { createHash, randomBytes } from "crypto";

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
export const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
export const genToken = () => randomBytes(24).toString("hex");

// Libellés lisibles des types de documents (pour la page de signature).
export const DOC_LABEL: Record<string, string> = {
  PROGRAMME: "Programme de formation", FICHE_SEMAINE: "Fiche d'expression de besoin",
  TEST_POSITIONNEMENT: "Test de positionnement", DEVIS: "Devis", CONTRAT: "Contrat / Convention",
  CONVOCATION: "Convocation", INVITATION: "Invitation", DROIT_IMAGE: "Droit à l'image",
  EMARGEMENT: "Feuille d'émargement", ATTESTATION_HYGIENE: "Attestation Hygiène",
  CERTIFICAT_REALISATION: "Certificat de réalisation", EVALUATION_FINANCEUR: "Évaluation",
  CGV: "Conditions générales de vente",
};
