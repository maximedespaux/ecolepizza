import { cadreClass } from "../lib/cadres.js";

/**
 * Avatar entouré de son cadre de parcours.
 *
 * Un seul composant pour tous les endroits où un stagiaire se montre (barre, profil,
 * Communauté) : sans lui, le cadre serait à recoder à chaque emplacement et finirait par
 * diverger.
 *
 * `size` pilote tout par une variable CSS — l'épaisseur du cadre et le halo doivent suivre le
 * diamètre, sinon un cadre calibré pour 44 px écrase un avatar de 28 px.
 */
export default function AvatarCadre({ avatar, initiales, cadre, size = 44, title, onClick }) {
  const cls = cadreClass(cadre);
  const Balise = onClick ? "button" : "span";
  return (
    <Balise
      type={onClick ? "button" : undefined}
      className={`av-wrap ${cls}`}
      style={{ "--av": `${size}px` }}
      title={title}
      onClick={onClick}
    >
      <span className="av-face" style={avatar ? { background: avatar.color } : undefined}>
        {avatar ? <span aria-hidden="true">{avatar.emoji}</span> : initiales}
      </span>
    </Balise>
  );
}
