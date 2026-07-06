"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";

interface Entry { id: string; action: string; entity: string; entityId: string | null; createdAt: string; hash: string | null; prevHash: string | null }
interface Verify { ok: boolean; total: number; brokenAt: number | null; reason?: string }

const ACTION: Record<string, string> = {
  "session.create": "Session planifiée", "session.update": "Session modifiée", "session.delete": "Session supprimée",
  "enrollment.create": "Inscription ajoutée", "enrollment.update": "Dossier mis à jour", "enrollment.delete": "Inscription retirée",
  "documents.generate": "Documents générés", "document.generate": "Documents générés",
  "learner.create": "Stagiaire ajouté", "learner.update": "Stagiaire modifié", "learner.delete": "Stagiaire supprimé",
  "program.create": "Formation créée", "program.update": "Formation modifiée", "program.delete": "Formation supprimée",
  "organization.update": "Organisme modifié",
  "signature.sent": "Signature demandée", "otp.sent": "Code OTP envoyé", "otp.validated": "Code OTP validé",
  "consent.given": "Consentement donné", "document.signed": "Document signé",
};
const actLabel = (a: string) => ACTION[a] ?? a;

export default function AuditClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch("/api/audit")).json();
      setEntries(j.data ?? []); setVerify(j.verify ?? null); setTotal(j.total ?? 0);
    } catch { toast("Chargement impossible", "err"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const seal = async () => {
    setBusy(true);
    const j = await (await fetch("/api/audit", { method: "POST" })).json();
    setBusy(false);
    toast(`Journal scellé (${j.sealed} événement(s) recalculés)`, "ok");
    load();
  };

  return (
    <div className="space-y-5 font-sans">
      <div className="pagehead">
        <div><div className="eyebrow">Système · Confiance</div><h1>Journal d&apos;audit</h1>
          <p className="lead">Chaque action est horodatée et <b>chaînée par empreinte SHA-256</b> : toute modification a posteriori rompt la chaîne et devient détectable. Rien n&apos;est jamais supprimé.</p></div>
      </div>

      {/* Bandeau d'intégrité */}
      <div className={`rounded-2xl border p-5 shadow-sm ${verify?.ok ? "border-[color-mix(in_srgb,var(--green)_45%,transparent)] bg-[var(--green-bg)]" : "border-line bg-surface"}`}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`grid h-12 w-12 place-items-center rounded-full text-2xl ${verify?.ok ? "bg-white/60" : "bg-[var(--rosso-bg)]"}`}>{verify ? (verify.ok ? "✓" : "⚠") : "…"}</div>
          <div className="flex-1 min-w-[200px]">
            <div className="font-display text-lg font-bold text-navy">
              {loading ? "Vérification…" : verify?.ok ? "Chaîne d'intégrité vérifiée" : "Chaîne rompue"}
            </div>
            <div className="text-sm text-muted">
              {verify?.ok
                ? `${verify.total} événement(s) — empreintes cohérentes de bout en bout.`
                : verify ? `Anomalie au maillon #${(verify.brokenAt ?? 0) + 1} (${verify.reason}). Scellez le journal pour resceller la chaîne.` : "—"}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={load} disabled={loading}>🔄 Vérifier</button>
            <button className="btn primary" onClick={seal} disabled={busy}>🔒 Sceller le journal</button>
          </div>
        </div>
      </div>

      {/* Chaîne d'événements */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-bold text-navy">Événements récents</h3>
          <span className="text-xs text-dim">{total} au total · 60 derniers affichés</span>
        </div>
        {loading ? <p className="text-sm text-muted">Chargement…</p> : entries.length === 0 ? <p className="text-sm text-muted">Aucun événement.</p> : (
          <div className="divide-y divide-[var(--border-soft)]">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "linear-gradient(135deg,var(--navy),var(--ember1))" }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink">{actLabel(e.action)}</div>
                  <div className="text-[11px] text-dim">{e.entity}{e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""} · {new Date(e.createdAt).toLocaleString("fr-FR")}</div>
                </div>
                <span className="font-mono text-[10.5px] text-muted bg-surface-2 rounded px-2 py-1 hidden sm:inline" title={e.hash ?? ""}>{e.hash ? e.hash.slice(0, 12) + "…" : "non scellé"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
