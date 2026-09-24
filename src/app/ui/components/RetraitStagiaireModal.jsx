import { useEffect, useState } from "react";
import { getRetraitDossier } from "../api/apiClient.js";

/**
 * RETIRER UN STAGIAIRE D'UNE SESSION : la fenêtre montre ce qui part et ce qui reste AVANT d'agir.
 *
 * La corbeille supprimait le dossier d'un clic, sans rien dire de ce qu'il emportait. Le plan vient du
 * serveur (lib/retraitDossier.js), trié par la règle même qui exécutera le retrait : l'écran ne peut pas
 * annoncer autre chose que ce qui sera fait. Deux gestes : « Retirer seulement » (documents gardés,
 * détachés de la formation) ou « Retirer et effacer » (documents NON signés et réponses QCM en plus).
 * Rien de signé, aucun émargement, aucune facture n'est jamais effacé.
 */
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

function RetraitStagiaireModal({ enrollmentId, name, onClose, onConfirm }) {
  const [plan, setPlan] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    getRetraitDossier(enrollmentId).then((r) => setPlan(r.data)).catch((e) => setErreur(e.message));
  }, [enrollmentId]);

  async function valider(effacer) {
    setEnvoi(true);
    try { await onConfirm(effacer); } finally { setEnvoi(false); }
  }

  const t = plan?.toujours_supprimes || {};
  const toujours = [
    [t.pieces, "pièce déposée", "pièces déposées"],
    [t.notes, "note de suivi", "notes de suivi"],
    [t.notes_evaluation, "note d'évaluation", "notes d'évaluation"],
    [t.verdicts, "verdict du jury", "verdicts du jury"],
    [t.remises, "remise", "remises"],
    [t.presences, "présence émargée", "présences émargées"],
  ].filter(([n]) => n > 0).map(([n, un, plusieurs]) => pluriel(n, un, plusieurs));
  const effacables = plan?.documents?.effacables || [];
  const gardes = plan?.documents?.gardes || [];
  const reponses = plan?.reponses_qcm || 0;
  const rienAEffacer = effacables.length === 0 && reponses === 0;

  return (
    <div className="overlay">
      <div className="modal">
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Retirer {name} de la session</h3>
          <button className="x" onClick={onClose} aria-label="Fermer" disabled={envoi}>×</button>
        </div>
        <div className="mbody">
          {erreur && <p className="hint" style={{ color: "var(--red)", margin: 0 }}>{erreur}</p>}
          {!plan && !erreur && <p className="hint" style={{ margin: 0 }}>Lecture du dossier…</p>}
          {plan && (
            <>
              <p style={{ marginTop: 0 }}>
                <b>Supprimé avec le dossier, dans tous les cas :</b>{" "}
                {toujours.length ? `${toujours.join(", ")}.` : "rien d'autre que le dossier lui-même."}
              </p>
              <p>
                <b>Toujours conservé :</b> factures et avoirs, feuilles d'émargement archivées
                {gardes.length ? ", et ces documents :" : "."}
              </p>
              {gardes.length > 0 && (
                <ul style={{ marginTop: 0 }}>
                  {gardes.map((d) => <li key={d.id}>{d.title} <span className="hint">({d.raison})</span></li>)}
                </ul>
              )}
              <p>
                <b>Retirer et effacer</b>{" "}
                {rienAEffacer ? "n'aurait rien de plus à supprimer : aucun document non signé ni réponse QCM dans ce dossier." : (
                  <>
                    supprime en plus{" "}
                    {effacables.length ? pluriel(effacables.length, "document non signé", "documents non signés") : "aucun document"}
                    {reponses ? ` et ${pluriel(reponses, "réponse QCM", "réponses QCM")}` : ""}
                    {effacables.length ? " :" : "."}
                  </>
                )}
              </p>
              {effacables.length > 0 && (
                <ul style={{ marginTop: 0 }}>{effacables.map((d) => <li key={d.id}>{d.title}</li>)}</ul>
              )}
              <p className="hint" style={{ marginBottom: 0 }}>
                Retirer seulement : ses documents restent sur sa fiche, détachés de la formation, et ses
                réponses QCM restent dans Résultats QCM.
              </p>
            </>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose} disabled={envoi}>Annuler</button>
          <button className="btn" onClick={() => valider(false)} disabled={!plan || envoi}>Retirer seulement</button>
          <button className="btn danger" onClick={() => valider(true)} disabled={!plan || envoi || rienAEffacer}>Retirer et effacer</button>
        </div>
      </div>
    </div>
  );
}

export default RetraitStagiaireModal;
