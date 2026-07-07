import { useEffect, useState } from "react";
import { getNotes, createNote, deleteNote } from "../api/apiClient.js";
import { Field } from "./Field.jsx";
import StatusMessage from "./StatusMessage.jsx";

/** Notes de suivi CRM d'un dossier (enrollment). */
function NotesModal({ enrollmentId, name, onClose }) {
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState("");
  const [reminder, setReminder] = useState("");
  const [status, setStatus] = useState(null);

  async function load() {
    try { setNotes((await getNotes(enrollmentId)).data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, [enrollmentId]);

  async function add(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setStatus(null);
    try {
      await createNote(enrollmentId, { body, reminder_at: reminder || null });
      setBody(""); setReminder("");
      load();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  async function remove(noteId) {
    try { await deleteNote(enrollmentId, noteId); load(); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Notes de suivi — {name}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <StatusMessage status={status} />
          <form onSubmit={add} style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Nouvelle note</label>
              <textarea className="inp" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Relance, échange, information…" />
            </div>
            <div className="row2">
              <Field label="Rappel (optionnel)" type="date" value={reminder} onChange={(e) => setReminder(e.target.value)} />
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button type="submit" className="btn primary">Ajouter</button>
              </div>
            </div>
          </form>

          {notes.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Aucune note pour ce dossier.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {notes.map((n) => (
                <div key={n.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {n.created_at} · {[n.first_name, n.last_name].filter(Boolean).join(" ") || "—"}
                      {n.reminder_at && <span className="badge a" style={{ marginLeft: 8 }}>⏰ {n.reminder_at}</span>}
                    </span>
                    <button className="iconbtn del" title="Supprimer" onClick={() => remove(n.id)}>🗑</button>
                  </div>
                  <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

export default NotesModal;
