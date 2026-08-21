import { useEffect, useMemo, useRef, useState } from "react";
import { getCarte, geocodeCarte, getFormations } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import { LEVELS, colorForLevel, LEVEL_LABEL, setBadgeColors } from "../lib/levels.js";

// Centroïdes (préfecture) par département — suffisant pour une carte à bulles.
const DEPTS = {
  "01": [46.20, 5.23, "Ain"], "02": [49.56, 3.62, "Aisne"], "03": [46.34, 3.43, "Allier"],
  "04": [44.09, 6.24, "Alpes-de-Haute-Provence"], "05": [44.56, 6.08, "Hautes-Alpes"],
  "06": [43.70, 7.27, "Alpes-Maritimes"], "07": [44.74, 4.60, "Ardèche"], "08": [49.77, 4.72, "Ardennes"],
  "09": [42.96, 1.61, "Ariège"], "10": [48.30, 4.08, "Aube"], "11": [43.21, 2.35, "Aude"],
  "12": [44.35, 2.57, "Aveyron"], "13": [43.30, 5.37, "Bouches-du-Rhône"], "14": [49.18, -0.37, "Calvados"],
  "15": [44.93, 2.44, "Cantal"], "16": [45.65, 0.16, "Charente"], "17": [46.16, -1.15, "Charente-Maritime"],
  "18": [47.08, 2.40, "Cher"], "19": [45.27, 1.77, "Corrèze"], "20": [42.15, 9.10, "Corse"],
  "21": [47.32, 5.04, "Côte-d'Or"], "22": [48.51, -2.77, "Côtes-d'Armor"], "23": [46.17, 1.87, "Creuse"],
  "24": [45.18, 0.72, "Dordogne"], "25": [47.24, 6.02, "Doubs"], "26": [44.93, 4.89, "Drôme"],
  "27": [49.02, 1.15, "Eure"], "28": [48.44, 1.49, "Eure-et-Loir"], "29": [48.00, -4.10, "Finistère"],
  "30": [43.84, 4.36, "Gard"], "31": [43.60, 1.44, "Haute-Garonne"], "32": [43.65, 0.59, "Gers"],
  "33": [44.84, -0.58, "Gironde"], "34": [43.61, 3.88, "Hérault"], "35": [48.11, -1.68, "Ille-et-Vilaine"],
  "36": [46.81, 1.69, "Indre"], "37": [47.39, 0.69, "Indre-et-Loire"], "38": [45.19, 5.72, "Isère"],
  "39": [46.67, 5.55, "Jura"], "40": [43.89, -0.50, "Landes"], "41": [47.59, 1.34, "Loir-et-Cher"],
  "42": [45.44, 4.39, "Loire"], "43": [45.04, 3.88, "Haute-Loire"], "44": [47.22, -1.55, "Loire-Atlantique"],
  "45": [47.90, 1.90, "Loiret"], "46": [44.45, 1.44, "Lot"], "47": [44.20, 0.62, "Lot-et-Garonne"],
  "48": [44.52, 3.50, "Lozère"], "49": [47.47, -0.55, "Maine-et-Loire"], "50": [49.12, -1.09, "Manche"],
  "51": [48.96, 4.36, "Marne"], "52": [48.11, 5.14, "Haute-Marne"], "53": [48.07, -0.77, "Mayenne"],
  "54": [48.69, 6.18, "Meurthe-et-Moselle"], "55": [48.77, 5.16, "Meuse"], "56": [47.66, -2.76, "Morbihan"],
  "57": [49.12, 6.18, "Moselle"], "58": [47.00, 3.16, "Nièvre"], "59": [50.63, 3.06, "Nord"],
  "60": [49.42, 2.83, "Oise"], "61": [48.43, 0.09, "Orne"], "62": [50.29, 2.78, "Pas-de-Calais"],
  "63": [45.78, 3.08, "Puy-de-Dôme"], "64": [43.30, -0.37, "Pyrénées-Atlantiques"],
  "65": [43.23, 0.07, "Hautes-Pyrénées"], "66": [42.70, 2.90, "Pyrénées-Orientales"],
  "67": [48.58, 7.75, "Bas-Rhin"], "68": [47.75, 7.34, "Haut-Rhin"], "69": [45.76, 4.84, "Rhône"],
  "70": [47.62, 6.15, "Haute-Saône"], "71": [46.78, 4.85, "Saône-et-Loire"], "72": [48.00, 0.20, "Sarthe"],
  "73": [45.57, 5.92, "Savoie"], "74": [45.90, 6.13, "Haute-Savoie"], "75": [48.86, 2.35, "Paris"],
  "76": [49.44, 1.10, "Seine-Maritime"], "77": [48.54, 2.66, "Seine-et-Marne"], "78": [48.80, 2.13, "Yvelines"],
  "79": [46.32, -0.46, "Deux-Sèvres"], "80": [49.89, 2.30, "Somme"], "81": [43.93, 2.15, "Tarn"],
  "82": [44.02, 1.35, "Tarn-et-Garonne"], "83": [43.12, 5.93, "Var"], "84": [43.95, 4.81, "Vaucluse"],
  "85": [46.67, -1.43, "Vendée"], "86": [46.58, 0.34, "Vienne"], "87": [45.83, 1.26, "Haute-Vienne"],
  "88": [48.17, 6.45, "Vosges"], "89": [47.80, 3.57, "Yonne"], "90": [47.64, 6.86, "Territoire de Belfort"],
  "91": [48.63, 2.44, "Essonne"], "92": [48.89, 2.24, "Hauts-de-Seine"], "93": [48.91, 2.44, "Seine-Saint-Denis"],
  "94": [48.79, 2.46, "Val-de-Marne"], "95": [49.05, 2.08, "Val-d'Oise"],
  "971": [16.24, -61.53, "Guadeloupe"], "972": [14.60, -61.07, "Martinique"], "973": [4.94, -52.33, "Guyane"],
  "974": [-20.88, 55.45, "La Réunion"], "976": [-12.78, 45.23, "Mayotte"],
};
const deptName = (d) => (DEPTS[d] ? DEPTS[d][2] : "Département " + d);

