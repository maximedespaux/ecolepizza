"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface SigData {
  status: string; docLabel: string; formation: string | null; organisme: string;
  signataire: { nom: string; email: string | null } | null; docHash: string | null; signedAt: string | null;
}

export default function SignerClient({ token }: { token: string }) {
  const [data, setData] = useState<SigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [otpDemo, setOtpDemo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState<{ docHash: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/signatures/${token}`);
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Lien invalide."); }
      else { setData(j.data); if (j.data.status === "SIGNEE") setSigned({ docHash: j.data.docHash ?? "" }); }
    } catch { setError("Chargement impossible."); }
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // Zone de signature
  const ctx = () => canvasRef.current?.getContext("2d") ?? null;
  useEffect(() => {
    const c = ctx(); if (!c) return;
    c.lineWidth = 2.5; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#1e2140";
  }, [data]);
  const point = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: React.MouseEvent | React.TouchEvent) => { drawing.current = true; const g = ctx(); if (!g) return; const p = point(e); g.beginPath(); g.moveTo(p.x, p.y); };
  const move = (e: React.MouseEvent | React.TouchEvent) => { if (!drawing.current) return; if ("touches" in e) e.preventDefault(); const g = ctx(); if (!g) return; const p = point(e); g.lineTo(p.x, p.y); g.stroke(); hasDrawn.current = true; };
  const stop = () => { drawing.current = false; };
  const clearSig = () => { const c = canvasRef.current; if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height); hasDrawn.current = false; };

  const sendOtp = async () => {
    setError(""); setBusy(true);
    const r = await fetch(`/api/signatures/${token}/otp`, { method: "POST" });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setError(j.error || "Envoi impossible."); return; }
    setOtpDemo(j.data.otpDemo);
  };

  const sign = async () => {
    setError("");
    if (!otp.trim()) { setError("Saisissez le code reçu."); return; }
    if (!hasDrawn.current) { setError("Merci de signer dans le cadre."); return; }
    if (!consent) { setError("Merci de cocher le consentement."); return; }
    const signature = canvasRef.current!.toDataURL("image/png");
    setBusy(true);
    const r = await fetch(`/api/signatures/${token}/sign`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp, consent: true, signature }),
    });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setError(j.error || "Signature impossible."); return; }
    setSigned({ docHash: j.data.docHash });
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-bg text-muted font-sans">Chargement…</div>;
  if (error && !data) return <div className="min-h-screen grid place-items-center bg-bg font-sans"><div className="rounded-2xl border border-line bg-surface p-8 text-center max-w-md"><div className="text-4xl mb-3">🔒</div><h1 className="font-display text-xl font-bold text-navy">Lien indisponible</h1><p className="text-muted text-sm mt-2">{error}</p></div></div>;

  return (
    <div className="min-h-screen bg-bg font-sans grid place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="rounded-3xl border border-line bg-surface shadow-xl overflow-hidden">
          <div className="p-6 text-white bg-[linear-gradient(135deg,var(--navy),var(--navy-dark))]">
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/70">{data?.organisme}</div>
            <h1 className="font-display text-2xl font-extrabold mt-1">Signature électronique</h1>
            <p className="text-white/80 text-sm mt-1">{data?.docLabel}{data?.formation ? ` — ${data.formation}` : ""}</p>
          </div>

          <div className="p-6">
            {signed ? (
              <div className="text-center py-4">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--green-bg)] text-3xl">✓</div>
                <h2 className="font-display text-xl font-bold text-navy mt-4">Document signé</h2>
                <p className="text-muted text-sm mt-1">Merci {data?.signataire?.nom}. Votre signature a été enregistrée.</p>
                <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4 text-left">
                  <div className="text-xs font-bold uppercase tracking-wide text-dim mb-2">Dossier de preuve</div>
                  <div className="text-[12px] text-ink space-y-1">
                    <div>Signataire : <b>{data?.signataire?.nom}</b></div>
                    <div>Date : <b>{new Date().toLocaleString("fr-FR")}</b></div>
                    <div>Authentification : <b>OTP e-mail ✓</b></div>
                    <div className="break-all">Empreinte SHA-256 :<br /><span className="font-mono text-[10.5px] text-muted">{signed.docHash}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="text-sm text-muted">
                  Bonjour <b className="text-ink">{data?.signataire?.nom}</b>. Pour signer ce document, recevez un code de vérification, signez dans le cadre, puis confirmez.
                </div>

                {/* 1. OTP */}
                <div>
                  <div className="text-[13px] font-semibold text-ink mb-2">1 · Code de vérification</div>
                  {!otpDemo ? (
                    <button onClick={sendOtp} disabled={busy} className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink hover:border-navy transition">📧 Recevoir mon code {data?.signataire?.email ? `(${data.signataire.email})` : ""}</button>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-lg bg-[var(--amber-bg)] text-[12px] text-ink px-3 py-2">Mode démo — votre code : <b className="font-mono">{otpDemo}</b> <span className="text-dim">(normalement envoyé par email)</span></div>
                      <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} placeholder="Saisir le code à 6 chiffres" className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-center text-lg font-mono tracking-[.3em] text-ink outline-none focus:border-navy" />
                    </div>
                  )}
                </div>

                {/* 2. Signature */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[13px] font-semibold text-ink">2 · Votre signature</div>
                    <button onClick={clearSig} className="text-xs text-ember font-semibold hover:underline">Effacer</button>
                  </div>
                  <canvas ref={canvasRef} width={460} height={150}
                    onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
                    onTouchStart={start} onTouchMove={move} onTouchEnd={stop}
                    className="w-full h-[150px] rounded-xl border-2 border-dashed border-line bg-white touch-none cursor-crosshair" />
                </div>

                {/* 3. Consentement */}
                <label className="flex items-start gap-2.5 text-[13px] text-ink cursor-pointer">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>Je consens à signer électroniquement ce document et reconnais sa valeur d&apos;engagement.</span>
                </label>

                {error && <div className="rounded-lg bg-[var(--rosso-bg)] text-ember text-sm px-3 py-2">{error}</div>}

                <button onClick={sign} disabled={busy} className="w-full rounded-xl px-4 py-3 font-bold text-white shadow-lg transition hover:brightness-105 disabled:opacity-60" style={{ background: "linear-gradient(135deg,var(--ember1),var(--ember2))" }}>
                  {busy ? "Signature…" : "✍ Signer le document"}
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-dim mt-4">Signature sécurisée · Impasto — {data?.organisme}</p>
      </div>
    </div>
  );
}
