/** En-tête de page : eyebrow + titre + accroche, actions optionnelles à droite. */
function PageHead({ eyebrow, title, lead, actions }) {
  return (
    <div className="pagehead">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="searchbar" style={{ margin: 0 }}>{actions}</div>}
    </div>
  );
}

export default PageHead;
