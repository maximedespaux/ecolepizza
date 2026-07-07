"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "@/lib/toast";
import { LEVEL_IMAGE_CHOICES, imageForCode } from "@/lib/ecole-pizza/assets";

interface Formation {
  id: string; code: string; titre: string; prix: string; jours: number; heures: number;
  public?: string | null; objectifs?: string | null; deroule?: string | null;
  hygiene: boolean; rsCode?: string | null; image?: string | null; ordre: number;
}

type Draft = {
  id: string; code: string; titre: string; prix: string; jours: string; heures: string;
  public: string; objectifs: string; deroule: string; hygiene: boolean; rsCode: string; image: string;
};

const blank: Draft = { id: "", code: "", titre: "", prix: "0", jours: "5", heures: "35", public: "", objectifs: "", deroule: "", hygiene: false, rsCode: "", image: "" };
const toDraft = (f: Formation): Draft => ({
  id: f.id, code: f.code, titre: f.titre, prix: String(f.prix), jours: String(f.jours), heures: String(f.heures),
  public: f.public ?? "", objectifs: f.objectifs ?? "", deroule: f.deroule ?? "", hygiene: f.hygiene, rsCode: f.rsCode ?? "", image: f.image ?? "",
});

// Image effective d'une carte : image enregistrée, sinon défaut par code.
const cardImage = (f: Formation) => f.image || imageForCode(f.code);

