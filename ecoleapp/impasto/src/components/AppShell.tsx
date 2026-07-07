"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Toaster from "./Toaster";
import { useRole } from "./RoleProvider";
import { canAccess } from "@/lib/auth/roles";
import { DEMO_PROFILES } from "@/lib/auth/profiles";

const NAV = [
  { grp: "Pilotage", items: [{ href: "/dashboard", ic: "◧", label: "Tableau de bord" }] },
  { grp: "Mon parcours", items: [{ href: "/mon-espace", ic: "🎓", label: "Mon espace" }] },
  {
    grp: "Secrétariat",
    items: [
      { href: "/stagiaires", ic: "☺", label: "Stagiaires" },
      { href: "/calendrier", ic: "🗓", label: "Calendrier" },
      { href: "/sessions", ic: "▦", label: "Sessions & planning" },
      { href: "/documents", ic: "⎙", label: "Génération de documents" },
      { href: "/suivi", ic: "▤", label: "Suivi Qualiopi" },
    ],
  },
  {
    grp: "Gestion",
    items: [
      { href: "/comptabilite", ic: "€", label: "Comptabilité" },
    ],
  },
  {
    grp: "Développement",
    items: [
      { href: "/formations", ic: "◍", label: "Formations" },
      { href: "/partenaires", ic: "🤝", label: "Partenaires" },
      { href: "/carte", ic: "🗺", label: "Carte des stagiaires" },
      { href: "/ventes", ic: "🛒", label: "Ventes de matériel" },
    ],
  },
  {
    grp: "Système",
    items: [
      { href: "/reglages", ic: "⚙", label: "Organisme" },
      { href: "/audit", ic: "🔒", label: "Journal d'audit" },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/dashboard": "Tableau de bord", "/mon-espace": "Mon espace", "/stagiaires": "Stagiaires",
  "/calendrier": "Calendrier", "/sessions": "Sessions & planning", "/documents": "Génération de documents",
  "/suivi": "Suivi Qualiopi", "/comptabilite": "Comptabilité", "/formations": "Formations", "/partenaires": "Partenaires",
  "/carte": "Carte des stagiaires", "/ventes": "Ventes de matériel", "/reglages": "Organisme", "/audit": "Journal d'audit",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, ready, setProfile } = useRole();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const t = localStorage.getItem("impasto_theme") || "light";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const pageKey = pathname.split("/")[1] || "dashboard";

  // Garde d'accès : pas de profil → /login ; accès refusé pour ce rôle → accueil du rôle.
  useEffect(() => {
    if (!ready) return;
    if (!profile) { router.replace("/login"); return; }
    if (!canAccess(profile.role, pageKey)) router.replace(profile.home);
  }, [ready, profile, pageKey, router]);

  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    localStorage.setItem("impasto_theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Écran neutre pendant la résolution du profil ou une redirection.
  if (!ready || !profile || !canAccess(profile.role, pageKey)) {
    return (
      <div className="app-loading">
        <div className="brand-splash">
          <Image src="/brand/logo.png" alt="" width={54} height={54} />
          <span>Impasto</span>
        </div>
      </div>
    );
  }

  const role = profile.role;

  return (
    <div className="app">
      <aside className={"sidebar" + (open ? " open" : "")}>
        <div className="brand">
          <Image src="/brand/logo.png" alt="École Pizza" width={42} height={42} />
          <div><div className="name">Impasto</div><div className="sub">École Pizza · Despaux</div></div>
        </div>
        <nav className="menu">
          {NAV.map((g) => {
            const items = g.items.filter((it) => canAccess(role, it.href.split("/")[1]));
            if (items.length === 0) return null;
            return (
              <div key={g.grp}>
                <div className="grp">{g.grp}</div>
                {items.map((it) => (
                  <Link key={it.href} href={it.href} className={active(it.href) ? "on" : ""}>
                    <span className="ic">{it.ic}</span> {it.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="avatar">{profile.initials}</div>
          <div><div className="who">{profile.name}</div><div className="role">{profile.subtitle}</div></div>
        </div>
      </aside>

      <div className={"scrim" + (open ? " show" : "")} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(true)}>☰</button>
          <div className="crumbs">Impasto <span style={{ opacity: 0.4 }}>/</span> <b>{TITLES[pathname] ?? ""}</b></div>
          <div className="spacer" />
          <label className="rolepick" title="Prévisualiser l'app en tant que…">
            <span className="eye" aria-hidden>👁</span>
            <select value={profile.id} onChange={(e) => setProfile(e.target.value)} aria-label="Voir en tant que">
              {DEMO_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.subtitle}</option>)}
            </select>
          </label>
          <button className={`theme-toggle ${theme}`} onClick={toggleTheme} title="Changer de thème" aria-label="Changer de thème">
            <span className="tt-ic tt-sun">☀</span>
            <span className="tt-ic tt-moon">☾</span>
            <span className="tt-knob" />
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
