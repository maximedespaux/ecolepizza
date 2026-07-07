"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { colorOf, frDate, sessionRange, learnerName, initials, CRM_LABEL, FINANCEMENT_LABEL } from "./shared";

interface DocLite { id: string; type: string; status: string; numberPrefix?: string | null }
interface NoteLite { id: string; body: string; createdAt: string }
interface Detail {
  id: string; crmStage: string; financement: string; devisSigne: boolean; acompteRecu: boolean; conformite: string;
  prix: number; acompte: number; priseEnCharge: number;
  learner: { id: string; nom: string; prenom?: string | null; email?: string | null; telephone?: string | null; ville?: string | null; statut?: string | null; niveauRealise?: string | null; aRecontacter: boolean; company?: { nom?: string | null; raisonSociale?: string | null } | null };
  session: { annee: number; semaine: number; dateDebut: string | null; dateFin: string | null; program: { code: string; titre: string; jours: number } };
  documents: DocLite[]; notes: NoteLite[];
  finance: { prix: number; acompte: number; priseEnCharge: number; resteAcharge: number; modeFinancement: string };
}

const DOC_LABEL: Record<string, string> = {
  PROGRAMME: "Programme", FICHE_SEMAINE: "Fiche d'expression", TEST_POSITIONNEMENT: "Test de positionnement",
  DEVIS: "Devis", CONTRAT: "Contrat", CONVENTION: "Convention", CONVOCATION: "Convocation", INVITATION: "Invitation",
  DROIT_IMAGE: "Droit à l'image", CGV: "CGV", EMARGEMENT: "Émargement", ATTESTATION_HYGIENE: "Attestation Hygiène",
  CERTIFICAT_REALISATION: "Certificat", EVALUATION_FINANCEUR: "Évaluation", EVALUATION_MANAGEUR: "Évaluation manageur",
};
const CONF: Record<string, [string, string]> = { VERT: ["g", "Dossier complet"], ORANGE: ["a", "À compléter"], ROUGE: ["r", "Incomplet"] };
const DOC_STATUS: Record<string, [string, string]> = {
  A_FAIRE: ["n", "À faire"], GENERE: ["b", "Généré"], ENVOYE: ["a", "Envoyé"], CONSULTE: ["a", "Consulté"], SIGNE: ["g", "Signé"], ARCHIVE: ["n", "Archivé"],
};
const euro = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";

