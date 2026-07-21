/**
 * Verrouille l'échelle d'affichage de l'application.
 *
 * Quatre zooms distincts existent, et aucun ne se bloque de la même façon :
 *
 *   1. Le zoom automatique des champs sur iOS — traité en CSS (police à 16px sur pointeur
 *      grossier). Safari zoome dès qu'un champ passe sous 16px, et ne dézoome jamais.
 *   2. Le double-tap — traité en CSS aussi (`touch-action:manipulation`).
 *   3. Le pincement à deux doigts — la balise viewport suffit sur Android ; sur iOS elle est
 *      ignorée depuis iOS 10, d'où les écouteurs `gesture*` ci-dessous, qui sont la seule
 *      prise restante sur Safari.
 *   4. Le zoom navigateur au clavier et à la molette — les écouteurs `wheel` et `keydown`.
 *
 * CE QUE CECI NE PEUT PAS FAIRE : le zoom déclenché par le menu du navigateur, par un
 * raccourci système ou par la loupe du système d'exploitation reste hors de portée d'une
 * page web. Le verrouillage est donc réel mais pas absolu.
 *
 * À SAVOIR : bloquer le zoom contrevient au critère WCAG 1.4.4 (redimensionnement du texte
 * jusqu'à 200 %). Un utilisateur malvoyant perd ici un recours. Le choix est assumé côté
 * produit ; ce commentaire est là pour que le prochain lecteur sache que c'en est un, et non
 * un oubli. Pour revenir en arrière : supprimer cet appel dans main.jsx, retirer
 * `maximum-scale`/`user-scalable` de index.html et le bloc « zoom » de app.css.
 */
export function verrouillerZoom() {
  // Molette : le zoom navigateur passe par un `wheel` avec Ctrl enfoncé (Cmd sur macOS).
  // `passive:false` est indispensable — sans lui, `preventDefault` est ignoré.
  const surMolette = (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
  window.addEventListener("wheel", surMolette, { passive: false });

  // Clavier : Ctrl/Cmd avec +, -, = ou 0. On teste `e.key` ET `e.code` : sur le pavé
  // numérique et selon la disposition (AZERTY), `key` ne vaut pas toujours le signe attendu.
  const touches = new Set(["+", "-", "=", "0", "_"]);
  const codes = new Set(["Equal", "Minus", "NumpadAdd", "NumpadSubtract", "Digit0", "Numpad0"]);
  const surTouche = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (touches.has(e.key) || codes.has(e.code)) e.preventDefault();
  };
  window.addEventListener("keydown", surTouche, { passive: false });

  // Safari : événements propriétaires du pincement, seul moyen de le retenir sur iOS.
  const surGeste = (e) => e.preventDefault();
  for (const t of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(t, surGeste, { passive: false });
  }

  // Filet pour le double-tap sur les Safari anciens, que `touch-action` ne couvre pas :
  // deux `touchend` à moins de 300ms l'un de l'autre valent un double-tap.
  let dernierTap = 0;
  const surTouchEnd = (e) => {
    const t = Date.now();
    if (t - dernierTap < 300) e.preventDefault();
    dernierTap = t;
  };
  document.addEventListener("touchend", surTouchEnd, { passive: false });

  // Rendu réversible : utile en test, et évite de fuir si un jour l'appel est monté/démonté.
  return () => {
    window.removeEventListener("wheel", surMolette);
    window.removeEventListener("keydown", surTouche);
    for (const t of ["gesturestart", "gesturechange", "gestureend"]) {
      document.removeEventListener(t, surGeste);
    }
    document.removeEventListener("touchend", surTouchEnd);
  };
}
