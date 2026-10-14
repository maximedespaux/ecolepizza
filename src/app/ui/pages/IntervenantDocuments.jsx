import { useContext, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { MesDocuments } from "./IntervenantEspace.jsx";

/**
 * Onglet « Documents » de l'espace intervenant.
 *
 * Les documents de session qu'on lui demande de signer (contrat d'hygiène, grille de jury…)
 * vivaient tout au bas de l'émargement, sous toutes ses demi-journées — invisibles. On les sort
 * au premier plan, dans leur propre entrée de barre. Même carte qu'avant (`MesDocuments`), rendue
 * en mode `autonome` : quand il n'y a rien, elle le DIT plutôt que de laisser une page blanche.
 */
export default function IntervenantDocuments() {
  const { user } = useContext(UserContext);
  const [status, setStatus] = useState(null);
  const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Espace intervenant</div>
        <h1>Mes documents</h1>
        <p>Les documents que l'école vous demande de signer apparaissent ici.</p>
      </div>
      <StatusMessage status={status} />
      <MesDocuments onStatus={setStatus} fullName={fullName} version={0} autonome />
    </>
  );
}
