import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { downloadDocumentPdf, documentPdfUrl } from "../api/apiClient.js";

/**
 * VOIR ET TÉLÉCHARGER UN DOCUMENT — les deux gestes, au même endroit, pour les deux côtés.
 *
 * DEMANDÉ : « toujours mettre la possibilité de voir le document et de le télécharger, des deux
 * côtés ». L'école le relit pour vérifier ce qu'elle a envoyé ; l'intervenant, pour savoir ce
 * qu'on lui demande de signer — et ce second cas est le plus important : signer sans pouvoir
 * ouvrir n'est pas signer, c'est obéir.
 *
 * UN SEUL COMPOSANT POUR LES DEUX ÉCRANS. Deux paires de boutons auraient divergé — l'une
 * gagnant un correctif que l'autre n'aurait pas eu, comme on l'a vu ailleurs dans cette
 * application cette semaine.
 *
 * LE MÊME POINT D'ENTRÉE SERT LES DEUX : `/documents/:id/pdf`. Sa garde accepte le personnel,
 * le stagiaire propriétaire, et — depuis la migration 157 — le SIGNATAIRE ATTRIBUÉ. Un document
 * de session n'a pas de stagiaire : sans cette troisième branche, l'intervenant se voyait
 * refuser le document dont il est justement le destinataire.
 *
 * L'ŒIL OUVRE UN ONGLET plutôt qu'une modale : le document est un PDF SIGNÉ, et le lecteur du
 * navigateur le rend mieux qu'un aperçu reconstruit — signatures et sceau compris, qui sont
 * précisément ce qu'on vient vérifier.
 */
function BoutonsDocument({ id, nom }) {
  const [occupe, setOccupe] = useState(false);
  const fichier = `${String(nom || "document").replace(/[\\/:*?"<>|]/g, "")}.pdf`;

  async function voir() {
    setOccupe(true);
    try {
      const url = await documentPdfUrl(id);
      window.open(url, "_blank", "noopener");
      /* L'URL blob est libérée APRÈS que l'onglet l'a chargée. La révoquer tout de suite
         donnerait un onglet vide — et attendre indéfiniment garderait le PDF en mémoire. */
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { /* le chargeur global a déjà signalé l'échec */ }
    finally { setOccupe(false); }
  }

  return (
    <>
      <button type="button" className="iconbtn" title="Voir le document" disabled={occupe}
        aria-label={`Voir ${nom || "le document"}`} onClick={voir}>
        <Icon name="eye" size={16} />
      </button>
      <button type="button" className="iconbtn" title="Télécharger le PDF"
        aria-label={`Télécharger ${nom || "le document"}`}
        onClick={() => downloadDocumentPdf(id, fichier)}>
        <Icon name="download" size={16} />
      </button>
    </>
  );
}

export default BoutonsDocument;
