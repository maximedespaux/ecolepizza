import { Icon } from "./Icon.jsx";
import { COEURS_MAX, restants } from "../lib/coeurs.js";

/**
 * La rangée de cœurs d'une partie d'arcade.
 *
 * LES CŒURS PERDUS RESTENT AFFICHÉS, en creux. Ne montrer que ceux qui restent ferait fondre la
 * rangée sans qu'on sache combien il y en avait au départ : « il m'en reste deux » ne veut rien
 * dire si le maximum n'est pas sous les yeux. Trois emplacements, toujours les trois.
 *
 * LE DERNIER CŒUR SE SIGNALE. À un seul restant, il bat — c'est le moment où l'information
 * change de nature : ce n'est plus un score, c'est un avertissement, et dans un jeu chronométré
 * on ne lit pas une rangée d'icônes, on la voit du coin de l'œil.
 *
 * `aria-label` porte le compte en toutes lettres : la couleur et le remplissage sont les deux
 * seuls signaux visuels, et aucun des deux ne se lit à la voix.
 */
export default function Coeurs({ perdus = 0 }) {
  const reste = restants(perdus);
  return (
    <span className={"jeu-coeurs" + (reste === 1 ? " dernier" : "")}
      aria-label={`${reste} cœur${reste > 1 ? "s" : ""} sur ${COEURS_MAX}`}>
      {Array.from({ length: COEURS_MAX }, (_, i) => (
        <Icon key={i} name="heart" size={15}
          fill={i < reste ? "currentColor" : "none"}
          className={i < reste ? "on" : "off"} />
      ))}
    </span>
  );
}
