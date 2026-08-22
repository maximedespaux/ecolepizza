import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { EspaceContext } from "../context/EspaceContext.jsx";
import { Icon } from "./Icon.jsx";

/**
 * Bascule « Backoffice ⇄ Mon espace stagiaire » pour un compte qui est LES DEUX.
 *
 * Invisible sinon (`canBeStudent` faux) : un vrai stagiaire, ou un membre du bureau sans fiche, ne
 * le voit jamais. La navigation est explicite (le backoffice n'a pas de route /mon-espace, et
 * inversement) : on renvoie vers la page d'accueil de l'espace choisi.
 */
export default function SpaceSwitcher() {
  const { viewAs, setViewAs, canBeStudent } = useContext(EspaceContext);
  const navigate = useNavigate();
  if (!canBeStudent) return null;
  const versStagiaire = viewAs !== "stagiaire";
  return (
    <button
      type="button"
      className="btn sm ghost"
      title={versStagiaire ? "Passer à mon espace stagiaire" : "Revenir au backoffice"}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
      onClick={() => {
        const v = versStagiaire ? "stagiaire" : "backoffice";
        setViewAs(v);
        navigate(v === "stagiaire" ? "/mon-espace" : "/dashboard");
      }}
    >
      <Icon name={versStagiaire ? "graduation" : "building"} size={15} />
      {versStagiaire ? "Espace stagiaire" : "Backoffice"}
    </button>
  );
}
