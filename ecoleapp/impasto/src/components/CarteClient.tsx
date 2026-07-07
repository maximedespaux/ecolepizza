/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";

interface Pt {
  id: string; nom: string; prenom: string | null; ville: string | null; departement: string | null;
  lat: number | null; lng: number | null; niveauRealise: string | null;
  entrepriseNom: string | null; telephone: string | null; email: string | null; aRecontacter: boolean;
}
// Point enrichi : niveau canonique + candidat à la montée en niveau.
interface EPt extends Pt { prim: string | null; cand: boolean }

// Niveaux canoniques alignés sur le catalogue Formations (regroupe les libellés libres).
const NIVEAUX: { key: string; label: string }[] = [
  { key: "I", label: "Niveau I" },
  { key: "II", label: "Niveau II" },
  { key: "EXPERT", label: "Expert" },
  { key: "NAPO", label: "Napolitaine" },
  { key: "AUTRE", label: "Autre" },
];
const NIV_LABEL: Record<string, string> = Object.fromEntries(NIVEAUX.map((n) => [n.key, n.label]));

// Analyse un « niveauRealise » libre (« I », « I & II », « II & EXPERT »…) en niveaux.
function levelsOf(niv?: string | null): { set: Set<string>; prim: string | null } {
  if (!niv || !niv.trim()) return { set: new Set(), prim: null };
  const s = niv.toLowerCase();
  const set = new Set<string>();
  if (/expert/.test(s)) set.add("EXPERT");
  if (/napo/.test(s)) set.add("NAPO");
  if (/\bii\b|niveau 2/.test(s)) set.add("II");
  if (/\bi\b|pro|niveau 1|1 avec|hygiène|hygiene/.test(s)) set.add("I");
  const prim = set.has("EXPERT") ? "EXPERT" : set.has("II") ? "II" : set.has("NAPO") ? "NAPO" : set.has("I") ? "I" : "AUTRE";
  return { set, prim };
}
// Candidat à l'upsell : a fait le Niveau I mais PAS le II ni l'Expert.
function isCandidate(niv?: string | null): boolean {
  const { set } = levelsOf(niv);
  return set.has("I") && !set.has("II") && !set.has("EXPERT");
}

const fullName = (p: Pt) => [p.prenom, p.nom].filter(Boolean).join(" ") || p.nom;

