import { useState } from "react";
import { createPortal } from "react-dom";
import SignatureModal from "./SignatureModal.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { Field, SelectField } from "./Field.jsx";
import { rattraperEmargement } from "../api/apiClient.js";

/* Les motifs les plus courants, d'un clic ; « Autre » demande de l'écrire. Courts : le motif
   s'imprime dans une case d'une quinzaine de millimètres. */
const MOTIFS = ["Oubli de signature", "Sans téléphone ni appareil", "Problème technique", "Arrivée après la reprise", "Autre"];
const MAX = 120; // la colonne `rattrapage_motif` (migration 184), et la place dans la case

/**
 * LE RATTRAPAGE D'UNE DEMI-JOURNÉE PAR L'ÉCOLE — décidé le 2026-09-26 : le stagiaire ne signe plus
 * que PENDANT la demi-journée ; une demi-journée manquée s'enregistre ici, avec un MOTIF qui
 * s'imprime dans la case de la feuille d'émargement, avec le nom de qui l'enregistre.
 *
 * Le stagiaire est là (le lendemain matin, ou sans téléphone) : il signe sur ce poste — la fenêtre
 * de signature habituelle s'ouvre, avec son nom. Sinon, la présence est attestée sans signature.
 *
 * RENDUE DANS `document.body`, comme SignatureModal : elle s'ouvre depuis la grille, à l'intérieur
 * d'une carte qui se translate au survol (cf. le commentaire de SignatureModal).
 */
function RattrapageModal({ record, stagiaire, demiJournee, onDone, onClose }) {
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [precision, setPrecision] = useState("");
  const [signeIci, setSigneIci] = useState(true);
  const [signer, setSigner] = useState(false); // la fenêtre de signature du stagiaire est ouverte
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  const texte = (motif === "Autre" ? precision.trim() : [motif, precision.trim()].filter(Boolean).join(" · ")).slice(0, MAX);
  const valide = texte.length > 0;

  async function envoyer(signature_data = null) {
    setBusy(true);
    setErreur(null);
    try {
      const r = await rattraperEmargement(record.id, { motif: texte, signature_data });
      onDone(r.message || "Présence enregistrée.");
    } catch (e) {
      setErreur(e.message);
      setSigner(false);
    } finally {
      setBusy(false);
    }
  }

  if (signer) {
    return (
      <SignatureModal
        doc={{ label: `émargement de ${stagiaire}, ${demiJournee}` }}
        defaultName={stagiaire}
        onConfirm={({ signature_data }) => envoyer(signature_data)}
        onClose={() => setSigner(false)}
      />
    );
  }

  return createPortal(
    <div className="overlay">
      <div className="modal">
        <div className="mhead">
          <h3 style={{ fontSize: 17 }}>Rattraper, {demiJournee}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <p className="hint" style={{ marginTop: 0 }}>
            <b>{stagiaire}</b> n'a pas signé cette demi-journée. Le motif et votre nom s'imprimeront dans sa case,
            sur la feuille d'émargement.
          </p>
          <SelectField label="Motif" value={motif} onChange={(e) => setMotif(e.target.value)}>
            {MOTIFS.map((m) => <option key={m} value={m}>{m}</option>)}
          </SelectField>
          <Field label={motif === "Autre" ? "Motif, en quelques mots" : "Précision (facultatif)"} value={precision} maxLength={MAX}
            onChange={(e) => setPrecision(e.target.value)} placeholder={motif === "Autre" ? "Ex. : rendez-vous médical justifié" : ""} />
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "var(--muted)" }}>
            <input type="checkbox" checked={signeIci} onChange={(e) => setSigneIci(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Le stagiaire est là : il signe sur ce poste. Sinon, sa présence est attestée sans signature.</span>
          </label>
          <StatusMessage status={erreur ? { type: "error", message: erreur } : null} />
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={!valide || busy} onClick={() => (signeIci ? setSigner(true) : envoyer(null))}>
            {busy ? "Enregistrement…" : signeIci ? "Faire signer le stagiaire" : "Attester la présence"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default RattrapageModal;
