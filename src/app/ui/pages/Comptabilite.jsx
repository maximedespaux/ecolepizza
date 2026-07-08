import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getComptabilite, getComptaPerformance, createExpense, deleteExpense, saveComptaTargets,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

const CATS = [
  { v: "MATIERES_PREMIERES", label: "Matières premières" },
  { v: "SALAIRES", label: "Salaires & charges" },
  { v: "LOYER", label: "Loyer & locaux" },
  { v: "MARKETING", label: "Marketing & envois" },
  { v: "ENERGIE", label: "Énergie" },
  { v: "DIVERS", label: "Divers" },
];
// Palette validée daltonisme (Okabe-Ito) définie en variables CSS (clair + sombre)
// dans app.css : voir --cat-* et --ca-*.
const POSTE_COLOR = {
  MATIERES_PREMIERES: "var(--cat-mp)", SALAIRES: "var(--cat-sal)", LOYER: "var(--cat-loy)",
  MARKETING: "var(--cat-mkt)", ENERGIE: "var(--cat-ene)", DIVERS: "var(--cat-div)",
};
const CA_COLORS = { insc: "var(--ca-insc)", mat: "var(--ca-mat)", extra: "var(--ca-extra)" };
const STATUT_COLOR = { vert: "var(--green)", orange: "#d98a24", rouge: "var(--ember1)" };

const euro = (n) => Math.round(n).toLocaleString("fr-FR") + " €";
const today = () => new Date().toISOString().slice(0, 10);

