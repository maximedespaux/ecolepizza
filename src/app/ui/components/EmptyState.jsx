import { Icon } from "./Icon.jsx";

/**
 * État vide illustré. `icon` = clé d'icône SVG (ex. "cart", "bell") ;
 * un emoji passé en repli reste rendu tel quel (compat ascendante).
 */
function EmptyState({ icon = "pizza", children }) {
  return (
    <div className="empty">
      <div className="big"><Icon name={icon} size={44} strokeWidth={1.5} /></div>
      {children}
    </div>
  );
}

export default EmptyState;
