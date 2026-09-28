import { useState } from "react";
import PageHead from "../components/PageHead.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import BillingProfiles from "../components/BillingProfiles.jsx";
import MoyensPaiement from "../components/MoyensPaiement.jsx";

/**
 * Facturation de l'organisme, dans les Paramètres.
 *
 * Les ENTITÉS ÉMETTRICES portent l'identité, la numérotation (gabarit libre) et la TVA. L'ancien
 * bloc « Réglages de facturation » global faisait double emploi et a été retiré — un seul endroit
 * par question. La première entité est pré-remplie depuis l'organisme.
 *
 * LES MOYENS DE PAIEMENT ONT QUITTÉ LES ENTITÉS (migration 187, 2026-09-28) : une seule liste pour
 * l'école, chacun avec le modèle de facture qu'il pré-sélectionne à la caisse et en facturant une
 * demande boutique. Ils vivaient en texte sur chaque entité, et les demandes lisaient une troisième
 * liste que plus rien ne permettait de modifier.
 */
export default function FacturationReglages() {
  const [status, setStatus] = useState(null);
  // `null` efface : un geste réussi ne doit pas laisser en tête l'erreur du précédent.
  const erreur = (m) => setStatus(m ? { type: "error", message: m } : null);
  return (
    <>
      <PageHead eyebrow="Organisme · Paramètres" title="Facturation"
        lead="Les entités sous lesquelles vous facturez (identité, numérotation, TVA), et vos moyens de paiement avec le modèle de facture de chacun." />
      <StatusMessage status={status} />
      <BillingProfiles onError={erreur} />
      <MoyensPaiement onError={erreur} />
    </>
  );
}
