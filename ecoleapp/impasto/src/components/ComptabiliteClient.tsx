"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";

// ---- Types (miroir de /api/comptabilite) ----
interface Poste { categorie: string; label: string; total: number; pct: number; cible: number; statut: "vert" | "orange" | "rouge"; conseil: string }
interface Depense { id: string; date: string; libelle: string; categorie: string; montantHT: number; note?: string | null }
interface Revenu { id: string; date: string; libelle: string; categorie: string; montant: number; note?: string | null }
interface Data {
  annee: number;
  ca: { total: number; inscriptions: number; materiel: number; extra: number };
  postes: Poste[]; totalDepenses: number;
  marge: number; margePct: number;
  dividendeCible: number; dividendeVise: number; dividendePossible: number; dividendeRealiste: number;
  partRealistePct: number; dividendeStatut: "impossible" | "atteignable" | "partiel"; dividendeMessage: string;
  targets: Record<string, number>;
  depenses: Depense[]; revenus: Revenu[]; annees: number[];
}

// Couleurs catégorielles = variables CSS (validées CVD, gérées clair/sombre dans globals.css).
const POSTE_COLOR: Record<string, string> = {
  MATIERES_PREMIERES: "var(--cat-mp)", SALAIRES: "var(--cat-sal)", LOYER: "var(--cat-loy)",
  MARKETING: "var(--cat-mkt)", ENERGIE: "var(--cat-ene)", DIVERS: "var(--cat-div)",
};

const CATS = [
  { v: "MATIERES_PREMIERES", label: "Matières premières" },
  { v: "SALAIRES", label: "Salaires & charges" },
  { v: "LOYER", label: "Loyer & locaux" },
  { v: "MARKETING", label: "Marketing & envois" },
  { v: "ENERGIE", label: "Énergie" },
  { v: "DIVERS", label: "Divers" },
];
const REVENU_CATS = [
  { v: "COMMISSION", label: "Commission partenaire" },
  { v: "SUBVENTION", label: "Subvention" },
  { v: "AUTRE", label: "Autre produit" },
];

const euro = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const today = () => new Date().toISOString().slice(0, 10);
const STATUT_COLOR: Record<string, string> = { vert: "var(--green)", orange: "#e0912b", rouge: "var(--ember1)" };
const STATUT_LABEL: Record<string, string> = { vert: "Dans la cible", orange: "À surveiller", rouge: "Dépassement" };

const inputCls = "w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy";
const labelCls = "block text-[13px] font-semibold text-ink mb-1.5";

