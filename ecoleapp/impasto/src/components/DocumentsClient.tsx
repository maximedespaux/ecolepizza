"use client";
import { useEffect, useState, useCallback } from "react";

interface Learner { id: string; nom: string; prenom?: string; financement: string }
interface Program { id: string; code: string; titre: string; prix: string; rsCode?: string | null }
interface Dossier {
  id: string; financement: string; conformite: string;
  learner: { nom: string; prenom?: string };
  session: { annee: number; semaine: number; program: { titre: string } };
  _count: { documents: number };
}
interface Doc { id: string; type: string; status: string; numberPrefix?: string; fileName?: string; mergeData?: Record<string, string> }

const SIGNABLE = new Set(["DEVIS", "CONTRAT", "DROIT_IMAGE", "CERTIFICAT_REALISATION"]);
const LABEL: Record<string, string> = {
  PROGRAMME: "Programme de formation", FICHE_SEMAINE: "Fiche d'expression de besoin",
  TEST_POSITIONNEMENT: "Test de positionnement", DEVIS: "Devis", CONTRAT: "Contrat / Convention",
  CONVOCATION: "Convocation à l'examen", INVITATION: "Invitation", DROIT_IMAGE: "Droit à l'image",
  EMARGEMENT: "Feuille d'émargement", ATTESTATION_HYGIENE: "Attestation Hygiène",
  CERTIFICAT_REALISATION: "Certificat de réalisation", EVALUATION_FINANCEUR: "Évaluations (chaud / froid)",
};
const STATUS: Record<string, [string, string]> = {
  A_FAIRE: ["n", "À faire"], GENERE: ["b", "Généré"], ENVOYE: ["a", "Envoyé"],
  CONSULTE: ["a", "Consulté"], SIGNE: ["g", "Signé"], ARCHIVE: ["n", "Archivé"],
};
const CONF: Record<string, [string, string]> = { VERT: ["g", "Complet"], ORANGE: ["a", "À compléter"], ROUGE: ["r", "Incomplet"] };

function nextStatus(type: string, cur: string) {
  const order = SIGNABLE.has(type)
    ? ["A_FAIRE", "GENERE", "ENVOYE", "CONSULTE", "SIGNE", "ARCHIVE"]
    : ["A_FAIRE", "GENERE", "ENVOYE", "ARCHIVE"];
  return order[(order.indexOf(cur) + 1) % order.length];
}

