import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import SignatureModal from "./SignatureModal.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { SelectField } from "./Field.jsx";
import { resignEmargement } from "../api/apiClient.js";

const SLOT_SHORT = { MATIN: "Matin", APRES_MIDI: "Après-m.", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };
const libelleDemiJournee = (s) => `${s.date.slice(8, 10)}/${s.date.slice(5, 7)} ${SLOT_SHORT[s.slot] || ""}`.trim();

/**
 * REDEMANDER UNE SIGNATURE DE STAGIAIRE RATÉE (blanche) — demandé par l'école le 2026-11-25.
 *
 * Une signature de stagiaire ne se remplace pas (décidé le 2026-09-26). EXCEPTION assumée : un pad
 * validé À VIDE n'est pas une signature. On choisit QUI et QUELLE demi-journée SIGNÉE est à refaire,
 * puis le stagiaire RESIGNE sur ce poste — la nouvelle signature écrase la blanche (serveur :
 * attendance.controller `resignPresence`, tracé au journal). Seules les demi-journées DÉJÀ signées
 * sont proposées : on ne « redemande » que ce qui existe (pour une case jamais signée, c'est le
 * rattrapage, « Rattraper »).
 *
 * Rendue dans `document.body`, comme RattrapageModal : elle s'ouvre depuis la grille, à l'intérieur
 * d'une carte qui se translate au survol (cf. le commentaire de SignatureModal).
 */
function RedemanderSignatureModal({ learners, sheets, byKey, onDone, onClose }) {
  // Pour chaque stagiaire, ses demi-journées DÉJÀ signées (les seules candidates à une resignature).
  const parStagiaire = useMemo(() => {
    const m = new Map();
    for (const l of learners) {
      const signees = sheets.filter((s) => byKey[`${l.id}|${s.id}`]?.has_signature);
      if (signees.length) m.set(l.id, signees);
    }
    return m;
  }, [learners, sheets, byKey]);

  const stagiaires = useMemo(() => learners.filter((l) => parStagiaire.has(l.id)), [learners, parStagiaire]);
  const [learnerId, setLearnerId] = useState(stagiaires[0]?.id || "");
  const signees = parStagiaire.get(learnerId) || [];
  const [sheetId, setSheetId] = useState(signees[0]?.id || "");
  const [signer, setSigner] = useState(false); // la fenêtre de signature du stagiaire est ouverte
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Changer de stagiaire recale la demi-journée sur sa première signée (sinon un sheetId d'un autre).
  function choisirStagiaire(id) {
    setLearnerId(id);
    const s = parStagiaire.get(id) || [];
    setSheetId(s[0]?.id || "");
  }

  const stagiaire = stagiaires.find((l) => l.id === learnerId);
  const nomStagiaire = stagiaire ? `${stagiaire.last_name || ""} ${stagiaire.first_name || ""}`.trim() : "";
  const sheet = signees.find((s) => s.id === sheetId);
  const rec = sheet ? byKey[`${learnerId}|${sheet.id}`] : null;
  const valide = Boolean(rec);

  async function envoyer(signature_data) {
    setBusy(true);
    setErreur(null);
    try {
      const r = await resignEmargement(rec.id, { signature_data });
      onDone(r.message || "Signature refaite.");
    } catch (e) {
      setErreur(e.message);
      setSigner(false);
    } finally {
      setBusy(false);
    }
  }

  if (signer && rec) {
    return (
      <SignatureModal
        doc={{ label: `émargement de ${nomStagiaire}, ${libelleDemiJournee(sheet)}` }}
        defaultName={nomStagiaire}
        onConfirm={({ signature_data }) => envoyer(signature_data)}
        onClose={() => setSigner(false)}
      />
    );
  }

  return createPortal(
    <div className="overlay">
      <div className="modal">
        <div className="mhead">
          <h3 style={{ fontSize: 17 }}>Redemander une signature</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          {stagiaires.length === 0 ? (
            <p className="hint" style={{ marginTop: 0 }}>
              Aucune signature de stagiaire à refaire : aucune demi-journée n'est encore signée.
            </p>
          ) : (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                À utiliser quand une signature est <b>blanche</b> (pad validé à vide). La signature choisie sera
                <b> effacée</b>, et le stagiaire resigne sur ce poste tout de suite.
              </p>
              <SelectField label="Stagiaire" value={learnerId} onChange={(e) => choisirStagiaire(e.target.value)}>
                {stagiaires.map((l) => <option key={l.id} value={l.id}>{l.last_name} {l.first_name}</option>)}
              </SelectField>
              <SelectField label="Demi-journée signée" value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
                {signees.map((s) => <option key={s.id} value={s.id}>{libelleDemiJournee(s)}</option>)}
              </SelectField>
              <StatusMessage status={erreur ? { type: "error", message: erreur } : null} />
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={!valide || busy} onClick={() => setSigner(true)}>
            Faire resigner sur ce poste
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default RedemanderSignatureModal;
