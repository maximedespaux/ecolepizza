import { useState } from "react";
import { createPortal } from "react-dom";
import { changeMyPassword } from "../api/apiClient.js";

/** Modale « Changer mon mot de passe » (vérifie le mot de passe actuel). */
function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  async function save() {
    setStatus(null);
    if (next.length < 8) { setStatus({ type: "error", message: "Le nouveau mot de passe doit contenir au moins 8 caractères." }); return; }
    if (next !== confirm) { setStatus({ type: "error", message: "Les deux mots de passe ne correspondent pas." }); return; }
    setSaving(true);
    try {
      await changeMyPassword({ currentPassword: current, newPassword: next });
      setStatus({ type: "success", message: "Mot de passe modifié." });
      setTimeout(onClose, 900);
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally { setSaving(false); }
  }

  /* La barre latérale est `position:sticky; z-index:40` : elle crée un contexte
     d'empilement, dans lequel le `z-index:100` de l'overlay reste ENFERMÉ — le contenu
     principal passait devant, et la modale apparaissait comme un simple voile gris.
     `createPortal` la sort au niveau du body, seul endroit où son z-index compte. */
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>Changer mon mot de passe</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          {status && <div className={`status ${status.type === "error" ? "err" : "ok"}`}>{status.message}</div>}
          <div className="field"><label>Mot de passe actuel</label>
            <input className="inp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="field"><label>Nouveau mot de passe</label>
            <input className="inp" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
          <div className="field"><label>Confirmer le nouveau mot de passe</label>
            <input className="inp" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()} /></div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving || !current || !next}>{saving ? "Enregistrement…" : "Modifier"}</button>
        </div>
      </div>
    </div>
    ,
    document.body
  );
}

export default ChangePasswordModal;
