import { useContext } from "react";
import { NavLink } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { NAV, canOpen } from "../lib/nav.js";
import { Icon } from "./Icon.jsx";

/**
 * BARRE DE NAVIGATION DU BAS — téléphone seulement (affichée/masquée par la CSS `.botnav`,
 * ≤ 640 px). Sur un petit écran, le menu complet est un tiroir qu'il faut ouvrir d'abord ; cette
 * barre met les quelques rubriques les plus fréquentes directement sous le pouce, plus un bouton
 * « Menu » qui ouvre le tiroir pour tout le reste.
 *
 * Les libellés et icônes viennent de `NAV` (une seule source), et l'accès est filtré par la MÊME
 * règle que la barre latérale (`canOpen`) : une rubrique interdite n'apparaît pas ici non plus.
 * On garde les quatre premières rubriques DISPONIBLES de la liste de priorité ci-dessous — un
 * libellé court pour chacune, la place étant comptée.
 */
const PRIORITE = [
  { to: "/dashboard", court: "Accueil" },
  { to: "/stagiaires", court: "Stagiaires" },
  { to: "/sessions", court: "Sessions" },
  { to: "/suivi", court: "Suivi" },
  // Replis, si l'une des précédentes est hors d'accès pour ce rôle :
  { to: "/entreprises", court: "Entreprises" },
  { to: "/ventes", court: "Ventes" },
];

export default function BottomNav({ onMenu }) {
  const { user } = useContext(UserContext);
  const tous = NAV.flatMap((g) => g.items);
  const liens = PRIORITE
    .map((p) => ({ ...p, item: tous.find((it) => it.to === p.to) }))
    .filter((p) => p.item && canOpen(user, p.item))
    .slice(0, 4);
  // Aucune rubrique disponible (cas théorique) : pas de barre, mais le bouton Menu reste utile.
  return (
    <nav className="botnav" aria-label="Navigation rapide">
      {liens.map((p) => (
        <NavLink key={p.to} to={p.to} className={({ isActive }) => "botnav-l" + (isActive ? " on" : "")}>
          <Icon name={p.item.ic} size={21} />
          <span>{p.court}</span>
        </NavLink>
      ))}
      <button type="button" className="botnav-l botnav-menu" onClick={onMenu} aria-label="Ouvrir le menu complet">
        <Icon name="menu" size={21} />
        <span>Menu</span>
      </button>
    </nav>
  );
}
