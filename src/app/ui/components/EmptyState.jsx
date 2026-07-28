import { Icon } from "./Icon.jsx";

/**
 * État vide illustré.
 *
 * DEUX ÉCRITURES, parce que les deux existent dans le code et que les deux ont leur usage :
 *
 *   <EmptyState icon="cart">Aucun article.</EmptyState>
 *   <EmptyState icon="package" title="Ton panier est vide" text="Ajoute du matériel…" />
 *
 * La seconde était SILENCIEUSEMENT IGNORÉE : le composant n'acceptait que `icon` et
 * `children`, si bien que sept appels affichaient une icône seule, sans un mot — sur des
 * écrans où le texte était précisément ce qui disait quoi faire ensuite (« La boutique
 * arrive », « Aucune demande », « Créez d'abord vos formations »).
 *
 * `title` et `text` cohabitent avec `children` plutôt que de les remplacer : réécrire les
 * quinze appels en `children` aurait été un refactor sans bénéfice, et la forme
 * `title`/`text` est la plus lisible quand le texte fait deux lignes.
 *
 * `icon` accepte une clé SVG ; un emoji passé en repli reste rendu tel quel (compat ascendante).
 */
function EmptyState({ icon = "pizza", title, text, children }) {
  return (
    <div className="empty">
      <div className="big"><Icon name={icon} size={44} strokeWidth={1.5} /></div>
      {title && <p className="empty-t">{title}</p>}
      {text && <p className="empty-x">{text}</p>}
      {children}
    </div>
  );
}

export default EmptyState;
