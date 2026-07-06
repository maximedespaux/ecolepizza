"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_PROFILES } from "@/lib/auth/profiles";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"demo" | "student">("demo");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const chooseDemo = (id: string, home: string) => {
    localStorage.removeItem("impasto_user");
    localStorage.setItem("impasto_profile", id);
    router.push(home);
  };

  const studentLogin = async () => {
    setErr(""); setBusy(true);
    const r = await fetch("/api/students/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error || "Connexion impossible."); return; }
    localStorage.removeItem("impasto_profile");
    localStorage.setItem("impasto_user", JSON.stringify(j.data.profile));
    router.push("/mon-espace");
  };

  const tabCls = (on: boolean) => `flex-1 rounded-lg py-2 text-sm font-semibold transition ${on ? "bg-ember text-white shadow-glow" : "text-muted hover:text-ink"}`;

  return (
    <div className="relative min-h-screen grid place-items-center overflow-hidden bg-bg font-sans px-4">
      <div className="pointer-events-none absolute -top-40 -left-32 h-[26rem] w-[26rem] rounded-full blur-3xl bg-[radial-gradient(circle,rgba(220,62,55,.4),transparent_70%)] animate-[floatGlow_16s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[26rem] w-[26rem] rounded-full blur-3xl bg-[radial-gradient(circle,rgba(44,51,113,.5),transparent_70%)] animate-[floatGlow_20s_ease-in-out_infinite_reverse]" />

      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-line bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] backdrop-blur-xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <Image src="/ecole/logo.png" alt="École Pizza" width={48} height={48} className="rounded-2xl bg-white p-1.5" />
            <div>
              <div className="font-display text-2xl font-bold text-ink leading-none">Impasto</div>
              <div className="text-[11px] text-dim tracking-wider uppercase mt-1">École Pizza · Despaux</div>
            </div>
          </div>

          <div className="flex gap-1 rounded-xl bg-surface-2 p-1 mb-5">
            <button className={tabCls(mode === "demo")} onClick={() => setMode("demo")}>Découvrir</button>
            <button className={tabCls(mode === "student")} onClick={() => setMode("student")}>Espace stagiaire</button>
          </div>

          {mode === "demo" ? (
            <>
              <p className="text-muted text-sm mb-5">Choisissez un profil pour découvrir l&apos;application telle que chaque rôle la vit.</p>
              <div className="space-y-2.5">
                {DEMO_PROFILES.map((p) => (
                  <button key={p.id} onClick={() => chooseDemo(p.id, p.home)} className="group w-full flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left transition-all duration-200 hover:border-ember hover:-translate-y-0.5 hover:shadow-glow">
                    <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-ember text-white font-bold text-sm shadow-glow">{p.initials}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-ink text-sm">{p.name}</span>
                      <span className="block text-xs text-muted truncate">{p.subtitle}</span>
                    </span>
                    <span className="text-ember text-xl transition-transform group-hover:translate-x-1">→</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); studentLogin(); }} className="space-y-3">
              <p className="text-muted text-sm mb-1">Connectez-vous avec l&apos;identifiant et le mot de passe reçus par email.</p>
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Identifiant (email)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Mot de passe</label>
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy" />
              </div>
              {err && <div className="rounded-lg bg-[var(--rosso-bg)] text-ember text-sm px-3 py-2">{err}</div>}
              <button type="submit" disabled={busy} className="w-full rounded-xl px-4 py-3 font-bold text-white shadow-lg transition hover:brightness-105 disabled:opacity-60" style={{ background: "linear-gradient(135deg,var(--ember1),var(--ember2))" }}>
                {busy ? "Connexion…" : "Se connecter"}
              </button>
            </form>
          )}

          <div className="mt-6 flex items-center gap-2.5 text-xs text-dim">
            <span className="rounded-full bg-surface-3 px-2.5 py-1 font-semibold text-muted">Accès sécurisé</span>
            <span>Les accès stagiaires sont générés par le secrétariat.</span>
          </div>
        </div>
        <p className="text-center text-xs text-dim mt-5">ERP de formation · Certifié Qualiopi</p>
      </div>
    </div>
  );
}
