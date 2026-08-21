import { useState } from "react";
import { Icon } from "./Icon.jsx";

/**
 * UNE IMAGE HÉBERGÉE AILLEURS — avec les quatre précautions qui vont avec.
 *
 * Un `<img src={url}>` écrit à la main marche très bien le jour où on l'écrit. Ce composant existe
 * pour les autres jours, et pour que les mêmes précautions s'appliquent aux cinq endroits qui
 * affichent une image distante plutôt qu'à celui dont on se souvient.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * 1. `referrerPolicy="no-referrer"` — LA PLUS IMPORTANTE, ET LA MOINS ÉVIDENTE.
 *
 * Sans elle, le navigateur envoie au serveur du fournisseur l'ADRESSE DE LA PAGE en cours. Le
 * fournisseur n'apprend donc pas seulement qu'un visiteur a chargé son image : il apprend ce que
 * cette personne était en train de regarder — et sur un espace stagiaire, l'URL peut désigner une
 * session, une commande, un identifiant. L'image, elle, s'affiche exactement pareil sans.
 *
 * 2. UNE IMAGE CASSÉE DISPARAÎT au lieu d'afficher l'icône brisée du navigateur. Un lien vers un
 *    site tiers finit toujours par mourir : le fournisseur refait son site, renomme un dossier.
 *    Une fiche sans photo reste lisible ; une fiche à l'image brisée fait douter du reste.
 *
 * 3. `loading="lazy"` — une boutique de quarante articles ne doit pas déclencher quarante requêtes
 *    vers autant de serveurs au premier affichage.
 *
 * 4. `alt=""` PAR DÉFAUT, et c'est volontaire. Ces images sont décoratives : le nom de l'article
 *    est écrit juste à côté. Un `alt` qui répéterait ce nom ferait lire deux fois la même chose à
 *    un lecteur d'écran. Passer `alt` explicitement reste possible quand l'image porte une
 *    information que le texte ne donne pas.
 */
function ImageLien({ src, alt = "", className = "", style, ratio, fallback = null }) {
  const [morte, setMorte] = useState(false);

  // Pas d'adresse, ou adresse morte : on rend le repli (souvent une pastille neutre), jamais rien
  // qui ressemble à une image manquante.
  if (!src || morte) return fallback;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={ratio ? { aspectRatio: ratio, ...style } : style}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setMorte(true)}
    />
  );
}

/** Le repli habituel : une pastille grise avec une icône, à la place et à la taille de l'image. */
export function ImagePlaceholder({ icone = "image", className = "", style }) {
  return (
    <span className={`img-vide ${className}`} style={style} aria-hidden="true">
      <Icon name={icone} size={18} />
    </span>
  );
}

export default ImageLien;
