import { useEffect, useState } from "react";
import { getDocument, signDocument, downloadDocumentPdf, documentPdfUrl } from "../api/apiClient.js";
import StatusMessage from "./StatusMessage.jsx";
import SignatureModal from "./SignatureModal.jsx";

/**
 * Aperçu FIDÈLE du document : le vrai modèle Word rempli, converti en PDF
 * (non modifiable) et affiché tel quel. Repli sur l'aperçu HTML si la
 * conversion PDF est indisponible (LibreOffice non installé côté serveur).
 */
function DocumentViewModal({ id, canSign = false, defaultName = "", onClose, onChanged }) {
  const [doc, setDoc] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null); // message si PDF indisponible
  const [missing, setMissing] = useState(null);   // infos manquantes (jetons vides)
  const [status, setStatus] = useState(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    getDocument(id).then((r) => setDoc(r.data)).catch((e) => setStatus({ type: "error", message: e.message }));
  }, [id]);

  // Aperçu = PDF du modèle rempli.
  useEffect(() => {
    let url;
    documentPdfUrl(id)
      .then((u) => { url = u; setPdfUrl(u); })
      .catch((e) => { setPdfError(e.message); setMissing(e.missing || null); });
    return () => { if (url) URL.revokeObjectURL(url); };
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
  const dl = (fn) => fn.catch((e) => { setStatus({ type: "error", message: e.message }); if (e.missing) setMissing(e.missing); });

  // Panneau des informations manquantes (regroupées par table d'origine).
  function MissingPanel() {
    if (!missing || !missing.length) return null;
    const groups = {};
    for (const m of missing) (groups[m.group || "Autres"] ||= []).push(m.label);
    return (
      <div style={{ padding: "16px 18px" }}>
        <div className="status err" style={{ marginBottom: 12 }}>
          <b>Document non généré :</b> {missing.length} information(s) manquante(s). Complétez la fiche puis réessayez.
        </div>
        <div className="doc-sheet" style={{ padding: 16 }}>
          {Object.entries(groups).map(([g, labels]) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ember1)", marginBottom: 4 }}>{g}</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {labels.map((l) => <li key={l} style={{ fontSize: 13 }}>{l}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 17 }}>{doc ? doc.title : "Document"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody" style={{ padding: 0, background: "var(--surface3)" }}>
          <StatusMessage status={status} />
          {pdfUrl ? (
            <object data={pdfUrl} type="application/pdf" className="doc-pdf-frame">
              <div style={{ padding: 22, textAlign: "center", color: "var(--muted)" }}>
                L'aperçu ne s'affiche pas ici.{" "}
                <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ember1)", fontWeight: 600 }}>
                  Ouvrir le PDF dans un nouvel onglet
                </a>
              </div>
            </object>
          ) : missing ? (
            <MissingPanel />
          ) : pdfError ? (
            <div style={{ padding: "16px 18px" }}>
              <div className="status err" style={{ marginBottom: 12 }}>Aperçu PDF indisponible : {pdfError}</div>
              {doc && <div className="doc-sheet" dangerouslySetInnerHTML={{ __html: doc.html }} />}
            </div>
          ) : (
            <p className="hint" style={{ padding: 18 }}>Génération de l'aperçu…</p>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
          {pdfUrl && (
            <a className="btn ghost sm" href={pdfUrl} target="_blank" rel="noreferrer">↗ Ouvrir</a>
          )}
          {doc && !missing && (
            <button className="btn" onClick={() => dl(downloadDocumentPdf(id, `${doc.title || "document"}.pdf`))}>PDF</button>
          )}
          {showSign && !missing && <button className="btn primary" onClick={() => setSigning(true)}>Signer</button>}
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
