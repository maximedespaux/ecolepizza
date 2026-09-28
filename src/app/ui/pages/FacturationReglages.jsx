import { useState } from "react";
import PageHead from "../components/PageHead.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import BillingProfiles from "../components/BillingProfiles.jsx";

/**
 * Facturation de l'organisme, dans les Paramètres.
 *
 * Tout tient désormais sur les ENTITÉS ÉMETTRICES : identité, numérotation (préfixe + gabarit
 * libre), TVA, moyens de paiement, modèle. L'ancien bloc « Réglages de facturation » global
 * faisait double emploi et a été retiré — un seul endroit par question. La première entité est
 * pré-remplie depuis l'organisme, il n'y a qu'à compléter ce qui touche la facture.
 */
export default function FacturationReglages() {
  const [status, setStatus] = useState(null);
  return (
    <>
      <PageHead eyebrow="Organisme · Paramètres" title="Facturation"
        lead="Les entités sous lesquelles vous facturez : identité, numérotation, TVA, moyens de paiement et modèle de facture." />
      <StatusMessage status={status} />
      <BillingProfiles onError={(m) => setStatus({ type: "error", message: m })} />
    </>
  );
}
