import { useState } from "react";
import PageHead from "../components/PageHead.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Groupe } from "./Mailing.jsx";

/**
 * ÉCRIRE À UN GROUPE — un e-mail, une fois, à des stagiaires ou des entreprises choisis.
 *
 * C'est l'acte COMMERCIAL du mailing (une relance, une annonce) : rangé en « Commercial », à côté
 * du pipeline, et non dans les RÉGLAGES. Le reste du mailing — les envois automatiques, leurs
 * textes, les envois programmés, la signature — reste un réglage de l'organisme (Paramètres →
 * Mailing).
 *
 * Le composant `Groupe` vit dans pages/Mailing.jsx, où il partage la barre d'insertion, l'aperçu et
 * la recherche de cible avec les textes et les règles programmées ; cette page n'en est que
 * l'enveloppe (en-tête, bandeau d'état).
 */
export default function EcrireGroupe() {
  const [status, setStatus] = useState(null);
  return (
    <>
      <PageHead eyebrow="Commercial" title="Écrire à un groupe"
        lead="Un message, une fois, à des stagiaires ou des entreprises choisis. Pour les e-mails automatiques, leurs textes et la signature, voir Paramètres → Mailing." />
      <StatusMessage status={status} />
      <Groupe onStatus={setStatus} />
    </>
  );
}