function loadCss(href: string) {
  if (document.querySelector(`link[data-lf="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = href; l.setAttribute("data-lf", href);
  document.head.appendChild(l);
}
function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    const ex = document.querySelector(`script[data-lf="${src}"]`) as any;
    if (ex) { if (ex._loaded) res(); else ex.addEventListener("load", () => res()); return; }
    const el = document.createElement("script");
    el.src = src; el.setAttribute("data-lf", src);
    el.onload = () => { (el as any)._loaded = true; res(); };
    el.onerror = () => rej(new Error("load")); document.body.appendChild(el);
  });
}

const COLOR = { miss: "#dc3e37", cand: "#e0912b", known: "#2c3371" };

export default function CarteClient() {
  const [pts, setPts] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterNiv, setFilterNiv] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyTargets, setOnlyTargets] = useState(false);
  const [q, setQ] = useState("");
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const j = await (await fetch("/api/carte")).json(); if (alive) setPts(j.data ?? []); } catch { /* */ }
      loadCss("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
      loadCss("https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css");
      loadCss("https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css");
      try {
        await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
        await loadScript("https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js");
      } catch { if (alive) setLoading(false); return; }
      if (!alive || !mapDiv.current) return;
      const L = (window as any).L; LRef.current = L;
      if (!mapRef.current) {
        const map = L.map(mapDiv.current, { center: [46.6, 2.4], zoom: 6 });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 19, attribution: "© OpenStreetMap © CARTO" }).addTo(map);
        mapRef.current = map;
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Points enrichis (niveau canonique + candidat upsell), calculés une fois.
  const epts = useMemo<EPt[]>(() => pts.map((p) => ({ ...p, prim: levelsOf(p.niveauRealise).prim, cand: isCandidate(p.niveauRealise) })), [pts]);

  // Liste filtrée (recherche + niveau + à compléter + ciblage).
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return epts.filter((p) => p.lat != null && p.lng != null)
      .filter((p) => (onlyMissing ? !p.niveauRealise : true))
      .filter((p) => (onlyTargets ? p.cand : true))
      .filter((p) => (filterNiv ? p.prim === filterNiv : true))
      .filter((p) => (needle
        ? [fullName(p), p.ville ?? "", p.niveauRealise ?? "", p.departement ?? ""].some((s) => s.toLowerCase().includes(needle))
        : true));
  }, [epts, q, onlyMissing, onlyTargets, filterNiv]);

  // (re)dessine les marqueurs selon les filtres.
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (clusterRef.current) map.removeLayer(clusterRef.current);
    const cluster = L.markerClusterGroup({ chunkedLoading: true });
    for (const p of filtered) {
      const fill = !p.niveauRealise ? COLOR.miss : p.cand ? COLOR.cand : COLOR.known;
      const m = L.circleMarker([p.lat, p.lng], { radius: p.cand ? 7 : 6, weight: 1.5, color: "#fff", fillColor: fill, fillOpacity: 0.9 });
      const contact = [p.telephone ? `☎ ${p.telephone}` : "", p.email ? `✉ ${p.email}` : ""].filter(Boolean).join("<br>");
      const tag = p.cand ? `<br><b style="color:${COLOR.cand}">🎓 À faire monter en Niveau II / Expert</b>` : "";
      m.bindPopup(`<b>${fullName(p)}</b><br>${p.ville ?? ""}${p.departement ? ` (${p.departement})` : ""}<br>Formation : ${p.niveauRealise ? NIV_LABEL[p.prim!] ?? p.niveauRealise : "<i>à compléter</i>"}${p.entrepriseNom ? `<br>🏢 ${p.entrepriseNom}` : ""}${contact ? `<br>${contact}` : ""}${tag}`);
      cluster.addLayer(m);
    }
    map.addLayer(cluster); clusterRef.current = cluster;
  }, [filtered]);

  const stats = useMemo(() => {
    const g = epts.filter((p) => p.lat != null);
    const byNiv: Record<string, number> = {};
    for (const p of g) if (p.prim) byNiv[p.prim] = (byNiv[p.prim] ?? 0) + 1;
    const missing = g.filter((p) => !p.niveauRealise).length;
    const candidates = g.filter((p) => p.cand).length;
    const depts = new Set(g.map((p) => p.departement).filter(Boolean)).size;
    return { total: g.length, missing, candidates, connues: g.length - missing, byNiv, depts };
  }, [epts]);

  const nivEntries = NIVEAUX.filter((n) => stats.byNiv[n.key]).map((n) => [n.key, stats.byNiv[n.key]] as [string, number]);

  return (
    <div className="space-y-5 font-sans">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.16em] text-ember">Développement · Débouchés</div>
        <h1 className="font-display text-3xl font-extrabold text-navy mt-1.5">Carte des stagiaires</h1>
        <p className="text-muted text-sm mt-1.5 max-w-2xl">Répartition géographique de vos {stats.total} stagiaires — démarchage, vente de matériel et montée en niveau. <b className="text-ember">Rouge</b> = à compléter · <b style={{ color: COLOR.cand }}>orange</b> = Niveau I à faire monter · <b className="text-navy">bleu</b> = niveau connu.</p>
      </div>

      {/* Récap chiffres */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Stagiaires géolocalisés" val={stats.total} />
        <Stat label="Formation connue" val={stats.connues} tone="navy" />
        <Stat label="🎓 Niveau I à faire monter" val={stats.candidates} tone="gold" />
        <Stat label="À compléter / recontacter" val={stats.missing} tone="red" />
      </div>

      {/* Recherche */}
      <div className="flex items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un stagiaire (nom, prénom, ville, niveau)…"
          className="w-full max-w-md rounded-xl border border-line bg-bg-2 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy"
        />
        {q && <button onClick={() => setQ("")} className="text-sm text-muted hover:text-ink">Effacer</button>}
        <span className="text-[12px] text-dim ml-auto">{filtered.length} affiché(s)</span>
      </div>

      {/* Filtres formations (catalogue) + ciblage */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!filterNiv && !onlyMissing && !onlyTargets} onClick={() => { setFilterNiv(""); setOnlyMissing(false); setOnlyTargets(false); }}>Tous ({stats.total})</Chip>
        {nivEntries.map(([niv, n]) => (
          <Chip key={niv} active={filterNiv === niv} onClick={() => { setFilterNiv(niv); setOnlyMissing(false); setOnlyTargets(false); }}>{NIV_LABEL[niv]} ({n})</Chip>
        ))}
        <Chip active={onlyTargets} tone="gold" onClick={() => { setOnlyTargets((v) => !v); setFilterNiv(""); setOnlyMissing(false); }}>🎓 Niveau I à faire monter ({stats.candidates})</Chip>
        <Chip active={onlyMissing} tone="red" onClick={() => { setOnlyMissing((v) => !v); setFilterNiv(""); setOnlyTargets(false); }}>⚠ À compléter ({stats.missing})</Chip>
      </div>

      {/* Carte */}
      <div className="relative rounded-2xl border border-line bg-surface shadow-sm overflow-hidden">
        {loading && <div className="absolute inset-0 z-[500] grid place-items-center bg-surface/70 text-muted text-sm">Chargement de la carte…</div>}
        <div ref={mapDiv} className="h-[560px] w-full" style={{ background: "var(--surface2)" }} />
      </div>

      {/* Récap par niveau + ciblage commercial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-display text-base font-bold text-navy mb-3">Récapitulatif par niveau</h3>
          <div className="space-y-2">
            {nivEntries.length === 0 ? <p className="text-sm text-muted">Aucune formation renseignée.</p> : nivEntries.map(([niv, n]) => (
              <div key={niv} className="flex items-center gap-3">
                <span className="text-sm text-ink w-32 shrink-0">{NIV_LABEL[niv]}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full bg-navy" style={{ width: `${(n / Math.max(1, stats.connues)) * 100}%` }} />
                </div>
                <b className="text-sm text-navy w-8 text-right">{n}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-display text-base font-bold text-navy mb-3">🎓 Ciblage — montée en niveau</h3>
          <p className="text-sm text-muted mb-3">
            <b className="text-ink" style={{ color: COLOR.cand }}>{stats.candidates}</b> stagiaires ont fait le <b className="text-ink">Niveau I</b> sans avoir suivi le Niveau II ni l&apos;Expert : ce sont vos meilleures cibles pour une formation complémentaire.
          </p>
          <button
            onClick={() => { setOnlyTargets(true); setFilterNiv(""); setOnlyMissing(false); }}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow"
            style={{ background: COLOR.cand }}
          >
            Cibler ces {stats.candidates} stagiaires sur la carte →
          </button>
          <ul className="text-sm text-muted space-y-2 mt-4">
            <li>🎯 <b className="text-ink">{stats.missing}</b> à recontacter (formation à préciser).</li>
            <li>🛒 Vente de matériel — voir « Ventes de matériel ».</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, val, tone }: { label: string; val: number; tone?: "navy" | "red" | "gold" }) {
  const color = tone === "red" ? "text-ember" : tone === "gold" ? "" : "text-navy";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`mt-1.5 font-display text-3xl font-extrabold tabular-nums ${color}`} style={tone === "gold" ? { color: "#e0912b" } : undefined}>{val}</div>
    </div>
  );
}

function Chip({ children, active, tone, onClick }: { children: React.ReactNode; active?: boolean; tone?: "red" | "gold"; onClick: () => void }) {
  const base = "rounded-full px-3.5 py-1.5 text-xs font-semibold transition border";
  const onStyle = active ? { background: tone === "red" ? "var(--ember1)" : tone === "gold" ? "#e0912b" : "var(--navy)", color: "#fff", borderColor: "transparent" } : undefined;
  const off = "bg-surface-2 text-ink border-line hover:border-navy";
  return <button onClick={onClick} className={`${base} ${active ? "" : off}`} style={onStyle}>{children}</button>;
}
