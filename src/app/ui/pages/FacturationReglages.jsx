import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import ShopSettings from "../components/ShopSettings.jsx";
import BillingProfiles from "../components/BillingProfiles.jsx";
import { getShopSettings } from "../api/apiClient.js";

/**
 * Réglages de facturation de l'organisme, dans les Paramètres.
 *
 * Regroupe ce qui relève de l'IDENTITÉ et des RÈGLES de facturation, pas de l'acte de vente :
 * numérotation, moyens de paiement, TVA, modèle par défaut, et les entités émettrices. Déplacé
 * hors de l'onglet Réglages de Ventes & Inventaire — la caisse ne garde que l'encaissement.
 */
export default function FacturationReglages() {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getShopSettings().then((r) => setSettings(r.data)).catch((e) => setStatus({ type: "error", message: e.message }));
  }, []);

  return (
    <>
      <PageHead eyebrow="Organisme · Paramètres" title="Facturation"
        lead="Numérotation, moyens de paiement, TVA et modèle de facture — plus les entités sous lesquelles vous facturez." />
      <StatusMessage status={status} />
      <div className="grid" style={{ gap: 16 }}>
        <ShopSettings
          settings={settings}
          onSaved={(s) => { setSettings(s); setStatus({ type: "success", message: "Réglages enregistrés." }); }}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
        <BillingProfiles onError={(m) => setStatus({ type: "error", message: m })} />
      </div>
    </>
  );
}
