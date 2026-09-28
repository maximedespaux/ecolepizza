import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import { Field } from "./Field.jsx";
import { enregistrerSaisies } from "../api/apiClient.js";

const valeursDe = (zones) => Object.fromEntries(zones.map((z) => [z.cle, z.valeur || ""]));

/**
 * LES ZONES À REMPLIR AVANT DE SIGNER (demandé le 2026-09-28). L'attestation sur l'honneur porte des
 * pointillés que le stagiaire remplit lui-même — son entreprise, sa fonction, sa période : l'école
 * ne les connaît pas. Elles ne se remplissaient pas en ligne, et l'attestation se signait en blanc.
 *
 * DÉCIDÉ PAR L'ÉCOLE : le stagiaire les remplit, ou le bureau pour lui (au bureau, au téléphone) ;
 * TOUTES sont obligatoires — le bouton « Signer » n'apparaît qu'une fois remplies, et le serveur
 * refuse une signature avec un blanc ; signé, le document les fige.
 *
 * LE FORMULAIRE ENTIER PART à chaque enregistrement (le serveur remplace les réponses) ; le document,
 * relu, relance l'aperçu, qui montre les réponses À LEUR PLACE — on voit ce qu'on va signer.
 */
export default function ZonesARemplir({ documentId, zones, pourLeStagiaire = false, onEnregistre }) {
  const [valeurs, setValeurs] = useState(() => valeursDe(zones));
  // Le document relu après un enregistrement apporte les réponses du serveur : elles font foi.
  useEffect(() => setValeurs(valeursDe(zones)), [zones]);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const modifie = zones.some((z) => (valeurs[z.cle] || "") !== (z.valeur || ""));
  const restent = zones.filter((z) => !String(valeurs[z.cle] || "").trim()).length;

  async function enregistrer(e) {
    e.preventDefault();
    setBusy(true); setErreur(null);
    try {
      await enregistrerSaisies(documentId, valeurs);
      await onEnregistre?.();
    } catch (err) { setErreur(err.message); }
    finally { setBusy(false); }
  }

  return (
    <form className="doc-questions doc-zones" onSubmit={enregistrer}>
      <p className="doc-questions-intro">
        <Icon name="pencil" size={15} aria-hidden="true" />
        <span>
          <b>Avant de signer&nbsp;:</b>{" "}
          {pourLeStagiaire ? "complétez, pour le stagiaire, " : "complétez "}
          {zones.length > 1 ? `les ${zones.length} informations que ce document imprime.` : "l'information que ce document imprime."}
          {" "}Elles ne pourront plus changer une fois le document signé.
        </span>
      </p>
      <div className="doc-zones-champs">
        {zones.map((z) => (
          <Field key={z.cle} label={z.libelle} requis
            type={z.type === "date" ? "date" : "text"}
            maxLength={z.type === "date" ? undefined : 200}
            value={valeurs[z.cle] || ""}
            onChange={(e) => setValeurs((v) => ({ ...v, [z.cle]: e.target.value }))} />
        ))}
      </div>
      {erreur && <p className="consent-erreur" role="alert">{erreur}</p>}
      <div className="doc-zones-pied">
        <button type="submit" className="btn primary" disabled={busy || !modifie}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <span className="hint" role="status">
          {modifie ? "Enregistrez pour voir vos réponses dans le document."
            : restent ? `${restent} à remplir avant de pouvoir signer.`
            : "Tout est rempli : le document peut être signé."}
        </span>
      </div>
    </form>
  );
}