function loadCss(href) {
  if (document.querySelector(`link[data-lf="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = href; l.setAttribute("data-lf", href);
  document.head.appendChild(l);
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const ex = document.querySelector(`script[data-lf="${src}"]`);
    if (ex) { if (ex._loaded) res(); else ex.addEventListener("load", () => res()); return; }
    const el = document.createElement("script");
    el.src = src; el.setAttribute("data-lf", src);
    el.onload = () => { el._loaded = true; res(); };
    el.onerror = () => rej(new Error("load")); document.body.appendChild(el);
  });
}

function Carte() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState(null);   // département sélectionné (filtre)
  const [forms, setForms] = useState([]);   // formations (codes) cochées
  const [programs, setPrograms] = useState([]); // catalogue des formations (pour le filtre)

  useEffect(() => {
    getFormations().then((r) => {
      const list = r.data || [];
      setPrograms(list);
      const map = {};
      for (const f of list) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      setBadgeColors(map);
    }).catch(() => {});
  }, []);
  const [geo, setGeo] = useState(false);     // géocodage en cours
  const [legende, setLegende] = useState(false); // panneau de légende (replié par défaut)
  const mapDiv = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const LRef = useRef(null);

  async function reload() {
    try { const j = await getCarte(); setData(j.data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const j = await getCarte(); if (alive) setData(j.data); }
      catch (e) { if (alive) setStatus({ type: "error", message: e.message }); }
      loadCss("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
      try { await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"); }
      catch { return; }
      if (!alive || !mapDiv.current || mapRef.current) { if (alive) setMapReady(true); return; }
      const L = window.L; LRef.current = L;
      // Zoom déplacé en bas à droite : le coin haut-gauche porte désormais la recherche,
      // et deux commandes superposées au même endroit s'annulent l'une l'autre.
      const map = L.map(mapDiv.current, { center: [46.6, 2.4], zoom: 5, scrollWheelZoom: true, zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19, attribution: "© OpenStreetMap © CARTO",
      }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    })();
    return () => { alive = false; };
  }, []);

  // Lance le géocodage (par lots) puis recharge.
  async function runGeocode() {
    setGeo(true); setStatus(null);
    try {
      const { data: r } = await geocodeCarte(120);
      await reload();
      setStatus({ type: "success", message: `${r.done} stagiaire(s) géolocalisé(s).` + (r.remaining ? ` ${r.remaining} restant(s), relancez.` : "") });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setGeo(false); }
  }

  // Options de formation : le catalogue (codes), complété par les codes présents
  // sur les points (au cas où une formation aurait été supprimée du catalogue).
  const formationOptions = useMemo(() => {
    const s = new Set(programs.map((p) => p.code).filter(Boolean));
    for (const p of (data?.points || [])) (p.formations || []).forEach((c) => s.add(c));
    return [...s].sort();
  }, [programs, data]);
  const pointMatch = (p) => !forms.length || (p.formations || []).some((c) => forms.includes(c));
  const shownPoints = useMemo(() => (data?.points || []).filter(pointMatch), [data, forms]);

  // Répartition par département : globale, ou recalculée depuis les points filtrés.
  const byDeptView = useMemo(() => {
    if (!data) return [];
    if (!forms.length) return data.byDept;
    const m = new Map();
    for (const p of shownPoints) { if (!p.dept) continue; m.set(p.dept, (m.get(p.dept) || 0) + 1); }
    return [...m.entries()].map(([dp, count]) => ({ dept: dp, count, towns: [] })).sort((a, b) => b.count - a.count);
  }, [data, forms, shownPoints]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return byDeptView;
    return byDeptView.filter((d) =>
      d.dept.includes(n) ||
      deptName(d.dept).toLowerCase().includes(n) ||
      d.towns.some((t) => t.town.toLowerCase().includes(n))
    );
  }, [byDeptView, q]);

  const maxCount = useMemo(() => Math.max(1, ...byDeptView.map((d) => d.count)), [byDeptView]);
  const deptPoints = useMemo(
    () => (dept ? shownPoints.filter((p) => p.dept === dept) : []),
    [shownPoints, dept]
  );

  // (re)dessine : bulles par département, ou points précis colorés par niveau du département sélectionné.
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (layerRef.current) map.removeLayer(layerRef.current);
    const group = L.layerGroup();

    if (dept) {
      // Points précis (stagiaires géocodés) du département, colorés par niveau.
      const pts = [];
      for (const p of deptPoints) {
        // Couleur du point = couleur de la formation suivie (la plus récente), sinon niveau.
        const col = colorForLevel(p.program_code || p.level);
        const m = L.circleMarker([p.lat, p.lng], {
          radius: 7, weight: 1.5, color: "#fff", fillColor: col, fillOpacity: 0.9,
        });
        m.bindPopup(`<b>${p.name}</b><br>${p.town || ""}<br><span style="color:${col}">${p.program_code || LEVEL_LABEL[p.level] || "Formation non définie"}</span>`);
        m.bindTooltip(p.name, { direction: "top" });
        group.addLayer(m);
        pts.push([p.lat, p.lng]);
      }
      map.addLayer(group);
      layerRef.current = group;
      if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
      else { const c = DEPTS[dept]; if (c) map.setView([c[0], c[1]], 9); }
    } else {
      // Vue d'ensemble : bulles cliquables par département.
      for (const d of filtered) {
        const c = DEPTS[d.dept];
        if (!c) continue;
        const radius = 8 + Math.round((d.count / maxCount) * 22);
        const m = L.circleMarker([c[0], c[1]], {
          radius, weight: 1.5, color: "#fff", fillColor: "#2c3371", fillOpacity: 0.78,
        });
        m.on("click", () => setDept(d.dept));
        m.bindTooltip(`${deptName(d.dept)} · ${d.count}, cliquer pour filtrer`, { direction: "top" });
        group.addLayer(m);
      }
      map.addLayer(group);
      layerRef.current = group;
      map.setView([46.6, 2.4], 5);
    }
  }, [filtered, maxCount, mapReady, dept, deptPoints]);

  const total = data?.total ?? 0;
  const ungeo = data?.ungeo ?? 0;
  const geocoded = data?.geocoded ?? 0;
  const pending = data?.pending ?? 0;
  const nbDepts = data?.byDept.length ?? 0;

  return (
    <>
      {/* L'accroche reste courte : la précision sur la confidentialité des adresses a sa place
          dans la légende, à côté des couleurs qu'elle explique, et non en tête d'une page dont
          on vient voir la carte. */}
      <PageHead
        eyebrow="Développement · Démarchage"
        title="Carte des stagiaires"
        lead="Où sont vos stagiaires, et où il reste à démarcher."
      />
      <StatusMessage status={status} />

      {dept && (
        <div className="dept-banner">
          <b>{deptName(dept)} ({dept})</b>, {deptPoints.length} stagiaire(s) géolocalisé(s)
          <button className="btn sm ghost" onClick={() => setDept(null)}><Icon name="chevron-left" size={14} /> Tous les départements</button>
        </div>
      )}

      {/* LA CARTE EST LA PAGE. Tout ce qui l'accompagnait — compteurs, légende, filtres — passe
          au-dessus d'elle plutôt qu'avant elle : c'est ce qui la fait commencer en haut de
          l'écran au lieu de neuf cents pixels plus bas. Filtrer en voyant le résultat bouger
          vaut mieux que filtrer puis descendre vérifier. */}
      <div className="carte-wrap carte-scene">
        {!mapReady && <div className="carte-loading">Chargement de la carte…</div>}
        <div ref={mapDiv} className="carte-map" />

        {/* Le filtre par formation ne peut porter que sur les stagiaires SITUÉS : l'agrégat par
            département arrive sans le détail des formations. Choisir une formation que personne
            de géolocalisé ne suit vidait donc la carte sans un mot. Elle le dit maintenant, et
            renvoie vers le seul geste qui y remédie — géolocaliser. */}
        {forms.length > 0 && shownPoints.length === 0 && (
          <div className="carte-rien">
            <Icon name="search" size={20} />
            <b>Aucun stagiaire situé ne suit {forms.length > 1 ? "ces formations" : `la formation ${forms[0]}`}.</b>
            <p>Ce filtre ne porte que sur les {geocoded} stagiaires localisés précisément, pas sur
              les {total} comptés par département.</p>
            <button className="btn sm" onClick={() => setForms([])}>Retirer le filtre</button>
          </div>
        )}

        <div className="carte-hud">
          <div className="hud-top">
            <label className="hud-panel hud-search">
              <Icon name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Département, ville…" aria-label="Filtrer par département ou ville" />
              {q && <button className="hud-x" onClick={() => setQ("")} aria-label="Effacer la recherche"><Icon name="x" size={13} /></button>}
            </label>

            <div className="hud-legende">
              <button className={"hud-panel hud-btn" + (legende ? " on" : "")}
                onClick={() => setLegende((v) => !v)} aria-expanded={legende}>
                <Icon name="info" size={15} /> Légende
              </button>
              {legende && (
                <div className="hud-panel hud-drop">
                  <div className="hud-drop-t">Couleur des points</div>
                  {LEVELS.map((l) => (
                    <span key={l.v} className="lg-item"><i style={{ background: l.color }} /> {l.label}</span>
                  ))}
                  <span className="lg-item"><i style={{ background: "#9aa0b4" }} /> Non défini</span>
                  <p className="hud-note">Les particuliers sont situés à leur ville, jamais à leur
                    adresse : c'est une donnée personnelle. Les professionnels le sont à l'adresse
                    de leur entreprise.</p>
                </div>
              )}
            </div>
          </div>

          <div className="hud-bot">
            {/* Les compteurs tiennent en une ligne : ils situent, ils ne se consultent pas. */}
            <div className="hud-panel hud-stats">
              <b className="chiffres">{total}</b> stagiaires
              <i />
              <b className="chiffres">{nbDepts}</b> départements
              <i />
              <b className="chiffres">{geocoded}</b> points précis
            </div>

            {formationOptions.length > 0 && (
              <div className="hud-panel hud-forms">
                {formationOptions.map((code) => {
                  const on = forms.includes(code);
                  return (
                    <button key={code} type="button" className={"hud-chip" + (on ? " on" : "")}
                      aria-pressed={on}
                      onClick={() => setForms((f) => (f.includes(code) ? f.filter((x) => x !== code) : [...f, code]))}
                      style={on ? { background: colorForLevel(code), borderColor: colorForLevel(code) } : { borderColor: colorForLevel(code) }}>
                      <i style={{ background: colorForLevel(code) }} />{code}
                    </button>
                  );
                })}
                {forms.length > 0 && (
                  <button className="hud-chip raz" onClick={() => setForms([])}><Icon name="x" size={12} /> Toutes</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* La dette de géocodage était le PLUS GROS CHIFFRE de la page, en rouge, au-dessus de la
          carte : on ouvrait une carte et on lisait un bilan de données manquantes. Elle devient
          une ligne d'action sous la carte — elle se règle en un clic, elle n'a pas à se
          contempler. Elle disparaît quand il n'y a plus rien à géolocaliser. */}
      {(pending + ungeo) > 0 && (
        <div className="carte-dette">
          <Icon name="target" size={16} />
          <span><b className="chiffres">{pending + ungeo}</b> stagiaire(s) sans point précis, comptés dans leur département, mais pas situés à la ville.</span>
          {/* Pas de `title` quand le bouton porte déjà le nombre : l'infobulle DEVIENT le nom
              accessible et remplace l'intitulé lu à voix haute par une phrase qui n'est pas celui
              affiché à l'écran. Elle ne sert que dans le cas désactivé, qu'elle explique. */}
          <button className="btn sm" onClick={runGeocode} disabled={geo || pending === 0}
            title={pending === 0 ? "Les restants n'ont pas de code postal exploitable" : undefined}>
            {geo ? "Géolocalisation…" : pending ? `Géolocaliser ${pending}` : "Rien à géolocaliser"}
          </button>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        {/* `h2` et non `h3` : cette section est écrite à la main plutôt qu'avec `<Card title>`,
            et enchaînait donc `h1` puis `h3` sans niveau intermédiaire — la structure du
            document annonçait un niveau manquant. `card-h` porte la mise en forme, qui n'est
            plus attachée à la balise (cf. Card.jsx). */}
        <div className="card-head"><h2 className="card-h">Répartition par département</h2><span className="sub">{filtered.length} affiché(s) · cliquer pour filtrer</span></div>
        {!data ? <p className="lead" style={{ margin: 0 }}>Chargement…</p>
          : filtered.length === 0 ? <p className="lead" style={{ margin: 0 }}>Aucun département ne correspond.</p> : (
            <div className="grid" style={{ gap: 10 }}>
              {filtered.map((d) => (
                <button key={d.dept} className={"dept-row" + (dept === d.dept ? " on" : "")} onClick={() => setDept(d.dept)}>
                  <span style={{ width: 190, flexShrink: 0, fontSize: 13, textAlign: "left" }}>
                    <b>{deptName(d.dept)}</b> <span className="sub" style={{ color: "var(--dim)" }}>({d.dept})</span>
                  </span>
                  <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--surface3)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(d.count / maxCount) * 100}%`, background: "var(--navy)", borderRadius: 999 }} />
                  </div>
                  <b className="chiffres" style={{ width: 34, textAlign: "right", color: "var(--navy)" }}>{d.count}</b>
                </button>
              ))}
            </div>
          )}
      </div>
    </>
  );
}

export default Carte;
