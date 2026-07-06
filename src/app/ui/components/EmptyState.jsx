/** État vide illustré. */
function EmptyState({ icon = "🍕", children }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      {children}
    </div>
  );
}

export default EmptyState;