export default function ProfilDrawer({ enrollmentId, onClose, onChanged }: { enrollmentId: string; onClose: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fin, setFin] = useState({ financement: "PARTICULIER", prix: "0", acompte: "0", priseEnCharge: "0" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch(`/api/enrollments/${enrollmentId}`)).json();
      setD(j.data);
      setFin({ financement: j.data.financement, prix: String(j.data.prix), acompte: String(j.data.acompte), priseEnCharge: String(j.data.priseEnCharge) });
    } catch { toast("Chargement du profil impossible", "err"); }
    setLoading(false);
  }, [enrollmentId]);
  useEffect(() => { load(); }, [load]);

  const patch = async (body: Record<string, unknown>, okMsg?: string) => {
    setSaving(true);
    const r = await fetch(`/api/enrollments/${enrollmentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { if (okMsg) toast(okMsg, "ok"); await load(); onChanged?.(); return true; }
    const j = await r.json().catch(() => ({})); toast(j.error || "Erreur", "err"); return false;
  };

  // Reste à charge recalculé en direct pendant l'édition.
  const liveReste = Math.max(0, (Number(fin.prix) || 0) - (Number(fin.priseEnCharge) || 0) - (Number(fin.acompte) || 0));
  const modeAuto = (Number(fin.priseEnCharge) || 0) <= 0;

  const archived = d?.crmStage === "ARCHIVE";

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        {loading || !d ? (
          <div className="dbody"><div className="skel" style={{ height: 60, marginBottom: 12 }} /><div className="skel" style={{ height: 40, marginBottom: 8 }} /><div className="skel" style={{ height: 40 }} /></div>
        ) : (
          <>
            <div className="dhead">
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1 }}>
                <span className="avatar" style={{ width: 44, height: 44, fontSize: 15, flex: "0 0 44px" }}>{initials(d.learner)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontFamily: "var(--font-d)", margin: 0, fontSize: 17 }}>{learnerName(d.learner)}</h3>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                    <span className="fmark" style={{ background: colorOf(d.session.program.code), marginRight: 6 }}>{d.session.program.code}</span>
                    {d.session.program.titre}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 3 }}>
                    {frDate(sessionRange(d.session).start)} → {frDate(sessionRange(d.session).end)} · Sem. {d.session.semaine}/{d.session.annee}
                  </div>
                </div>
              </div>
              <button className="x" onClick={onClose} aria-label="Fermer">×</button>
            </div>

            <div className="dbody">
              {/* Statut + conformité */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <span className="badge b">{CRM_LABEL[d.crmStage] ?? d.crmStage}</span>
                <span className={`badge ${CONF[d.conformite]?.[0] ?? "n"}`}>{CONF[d.conformite]?.[1] ?? d.conformite}</span>
                {d.learner.aRecontacter && <span className="badge a">À recontacter</span>}
              </div>

              {/* Coordonnées */}
              <Section title="Coordonnées">
                <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.7 }}>
                  {d.learner.email && <div>✉ {d.learner.email}</div>}
                  {d.learner.telephone && <div>☎ {d.learner.telephone}</div>}
                  {d.learner.ville && <div>📍 {d.learner.ville}</div>}
                  {d.learner.company?.nom && <div>🏢 {d.learner.company.nom}</div>}
                  {!d.learner.email && !d.learner.telephone && !d.learner.ville && <div className="hint">Coordonnées à compléter.</div>}
                </div>
              </Section>

              {/* Financement paramétrable */}
              <Section title="Financement">
                <div className="row2">
                  <div className="field"><label>Type</label>
                    <select value={fin.financement} onChange={(e) => setFin({ ...fin, financement: e.target.value })}>
                      <option value="PARTICULIER">Particulier</option>
                      <option value="PROFESSIONNEL">Professionnel</option>
                    </select>
                  </div>
                  <div className="field"><label>Prix total (€)</label><input className="inp" inputMode="decimal" value={fin.prix} onChange={(e) => setFin({ ...fin, prix: e.target.value })} /></div>
                </div>
                <div className="row2">
                  <div className="field"><label>Prise en charge (€) <span className="hint">OPCO / France Travail…</span></label><input className="inp" inputMode="decimal" value={fin.priseEnCharge} onChange={(e) => setFin({ ...fin, priseEnCharge: e.target.value })} /></div>
                  <div className="field"><label>Acompte (€)</label><input className="inp" inputMode="decimal" value={fin.acompte} onChange={(e) => setFin({ ...fin, acompte: e.target.value })} /></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0", padding: "10px 12px", borderRadius: 12, background: "var(--surface2)" }}>
                  <span className="badge n">{modeAuto ? "Auto-financement" : "Pris en charge"}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Reste à charge (complément)</span>
                  <b style={{ fontFamily: "var(--font-d)", fontSize: 18, color: liveReste > 0 ? "var(--ember1)" : "var(--green)" }}>{euro(liveReste)}</b>
                </div>
                <button className="btn primary" disabled={saving} onClick={() => patch({ financement: fin.financement, prix: fin.prix, acompte: fin.acompte, priseEnCharge: fin.priseEnCharge }, "Financement enregistré")}>Enregistrer le financement</button>
              </Section>

              {/* Jalons pipeline */}
              <Section title="Jalons">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Toggle on={d.devisSigne} label="Devis signé" onClick={() => patch({ devisSigne: !d.devisSigne }, d.devisSigne ? "Devis dé-validé" : "Devis marqué signé")} />
                  <Toggle on={d.acompteRecu} label="Acompte reçu" onClick={() => patch({ acompteRecu: !d.acompteRecu }, d.acompteRecu ? "Acompte annulé" : "Acompte marqué reçu")} />
                </div>
                <p className="hint" style={{ marginTop: 8 }}>« Inscrit » exige devis signé + acompte reçu. Le secrétariat confirme l&apos;acompte ici.</p>
              </Section>

              {/* Documents */}
              <Section title={`Documents (${d.documents.length})`}>
                {d.documents.length === 0 ? <p className="hint">Aucun document. Générez le dossier dans « Génération de documents ».</p> : (
                  <div className="divide-y divide-[var(--border-soft)]">
                    {d.documents.map((doc) => {
                      const st = DOC_STATUS[doc.status] ?? ["n", doc.status];
                      return (
                        <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0" }}>
                          <span style={{ flex: 1, fontSize: 13, color: "var(--ink)" }}>{DOC_LABEL[doc.type] ?? doc.type}</span>
                          <span className={`badge ${st[0]}`}>{st[1]}</span>
                          {doc.status === "SIGNE"
                            ? <a className="btn ghost sm" href={`/api/documents/${doc.id}/download?signed=1&inline=1`} target="_blank" rel="noopener" style={{ color: "var(--green)" }}>PDF signé</a>
                            : <a className="btn ghost sm" href={`/api/documents/${doc.id}/download?format=pdf&inline=1`} target="_blank" rel="noopener">PDF</a>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* Suivi 6 mois */}
              <Section title="Suivi 6 mois & débouchés">
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <Toggle on={d.learner.aRecontacter} label="À recontacter" onClick={() => patch({ aRecontacter: !d.learner.aRecontacter })} />
                </div>
                <div className="field">
                  <textarea className="inp" rows={2} placeholder="Situation, opportunité (formation sup., vente matériel, emploi)…" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button className="btn" disabled={saving || !note.trim()} onClick={async () => { if (await patch({ note })) setNote(""); }}>+ Ajouter une note de suivi</button>
                {d.notes.length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {d.notes.map((n) => (
                      <div key={n.id} style={{ fontSize: 12.5, color: "var(--ink)", background: "var(--surface2)", borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10.5, color: "var(--dim)", marginBottom: 2 }}>{new Date(n.createdAt).toLocaleDateString("fr-FR")}</div>
                        {n.body}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            <div className="dfoot">
              {archived
                ? <button className="btn" onClick={() => patch({ crmStage: "CONTACTE" }, "Dossier réactivé")}>↩ Désarchiver</button>
                : <button className="btn ghost danger" onClick={() => { if (confirm("Archiver ce dossier ? Il sort du pipeline actif mais reste consultable.")) patch({ crmStage: "ARCHIVE" }, "Dossier archivé").then(onClose); }}>Archiver</button>}
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={onClose}>Terminé</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-d)", fontSize: 14, color: "var(--navy)" }}>{title}</h4>
      {children}
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`badge ${on ? "g" : "n"}`} style={{ cursor: "pointer", fontSize: 12.5, padding: "5px 11px" }}>
      {on ? "✓" : "○"} {label}
    </button>
  );
}
