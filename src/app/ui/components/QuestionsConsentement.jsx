import { useState } from "react";
import { Icon } from "./Icon.jsx";
import { setMyConsent } from "../api/apiClient.js";

/**
 * LES QUESTIONS QU'UN DOCUMENT IMPRIME, POSÉES AVANT SA SIGNATURE (demandé le 2026-09-22).
 *
 * Le document « Droit à l'image » imprime la réponse du stagiaire, photos et partenaires, dans ses
 * cases. Elles ne se cochaient pas en ligne : le PDF signé ne disait pas ce qu'il avait choisi.
 * Tant que la réponse manque, les cases restent vides et le serveur refuse la signature — c'est
 * donc ici qu'elle se donne, sur le document même, avant d'en voir l'aperçu coché.
 *
 * LES RÈGLES DE LA FENÊTRE DE L'ESPACE (ConsentModal) VALENT ICI. La phrase affichée est celle que
 * le registre figera avec la réponse. Les deux boutons ont le même poids : un « J'accepte » en
 * couleur face à un « Je refuse » pâle serait un choix guidé, et un choix guidé n'est pas libre.
 * La réponse se change ensuite depuis le profil ; le document signé garde celle du jour.
 *
 * UNE QUESTION À LA FOIS : la suivante arrive avec l'aperçu remis à jour, qui montre la case que la
 * première vient de cocher.
 */
export default function QuestionsConsentement({ questions, onRepondu }) {
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  if (!questions?.length) return null;
  const q = questions[0];

  async function repondre(accorde) {
    setBusy(true); setErreur(null);
    try {
      await setMyConsent(q.cle, accorde);
      await onRepondu?.();
    } catch (e) { setErreur(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="doc-questions" aria-labelledby={`doc-question-${q.cle}`}>
      <p className="doc-questions-intro">
        <Icon name="shield" size={15} aria-hidden="true" />
        <span>
          <b>Avant de signer&nbsp;:</b> ce document imprime votre réponse
          {questions.length > 1 ? ` à ${questions.length} questions.` : "."}
        </span>
      </p>
      <h4 id={`doc-question-${q.cle}`}>{q.titre}</h4>
      <p className="consent-texte">{q.formulation}</p>
      <div className="consent-dest">
        <b>{q.titreDestinataires || "Qui recevra ces informations"}</b>
        <span>{q.destinataires}</span>
      </div>
      {erreur && <p className="consent-erreur" role="alert">{erreur}</p>}
      <div className="consent-foot">
        <button type="button" className="btn consent-choix" disabled={busy} onClick={() => repondre(false)}>Je refuse</button>
        <button type="button" className="btn consent-choix" disabled={busy} onClick={() => repondre(true)}>J'accepte</button>
      </div>
      <p className="hint doc-questions-pied">
        Votre réponse est enregistrée avec sa date. Vous pourrez en changer depuis <b>Mon profil → Confidentialité</b>.
      </p>
    </section>
  );
}
