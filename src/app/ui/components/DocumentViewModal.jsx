import { useEffect, useState } from "react";
import { getDocument, signDocument } from "../api/apiClient.js";
import StatusMessage from "./StatusMessage.jsx";
import SignatureModal from "./SignatureModal.jsx";

/**
 * Aperçu du contenu d'un document (HTML fusionné). Si `canSign` et que le
 * document est signable et non signé, propose la signature.
 */
function DocumentViewModal({ id, canSign = false, defaultName = "", onClose, onChanged }) {
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    getDocument(id).then((r) => setDoc(r.data)).catch((e) => setStatus({ type: "error", message: e.message }));
  }, [id]);

  async function handleSign({ signer_name, signature_data }) {
    try {
      await signDocument(id, { signer_name, signature_data });
      setSigning(false);
      onChanged && onChanged();
      onClose();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  const showSign = canSign && doc && doc.signable && doc.status !== "SIGNE";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 17 }}>{doc ? doc.title : "Document"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody" style={{ maxHeight: "70vh", overflowY: "auto", background: "var(--surface2)" }}>
          <StatusMessage status={status} />
          {!doc ? (
            <p className="hint">Chargement…</p>
          ) : (
            <>
              <div dangerouslySetInnerHTML={{ __html: doc.html }} />
              {doc.status === "SIGNE" && (
                <div className="doc-sheet" style={{ marginTop: 12 }}>
                  <b>Signé</b> le {doc.signed_at} par {doc.signer_name}.
                  {doc.signature_data && <div><img className="doc-signature-img" src={doc.signature_data} alt="signature" /></div>}
                </div>
              )}
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
          {showSign && <button className="btn primary" onClick={() => setSigning(true)}>✎ Signer</button>}
        </div>
      </div>

      {signing && (
        <SignatureModal
          doc={{ label: doc.title }}
          defaultName={defaultName}
          onConfirm={handleSign}
          onClose={() => setSigning(false)}
        />
      )}
    </div>
  );
}

export default DocumentViewModal;