export default function ComptabiliteClient() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [tab, setTab] = useState<"gestion" | "performance">("gestion");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const [dep, setDep] = useState({ libelle: "", categorie: "MATIERES_PREMIERES", montantHT: "", date: today() });
  const [rev, setRev] = useState({ libelle: "", categorie: "COMMISSION", montant: "", date: today() });
  const [savingDep, setSavingDep] = useState(false);
  const [savingRev, setSavingRev] = useState(false);

  const [editCibles, setEditCibles] = useState(false);
  const [cibleForm, setCibleForm] = useState<Record<string, string>>({});
  const [dividendeForm, setDividendeForm] = useState("10");

  const load = useCallback(async (an: number) => {
    setLoading(true);
    try {
      const j = await (await fetch(`/api/comptabilite?annee=${an}`)).json();
      setData(j.data);
      const t: Record<string, string> = {};
      for (const c of CATS) t[c.v] = String(j.data.targets[c.v] ?? "");
      setCibleForm(t);
      setDividendeForm(String(j.data.dividendeCible ?? 10));
    } catch { toast("Chargement impossible", "err"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(annee); }, [annee, load]);

  const submitDep = async () => {
    if (!dep.libelle.trim() || !dep.montantHT) { toast("Libellé et montant requis", "err"); return; }
    setSavingDep(true);
    const r = await fetch("/api/comptabilite/depenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dep) });
    setSavingDep(false);
    if (r.ok) { setDep({ libelle: "", categorie: dep.categorie, montantHT: "", date: today() }); toast("Dépense enregistrée", "ok"); load(annee); }
    else { const j = await r.json().catch(() => ({})); toast(j.error || "Erreur", "err"); }
  };

  const submitRev = async () => {
    if (!rev.libelle.trim() || !rev.montant) { toast("Libellé et montant requis", "err"); return; }
    setSavingRev(true);
    const r = await fetch("/api/comptabilite/revenus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rev) });
    setSavingRev(false);
    if (r.ok) { setRev({ libelle: "", categorie: rev.categorie, montant: "", date: today() }); toast("Produit enregistré", "ok"); load(annee); }
    else { const j = await r.json().catch(() => ({})); toast(j.error || "Erreur", "err"); }
  };

  const delDep = async (d: Depense) => {
    if (!confirm(`Supprimer « ${d.libelle} » ?`)) return;
    const r = await fetch("/api/comptabilite/depenses/" + d.id, { method: "DELETE" });
    if (r.ok) { toast("Dépense supprimée", "ok"); load(annee); } else toast("Suppression impossible", "err");
  };
  const delRev = async (v: Revenu) => {
    if (!confirm(`Supprimer « ${v.libelle} » ?`)) return;
    const r = await fetch("/api/comptabilite/revenus/" + v.id, { method: "DELETE" });
    if (r.ok) { toast("Produit supprimé", "ok"); load(annee); } else toast("Suppression impossible", "err");
  };

  const saveCibles = async () => {
    const targets: Record<string, number> = {};
    for (const c of CATS) { const n = Number(cibleForm[c.v]); if (!Number.isNaN(n)) targets[c.v] = n; }
    const r = await fetch("/api/comptabilite/cibles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets, dividendeCible: Number(dividendeForm) }) });
    if (r.ok) { setEditCibles(false); toast("Cibles enregistrées", "ok"); load(annee); }
    else { const j = await r.json().catch(() => ({})); toast(j.error || "Erreur", "err"); }
  };

  // Échelle commune pour les barres « réel vs cible ».
  const scale = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.postes.map((p) => Math.max(p.pct, p.cible))) * 1.15;
  }, [data]);

  const RED = "linear-gradient(135deg,var(--ember1),var(--ember2))";

  return (
    <div className="space-y-5 font-sans">
      <div className="pagehead">
        <div>
          <div className="eyebrow">Gestion · Pilotage</div>
          <h1>Comptabilité</h1>
          <p className="lead">Tableau de gestion (pas de comptabilité légale). Le chiffre d&apos;affaires se calcule automatiquement depuis les inscriptions, les ventes de matériel et les produits divers. Chaque poste de dépense est comparé à sa cible.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className={labelCls}>Année</label>
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className={inputCls}>
              {(data?.annees ?? [annee]).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-line-soft">
        <TabBtn on={tab === "gestion"} onClick={() => setTab("gestion")}>Gestion</TabBtn>
        <TabBtn on={tab === "performance"} onClick={() => setTab("performance")}>Performance</TabBtn>
      </div>

      {tab === "performance" && <Performance annee={annee} />}

      {tab === "gestion" && (loading || !data ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi title="Chiffre d'affaires" value={euro(data.ca.total)} accent="navy" />
            <Kpi title="Total des dépenses" value={euro(data.totalDepenses)} accent="navy" />
            <Kpi title={`Marge (${data.margePct}%)`} value={euro(data.marge)} accent={data.marge >= 0 ? "green" : "ember"} />
            <Kpi title={`Dividendes réalistes (${data.partRealistePct}%)`} value={euro(data.dividendeRealiste)} accent={data.dividendeRealiste > 0 ? "green" : "ember"} />
          </div>

          {/* Détail du CA */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <h3 className="font-display text-base font-bold text-navy mb-3">Composition du chiffre d&apos;affaires</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <CaPart label="Inscriptions" value={data.ca.inscriptions} total={data.ca.total} />
              <CaPart label="Ventes de matériel" value={data.ca.materiel} total={data.ca.total} />
              <CaPart label="Produits divers" value={data.ca.extra} total={data.ca.total} />
            </div>
          </div>

          {/* Comment se calcule le CA ? (le CA ne se saisit pas, il s'additionne) */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <h3 className="font-display text-base font-bold text-navy mb-1">Comment se calcule le chiffre d&apos;affaires ?</h3>
            <p className="text-[13px] text-muted mb-4">Le CA ne se saisit pas à la main : il s&apos;additionne automatiquement à partir de trois sources. Renseignez chaque source à son endroit, le total se met à jour ici.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SourceCA n={1} color="var(--ca-insc)" titre="Inscriptions" montant={euro(data.ca.inscriptions)}
                desc="Somme des prix des inscriptions. Le prix reprend automatiquement le tarif de la formation."
                href="/calendrier" lien="Inscrire un stagiaire →" />
              <SourceCA n={2} color="var(--ca-mat)" titre="Ventes de matériel" montant={euro(data.ca.materiel)}
                desc="Fours, pétrins, matières premières… vendus aux stagiaires."
                href="/ventes" lien="Enregistrer une vente →" />
              <SourceCA n={3} color="var(--ca-extra)" titre="Produits divers" montant={euro(data.ca.extra)}
                desc="Commissions partenaires, subventions, remboursements. Se saisit dans le formulaire plus bas."
                href={null} lien="Formulaire « produit divers » ↓" />
            </div>
          </div>

          {/* Statistiques graphiques : camemberts CA + dépenses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h3 className="font-display text-base font-bold text-navy mb-4">Répartition du chiffre d&apos;affaires</h3>
              <DonutBlock
                centerLabel="CA total" centerValue={euro(data.ca.total)}
                segments={[
                  { label: "Inscriptions", value: data.ca.inscriptions, color: "var(--ca-insc)" },
                  { label: "Ventes de matériel", value: data.ca.materiel, color: "var(--ca-mat)" },
                  { label: "Produits divers", value: data.ca.extra, color: "var(--ca-extra)" },
                ]}
              />
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h3 className="font-display text-base font-bold text-navy mb-4">Dépenses par poste</h3>
              <DonutBlock
                centerLabel="Dépenses" centerValue={euro(data.totalDepenses)}
                segments={data.postes.map((p) => ({ label: p.label, value: p.total, color: POSTE_COLOR[p.categorie] }))}
              />
            </div>
          </div>

          {/* Dividendes — vue réaliste */}
          <Dividendes data={data} />

          {/* Postes de dépense vs cible */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-bold text-navy">Postes de dépense (% du CA vs cible)</h3>
              {editCibles ? (
                <div className="flex gap-2">
                  <button onClick={saveCibles} className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-white" style={{ background: RED }}>Enregistrer</button>
                  <button onClick={() => setEditCibles(false)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-muted">Annuler</button>
                </div>
              ) : (
                <button onClick={() => setEditCibles(true)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-navy hover:bg-surface-2">Modifier les cibles</button>
              )}
            </div>

            <div className="space-y-4">
              {data.postes.map((p) => (
                <div key={p.categorie}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUT_COLOR[p.statut] }} />
                      <span className="text-sm font-semibold text-ink">{p.label}</span>
                      <span className="text-[11px] text-dim">{euro(p.total)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums" style={{ color: STATUT_COLOR[p.statut] }}>{p.pct}%</span>
                      {editCibles ? (
                        <span className="flex items-center gap-1 text-[12px] text-muted">
                          cible
                          <input value={cibleForm[p.categorie] ?? ""} onChange={(e) => setCibleForm((f) => ({ ...f, [p.categorie]: e.target.value }))} inputMode="decimal" className="w-14 rounded-lg border border-line bg-bg-2 px-2 py-1 text-[13px] text-ink outline-none focus:border-navy" />%
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted w-16 text-right">cible {p.cible}%</span>
                      )}
                    </div>
                  </div>
                  {/* barre réel + marqueur cible */}
                  <div className="relative h-2.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (p.pct / scale) * 100)}%`, background: STATUT_COLOR[p.statut] }} />
                  </div>
                  <div className="relative h-0">
                    <span className="absolute -top-2.5 h-2.5 w-0.5 bg-navy/70" style={{ left: `${Math.min(100, (p.cible / scale) * 100)}%` }} title={`Cible ${p.cible}%`} />
                  </div>
                  <p className="mt-1.5 text-[12px] text-muted">{p.conseil}</p>
                </div>
              ))}
            </div>

            {editCibles && (
              <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-4 text-sm">
                <span className="font-semibold text-ink">Dividendes visés</span>
                <input value={dividendeForm} onChange={(e) => setDividendeForm(e.target.value)} inputMode="decimal" className="w-16 rounded-lg border border-line bg-bg-2 px-2 py-1 text-[13px] text-ink outline-none focus:border-navy" />
                <span className="text-muted">% du CA</span>
              </div>
            )}
          </div>

          {/* Saisies */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Dépense */}
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h3 className="font-display text-base font-bold text-navy mb-4">Enregistrer une dépense</h3>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Libellé</label>
                  <input value={dep.libelle} onChange={(e) => setDep({ ...dep, libelle: e.target.value })} placeholder="Facture farine, loyer avril…" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Poste</label>
                    <select value={dep.categorie} onChange={(e) => setDep({ ...dep, categorie: e.target.value })} className={inputCls}>
                      {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Montant HT (€)</label>
                    <input value={dep.montantHT} onChange={(e) => setDep({ ...dep, montantHT: e.target.value })} inputMode="decimal" placeholder="0" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={dep.date} onChange={(e) => setDep({ ...dep, date: e.target.value })} className={inputCls} />
                </div>
                <button onClick={submitDep} disabled={savingDep} className="w-full rounded-xl px-4 py-3 font-bold text-white shadow-lg transition hover:brightness-105 disabled:opacity-60" style={{ background: RED }}>
                  {savingDep ? "Enregistrement…" : "+ Ajouter la dépense"}
                </button>
              </div>
            </div>

            {/* Revenu extra */}
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h3 className="font-display text-base font-bold text-navy mb-4">Enregistrer un produit divers</h3>
              <p className="text-[12px] text-dim mb-3 -mt-2">Commissions partenaires, subventions, remboursements… (les ventes de matériel se saisissent dans « Ventes de matériel »).</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Libellé</label>
                  <input value={rev.libelle} onChange={(e) => setRev({ ...rev, libelle: e.target.value })} placeholder="Commission Le 5 Stagioni…" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Type</label>
                    <select value={rev.categorie} onChange={(e) => setRev({ ...rev, categorie: e.target.value })} className={inputCls}>
                      {REVENU_CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Montant (€)</label>
                    <input value={rev.montant} onChange={(e) => setRev({ ...rev, montant: e.target.value })} inputMode="decimal" placeholder="0" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={rev.date} onChange={(e) => setRev({ ...rev, date: e.target.value })} className={inputCls} />
                </div>
                <button onClick={submitRev} disabled={savingRev} className="w-full rounded-xl px-4 py-3 font-bold text-white shadow-lg transition hover:brightness-105 disabled:opacity-60" style={{ background: RED }}>
                  {savingRev ? "Enregistrement…" : "+ Ajouter le produit"}
                </button>
              </div>
            </div>
          </div>

          {/* Listes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h3 className="font-display text-base font-bold text-navy mb-3">Dépenses {annee}</h3>
              {data.depenses.length === 0 ? <p className="text-sm text-muted">Aucune dépense saisie.</p> : (
                <div className="divide-y divide-[var(--border-soft)]">
                  {data.depenses.map((d) => (
                    <Row key={d.id} titre={d.libelle} sous={`${CATS.find((c) => c.v === d.categorie)?.label ?? d.categorie} · ${new Date(d.date).toLocaleDateString("fr-FR")}`} montant={euro(d.montantHT)} onDel={() => delDep(d)} />
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h3 className="font-display text-base font-bold text-navy mb-3">Produits divers {annee}</h3>
              {data.revenus.length === 0 ? <p className="text-sm text-muted">Aucun produit divers saisi.</p> : (
                <div className="divide-y divide-[var(--border-soft)]">
                  {data.revenus.map((v) => (
                    <Row key={v.id} titre={v.libelle} sous={`${REVENU_CATS.find((c) => c.v === v.categorie)?.label ?? v.categorie} · ${new Date(v.date).toLocaleDateString("fr-FR")}`} montant={euro(v.montant)} onDel={() => delRev(v)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ))}
    </div>
  );
}

function TabBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className="px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors"
      style={{ borderColor: on ? "var(--ember1)" : "transparent", color: on ? "var(--text)" : "var(--muted)" }}>
      {children}
    </button>
  );
}

function Kpi({ title, value, accent }: { title: string; value: string; accent: "navy" | "ember" | "green" }) {
  const color = accent === "ember" ? "text-ember" : accent === "green" ? "text-green" : "text-navy";
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="text-[13px] text-muted">{title}</div>
      <div className={`mt-1.5 font-display text-2xl font-extrabold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function CaPart({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-line-soft bg-bg-2 p-3">
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="text-dim">{pct}%</span>
      </div>
      <div className="mt-1 font-display text-lg font-bold text-navy tabular-nums">{euro(value)}</div>
    </div>
  );
}

type Seg = { label: string; value: number; color: string };

// Camembert (donut) en SVG pur — 2px d'écart de surface, survol interactif.
function Donut({ segments, active, onHover, size = 168, thickness = 24 }: { segments: Seg[]; active: number | null; onHover: (i: number | null) => void; size?: number; thickness?: number }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const items = segments.map((s, i) => ({ ...s, i })).filter((s) => s.value > 0);
  const gap = total > 0 && items.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Camembert de répartition">
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

function DonutBlock({ segments, centerLabel, centerValue }: { segments: Seg[]; centerLabel: string; centerValue: string }) {
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const hovered = active !== null ? segments[active] : null;
  const hoveredPct = hovered && total > 0 ? Math.round((hovered.value / total) * 100) : 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: 168, height: 168 }}>
        <Donut segments={segments} active={active} onHover={setActive} />
        <div className="absolute inset-0 grid place-items-center text-center pointer-events-none px-6">
          {hovered ? (
            <div>
              <div className="text-[11px] text-muted truncate max-w-[120px]">{hovered.label}</div>
              <div className="font-display text-lg font-extrabold tabular-nums" style={{ color: hovered.color }}>{euro(hovered.value)}</div>
              <div className="text-[11px] text-dim tabular-nums">{hoveredPct}%</div>
            </div>
          ) : (
            <div>
              <div className="text-[11px] text-dim">{centerLabel}</div>
              <div className="font-display text-lg font-extrabold text-navy tabular-nums">{centerValue}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 w-full space-y-1">
        {total === 0 ? <p className="text-sm text-muted">Aucune donnée pour cette année.</p> : segments.map((s, i) => {
          if (s.value <= 0) return null;
          const pct = Math.round((s.value / total) * 100);
          const on = active === i;
          return (
            <div key={i} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1 -mx-2 cursor-default transition-colors"
              style={{ background: on ? "var(--surface2)" : "transparent", opacity: active !== null && !on ? 0.5 : 1 }}>
              <span className="h-3 w-3 rounded-[4px] shrink-0" style={{ background: s.color }} />
              <span className="text-[13px] text-ink flex-1 truncate">{s.label}</span>
              <span className="text-[13px] font-semibold text-navy tabular-nums">{euro(s.value)}</span>
              <span className="text-[11px] text-dim w-9 text-right tabular-nums">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dividendes({ data }: { data: Data }) {
  const color = data.dividendeStatut === "atteignable" ? "var(--green)" : data.dividendeStatut === "partiel" ? "#e0912b" : "var(--ember1)";
  const bg = data.dividendeStatut === "atteignable" ? "var(--green-bg)" : data.dividendeStatut === "partiel" ? "var(--amber-bg)" : "var(--rosso-bg)";
  // Jauge : part réaliste vs objectif, sur une échelle commune.
  const gaugeMax = Math.max(data.dividendeCible, data.partRealistePct, 12) * 1.12;
  const fillPct = Math.min(100, (data.partRealistePct / gaugeMax) * 100);
  const ciblePct = Math.min(100, (data.dividendeCible / gaugeMax) * 100);
  // « Où va le CA ? » : barre 100 % = dépenses (par poste) + marge distribuable.
  const denom = Math.max(1, data.ca.total, data.totalDepenses);
  const stack = [
    ...data.postes.filter((p) => p.total > 0).map((p) => ({ label: p.label, value: p.total, color: POSTE_COLOR[p.categorie] })),
    ...(data.marge > 0 ? [{ label: "Marge (→ dividendes)", value: data.marge, color: "var(--green)" }] : []),
  ];

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display text-base font-bold text-navy">Dividendes — objectif {data.dividendeCible}% du CA</h3>
      </div>
      <p className="text-[12px] text-dim mb-4">La part distribuable ne peut jamais dépasser la marge. Complétez vos inscriptions et dépenses réelles pour fiabiliser le calcul.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Mini label="Marge distribuable" value={euro(data.dividendePossible)} tone={data.dividendePossible > 0 ? "green" : "ember"} />
        <Mini label={`Objectif (${data.dividendeCible}% du CA)`} value={euro(data.dividendeVise)} tone="navy" />
        <Mini label={`Dividende réaliste (${data.partRealistePct}%)`} value={euro(data.dividendeRealiste)} tone={data.dividendeRealiste > 0 ? "green" : "ember"} />
      </div>

      {/* Jauge part réaliste vs objectif */}
      <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
        <span>Part de dividendes réaliste</span>
        <span>Objectif {data.dividendeCible}%</span>
      </div>
      <div className="relative h-3.5 rounded-full bg-surface-3 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${fillPct}%`, background: color }} />
      </div>
      <div className="relative h-0">
        <span className="absolute -top-[18px] h-[18px] w-0.5 bg-navy" style={{ left: `${ciblePct}%` }} title={`Objectif ${data.dividendeCible}%`} />
      </div>

      <div className="mt-4 rounded-xl px-3.5 py-2.5 text-[13px] font-medium" style={{ background: bg, color }}>
        {data.dividendeMessage}
      </div>

      {/* Où va le chiffre d'affaires ? */}
      <StackBar stack={stack} denom={denom} />
    </div>
  );
}

function StackBar({ stack, denom }: { stack: Seg[]; denom: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? stack[hover] : null;
  const hPct = h ? Math.round((h.value / denom) * 100) : 0;
  return (
    <div className="mt-5 pt-4 border-t border-line-soft">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink">Où va le chiffre d&apos;affaires ?</span>
        {h && <span className="text-[12px] font-semibold tabular-nums" style={{ color: h.color }}>{h.label} · {euro(h.value)} · {hPct}%</span>}
      </div>
      <div className="flex h-5 w-full overflow-hidden rounded-lg bg-surface-3">
        {stack.map((s, i) => (
          <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            title={`${s.label} : ${euro(s.value)}`}
            style={{ width: `${(s.value / denom) * 100}%`, background: s.color, borderRight: i < stack.length - 1 ? "2px solid var(--surface)" : undefined, opacity: hover !== null && hover !== i ? 0.4 : 1, transition: "opacity .15s", cursor: "pointer" }} />
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">Réduire les postes en rouge agrandit la marge verte — donc la part distribuable en dividendes.</p>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone: "navy" | "green" | "ember" }) {
  const color = tone === "green" ? "text-green" : tone === "ember" ? "text-ember" : "text-navy";
  return (
    <div className="rounded-xl border border-line-soft bg-bg-2 p-3">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`mt-1 font-display text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function SourceCA({ n, color, titre, montant, desc, href, lien }: { n: number; color: string; titre: string; montant: string; desc: string; href: string | null; lien: string }) {
  return (
    <div className="rounded-xl border border-line-soft bg-bg-2 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{n}</span>
        <span className="text-[13.5px] font-semibold text-ink flex-1">{titre}</span>
        <span className="font-display text-sm font-bold text-navy tabular-nums">{montant}</span>
      </div>
      <p className="text-[12px] text-muted leading-snug mb-2">{desc}</p>
      {href ? (
        <Link href={href} className="text-[12px] font-semibold text-ember hover:underline">{lien}</Link>
      ) : (
        <span className="text-[12px] font-semibold text-dim">{lien}</span>
      )}
    </div>
  );
}

function Row({ titre, sous, montant, onDel }: { titre: string; sous: string; montant: string; onDel: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-ink truncate">{titre}</div>
        <div className="text-[11px] text-dim">{sous}</div>
      </div>
      <b className="text-sm text-navy tabular-nums">{montant}</b>
      <button onClick={onDel} title="Supprimer" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-white hover:bg-ember hover:border-transparent transition">🗑</button>
    </div>
  );
}

// ---- Sous-onglet Performance (récap annuel + comparaison N-1) ----
interface PerfYear {
  annee: number; caTotal: number; caInscriptions: number; caMateriel: number; caExtra: number;
  nbInscriptions: number; nbStagiaires: number; nbSessions: number; ticketMoyen: number;
  stagiairesMoyens: number; depensesTotal: number; marge: number; postes: Record<string, number>;
}
interface PerfData { annee: number; anneePrec: number; current: PerfYear; previous: PerfYear; postesLabels: { categorie: string; label: string }[] }

function Performance({ annee }: { annee: number }) {
  const [d, setD] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try { const j = await (await fetch(`/api/comptabilite/performance?annee=${annee}`)).json(); if (!cancel) setD(j.data); }
      catch { /* silencieux */ }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [annee]);

  if (loading || !d) return <p className="text-sm text-muted">Chargement…</p>;
  const c = d.current, p = d.previous;
  const nb = (n: number) => n.toLocaleString("fr-FR");

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted">Récapitulatif <b className="text-ink">{d.annee}</b> comparé à <b className="text-ink">{d.anneePrec}</b>. Un écart en vert est favorable.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PerfCard label="Chiffre d'affaires" cur={euro(c.caTotal)} prevLabel={euro(p.caTotal)} rawCur={c.caTotal} rawPrev={p.caTotal} annPrec={d.anneePrec} />
        <PerfCard label="Stagiaires (distincts)" cur={nb(c.nbStagiaires)} prevLabel={nb(p.nbStagiaires)} rawCur={c.nbStagiaires} rawPrev={p.nbStagiaires} annPrec={d.anneePrec} />
        <PerfCard label="Inscriptions" cur={nb(c.nbInscriptions)} prevLabel={nb(p.nbInscriptions)} rawCur={c.nbInscriptions} rawPrev={p.nbInscriptions} annPrec={d.anneePrec} />
        <PerfCard label="Ticket moyen" cur={euro(c.ticketMoyen)} prevLabel={euro(p.ticketMoyen)} rawCur={c.ticketMoyen} rawPrev={p.ticketMoyen} annPrec={d.anneePrec} />
        <PerfCard label="Stagiaires moyens / session" cur={String(c.stagiairesMoyens)} prevLabel={String(p.stagiairesMoyens)} rawCur={c.stagiairesMoyens} rawPrev={p.stagiairesMoyens} annPrec={d.anneePrec} />
        <PerfCard label="Sessions" cur={nb(c.nbSessions)} prevLabel={nb(p.nbSessions)} rawCur={c.nbSessions} rawPrev={p.nbSessions} annPrec={d.anneePrec} />
        <PerfCard label="Dépenses" cur={euro(c.depensesTotal)} prevLabel={euro(p.depensesTotal)} rawCur={c.depensesTotal} rawPrev={p.depensesTotal} annPrec={d.anneePrec} invert />
        <PerfCard label="Marge" cur={euro(c.marge)} prevLabel={euro(p.marge)} rawCur={c.marge} rawPrev={p.marge} annPrec={d.anneePrec} />
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm overflow-x-auto">
        <h3 className="font-display text-base font-bold text-navy mb-3">Dépenses par poste — {d.annee} vs {d.anneePrec}</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase text-dim">
            <th className="py-2">Poste</th><th className="py-2 text-right">{d.annee}</th><th className="py-2 text-right">{d.anneePrec}</th><th className="py-2 text-right">Écart</th>
          </tr></thead>
          <tbody>
            {d.postesLabels.map((pl) => {
              const cur = c.postes[pl.categorie] ?? 0, prev = p.postes[pl.categorie] ?? 0;
              return (
                <tr key={pl.categorie} className="border-t border-line-soft">
                  <td className="py-2 text-ink">{pl.label}</td>
                  <td className="py-2 text-right tabular-nums text-navy">{euro(cur)}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{euro(prev)}</td>
                  <td className="py-2 text-right tabular-nums"><Ecart diff={cur - prev} invert /></td>
                </tr>
              );
            })}
            <tr className="border-t border-line font-bold">
              <td className="py-2 text-ink">Total</td>
              <td className="py-2 text-right tabular-nums text-navy">{euro(c.depensesTotal)}</td>
              <td className="py-2 text-right tabular-nums text-muted">{euro(p.depensesTotal)}</td>
              <td className="py-2 text-right tabular-nums"><Ecart diff={c.depensesTotal - p.depensesTotal} invert /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerfCard({ label, cur, prevLabel, rawCur, rawPrev, annPrec, invert }: { label: string; cur: string; prevLabel: string; rawCur: number; rawPrev: number; annPrec: number; invert?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-extrabold text-navy tabular-nums">{cur}</div>
      <div className="mt-1.5 flex items-center gap-2 text-[12px]">
        <Delta cur={rawCur} prev={rawPrev} invert={invert} />
        <span className="text-dim">vs {annPrec} : {prevLabel}</span>
      </div>
    </div>
  );
}

function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="text-dim font-semibold">nouveau</span>;
  const diff = cur - prev;
  const pct = Math.round((diff / Math.abs(prev)) * 1000) / 10;
  const good = diff === 0 ? null : invert ? diff < 0 : diff > 0;
  const color = good === null ? "var(--muted)" : good ? "var(--green)" : "var(--ember1)";
  return <span style={{ color, fontWeight: 700 }}>{diff >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

function Ecart({ diff, invert }: { diff: number; invert?: boolean }) {
  const good = diff === 0 ? null : invert ? diff < 0 : diff > 0;
  const color = good === null ? "var(--muted)" : good ? "var(--green)" : "var(--ember1)";
  return <span style={{ color, fontWeight: 600 }}>{diff > 0 ? "+" : ""}{euro(diff)}</span>;
}
