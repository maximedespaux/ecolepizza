import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import { getDocument, signDocument, downloadDocumentPdf, documentPdfUrl, documentPreviewHtml, createSignLink } from "../api/apiClient.js";
import StatusMessage from "./StatusMessage.jsx";
import SignatureModal from "./SignatureModal.jsx";

/**
 * Aperçu FIDÈLE du document : rendu HTML identique au PDF, affiché en ligne
 * (iframe srcdoc, indépendant du lecteur PDF du navigateur). Boutons PDF / Ouvrir
 * pour obtenir le PDF réel.
 */
function DocumentViewModal({ id, canSign = false, defaultName = "", onClose, onChanged }) {
  const [doc, setDoc] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [pdfError, setPdfError] = useState(null); // message si aperçu indisponible
  const [missing, setMissing] = useState(null);   // infos manquantes (jetons vides)
  const [status, setStatus] = useState(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    getDocument(id).then((r) => setDoc(r.data)).catch((e) => setStatus({ type: "error", message: e.message }));
  }, [id]);

  // Aperçu = rendu HTML du modèle rempli (affiché en ligne, sans lecteur PDF).
  useEffect(() => {
    documentPreviewHtml(id)
      .then((html) => setPreviewHtml(html))
      .catch((e) => { setPdfError(e.message); setMissing(e.missing || null); });
  }, [id]);

  // Ouvre le PDF réel dans un nouvel onglet (à la demande).
  async function openPdf() {
    setStatus(null);
    const w = window.open("", "_blank");
    try {
      const url = await documentPdfUrl(id);
      if (w) w.location.href = url; else window.open(url, "_blank");
    } catch (e) {
      if (w) w.close();
      setStatus({ type: "error", message: e.message });
      if (e.missing) setMissing(e.missing);
    }
  }

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

  // Lien de signature pour un signataire EXTERNE (tuteur, financeur…) — action du personnel.
  async function externalLink() {
    setStatus(null);
    try {
      const r = await createSignLink(id, { slot: "external", label: "Signature externe" });
      const url = `${window.location.origin}/signer/${r.data.token}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      setStatus({ type: "success", message: `Lien de signature externe copié : ${url}` });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
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
          {doc && doc.org_signable && (
            <div style={{ padding: "6px 14px", fontSize: 12, background: doc.org_signed ? "rgba(22,163,74,.08)" : "rgba(184,134,11,.10)", borderBottom: "1px solid var(--border-soft)" }}>
              {doc.org_signed
                ? <><b style={{ color: "#16a34a" }}><Icon name="check" size={13} style={{ verticalAlign: "text-bottom" }} /> Signé par l'organisme</b>{doc.org_signer_name ? ` (${doc.org_signer_name})` : ""}{doc.org_signed_at ? ` le ${new Date(doc.org_signed_at).toLocaleDateString("fr-FR")}` : ""}</>
                : <span style={{ color: "var(--amber, #b8860b)" }}><Icon name="pencil" size={13} style={{ verticalAlign: "text-bottom" }} /> L'organisme contresigne automatiquement <b>en dernier</b>, après les autres signataires (signature enregistrée requise).</span>}
            </div>
          )}
          {doc && doc.status === "SIGNE" && (
            <div style={{ padding: "8px 14px", fontSize: 12, background: "rgba(22,163,74,.10)", borderBottom: "1px solid rgba(22,163,74,.30)" }}>
              <b style={{ color: "#16a34a" }}><Icon name="check" size={13} style={{ verticalAlign: "text-bottom" }} /> Signé électroniquement</b> par <b>{doc.signer_name || "—"}</b>
              {doc.signed_at ? ` le ${new Date(doc.signed_at).toLocaleString("fr-FR")}` : ""}
              {doc.signer_ip ? ` · IP ${doc.signer_ip}` : ""}
              {doc.signed_hash && (
                <span style={{ display: "block", color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                  Empreinte SHA-256 : <span className="mono">{doc.signed_hash.slice(0, 40)}…</span> · PDF scellé (cachet de l'organisme, intégrité vérifiable)
                </span>
              )}
            </div>
          )}
          {previewHtml ? (
            <iframe srcDoc={previewHtml} title="Aperçu du document" className="doc-pdf-frame" sandbox="allow-same-origin" />
          ) : missing ? (
            <MissingPanel />
          ) : pdfError ? (
            <div style={{ padding: "16px 18px" }}>
              <div className="status err" style={{ marginBottom: 12 }}>Aperçu indisponible : {pdfError}</div>
              {/* Sans modèle, il n'y a rien à montrer — et surtout rien à inventer. Ce repli
                  affichait auparavant un document reconstitué par le code : on a pu voir une
                  convention de formation complète, déjà signée, sous un bandeau « Aucun
                  modèle ». Le contenu signé n'était alors fixé nulle part. */}
              {doc?.no_template ? (
                <div className="doc-sheet" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                  <Icon name="file-text" size={28} />
                  <p style={{ margin: "10px 0 4px", fontWeight: 700, color: "var(--text)" }}>
                    Ce document n'a pas encore de modèle.
                  </p>
                  <p className="hint" style={{ margin: 0 }}>
                    Son contenu doit être défini dans <b>Modèles de documents</b> avant de pouvoir être
                    affiché ou envoyé.
                  </p>
                </div>
              ) : doc ? (
                <div className="doc-sheet" dangerouslySetInnerHTML={{ __html: doc.html }} />
              ) : null}
            </div>
          ) : (
            <p className="hint" style={{ padding: 18 }}>Génération de l'aperçu…</p>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
          {!missing && (
            <button className="btn ghost sm" onClick={openPdf}><Icon name="link" size={14} /> Ouvrir le PDF</button>
          )}
          {doc && !missing && (
            <button className="btn" onClick={() => dl(downloadDocumentPdf(id, `${doc.title || "document"}.pdf`))}>PDF</button>
          )}
          {canSign && doc && doc.external_sign && doc.status !== "SIGNE" && !missing && (
            <button className="btn ghost sm" title="Copier un lien pour qu'un signataire externe signe" onClick={externalLink}>🔗 Lien externe</button>
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