export default function FormationsClient() {
  const [items, setItems] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Glisser-déposer : poignée « armée » (ref pour éviter la course d'état).
  const armed = useRef(false);
  const dragId = useRef<string | null>(null);
  const didDrag = useRef(false);
  const [overId, setOverId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/formations").then((r) => r.json());
    setItems(j.data ?? []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setDraft({ ...blank }); setIsNew(true); setErr(""); };
  const openEdit = (f: Formation) => { setDraft(toDraft(f)); setIsNew(false); setErr(""); };
  const set = (k: keyof Draft, v: string | boolean) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft) return;
    if (!draft.code.trim()) { setErr("Le code est requis."); return; }
    if (!draft.titre.trim()) { setErr("L'intitulé est requis."); return; }
    setSaving(true); setErr("");
    const payload = {
      code: draft.code, titre: draft.titre, prix: draft.prix, jours: draft.jours, heures: draft.heures,
      public: draft.public, objectifs: draft.objectifs, deroule: draft.deroule, hygiene: draft.hygiene, rsCode: draft.rsCode, image: draft.image,
    };
    const res = await fetch(isNew ? "/api/formations" : "/api/formations/" + draft.id, {
      method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) { setDraft(null); toast(isNew ? "Formation créée" : "Formation mise à jour"); load(); }
    else { const j = await res.json().catch(() => ({})); setErr(j.error || "Erreur."); }
  };

  const del = async () => {
    if (!draft || isNew) return;
    if (!confirm(`Supprimer la formation « ${draft.titre} » ?`)) return;
    const res = await fetch("/api/formations/" + draft.id, { method: "DELETE" });
    if (res.ok) { setDraft(null); toast("Formation supprimée"); load(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error || "Suppression impossible", "err"); }
  };

  // --- Réordonnancement ---
  const persist = async (arr: Formation[]) => {
    const r = await fetch("/api/formations/reorder", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: arr.map((f) => f.id) }),
    });
    if (!r.ok) { toast("Réorganisation non enregistrée", "err"); load(); }
  };
  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = items.findIndex((f) => f.id === fromId);
    const to = items.findIndex((f) => f.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setItems(next);
    persist(next);
  };
  const cleanup = () => {
    setOverId(null); dragId.current = null; armed.current = false;
    setTimeout(() => { didDrag.current = false; }, 50);
  };

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Catalogue</div><h1>Formations</h1>
          <p className="lead">Vos programmes. Glissez la poignée <span aria-hidden>⠿</span> pour réordonner, cliquez une carte pour la modifier (tarif, durée, visuel…). Ces données alimentent le calendrier, les devis et les contrats.</p></div>
        <button className="btn primary" onClick={openNew}>+ Nouvelle formation</button>
      </div>

      {loading ? <div className="empty">Chargement…</div> : items.length === 0 ? (
        <div className="empty"><div className="big">◍</div><h3>Aucune formation</h3><p>Ajoutez votre première formation.</p></div>
      ) : (
        <div className="grid cols-3">
          {items.map((f) => {
            const img = cardImage(f);
            const over = overId === f.id && dragId.current !== f.id;
            return (
              <div
                key={f.id}
                className="card hover"
                style={{ padding: 0, overflow: "hidden", position: "relative", outline: over ? "2px dashed var(--ember1)" : undefined, outlineOffset: -2 }}
                draggable
                onDragStart={(e) => { if (!armed.current) { e.preventDefault(); return; } dragId.current = f.id; didDrag.current = true; e.dataTransfer.effectAllowed = "move"; }}
                onDragEnter={() => setOverId(f.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragId.current) move(dragId.current, f.id); cleanup(); }}
                onDragEnd={cleanup}
                onClick={() => { if (!didDrag.current) openEdit(f); }}
              >
                {/* Bannière visuelle du niveau */}
                <div style={{ height: 104, background: img ? `center/cover url(${img})` : "var(--grad-ember)", position: "relative" }}>
                  <span
                    className="fdrag"
                    title="Glisser pour réordonner"
                    onMouseDown={() => { armed.current = true; }}
                    onMouseUp={() => { armed.current = false; }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", top: 8, left: 8, cursor: "grab", background: "var(--glass)", backdropFilter: "blur(6px)", borderRadius: 8, padding: "2px 7px", fontSize: 15, color: "var(--text)", userSelect: "none" }}
                  >⠿</span>
                  <span className={"badge " + (f.rsCode ? "r" : "n")} style={{ position: "absolute", top: 8, right: 8 }}>{f.code}{f.rsCode ? " · certifiante" : ""}</span>
                </div>

                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                    <h3 style={{ fontSize: 15.5, margin: 0, lineHeight: 1.25 }}>{f.titre}</h3>
                    <span style={{ fontFamily: "var(--font-d)", fontSize: 20, fontWeight: 700, color: "var(--ember1)", whiteSpace: "nowrap" }}>{Number(f.prix).toLocaleString("fr-FR")} €</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", minHeight: 32, marginTop: 6 }}>{f.objectifs}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <span className="badge n">{f.jours} jours</span><span className="badge n">{f.heures} h</span>
                    {f.hygiene && <span className="badge n">+ hygiène</span>}
                    <span className="badge a" style={{ marginLeft: "auto" }}>✎ Modifier</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setDraft(null); }}>
          <div className="modal">
            <div className="mhead"><h3>{isNew ? "Nouvelle formation" : "Modifier la formation"}</h3><button className="x" onClick={() => setDraft(null)}>×</button></div>
            <div className="mbody">
              {err && <div className="badge r" style={{ marginBottom: 12 }}>{err}</div>}
              <div className="row2">
                <div className="field"><label>Code <span className="hint">ex. NIV1H, RS7404</span></label><input className="inp" value={draft.code} onChange={(e) => set("code", e.target.value)} placeholder="NIV1" /></div>
                <div className="field"><label>Code RS <span className="hint">si certifiante</span></label><input className="inp" value={draft.rsCode} onChange={(e) => set("rsCode", e.target.value)} placeholder="RS7404" /></div>
              </div>
              <div className="field"><label>Intitulé</label><input className="inp" value={draft.titre} onChange={(e) => set("titre", e.target.value)} placeholder="Niveau I – Pizza Classique" /></div>

              {/* Visuel du niveau */}
              <div className="field">
                <label>Visuel du niveau <span className="hint">affiché sur la carte</span></label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 88, height: 58, borderRadius: 10, flexShrink: 0, border: "1px solid var(--border)", background: (draft.image || imageForCode(draft.code)) ? `center/cover url(${draft.image || imageForCode(draft.code)})` : "var(--grad-ember)" }} />
                  <select className="inp" value={draft.image} onChange={(e) => set("image", e.target.value)}>
                    <option value="">Par défaut (selon le code)</option>
                    {LEVEL_IMAGE_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="row3">
                <div className="field"><label>Tarif net (€)</label><input className="inp tnum" value={draft.prix} onChange={(e) => set("prix", e.target.value)} /></div>
                <div className="field"><label>Jours</label><input className="inp tnum" value={draft.jours} onChange={(e) => set("jours", e.target.value)} /></div>
                <div className="field"><label>Heures</label><input className="inp tnum" value={draft.heures} onChange={(e) => set("heures", e.target.value)} /></div>
              </div>
              <div className="field"><label>Public</label><input className="inp" value={draft.public} onChange={(e) => set("public", e.target.value)} /></div>
              <div className="field"><label>Objectifs</label><textarea className="inp" rows={2} value={draft.objectifs} onChange={(e) => set("objectifs", e.target.value)} /></div>
              <div className="field"><label>Déroulé pédagogique <span className="hint">alimente les documents</span></label><textarea className="inp" rows={3} value={draft.deroule} onChange={(e) => set("deroule", e.target.value)} /></div>
              <div className="field" style={{ marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <input type="checkbox" checked={draft.hygiene} onChange={(e) => set("hygiene", e.target.checked)} style={{ width: 16, height: 16 }} />
                  Inclut le module hygiène alimentaire (feuille d&apos;émargement + attestation)
                </label>
              </div>
            </div>
            <div className="mfoot">
              {!isNew && <button className="btn danger" style={{ marginRight: "auto" }} onClick={del}>Supprimer</button>}
              <button className="btn" onClick={() => setDraft(null)}>Annuler</button>
              <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : isNew ? "Créer" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