function Comptabilite() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [tab, setTab] = useState("gestion");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const [dep, setDep] = useState({ label: "", categorie: "MATIERES_PREMIERES", montantHT: "", date: today() });
  const [savingDep, setSavingDep] = useState(false);

  const [editCibles, setEditCibles] = useState(false);
  const [cibleForm, setCibleForm] = useState({});
  const [dividendeForm, setDividendeForm] = useState("10");

  const load = useCallback(async (an, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data: d } = await getComptabilite(an);
      setData(d);
      const t = {};
      for (const c of CATS) t[c.v] = String(d.targets[c.v] ?? "");
      setCibleForm(t);
      setDividendeForm(String(d.dividendeCible ?? 10));
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(annee); }, [annee, load]);

  async function submitDep() {
    if (!dep.label.trim() || !dep.montantHT) { setStatus({ type: "error", message: "Libellé et montant requis." }); return; }
    setSavingDep(true);
    try {
      await createExpense(dep);
      setDep({ label: "", categorie: dep.categorie, montantHT: "", date: today() });
      setStatus({ type: "success", message: "Dépense enregistrée." });
      load(annee, { silent: true });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSavingDep(false); }
  }

  async function delDep(d) {
    if (!window.confirm(`Supprimer « ${d.label} » ?`)) return;
    try { await deleteExpense(d.id); load(annee, { silent: true }); } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function saveCibles() {
    const targets = {};
    for (const c of CATS) { const n = Number(cibleForm[c.v]); if (Number.isFinite(n)) targets[c.v] = n; }
    try {
      await saveComptaTargets({ targets, dividendeCible: Number(dividendeForm) });
      setEditCibles(false);
      setStatus({ type: "success", message: "Cibles enregistrées." });
      load(annee, { silent: true });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const scale = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.postes.map((p) => Math.max(p.pct, p.cible))) * 1.15;
  }, [data]);

  return (
    <>
      <PageHead
        eyebrow="Gestion · Pilotage"
        title="Comptabilité"
        lead="Tableau de gestion (pas de comptabilité légale). Le chiffre d'affaires se calcule automatiquement depuis les inscriptions, les ventes de matériel et les produits divers. Chaque poste de dépense est comparé à sa cible."
        actions={
          <select className="inp" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} aria-label="Année">
            {(data?.annees ?? [annee]).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />
      <StatusMessage status={status} />

      <div className="tabs">
        <button className={`tab ${tab === "gestion" ? "on" : ""}`} onClick={() => setTab("gestion")}>Gestion</button>
        <button className={`tab ${tab === "performance" ? "on" : ""}`} onClick={() => setTab("performance")}>Performance</button>
      </div>

      {tab === "performance" ? (
        <Performance annee={annee} />
      ) : loading || !data ? (
        <p className="lead">Chargement…</p>
      ) : (
        <div className="grid" style={{ gap: 16 }}>
          {/* KPIs */}
          <div className="grid cols-4">
            <div className="kpi"><div className="lbl">Chiffre d'affaires</div><div className="val tnum">{euro(data.ca.total)}</div></div>
            <div className="kpi"><div className="lbl">Total des dépenses</div><div className="val tnum">{euro(data.totalDepenses)}</div></div>
            <div className="kpi"><div className="lbl">Marge ({data.margePct}%)</div><div className="val tnum" style={{ color: data.marge >= 0 ? "var(--green)" : "var(--ember1)" }}>{euro(data.marge)}</div></div>
            <div className="kpi"><div className="lbl">Dividendes réalistes ({data.partRealistePct}%)</div><div className="val tnum" style={{ color: data.dividendeRealiste > 0 ? "var(--green)" : "var(--ember1)" }}>{euro(data.dividendeRealiste)}</div></div>
          </div>

          {/* Composition du CA (3 cartes %) */}
          <Card title="Composition du chiffre d'affaires">
            <div className="grid cols-3">
              <CaPart label="Inscriptions" value={data.ca.inscriptions} total={data.ca.total} color={CA_COLORS.insc} />
              <CaPart label="Ventes de matériel" value={data.ca.materiel} total={data.ca.total} color={CA_COLORS.mat} />
              <CaPart label="Produits divers" value={data.ca.extra} total={data.ca.total} color={CA_COLORS.extra} />
            </div>
          </Card>

          {/* Camemberts */}
          <div className="grid cols-2">
            <Card title="Répartition du chiffre d'affaires">
              <DonutBlock
                centerLabel="CA total" centerValue={euro(data.ca.total)}
                segments={[
                  { label: "Inscriptions", value: data.ca.inscriptions, color: CA_COLORS.insc },
                  { label: "Ventes de matériel", value: data.ca.materiel, color: CA_COLORS.mat },
                  { label: "Produits divers", value: data.ca.extra, color: CA_COLORS.extra },
                ]}
              />
            </Card>
            <Card title="Dépenses par poste">
              <DonutBlock
                centerLabel="Dépenses" centerValue={euro(data.totalDepenses)}
                segments={data.postes.map((p) => ({ label: p.label, value: p.total, color: POSTE_COLOR[p.categorie] }))}
              />
            </Card>
          </div>

          {/* Comment se calcule le CA */}
          <Card title="Comment se calcule le chiffre d'affaires ?">
            <p className="lead" style={{ marginTop: 0 }}>Le CA ne se saisit pas à la main : il s'additionne automatiquement à partir de trois sources.</p>
            <div className="grid cols-3">
              <SourceCA n={1} color={CA_COLORS.insc} titre="Inscriptions" montant={euro(data.ca.inscriptions)}
                desc="Somme des prix des inscriptions (tarif de la formation)." href="/sessions" lien="Voir les sessions →" />
              <SourceCA n={2} color={CA_COLORS.mat} titre="Ventes de matériel" montant={euro(data.ca.materiel)}
                desc="Fours, pétrins, matières premières… vendus aux stagiaires." href="/ventes" lien="Enregistrer une vente →" />
              <SourceCA n={3} color={CA_COLORS.extra} titre="Produits divers" montant={euro(data.ca.extra)}
                desc="Commissions, subventions, remboursements. Se saisit sur la page Partenaires." href="/partenaires" lien="Enregistrer une commission →" />
            </div>
          </Card>

          {/* Dividendes */}
          <Dividendes data={data} />

          {/* Postes vs cible */}
          <Card
            title="Postes de dépense (% du CA vs cible)"
            more={editCibles ? (
              <span style={{ display: "flex", gap: 8 }}>
                <button className="btn primary sm" onClick={saveCibles}>Enregistrer</button>
                <button className="btn ghost sm" onClick={() => setEditCibles(false)}>Annuler</button>
              </span>
            ) : (
              <button className="btn ghost sm" onClick={() => setEditCibles(true)}>Modifier les cibles</button>
            )}
          >
            <div className="grid" style={{ gap: 14 }}>
              {data.postes.map((p) => (
                <div key={p.categorie}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <i style={{ width: 10, height: 10, borderRadius: 999, background: STATUT_COLOR[p.statut] }} />
                      <b>{p.label}</b>
                      <span className="sub" style={{ color: "var(--dim)" }}>{euro(p.total)}</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <b className="tnum" style={{ color: STATUT_COLOR[p.statut] }}>{p.pct}%</b>
                      {editCibles ? (
                        <span className="sub" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          cible
                          <input className="inp" style={{ width: 56, padding: "4px 6px" }} inputMode="decimal"
                            value={cibleForm[p.categorie] ?? ""} onChange={(e) => setCibleForm((f) => ({ ...f, [p.categorie]: e.target.value }))} />%
                        </span>
                      ) : (
                        <span className="sub" style={{ width: 64, textAlign: "right" }}>cible {p.cible}%</span>
                      )}
                    </span>
                  </div>
                  <div className="poste-bar">
                    <span style={{ width: `${Math.min(100, (p.pct / scale) * 100)}%`, background: STATUT_COLOR[p.statut] }} />
                    <em className="poste-target" style={{ left: `${Math.min(100, (p.cible / scale) * 100)}%` }} title={`Cible ${p.cible}%`} />
                  </div>
                  <p className="sub" style={{ marginTop: 6 }}>{p.conseil}</p>
                </div>
              ))}
            </div>
            {editCibles && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--border-soft)", paddingTop: 14, marginTop: 14 }}>
                <b>Dividendes visés</b>
                <input className="inp" style={{ width: 64, padding: "4px 6px" }} inputMode="decimal"
                  value={dividendeForm} onChange={(e) => setDividendeForm(e.target.value)} />
                <span className="sub">% du CA</span>
              </div>
            )}
          </Card>

          {/* Saisies */}
          <div className="grid cols-2">
            <Card title="Enregistrer une dépense">
              <div className="field"><label>Libellé</label>
                <input className="inp" value={dep.label} onChange={(e) => setDep({ ...dep, label: e.target.value })} placeholder="Facture farine, loyer avril…" /></div>
              <div className="row2">
                <div className="field"><label>Poste</label>
                  <select value={dep.categorie} onChange={(e) => setDep({ ...dep, categorie: e.target.value })}>
                    {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                  </select></div>
                <div className="field"><label>Montant HT (€)</label>
                  <input className="inp" inputMode="decimal" value={dep.montantHT} onChange={(e) => setDep({ ...dep, montantHT: e.target.value })} placeholder="0" /></div>
              </div>
              <div className="field"><label>Date</label>
                <input className="inp" type="date" value={dep.date} onChange={(e) => setDep({ ...dep, date: e.target.value })} /></div>
              <button className="btn primary" style={{ width: "100%" }} disabled={savingDep} onClick={submitDep}>
                {savingDep ? "Enregistrement…" : "+ Ajouter la dépense"}
              </button>
            </Card>
          </div>

          {/* Liste des dépenses */}
          <div className="grid">
            <Card title={`Dépenses ${annee}`}>
              {data.depenses.length === 0 ? <p className="lead" style={{ margin: 0 }}>Aucune dépense saisie.</p> : (
                <div>{data.depenses.map((d) => (
                  <ListRow key={d.id} titre={d.label} sous={`${CATS.find((c) => c.v === d.category)?.label ?? d.category} · ${new Date(d.date).toLocaleDateString("fr-FR")}`} montant={euro(d.amount_ht)} onDel={() => delDep(d)} />
                ))}</div>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Sous-composants ---------- */

function CaPart({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mini-kpi">
      <div className="sub" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 9, height: 9, borderRadius: 999, background: color }} />{label}
        </span>
        <span style={{ color: "var(--dim)" }}>{pct}%</span>
      </div>
      <div className="tnum" style={{ fontWeight: 700, fontSize: 18, color: "var(--navy)", marginTop: 4 }}>{euro(value)}</div>
    </div>
  );
}

function SourceCA({ n, color, titre, montant, desc, href, lien }) {
  return (
    <div className="src-ca">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="src-n" style={{ background: color }}>{n}</span>
        <b style={{ flex: 1 }}>{titre}</b>
        <b className="tnum" style={{ color: "var(--navy)" }}>{montant}</b>
      </div>
      <p className="sub" style={{ margin: "0 0 8px" }}>{desc}</p>
      {href ? <Link to={href} className="src-link">{lien}</Link> : <span className="sub">{lien}</span>}
    </div>
  );
}

function ListRow({ titre, sous, montant, onDel }) {
  return (
    <div className="list-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titre}</div>
        <div className="sub" style={{ color: "var(--dim)" }}>{sous}</div>
      </div>
      <b className="tnum" style={{ color: "var(--navy)" }}>{montant}</b>
      <button type="button" className="iconbtn del" title="Supprimer" onClick={onDel}>🗑</button>
    </div>
  );
}

function Donut({ segments, active, onHover, size = 168, thickness = 24 }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  // On réserve la place du survol (thickness+5) pour que la part agrandie ne soit pas rognée.
  const r = (size - thickness - 6) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const items = segments.map((s, i) => ({ ...s, i })).filter((s) => s.value > 0);
  const gap = total > 0 && items.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }} role="img" aria-label="Camembert">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface3)" strokeWidth={thickness} />
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        {items.map((seg) => {
          const len = (seg.value / total) * circ;
          const dash = Math.max(0.5, len - gap);
          const on = active === seg.i;
          const dimmed = active !== null && !on;
          const el = (
            <circle key={seg.i} cx={cx} cy={cx} r={r} fill="none" stroke={seg.color}
              strokeWidth={on ? thickness + 5 : thickness}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
              style={{ opacity: dimmed ? 0.3 : 1, transition: "opacity .15s, stroke-width .15s", cursor: "pointer" }}
              onMouseEnter={() => onHover(seg.i)} onMouseLeave={() => onHover(null)} />
          );
          offset += len;
          return el;
        })}
      </g>
    </svg>
  );
}

