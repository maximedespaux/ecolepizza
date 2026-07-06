"use client";
import { useEffect, useState, useCallback } from "react";
import { PARTNER_CATEGORIES } from "@/lib/ecole-pizza/partenaires";
import { toast } from "@/lib/toast";

interface Contract { id: string; status: string; titre: string }
interface Partner {
  id: string; nom: string; categorie: string; ville?: string;
  contactNom?: string; contactEmail?: string; contactTel?: string; remisePct?: number;
  contracts: Contract[];
}
const catLabel = (v: string) => PARTNER_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const empty = { nom: "", categorie: "AUTRE", ville: "", contactNom: "", contactEmail: "", contactTel: "", remisePct: "", notes: "" };

export default function PartenairesClient() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [cat, setCat] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (c = "") => {
    setLoading(true);
    const res = await fetch("/api/partenaires" + (c ? "?categorie=" + c : ""));
    const json = await res.json(); setPartners(json.data ?? []); setLoading(false);
  }, []);
  useEffect(() => { load(cat); }, [cat, load]);

  const openNew = () => { setEditId(null); setForm({ ...empty }); setErr(""); setModal(true); };
  const openEdit = (p: Partner) => {
    setEditId(p.id);
    setForm({ nom: p.nom, categorie: p.categorie, ville: p.ville ?? "", contactNom: p.contactNom ?? "", contactEmail: p.contactEmail ?? "", contactTel: p.contactTel ?? "", remisePct: p.remisePct ? String(p.remisePct) : "", notes: "" });
    setErr(""); setModal(true);
  };

  const submit = async () => {
    setErr("");
    if (!form.nom.trim()) { setErr("Le nom est requis."); return; }
    setSaving(true);
    const url = editId ? "/api/partenaires/" + editId : "/api/partenaires";
    const res = await fetch(url, { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || "Erreur."); return; }
    setModal(false); toast(editId ? "Partenaire mis à jour" : "Partenaire ajouté"); load(cat);
  };

  const del = async (p: Partner) => {
    if (!confirm(`Supprimer le partenaire ${p.nom} ?`)) return;
    const res = await fetch("/api/partenaires/" + p.id, { method: "DELETE" });
    if (res.ok) { toast("Partenaire supprimé"); load(cat); } else toast("Suppression impossible", "err");
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Développement</div><h1>Partenaires</h1>
          <p className="lead">Annuaire des partenaires (farines, matériel, fours, charcuterie…). Cliquez une carte pour modifier.</p></div>
        <button className="btn primary" onClick={openNew}>+ Nouveau partenaire</button>
      </div>

      <div className="searchbar">
        <button className={"btn sm" + (cat === "" ? " primary" : "")} onClick={() => setCat("")}>Tous</button>
        {PARTNER_CATEGORIES.map((c) => (
          <button key={c.value} className={"btn sm" + (cat === c.value ? " primary" : "")} onClick={() => setCat(c.value)}>{c.label}</button>
        ))}
      </div>

      {loading ? <div className="empty">Chargement…</div> : (
        <div className="grid cols-3">
          {partners.map((p) => {
            const actif = p.contracts.some((c) => c.status === "ACTIF");
            return (
              <div key={p.id} className="card hover" onClick={() => openEdit(p)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <h3 style={{ fontSize: 16 }}>{p.nom}</h3>
                  <div className="actions">
                    <button className="iconbtn" title="Modifier" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>✎</button>
                    <button className="iconbtn del" title="Supprimer" onClick={(e) => { e.stopPropagation(); del(p); }}>🗑</button>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="badge n">{catLabel(p.categorie)}</span>
                  {p.ville && <span className="badge n">{p.ville}</span>}
                  {p.remisePct ? <span className="badge a">-{p.remisePct}%</span> : null}
                  <span className={"badge " + (actif ? "g" : "n")}>{actif ? "Contrat actif" : "À contractualiser"}</span>
                </div>
                {(p.contactNom || p.contactEmail) && (
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>{p.contactNom}{p.contactEmail ? " · " + p.contactEmail : ""}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="modal">
            <div className="mhead"><h3>{editId ? "Modifier le partenaire" : "Nouveau partenaire"}</h3><button className="x" onClick={() => setModal(false)}>×</button></div>
            <div className="mbody">
              {err && <div className="badge r" style={{ marginBottom: 12 }}>{err}</div>}
              <div className="row2">
                <div className="field"><label>Nom</label><input className="inp" value={form.nom} onChange={(e) => set("nom", e.target.value)} /></div>
                <div className="field"><label>Catégorie</label><select className="inp" value={form.categorie} onChange={(e) => set("categorie", e.target.value)}>{PARTNER_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              </div>
              <div className="row2">
                <div className="field"><label>Ville</label><input className="inp" value={form.ville} onChange={(e) => set("ville", e.target.value)} /></div>
                <div className="field"><label>Remise négociée (%)</label><input className="inp" value={form.remisePct} onChange={(e) => set("remisePct", e.target.value)} /></div>
              </div>
              <div className="row3">
                <div className="field"><label>Contact</label><input className="inp" value={form.contactNom} onChange={(e) => set("contactNom", e.target.value)} /></div>
                <div className="field"><label>Email</label><input className="inp" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></div>
                <div className="field"><label>Téléphone</label><input className="inp" value={form.contactTel} onChange={(e) => set("contactTel", e.target.value)} /></div>
              </div>
            </div>
            <div className="mfoot">
              {editId && <button className="btn danger" style={{ marginRight: "auto" }} onClick={() => { const t = partners.find((x) => x.id === editId); setModal(false); if (t) del(t); }}>Supprimer</button>}
              <button className="btn" onClick={() => setModal(false)}>Annuler</button>
              <button className="btn primary" onClick={submit} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
