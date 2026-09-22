import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.jsx";
import { getMyConsents, setMyConsent } from "../api/apiClient.js";
import { dateHeure } from "../lib/format.js";

/**
 * LA DEMANDE DE CONSENTEMENT — posée une fois, et une seule.
 *
 * UN REFUS NE SE REDEMANDE PAS, et c'est la règle qui structure tout ce composant. Reposer la
 * question à chaque connexion à quelqu'un qui a dit non le pousse à accepter pour avoir la paix :
 * le consentement cesse d'être « libre » au sens de l'article 4(11), et un consentement arraché ne
 * couvre RIEN. On se retrouve alors à transmettre des données en se croyant protégé, ce qui est
 * pire que de n'avoir rien demandé. La CNIL demande explicitement qu'un refus soit mémorisé.
 *
 * Ce qui déclenche la fenêtre est donc uniquement `accorde === null` — « jamais demandé ». Ni un
 * oui, ni un non ne la rouvrent ; le profil est le seul chemin pour changer d'avis, dans les deux
 * sens (art. 7.3 : se rétracter doit être aussi simple que d'accepter).
 *
 * FERMER SANS RÉPONDRE N'EST PAS UN REFUS. Rien n'est écrit, et la question revient — sinon on
 * enregistrerait un « non » que personne n'a prononcé. Mais pas indéfiniment : après trois
 * présentations sans réponse, on cesse de la poser. Sans cette borne, l'insistance produirait
 * exactement le consentement extorqué qu'on cherche à éviter.
 *
 * LES DEUX RÉPONSES ONT LE MÊME POIDS VISUEL. Un « J'accepte » en couleur pleine face à un
 * « Je refuse » en gris pâle est un choix guidé, et un choix guidé n'est pas libre. Le refus doit
 * être aussi facile à cliquer que l'accord.
 */
const MAX_RELANCES = 3;

/* UN COMPTEUR PAR QUESTION (2026-09-22, avec le droit à l'image). Un compteur unique aurait fait
   taire la question des photos chez quiconque avait fermé trois fois celle des partenaires — une
   question qu'on ne lui avait pourtant jamais posée. Les partenaires gardent la clé d'origine : les
   compteurs déjà posés restent justes. */
const CLE_RELANCES_DE = (cle) => `impasto.consent.relances${cle === "partenaires" ? "" : "." + cle}`;

const relances = (cle) => {
  try { return Number(localStorage.getItem(CLE_RELANCES_DE(cle))) || 0; } catch { return 0; }
};
const compterUneRelance = (cle) => {
  try { localStorage.setItem(CLE_RELANCES_DE(cle), String(relances(cle) + 1)); } catch { /* ignore */ }
};

/**
 * LA PROCHAINE QUESTION À POSER, parmi celles qu'on n'a ni déjà répondues dans cette fenêtre, ni
 * cessé de poser.
 *
 * DEUX DÉCLENCHEURS, CHACUN SOUS SON COMPTEUR DE RELANCES.
 *  · JAMAIS DEMANDÉ (`accorde === null`) — la première fenêtre.
 *  · LISTE ÉLARGIE (`ajoutes.length`) — l'école transmet désormais des informations que cette
 *    personne-là n'a pas vues quand elle a répondu. Son accord ne les couvre pas : tant qu'elle n'a
 *    pas revu la question, ces colonnes sortent VIDES de l'export.
 * Un REFUS ne déclenche ni l'un ni l'autre : le serveur ne remonte `ajoutes` que pour un accord
 * (art. 4(11) — reposer la question à qui a dit non le pousse à accepter pour avoir la paix).
 * Élargir la liste ne rouvre donc pas un dossier clos.
 */
function prochaine(toutes, repondues = []) {
  const liste = toutes.filter((f) => !repondues.includes(f.cle) && relances(f.cle) < MAX_RELANCES);
  return liste.find((f) => f.accorde === null) || liste.find((f) => f.ajoutes?.length) || null;
}