function DonutBlock({ segments, centerLabel, centerValue }) {
  const [active, setActive] = useState(null);
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const hovered = active !== null ? segments[active] : null;
  const hoveredPct = hovered && total > 0 ? Math.round((hovered.value / total) * 100) : 0;
  return (
    <div className="donut-wrap">
      <div style={{ position: "relative", width: 168, height: 168, flexShrink: 0 }}>
        <Donut segments={segments} active={active} onHover={setActive} />
        <div className="donut-center">
          {hovered ? (
            <>
              <div style={{ fontSize: 10.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 118 }}>{hovered.label}</div>
              <div className="tnum" style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.15, color: hovered.color }}>{euro(hovered.value)}</div>
              <div className="tnum" style={{ fontSize: 10.5, color: "var(--dim)" }}>{hoveredPct}%</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 10.5, color: "var(--dim)" }}>{centerLabel}</div>
              <div className="tnum" style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.15, color: "var(--navy)" }}>{centerValue}</div>
            </>
          )}
        </div>
      </div>
      <div style={{ flex: 1, width: "100%" }}>
        {total === 0 ? <p className="lead" style={{ margin: 0 }}>Aucune donnée pour cette année.</p> : segments.map((s, i) => {
          if (s.value <= 0) return null;
          const pct = Math.round((s.value / total) * 100);
          const on = active === i;
          return (
            <div key={i} className="legend-row" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              style={{ background: on ? "var(--surface2)" : "transparent", opacity: active !== null && !on ? 0.5 : 1 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              <b className="tnum" style={{ color: "var(--navy)" }}>{euro(s.value)}</b>
              <span className="sub tnum" style={{ width: 36, textAlign: "right", color: "var(--dim)" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dividendes({ data }) {
  const color = data.dividendeStatut === "atteignable" ? "var(--green)" : data.dividendeStatut === "partiel" ? "#d98a24" : "var(--ember1)";
  const bg = data.dividendeStatut === "atteignable" ? "var(--green-bg)" : data.dividendeStatut === "partiel" ? "var(--amber-bg)" : "var(--rosso-bg)";
  const gaugeMax = Math.max(data.dividendeCible, data.partRealistePct, 12) * 1.12;
  const fillPct = Math.min(100, (data.partRealistePct / gaugeMax) * 100);
  const ciblePct = Math.min(100, (data.dividendeCible / gaugeMax) * 100);
  const denom = Math.max(1, data.ca.total, data.totalDepenses);
  const stack = [
    ...data.postes.filter((p) => p.total > 0).map((p) => ({ label: p.label, value: p.total, color: POSTE_COLOR[p.categorie] })),
    ...(data.marge > 0 ? [{ label: "Marge (→ dividendes)", value: data.marge, color: "var(--green)" }] : []),
  ];
  return (
    <Card title={`Dividendes — objectif ${data.dividendeCible}% du CA`}>
      <p className="sub" style={{ marginTop: -4 }}>La part distribuable ne peut jamais dépasser la marge.</p>
      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <Mini label="Marge distribuable" value={euro(data.dividendePossible)} tone={data.dividendePossible > 0 ? "var(--green)" : "var(--ember1)"} />
        <Mini label={`Objectif (${data.dividendeCible}% du CA)`} value={euro(data.dividendeVise)} tone="var(--navy)" />
        <Mini label={`Dividende réaliste (${data.partRealistePct}%)`} value={euro(data.dividendeRealiste)} tone={data.dividendeRealiste > 0 ? "var(--green)" : "var(--ember1)"} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }} className="sub">
        <span>Part de dividendes réaliste</span><span>Objectif {data.dividendeCible}%</span>
      </div>
      <div className="poste-bar" style={{ marginTop: 4 }}>
        <span style={{ width: `${fillPct}%`, background: color }} />
        <em className="poste-target" style={{ left: `${ciblePct}%` }} title={`Objectif ${data.dividendeCible}%`} />
      </div>
      <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, background: bg, color, fontWeight: 500, fontSize: 13 }}>
        {data.dividendeMessage}
      </div>
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border-soft)" }}>
        <b>Où va le chiffre d'affaires ?</b>
        <div className="stack-bar">
          {stack.map((s, i) => (
            <span key={i} title={`${s.label} : ${euro(s.value)}`} style={{ width: `${(s.value / denom) * 100}%`, background: s.color }} />
          ))}
        </div>
        <p className="sub" style={{ marginTop: 8 }}>Réduire les postes en rouge agrandit la marge verte — donc la part distribuable en dividendes.</p>
      </div>
    </Card>
  );
}

function Mini({ label, value, tone }) {
  return (
    <div className="mini-kpi">
      <div className="sub">{label}</div>
      <div className="tnum" style={{ fontWeight: 700, fontSize: 18, color: tone, marginTop: 4 }}>{value}</div>
    </div>
  );
}

/* ---------- Sous-onglet Performance ---------- */

function Performance({ annee }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    getComptaPerformance(annee)
      .then((r) => { if (!cancel) setD(r.data); })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [annee]);

  if (loading || !d) return <p className="lead">Chargement…</p>;
  const c = d.current, p = d.previous;
  const nb = (n) => n.toLocaleString("fr-FR");

  return (
    <div className="grid" style={{ gap: 16 }}>
      <p className="lead" style={{ margin: 0 }}>Récapitulatif <b>{d.annee}</b> comparé à <b>{d.anneePrec}</b>. Un écart en vert est favorable.</p>
      <div className="grid cols-4">
        <PerfCard label="Chiffre d'affaires" cur={euro(c.caTotal)} prev={euro(p.caTotal)} rc={c.caTotal} rp={p.caTotal} an={d.anneePrec} />
        <PerfCard label="Stagiaires (distincts)" cur={nb(c.nbStagiaires)} prev={nb(p.nbStagiaires)} rc={c.nbStagiaires} rp={p.nbStagiaires} an={d.anneePrec} />
        <PerfCard label="Inscriptions" cur={nb(c.nbInscriptions)} prev={nb(p.nbInscriptions)} rc={c.nbInscriptions} rp={p.nbInscriptions} an={d.anneePrec} />
        <PerfCard label="Ticket moyen" cur={euro(c.ticketMoyen)} prev={euro(p.ticketMoyen)} rc={c.ticketMoyen} rp={p.ticketMoyen} an={d.anneePrec} />
        <PerfCard label="Stagiaires moyens / session" cur={String(c.stagiairesMoyens)} prev={String(p.stagiairesMoyens)} rc={c.stagiairesMoyens} rp={p.stagiairesMoyens} an={d.anneePrec} />
        <PerfCard label="Sessions" cur={nb(c.nbSessions)} prev={nb(p.nbSessions)} rc={c.nbSessions} rp={p.nbSessions} an={d.anneePrec} />
        <PerfCard label="Dépenses" cur={euro(c.depensesTotal)} prev={euro(p.depensesTotal)} rc={c.depensesTotal} rp={p.depensesTotal} an={d.anneePrec} invert />
        <PerfCard label="Marge" cur={euro(c.marge)} prev={euro(p.marge)} rc={c.marge} rp={p.marge} an={d.anneePrec} />
      </div>
      <Card title={`Dépenses par poste — ${d.annee} vs ${d.anneePrec}`}>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Poste</th><th className="ta-r">{d.annee}</th><th className="ta-r">{d.anneePrec}</th><th className="ta-r">Écart</th></tr></thead>
            <tbody>
              {d.postesLabels.map((pl) => {
                const cur = c.postes[pl.categorie] ?? 0, prev = p.postes[pl.categorie] ?? 0;
                return (
                  <tr key={pl.categorie}>
                    <td>{pl.label}</td>
                    <td className="ta-r tnum">{euro(cur)}</td>
                    <td className="ta-r tnum" style={{ color: "var(--muted)" }}>{euro(prev)}</td>
                    <td className="ta-r tnum"><Ecart diff={cur - prev} invert /></td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td className="ta-r tnum">{euro(c.depensesTotal)}</td>
                <td className="ta-r tnum" style={{ color: "var(--muted)" }}>{euro(p.depensesTotal)}</td>
                <td className="ta-r tnum"><Ecart diff={c.depensesTotal - p.depensesTotal} invert /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PerfCard({ label, cur, prev, rc, rp, an, invert }) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="val tnum">{cur}</div>
      <div className="sub" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <Delta cur={rc} prev={rp} invert={invert} />
        <span style={{ color: "var(--dim)" }}>vs {an} : {prev}</span>
      </div>
    </div>
  );
}

function Delta({ cur, prev, invert }) {
  if (!prev) return <span style={{ color: "var(--dim)", fontWeight: 600 }}>nouveau</span>;
  const diff = cur - prev;
  const pct = Math.round((diff / Math.abs(prev)) * 1000) / 10;
  const good = diff === 0 ? null : invert ? diff < 0 : diff > 0;
  const color = good === null ? "var(--muted)" : good ? "var(--green)" : "var(--ember1)";
  return <span style={{ color, fontWeight: 700 }}>{diff >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function Ecart({ diff, invert }) {
  const good = diff === 0 ? null : invert ? diff < 0 : diff > 0;
  const color = good === null ? "var(--muted)" : good ? "var(--green)" : "var(--ember1)";
  return <span style={{ color, fontWeight: 600 }}>{diff > 0 ? "+" : ""}{euro(diff)}</span>;
}

export default Comptabilite;
