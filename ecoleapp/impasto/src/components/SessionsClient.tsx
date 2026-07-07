"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { SESSION_STATUSES, STATUS_LABEL, STATUS_BADGE } from "@/components/calendrier/shared";

interface Session {
  id: string; annee: number; semaine: number; dateDebut: string | null; dateFin: string | null; status: string;
  program: { titre: string; code: string }; _count: { enrollments: number };
}
type Edit = { id: string; titre: string; status: string; annee: string; semaine: string; enrollments: number };

const fr = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "—");

export default function SessionsClient() {
  const [items, setItems] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const j = await (await fetch("/api/sessions")).json(); setItems(j.data ?? []); }
    catch { toast("Chargement impossible", "err"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (s: Session) => setEdit({ id: s.id, titre: s.program.titre, status: s.status, annee: String(s.annee), semaine: String(s.semaine), enrollments: s._count.enrollments });

  const save = async () => {
    if (!edit) return;
    const annee = Number(edit.annee), semaine = Number(edit.semaine);
    if (!annee || semaine < 1 || semaine > 53) { toast("Semaine (1–53) et année valides requises", "err"); return; }
    setSaving(true);
    const res = await fetch("/api/sessions/" + edit.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: edit.status, annee, semaine }),
    });
    setSaving(false);
    if (res.ok) { setEdit(null); toast("Session mise à jour", "ok"); load(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error || "Mise à jour impossible", "err"); }
  };

  const del = async () => {
    if (!edit) return;
    if (!confirm(`Supprimer la session « ${edit.titre} » (Sem. ${edit.semaine}/${edit.annee}) ?`)) return;
    const res = await fetch("/api/sessions/" + edit.id, { method: "DELETE" });
    if (res.ok) { setEdit(null); toast("Session supprimée", "ok"); load(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error || "Suppression impossible", "err"); }
  };

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Secrétariat</div><h1>Sessions & planning</h1>
          <p className="lead">Sessions par année / semaine. Cliquez une ligne pour changer le statut, déplacer (les dates se recalculent) ou supprimer. Les inscriptions se gèrent depuis le calendrier.</p></div>
        <Link className="btn primary" href="/calendrier">+ Planifier (calendrier)</Link>
      </div>

      {loading ? <div className="empty">Chargement…</div> : items.length === 0 ? (
        <div className="empty"><div className="big">▦</div><h3>Aucune session</h3><p>Créez une session depuis le calendrier ou une formation.</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead><tr><th>Semaine</th><th>Formation</th><th>Dates</th><th>Stagiaires</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => open(s)}>
                  <td className="mono">{s.annee} · SEM {s.semaine}</td>
                  <td><b>{s.program.titre}</b></td>
                  <td>{fr(s.dateDebut)} → {fr(s.dateFin)}</td>
                  <td>{s._count.enrollments}</td>
                  <td><span className={"badge " + (STATUS_BADGE[s.status] ?? "n")}>{STATUS_LABEL[s.status] ?? s.status}</span></td>
                  <td style={{ textAlign: "right" }}><span className="badge a">✎ Modifier</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="mhead"><h3>Modifier la session</h3><button className="x" onClick={() => setEdit(null)}>×</button></div>
            <div className="mbody">
              <div className="field"><label>Formation</label><input className="inp" value={edit.titre} disabled /></div>
              <div className="field">
                <label>Statut</label>
                <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {SESSION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="row2">
                <div className="field"><label>Semaine <span className="hint">1–53</span></label><input className="inp tnum" value={edit.semaine} onChange={(e) => setEdit({ ...edit, semaine: e.target.value })} inputMode="numeric" /></div>
                <div className="field"><label>Année</label><input className="inp tnum" value={edit.annee} onChange={(e) => setEdit({ ...edit, annee: e.target.value })} inputMode="numeric" /></div>
              </div>
              <p className="hint" style={{ marginTop: 2 }}>Les dates de début et de fin sont recalculées automatiquement depuis la semaine ISO.</p>
              {edit.enrollments > 0 && <div className="badge a" style={{ marginTop: 10 }}>{edit.enrollments} stagiaire(s) inscrit(s) — retirez-les depuis le calendrier avant de supprimer.</div>}
            </div>
            <div className="mfoot">
              <button className="btn danger" style={{ marginRight: "auto" }} onClick={del}>Supprimer</button>
              <button className="btn" onClick={() => setEdit(null)}>Annuler</button>
              <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