export default function DocumentsClient() {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [form, setForm] = useState({ learnerId: "", programId: "", annee: String(new Date().getFullYear()), semaine: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [preview, setPreview] = useState<Doc | null>(null);

  const loadDossiers = useCallback(async () => {
    const r = await fetch("/api/enrollments"); const j = await r.json(); setDossiers(j.data ?? []);
  }, []);
  useEffect(() => {
    (async () => {
      const [l, p] = await Promise.all([fetch("/api/stagiaires").then((r) => r.json()), fetch("/api/formations").then((r) => r.json())]);
      setLearners(l.data ?? []); setPrograms(p.data ?? []);
    })();
    loadDossiers();
  }, [loadDossiers]);

  const openDossier = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    const r = await fetch("/api/documents?enrollmentId=" + id); const j = await r.json(); setDocs(j.data ?? []);
  };

  const generate = async () => {
    setMsg("");
    if (!form.learnerId || !form.programId || !form.semaine) { setMsg("Choisissez un stagiaire, une formation et une semaine."); return; }
    setBusy(true);
    const r = await fetch("/api/documents/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    const j = await r.json();
    if (!r.ok) { setMsg(j.error || "Erreur."); return; }
    setMsg("✅ Documents générés (" + j.data.documents + ").");
    await loadDossiers();
    setOpenId(null);
    setTimeout(() => openDossier(j.data.enrollmentId), 50);
  };

  const cycle = async (d: Doc) => {
    const ns = nextStatus(d.type, d.status);
    setDocs((cur) => cur.map((x) => (x.id === d.id ? { ...x, status: ns } : x)));
    await fetch("/api/documents/" + d.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: ns }) });
    loadDossiers();
  };

  const sendToSign = async () => {
    const signables = docs.filter((d) => SIGNABLE.has(d.type) && d.status !== "SIGNE");
    for (const d of signables) {
      await fetch("/api/documents/" + d.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ENVOYE" }) });
    }
    setDocs((cur) => cur.map((x) => (SIGNABLE.has(x.type) && x.status !== "SIGNE" ? { ...x, status: "ENVOYE" } : x)));
    loadDossiers();
  };

  const refreshDocs = async () => {
    if (!openId) return;
    const r = await fetch("/api/documents?enrollmentId=" + openId); const j = await r.json(); setDocs(j.data ?? []);
  };
  // Crée la demande de signature et ouvre la page de signature (nouvel onglet).
  const createAndOpenSign = async (docId: string) => {
    const r = await fetch("/api/signatures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: docId }) });
    const j = await r.json();
    if (r.ok && j.data?.token) { window.open(`/signer/${j.data.token}`, "_blank"); await refreshDocs(); loadDossiers(); }
  };

  // Clôture la formation : le stagiaire reçoit alors certificat / attestation / facture dans son espace.
  const delivrerFin = async () => {
    if (!openId) return;
    if (!confirm("Délivrer la fin de formation ? Le stagiaire recevra dans son espace le certificat, l'attestation et la facture.")) return;
    const r = await fetch("/api/enrollments/" + openId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crmStage: "TERMINE" }) });
    if (r.ok) { setMsg("✅ Fin de formation délivrée — disponible dans l'espace du stagiaire."); loadDossiers(); refreshDocs(); }
    else setMsg("Erreur lors de la clôture.");
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Secrétariat</div><h1>Génération de documents</h1>
          <p className="lead">Choisissez la personne et la formation : Impasto crée le dossier et génère les documents 1 à 11, puis vous suivez chaque statut.</p></div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Générer un dossier</h3>
        {msg && <div className="badge a" style={{ marginBottom: 12 }}>{msg}</div>}
        <div className="row3">
          <div className="field"><label>Stagiaire</label>
            <select className="inp" value={form.learnerId} onChange={(e) => set("learnerId", e.target.value)}>
              <option value="">— Choisir —</option>
              {learners.map((l) => <option key={l.id} value={l.id}>{l.nom} {l.prenom}</option>)}
            </select></div>
          <div className="field"><label>Formation</label>
            <select className="inp" value={form.programId} onChange={(e) => set("programId", e.target.value)}>
              <option value="">— Choisir —</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.titre.slice(0, 36)}</option>)}
            </select></div>
          <div className="field"><label>Année / Semaine</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="inp tnum" value={form.annee} onChange={(e) => set("annee", e.target.value)} style={{ width: 90 }} />
              <input className="inp tnum" placeholder="Sem." value={form.semaine} onChange={(e) => set("semaine", e.target.value)} />
            </div></div>
        </div>
        <button className="btn primary" onClick={generate} disabled={busy}>{busy ? "Génération…" : "⎙ Générer les documents (1 → 11)"}</button>
      </div>

      <h3 style={{ fontSize: 16, margin: "6px 0 12px" }}>Dossiers</h3>
      {dossiers.length === 0 ? (
        <div className="empty"><div className="big">⎙</div><h3>Aucun dossier</h3><p>Générez un premier dossier ci-dessus.</p></div>
      ) : dossiers.map((d) => {
        const [cc, cl] = CONF[d.conformite] ?? ["n", d.conformite];
        const open = openId === d.id;
        return (
          <div key={d.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => openDossier(d.id)}>
              <div style={{ flex: 1 }}>
                <b>{d.learner.nom} {d.learner.prenom}</b>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{d.session.program.titre} · SEM {d.session.semaine} · {d._count.documents} doc.</div>
              </div>
              <span className={"badge " + (d.financement === "PARTICULIER" ? "b" : "a")}>{d.financement === "PARTICULIER" ? "Particulier" : "Professionnel"}</span>
              <span className={"badge " + cc}>{cl}</span>
              <span style={{ color: "var(--dim)" }}>{open ? "▲" : "▼"}</span>
            </div>

            {open && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
                {docs.map((doc) => {
                  const [sc, sl] = STATUS[doc.status] ?? ["n", doc.status];
                  const previewable = ["DEVIS", "CONTRAT", "CONVOCATION", "CERTIFICAT_REALISATION"].includes(doc.type);
                  return (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
                      <div className="mono" style={{ width: 26, height: 26, borderRadius: 7, background: "var(--surface3)", display: "grid", placeItems: "center", fontSize: 12, color: "var(--muted)" }}>{doc.numberPrefix}</div>
                      <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{LABEL[doc.type] ?? doc.type}</div>
                      {previewable && <button className="btn ghost sm" onClick={() => setPreview(doc)}>Aperçu</button>}
                      <a className="btn ghost sm" href={`/api/documents/${doc.id}/download`} title="Télécharger le document Word rempli" onClick={(e) => e.stopPropagation()}>⬇ Word</a>
                      {SIGNABLE.has(doc.type) && doc.status !== "SIGNE" && <button className="btn ghost sm" onClick={() => createAndOpenSign(doc.id)} title="Signature électronique">✍ Signer</button>}
                      <span className={"badge " + sc} style={{ cursor: "pointer" }} title="Cliquez pour faire avancer le statut" onClick={() => cycle(doc)}>{sl}</span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button className="btn" onClick={sendToSign}>✎ Envoyer en signature</button>
                  <button className="btn primary" onClick={delivrerFin}>🎓 Délivrer la fin de formation</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {preview && <Preview doc={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function Preview({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const m = doc.mergeData ?? {};
  const v = (k: string) => m[k] ?? "—";
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="mhead"><h3>Aperçu — {LABEL[doc.type] ?? doc.type}</h3><button className="x" onClick={onClose}>×</button></div>
        <div className="mbody">
          <div style={{ background: "#f7f1e6", color: "#22180f", borderRadius: 10, padding: "26px 30px", fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ borderBottom: "2px solid #c1272d", paddingBottom: 10, marginBottom: 14 }}>
              <strong style={{ color: "#16243d", fontSize: 16 }}>École Pizza — Jean-Jacques Despaux</strong>
              <div style={{ fontSize: 11, color: "#555" }}>101 rue Alsace Lorraine, 65300 Lannemezan · SIRET 879 955 136 00012 · NDA 76 65 00989 65</div>
            </div>
            <div style={{ textAlign: "center", fontFamily: "var(--font-d)", fontSize: 18, color: "#16243d", margin: "4px 0 14px" }}>{LABEL[doc.type]}</div>
            <p><b>{v("Personne")}</b><br />{v("Adresse")}</p>
            <table style={{ width: "100%", fontSize: 12 }}>
              <tbody>
                <tr><td style={{ padding: 6, borderBottom: "1px solid #e3d9c5" }}><b>Formation</b></td><td style={{ padding: 6, borderBottom: "1px solid #e3d9c5" }}>{v("Niveau suggérer")}</td></tr>
                <tr><td style={{ padding: 6, borderBottom: "1px solid #e3d9c5" }}><b>Dates</b></td><td style={{ padding: 6, borderBottom: "1px solid #e3d9c5" }}>{v("Date")}</td></tr>
                <tr><td style={{ padding: 6, borderBottom: "1px solid #e3d9c5" }}><b>Durée</b></td><td style={{ padding: 6, borderBottom: "1px solid #e3d9c5" }}>{v("Jours")} · {v("Heures")}</td></tr>
                <tr><td style={{ padding: 6 }}><b>Montant</b></td><td style={{ padding: 6 }}>{v("Prix")}</td></tr>
              </tbody>
            </table>
            <p style={{ color: "#777", marginTop: 14, fontSize: 11 }}>Aperçu des données de fusion. Le document Word réel (fidèle à vos modèles, entièrement rempli) se télécharge via le bouton « ⬇ Word ».</p>
          </div>
        </div>
        <div className="mfoot"><button className="btn" onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}
