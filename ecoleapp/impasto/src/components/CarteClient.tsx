/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";

interface Pt {
  id: string; nom: string; ville: string | null; departement: string | null;
  lat: number | null; lng: number | null; niveauRealise: string | null;
  entrepriseNom: string | null; telephone: string | null; email: string | null; aRecontacter: boolean;
}

const NIV_LABEL: Record<string, string> = {
  I: "Niveau I", "I PRO": "Niveau I Pro", II: "Niveau II", EXPERT: "Expert",
  NAPO: "Napolitaine", "I & II": "Niveau I & II",
};
const nivLabel = (n?: string | null) => (n ? NIV_LABEL[n] ?? n : null);

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

export default function CarteClient() {
  const [pts, setPts] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterNiv, setFilterNiv] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
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

  // (re)dessine les marqueurs selon le filtre
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (clusterRef.current) map.removeLayer(clusterRef.current);
    const cluster = L.markerClusterGroup({ chunkedLoading: true });
    const list = pts.filter((p) => p.lat != null && p.lng != null)
      .filter((p) => (onlyMissing ? !p.niveauRealise : true))
      .filter((p) => (filterNiv ? p.niveauRealise === filterNiv : true));
    for (const p of list) {
      const miss = !p.niveauRealise;
      const m = L.circleMarker([p.lat, p.lng], { radius: 6, weight: 1.5, color: "#fff", fillColor: miss ? "#dc3e37" : "#2c3371", fillOpacity: 0.9 });
      const contact = [p.telephone ? `☎ ${p.telephone}` : "", p.email ? `✉ ${p.email}` : ""].filter(Boolean).join("<br>");
      m.bindPopup(`<b>${p.nom}</b><br>${p.ville ?? ""}${p.departement ? ` (${p.departement})` : ""}<br>Formation : ${nivLabel(p.niveauRealise) ?? "<i>à compléter</i>"}${p.entrepriseNom ? `<br>🏢 ${p.entrepriseNom}` : ""}${contact ? `<br>${contact}` : ""}`);
      cluster.addLayer(m);
    }
    map.addLayer(cluster); clusterRef.current = cluster;
  }, [pts, filterNiv, onlyMissing, loading]);

  const stats = useMemo(() => {
    const g = pts.filter((p) => p.lat != null);
    const byNiv: Record<string, number> = {};
    for (const p of g) if (p.niveauRealise) byNiv[p.niveauRealise] = (byNiv[p.niveauRealise] ?? 0) + 1;
    const missing = g.filter((p) => !p.niveauRealise).length;
    const depts = new Set(g.map((p) => p.departement).filter(Boolean)).size;
    return { total: g.length, missing, connues: g.length - missing, byNiv, depts };
  }, [pts]);

  const nivEntries = Object.entries(stats.byNiv).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5 font-sans">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.16em] text-ember">Développement · Débouchés</div>
        <h1 className="font-display text-3xl font-extrabold text-navy mt-1.5">Carte des stagiaires</h1>
        <p className="text-muted text-sm mt-1.5 max-w-2xl">Répartition géographique de vos {stats.total} stagiaires — pour le démarchage, la vente de matériel et les formations complémentaires. Les points <b className="text-ember">rouges</b> sont à compléter (formation inconnue → à recontacter).</p>
      </div>

      {/* Récap chiffres */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Stagiaires géolocalisés" val={stats.total} />
        <Stat label="Formation connue" val={stats.connues} tone="navy" />
        <Stat label="À compléter / recontacter" val={stats.missing} tone="red" />
        <Stat label="Départements couverts" val={stats.depts} />
      </div>

      {/* Filtres formations */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!filterNiv && !onlyMissing} onClick={() => { setFilterNiv(""); setOnlyMissing(false); }}>Tous ({stats.total})</Chip>
        {nivEntries.map(([niv, n]) => (
          <Chip key={niv} active={filterNiv === niv} onClick={() => { setFilterNiv(niv); setOnlyMissing(false); }}>{nivLabel(niv)} ({n})</Chip>
        ))}
        <Chip active={onlyMissing} tone="red" onClick={() => { setOnlyMissing((v) => !v); setFilterNiv(""); }}>⚠ À compléter ({stats.missing})</Chip>
      </div>

      {/* Carte */}
      <div className="relative rounded-2xl border border-line bg-surface shadow-sm overflow-hidden">
        {loading && <div className="absolute inset-0 z-[500] grid place-items-center bg-surface/70 text-muted text-sm">Chargement de la carte…</div>}
        <div ref={mapDiv} className="h-[560px] w-full" style={{ background: "var(--surface2)" }} />
      </div>

      {/* Récap débouchés (secrétariat / formateur) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-display text-base font-bold text-navy mb-3">Récapitulatif formations</h3>
          <div className="space-y-2">
            {nivEntries.length === 0 ? <p className="text-sm text-muted">Aucune formation renseignée.</p> : nivEntries.map(([niv, n]) => (
              <div key={niv} className="flex items-center gap-3">
                <span className="text-sm text-ink w-32 shrink-0">{nivLabel(niv)}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full bg-navy" style={{ width: `${(n / Math.max(1, stats.connues)) * 100}%` }} />
                </div>
                <b className="text-sm text-navy w-8 text-right">{n}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-display text-base font-bold text-navy mb-3">Débouchés & vente de matériel</h3>
          <ul className="text-sm text-muted space-y-2">
            <li>🎯 <b className="text-ink">{stats.missing}</b> stagiaires à recontacter (formation à préciser, montée en niveau).</li>
            <li>🛒 Vente de matériel (fours, pétrins, matières premières) — <span className="text-dim">module de suivi des ventes à venir.</span></li>
            <li>🎓 Cibler les <b className="text-ink">Niveau I</b> pour proposer Niveau II / Expert.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, val, tone }: { label: string; val: number; tone?: "navy" | "red" }) {
  const color = tone === "red" ? "text-ember" : "text-navy";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`mt-1.5 font-display text-3xl font-extrabold tabular-nums ${color}`}>{val}</div>
    </div>
  );
}

function Chip({ children, active, tone, onClick }: { children: React.ReactNode; active?: boolean; tone?: "red"; onClick: () => void }) {
  const base = "rounded-full px-3.5 py-1.5 text-xs font-semibold transition border";
  const on = tone === "red" ? "bg-ember text-white border-transparent" : "bg-navy text-white border-transparent";
  const off = "bg-surface-2 text-ink border-line hover:border-navy";
  return <button onClick={onClick} className={`${base} ${active ? on : off}`}>{children}</button>;
}
