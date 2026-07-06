"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "@/lib/toast";

interface Formation {
  id: string; code: string; titre: string; prix: string; jours: number; heures: number;
  public?: string | null; objectifs?: string | null; deroule?: string | null;
  hygiene: boolean; rsCode?: string | null;
}

type Draft = {
  id: string; code: string; titre: string; prix: string; jours: string; heures: string;
  public: string; objectifs: string; deroule: string; hygiene: boolean; rsCode: string;
};

const blank: Draft = { id: "", code: "", titre: "", prix: "0", jours: "5", heures: "35", public: "", objectifs: "", deroule: "", hygiene: false, rsCode: "" };
const toDraft = (f: Formation): Draft => ({
  id: f.id, code: f.code, titre: f.titre, prix: String(f.prix), jours: String(f.jours), heures: String(f.heures),
  public: f.public ?? "", objectifs: f.objectifs ?? "", deroule: f.deroule ?? "", hygiene: f.hygiene, rsCode: f.rsCode ?? "",
});

export default function FormationsClient() {
  const [items, setItems] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

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
      public: draft.public, objectifs: draft.objectifs, deroule: draft.deroule, hygiene: draft.hygiene, rsCode: draft.rsCode,
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

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Catalogue</div><h1>Formations</h1>
          <p className="lead">Vos programmes. Ajoutez, modifiez (tarif, durée, code, objectifs…) ou supprimez — ces données alimentent le calendrier, les devis et les contrats.</p></div>
        <button className="btn primary" onClick={openNew}>+ Nouvelle formation</button>
      </div>

      {loading ? <div className="empty">Chargement…</div> : items.length === 0 ? (
        <div className="empty"><div className="big">◍</div><h3>Aucune formation</h3><p>Ajoutez votre première formation.</p></div>
      ) : (
        <div className="grid cols-3">
          {items.map((f) => (
            <div key={f.id} className="card hover" onClick={() => openEdit(f)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <span className={"badge " + (f.rsCode ? "r" : "n")}>{f.code}{f.rsCode ? " · certifiante" : ""}</span>
                <span style={{ fontFamily: "var(--font-d)", fontSize: 24, fontWeight: 700, color: "var(--ember1)" }}>{Number(f.prix).toLocaleString("fr-FR")} €</span>
              </div>
              <h3 style={{ fontSize: 16, margin: "12px 0 6px" }}>{f.titre}</h3>
              <div style={{ fontSize: 12.5, color: "var(--muted)", minHeight: 32 }}>{f.objectifs}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <span className="badge n">{f.jours} jours</span><span className="badge n">{f.heures} h</span>
                {f.hygiene && <span className="badge n">+ hygiène</span>}
                <span className="badge a" style={{ marginLeft: "auto" }}>✎ Modifier</span>
              </div>
            </div>
          ))}
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
