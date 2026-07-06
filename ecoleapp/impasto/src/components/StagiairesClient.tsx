"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "@/lib/toast";

interface Learner {
  id: string; civilite?: string; nom: string; prenom?: string; email?: string;
  telephone?: string; ville?: string; financement: string; opco?: string;
  niveauRealise?: string | null; aRecontacter?: boolean; departement?: string | null;
  company?: { nom: string } | null;
}
const empty = {
  civilite: "Monsieur", nom: "", prenom: "", email: "", telephone: "", ville: "",
  financement: "PARTICULIER", opco: "", niveauRealise: "", aRecontacter: false,
};
const initials = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const NIV_LABEL: Record<string, string> = {
  I: "Niveau I", "I PRO": "Niveau I Pro", II: "Niveau II", EXPERT: "Expert",
  NAPO: "Napolitaine", TEGLIA: "Teglia & Pala", RS7404: "Artisanales (RS7404)",
};
const nivLabel = (n?: string | null) => (n ? NIV_LABEL[n] ?? `Niveau ${n}` : null);

export default function StagiairesClient() {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [access, setAccess] = useState<{ email: string; password: string; name: string } | null>(null);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    const res = await fetch("/api/stagiaires" + (query ? "?q=" + encodeURIComponent(query) : ""));
    const json = await res.json();
    setLearners(json.data ?? []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => load(q), 250); return () => clearTimeout(t); }, [q, load]);

  const missingCount = useMemo(() => learners.filter((l) => !l.niveauRealise).length, [learners]);
  const shown = useMemo(() => (onlyMissing ? learners.filter((l) => !l.niveauRealise) : learners), [learners, onlyMissing]);

  const openNew = () => { setEditId(null); setForm({ ...empty }); setErr(""); setModal(true); };
  const openEdit = (l: Learner) => {
    setEditId(l.id);
    setForm({
      civilite: l.civilite ?? "Monsieur", nom: l.nom, prenom: l.prenom ?? "", email: l.email ?? "",
      telephone: l.telephone ?? "", ville: l.ville ?? "", financement: l.financement, opco: l.opco ?? "",
      niveauRealise: l.niveauRealise ?? "", aRecontacter: l.aRecontacter ?? false,
    });
    setErr(""); setModal(true);
  };

  const submit = async () => {
    setErr("");
    if (!form.nom.trim()) { setErr("Le nom est requis."); return; }
    setSaving(true);
    const url = editId ? "/api/stagiaires/" + editId : "/api/stagiaires";
    const res = await fetch(url, { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || "Erreur."); return; }
    setModal(false); toast(editId ? "Stagiaire mis à jour" : "Stagiaire créé"); load(q);
  };

  // Génère un accès stagiaire (identifiant + mot de passe à communiquer).
  const genAccess = async (l: Learner) => {
    const res = await fetch("/api/students/access", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ learnerId: l.id }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) setAccess(j.data);
    else toast(j.error || "Accès impossible", "err");
  };

  // Bascule rapide « à recontacter » depuis la ligne.
  const toggleRecontact = async (l: Learner) => {
    const res = await fetch("/api/stagiaires/" + l.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aRecontacter: !l.aRecontacter }),
    });
    if (res.ok) { toast(l.aRecontacter ? "Retiré des relances" : "Marqué à recontacter"); load(q); }
    else toast("Impossible", "err");
  };

  const del = async (l: Learner) => {
    if (!confirm(`Supprimer ${l.nom} ${l.prenom ?? ""} et son dossier ?`)) return;
    const res = await fetch("/api/stagiaires/" + l.id, { method: "DELETE" });
    if (res.ok) { toast("Stagiaire supprimé"); load(q); } else toast("Suppression impossible", "err");
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Secrétariat</div><h1>Stagiaires</h1>
          <p className="lead">Cliquez une ligne pour modifier la fiche. Les fiches sans formation sont à compléter / recontacter.</p></div>
        <button className="btn primary" onClick={openNew}>+ Nouveau stagiaire</button>
      </div>

      <div className="searchbar">
        <input className="inp" placeholder="⌕ Nom, ville…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={"btn sm" + (onlyMissing ? " primary" : "")} onClick={() => setOnlyMissing((v) => !v)}>⚠ À compléter ({missingCount})</button>
        <span className="hint">{shown.length} affiché(s)</span>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {loading ? <div className="empty">Chargement…</div>
          : shown.length === 0 ? <div className="empty"><div className="big">☺</div><h3>Aucun stagiaire</h3><p>{onlyMissing ? "Toutes les fiches affichées ont une formation." : "Ajoutez votre premier stagiaire pour démarrer."}</p></div>
          : (
            <table>
              <thead><tr><th>Stagiaire</th><th>Ville</th><th>Formation</th><th>Financement</th><th></th></tr></thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} className="click" onClick={() => openEdit(l)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <div className="avatar" style={{ width: 34, height: 34, borderRadius: 9, fontSize: 12 }}>{initials(l.nom + " " + (l.prenom ?? ""))}</div>
                        <div>
                          <b>{l.nom} {l.prenom}</b>
                          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{l.email ?? l.telephone ?? "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>{l.ville ?? "—"}{l.departement ? ` (${l.departement})` : ""}</td>
                    <td>
                      {l.niveauRealise
                        ? <span className="badge b">{nivLabel(l.niveauRealise)}</span>
                        : <span className="badge r" title="Formation inconnue — à compléter / recontacter">⚠ à compléter</span>}
                      {l.aRecontacter && <span className="badge a" style={{ marginLeft: 6 }}>à recontacter</span>}
                    </td>
                    <td><span className={"badge " + (l.financement === "PARTICULIER" ? "b" : "a")}>{l.financement === "PARTICULIER" ? "Particulier" : "Professionnel"}</span></td>
                    <td><div className="actions">
                      <button className="iconbtn" title={l.aRecontacter ? "Retirer des relances" : "Marquer à recontacter"} onClick={(e) => { e.stopPropagation(); toggleRecontact(l); }}>{l.aRecontacter ? "☎" : "📞"}</button>
                      <button className="iconbtn" title="Générer un accès stagiaire (identifiant + mot de passe)" onClick={(e) => { e.stopPropagation(); genAccess(l); }}>🔑</button>
                      <button className="iconbtn" title="Modifier / compléter" onClick={(e) => { e.stopPropagation(); openEdit(l); }}>✎</button>
                      <button className="iconbtn del" title="Supprimer" onClick={(e) => { e.stopPropagation(); del(l); }}>🗑</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {modal && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="modal">
            <div className="mhead"><h3>{editId ? "Modifier le stagiaire" : "Nouveau stagiaire"}</h3><button className="x" onClick={() => setModal(false)}>×</button></div>
            <div className="mbody">
              {err && <div className="badge r" style={{ marginBottom: 12 }}>{err}</div>}
              <div className="row3">
                <div className="field"><label>Civilité</label><select className="inp" value={form.civilite} onChange={(e) => set("civilite", e.target.value)}><option>Madame</option><option>Monsieur</option></select></div>
                <div className="field"><label>Nom</label><input className="inp" value={form.nom} onChange={(e) => set("nom", e.target.value)} /></div>
                <div className="field"><label>Prénom</label><input className="inp" value={form.prenom} onChange={(e) => set("prenom", e.target.value)} /></div>
              </div>
              <div className="row3">
                <div className="field"><label>Email</label><input className="inp" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
                <div className="field"><label>Téléphone</label><input className="inp" value={form.telephone} onChange={(e) => set("telephone", e.target.value)} /></div>
                <div className="field"><label>Ville</label><input className="inp" value={form.ville} onChange={(e) => set("ville", e.target.value)} /></div>
              </div>
              <div className="row2">
                <div className="field">
                  <label>Formation réalisée <span className="hint">vide = à compléter</span></label>
                  <input className="inp" list="niv-list" value={form.niveauRealise} onChange={(e) => set("niveauRealise", e.target.value)} placeholder="— à compléter —" />
                  <datalist id="niv-list">
                    <option value="I">Niveau I</option><option value="I PRO">Niveau I Pro</option>
                    <option value="II">Niveau II</option><option value="EXPERT">Expert</option>
                    <option value="NAPO">Napolitaine</option><option value="TEGLIA">Teglia &amp; Pala</option>
                    <option value="RS7404">Artisanales (RS7404)</option>
                  </datalist>
                </div>
                <div className="field"><label>Financement</label><select className="inp" value={form.financement} onChange={(e) => set("financement", e.target.value)}><option value="PARTICULIER">Particulier</option><option value="PROFESSIONNEL">Professionnel</option></select></div>
              </div>
              <div className="field" style={{ marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.aRecontacter} onChange={(e) => setForm((f) => ({ ...f, aRecontacter: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  À recontacter (relance commerciale / montée en niveau)
                </label>
              </div>
            </div>
            <div className="mfoot">
              {editId && <button className="btn danger" style={{ marginRight: "auto" }} onClick={() => { const t = learners.find((x) => x.id === editId); setModal(false); if (t) del(t); }}>Supprimer</button>}
              <button className="btn" onClick={() => setModal(false)}>Annuler</button>
              <button className="btn primary" onClick={submit} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}

      {access && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setAccess(null); }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="mhead"><h3>🔑 Accès stagiaire créé</h3><button className="x" onClick={() => setAccess(null)}>×</button></div>
            <div className="mbody">
              <p className="lead" style={{ marginTop: 0 }}>Communiquez ces identifiants à <b>{access.name}</b> (à envoyer par email). Le mot de passe n&apos;est affiché qu&apos;une seule fois.</p>
              <div className="field"><label>Identifiant (email)</label><input className="inp mono" readOnly value={access.email} onFocus={(e) => e.target.select()} /></div>
              <div className="field"><label>Mot de passe</label><input className="inp mono" readOnly value={access.password} onFocus={(e) => e.target.select()} /></div>
              <div className="badge a" style={{ marginTop: 4 }}>Le stagiaire se connecte via « Espace stagiaire » sur la page de connexion.</div>
            </div>
            <div className="mfoot">
              <button className="btn primary" onClick={() => { navigator.clipboard?.writeText(`Identifiant : ${access.email}\nMot de passe : ${access.password}`); toast("Identifiants copiés"); }}>Copier</button>
              <button className="btn" onClick={() => setAccess(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