export default function ConsentModal() {
  const [aDemander, setADemander] = useState(null);   // la finalité à poser, ou null
  const [toutes, setToutes] = useState([]);           // l'état de chaque finalité, pour enchaîner
  const [repondues, setRepondues] = useState([]);     // celles répondues dans cette fenêtre
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    getMyConsents().then((r) => {
      // `null` : migration non jouée, ou compte sans fiche stagiaire. Rien à demander.
      const liste = r?.data;
      if (!Array.isArray(liste)) return;
      setToutes(liste);
      const premiere = prochaine(liste);
      if (premiere) { setADemander(premiere); compterUneRelance(premiere.cle); }
    }).catch(() => { /* silencieux : une demande de consentement ne doit pas casser l'écran */ });
  }, []);

  if (!aDemander) return null;

  const maj = aDemander.accorde === true && aDemander.ajoutes?.length > 0;

  /* DEUX QUESTIONS SE SUIVENT DANS LA MÊME FENÊTRE (partenaires, puis photos) : répondre à la
     première présente la seconde, au lieu de la renvoyer à la prochaine connexion — où elle
     reviendrait par surprise, déjà comptée comme une relance. Fermer arrête tout, sans rien écrire. */
  const repondre = async (accorde, conserver) => {
    setBusy(true); setErreur(null);
    try {
      await setMyConsent(aDemander.cle, accorde, conserver);
      const faites = [...repondues, aDemander.cle];
      const suivante = prochaine(toutes, faites);
      setRepondues(faites);
      if (suivante) compterUneRelance(suivante.cle);
      setADemander(suivante);
      setBusy(false);
    } catch (e) { setErreur(e.message); setBusy(false); }
  };

  return createPortal(
    <div className="overlay">
      <div className="modal consent-modal">
        <div className="mhead">
          <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="shield" size={17} /> {maj ? "Votre accord doit être mis à jour" : aDemander.titre}
          </h3>
          {/* La croix ferme SANS RIEN ÉCRIRE : ne pas répondre n'est pas refuser. */}
          <button className="x" onClick={() => setADemander(null)} aria-label="Fermer sans répondre">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="mbody">
          {/* CE QUI A CHANGÉ, EN PREMIER ET NOMMÉ. Reposer la question sans dire ce qui s'est
              ajouté obligerait à relire deux paragraphes pour trouver le mot nouveau — et
              personne ne le fait. La liste des ajouts est la seule information vraiment neuve. */}
          {maj && (
            <div className="consent-maj">
              <b><Icon name="alert-triangle" size={13} /> Ce qui s'ajoute à votre accord</b>
              <ul>{aDemander.ajoutes.map((c) => <li key={c}>{c.replace(/_/g, " ")}</li>)}</ul>
              <span className="hint">
                Vous aviez accepté le {dateHeure(aDemander.decide_at)}. Ces informations-là ne faisaient pas
                partie de ce que vous aviez lu.
              </span>
            </div>
          )}
          <p className="consent-texte">{aDemander.formulation}</p>

          <div className="consent-dest">
            {/* « Qui recevra ces informations » pour des partenaires, « Où ces photos peuvent
                paraître » pour des photos : c'est le serveur qui le dit, avec la question. */}
            <b>{aDemander.titreDestinataires || "Qui recevra ces informations"}</b>
            <span>{aDemander.destinataires}</span>
          </div>

          <p className="hint" style={{ marginBottom: 0 }}>
            Votre réponse est enregistrée avec sa date. Vous pouvez en changer quand vous le
            souhaitez depuis <b>Mon profil → Confidentialité</b>, dans un sens comme dans l'autre.
          </p>

          {erreur && <p className="consent-erreur">{erreur}</p>}
        </div>
        <div className="mfoot consent-foot">
          {/* MÊME POIDS VISUEL pour les deux réponses : un choix guidé n'est pas libre.
              EN MISE À JOUR, LE SECOND BOUTON N'EST PAS UN REFUS, et son libellé le dit. « Je
              refuse » aurait laissé croire qu'on retire tout son accord — alors qu'on garde
              exactement ce qu'on avait accepté. C'est aussi ce que le serveur enregistre : un
              consentement maintenu sur son périmètre d'origine, pas une opposition. */}
          <button className="btn consent-choix" disabled={busy}
            onClick={() => (maj ? repondre(true, true) : repondre(false))}>
            {maj ? "Conserver mon accord actuel" : "Je refuse"}
          </button>
          <button className="btn consent-choix" disabled={busy} onClick={() => repondre(true)}>
            {maj ? "Accepter la nouvelle version" : "J'accepte"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
