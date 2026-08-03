import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon.jsx";

/**
 * LE BANDEAU D'INFORMATION, à la première connexion.
 *
 * CE QU'IL N'EST PAS, et la distinction est tout le sujet : ce n'est PAS un bandeau de
 * consentement. Il ne propose ni « accepter » ni « refuser », parce qu'il n'y a rien à consentir.
 * Tout ce que l'application dépose est strictement nécessaire au service demandé, donc exempté
 * (art. 82 de la loi Informatique et Libertés) ; demander un accord qui n'a pas lieu d'être
 * habituerait à cliquer sans lire, exactement ce que le consentement est censé empêcher.
 *
 * L'exemption dispense du consentement, JAMAIS de l'information. Ce bandeau est cette information,
 * et son unique bouton dit ce qu'il fait : « J'ai compris ». Il ne débloque rien, il acquitte.
 *
 * DEUX RÉGIMES, ET IL NE FAUT PAS LES CONFONDRE. Ce qui est déposé sur l'APPAREIL est exempté :
 * rien à accepter. La transmission des coordonnées AUX PARTENAIRES, elle, exige un accord, qu'un
 * stagiaire peut refuser et retirer (cf. `ConsentModal`). Le bandeau doit donc se garder de
 * surpromettre : dire « aucun service tiers » se comprendrait comme « rien n'est partagé avec
 * personne », ce qui serait faux. Il nomme le choix séparé au lieu de le passer sous silence.
 *
 * APRÈS LA CONNEXION, ET NON SUR L'ÉCRAN DE CONNEXION. Un bandeau posé sur le formulaire de
 * connexion se lit au moment où l'on cherche à entrer : personne ne le lit, tout le monde le
 * chasse. Une fois entré, l'attention est disponible. La page reste par ailleurs accessible
 * AVANT connexion par le lien de l'écran de login, pour qui veut savoir avant de se créer un
 * compte : les deux chemins ne se remplacent pas.
 *
 * IL NE REVIENT PAS. Une information acquittée n'a pas à être répétée à chaque visite, et un
 * bandeau qui revient sans fin devient un obstacle qu'on apprend à ignorer.
 */
const CLE = "impasto.bandeauConfidentialite";

const dejaVu = () => {
  try { return localStorage.getItem(CLE) === "1"; } catch { return true; }
};

export default function BandeauConfidentialite() {
  const [masque, setMasque] = useState(dejaVu);
  if (masque) return null;

  const acquitter = () => {
    try { localStorage.setItem(CLE, "1"); } catch { /* navigation privée : il reviendra, sans casser */ }
    setMasque(true);
  };

  return (
    <div className="bandeau-conf" role="region" aria-label="Information sur les données">
      <Icon name="shield" size={17} />
      {/* NE PAS SURPROMETTRE. « Aucun service tiers » est vrai de ce qui est déposé sur
          l'appareil, et un lecteur le comprendrait comme « rien n'est partagé avec personne ».
          Or la transmission aux partenaires existe. Elle relève d'un AUTRE régime, avec un vrai
          choix à faire, et le bandeau doit le dire plutôt que de laisser croire l'inverse. */}
      <p>
        Sur votre appareil, cette application n'enregistre que le nécessaire à son fonctionnement :
        session, panier, préférences d'affichage. <b>Aucun traceur publicitaire.</b> Le partage de
        vos coordonnées avec les partenaires de l'école est, lui, un <b>choix séparé</b> que vous
        pouvez refuser ou retirer quand vous voulez.{" "}
        <Link to="/confidentialite">Voir le détail</Link>
      </p>
      {/* UN SEUL BOUTON, et son libellé dit la vérité : il acquitte une information, il n'accorde
          rien. « Accepter » laisserait croire qu'un refus était possible, donc qu'on a consenti. */}
      <button className="btn primary sm" onClick={acquitter}>J'ai compris</button>
    </div>
  );
}
