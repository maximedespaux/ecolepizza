import { useContext, useState } from "react";
import { useMoneyMask, canRevealMoney, isRevealConfirmSkipped, setRevealConfirmSkip } from "../lib/moneyPrivacy.js";
import { UserContext } from "../context/UserContext.jsx";
import { Icon } from "./Icon.jsx";

/**
 * Bouton « Masquer / Afficher les montants » + confirmation, partagé par toutes
 * les pages Ventes & Finance. Masquer est immédiat ; afficher demande confirmation.
 * Les utilisateurs sans droit de révélation (ex. formateur) voient un simple
 * indicateur « Confidentiel » : les montants restent masqués en permanence.
 */
export default function MoneyToggle() {
  const { user } = useContext(UserContext);
  const { masked, hide, reveal } = useMoneyMask();
  const [confirm, setConfirm] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);

  // Révéler : si l'utilisateur a coché « ne plus demander » dans cette session,
  // on affiche directement sans repasser par la confirmation.
  const askOrReveal = () => (isRevealConfirmSkipped() ? reveal() : setConfirm(true));
  const doReveal = () => { if (dontAsk) setRevealConfirmSkip(true); reveal(); setConfirm(false); };

  if (!canRevealMoney(user)) {
    return (
      <span className="btn ghost" style={{ cursor: "default", opacity: 0.75, gap: 6 }} title="Montants confidentiels — masqués pour votre profil">
        <Icon name="eye-off" size={16} /> Confidentiel
      </span>
    );
  }

  return (
    <>
      <button
        className="btn ghost"
        onClick={() => (masked ? askOrReveal() : hide())}
        title={masked ? "Afficher les montants (confidentiel)" : "Masquer les montants"}
      >
        <Icon name={masked ? "eye" : "eye-off"} size={16} /> {masked ? "Afficher" : "Masquer"}
      </button>

      {confirm && (
        <div className="overlay" onClick={() => setConfirm(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>Afficher les montants ?</h3>
              <button className="x" onClick={() => setConfirm(false)} aria-label="Fermer"><Icon name="x" size={16} /></button>
            </div>
            <div className="mbody">
              <p className="lead" style={{ margin: 0 }}>
                Ces données financières sont <b>confidentielles</b>. Confirmez pour afficher les montants
                sur <b>toutes</b> les pages Ventes &amp; Finance.
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
                Ne plus demander durant cette session <span className="hint">(jusqu'à la déconnexion)</span>
              </label>
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => setConfirm(false)}>Annuler</button>
              <button className="btn primary" onClick={doReveal}>
                <Icon name="eye" size={15} /> Afficher
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
