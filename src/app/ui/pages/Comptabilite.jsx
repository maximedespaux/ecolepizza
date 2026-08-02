import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Link } from "react-router-dom";
import {
  getComptabilite, getComptaPerformance, createExpense, deleteExpense, saveComptaTargets, deleteRevenue,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import MoneyToggle from "../components/MoneyToggle.jsx";

const REV_LABEL = { COMMISSION: "Commission partenaire", SUBVENTION: "Subvention", AUTRE: "Autre produit" };
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

// Titre de carte avec icône de tête.
const T = (icon, text) => <span className="card-ttl"><Icon name={icon} size={16} /> {text}</span>;

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function Comptabilite() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [tab, setTab] = useState("gestion");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const [dep, setDep] = useState({ label: "", categorie: "MATIERES_PREMIERES", montantHT: "", date: today() });
  const [savingDep, setSavingDep] = useState(false);

  const [editCibles, setEditCibles] = useState(false);
  const [cibleForm, setCibleForm] = useState({});
  const [dividendeForm, setDividendeForm] = useState("10");

  const load = useCallback(async (an, mo, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data: d } = await getComptabilite(an, mo);
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
  useEffect(() => { load(annee, mois); }, [annee, mois, load]);

  async function submitDep() {
    if (!dep.label.trim() || !dep.montantHT) { setStatus({ type: "error", message: "Libellé et montant requis." }); return; }
    setSavingDep(true);
    try {
      await createExpense(dep);
      setDep({ label: "", categorie: dep.categorie, montantHT: "", date: today() });
      setStatus({ type: "success", message: "Dépense enregistrée." });
      load(annee, mois, { silent: true });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSavingDep(false); }
  }

  async function delDep(d) {
    if (!window.confirm(`Supprimer « ${d.label} » ?`)) return;
    try { await deleteExpense(d.id); load(annee, mois, { silent: true }); } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function delRev(r) {
    if (!window.confirm(`Supprimer le produit « ${r.label} » (${euro(r.amount)}) ?`)) return;
    try { await deleteRevenue(r.id); load(annee, mois, { silent: true }); } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function saveCibles() {
    const targets = {};
    for (const c of CATS) { const n = Number(cibleForm[c.v]); if (Number.isFinite(n)) targets[c.v] = n; }
    try {
      await saveComptaTargets({ targets, dividendeCible: Number(dividendeForm) });
      setEditCibles(false);
      setStatus({ type: "success", message: "Cibles enregistrées." });
      load(annee, mois, { silent: true });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  /* LE LIBELLÉ DE LA PÉRIODE, écrit une fois et repris partout. Chaque titre portait l'ANNÉE en
     dur (« Résultat 2026 », « Dépenses 2026 ») alors que les chiffres suivent maintenant le mois :
     un intitulé qui annonce l'année au-dessus d'un total mensuel est pire qu'un intitulé absent. */
  const periode = mois === 0 ? String(annee) : `${MOIS[mois - 1].toLowerCase()} ${annee}`;

  const scale = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.postes.map((p) => Math.max(p.pct, p.cible))) * 1.15;
  }, [data]);

  return (
    <>
      <PageHead
        eyebrow="Gestion · Pilotage"
        title="Comptabilité"
        // L'avertissement reste : il empêche de prendre cet écran pour une comptabilité
        // opposable. Le reste décrivait ce qui est maintenant lisible juste en dessous.
        lead="Tableau de gestion — ce n'est pas une comptabilité légale."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <MoneyToggle />
            {/* `.inp` impose width:100% aux <select> ; dans cette barre horizontale, deux selects
                pleine largeur écrasaient le bouton Masquer voisin. On les laisse tenir la largeur
                de leur contenu — width:auto — pour que la rangée reste alignée. */}
            {/* LE MOIS PILOTE TOUTE LA PAGE. Il ne pilotait qu'une tuile sur une quinzaine — un
                sélecteur en tête d'écran qui ne change qu'un chiffre se lit, à juste titre, comme
                cassé. Valeur 0 = année entière. */}
            <select className="inp" style={{ width: "auto" }} value={mois} onChange={(e) => setMois(Number(e.target.value))} aria-label="Mois">
              <option value={0}>Année entière</option>
              {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select className="inp" style={{ width: "auto" }} value={annee} onChange={(e) => setAnnee(Number(e.target.value))} aria-label="Année">
              {(data?.annees ?? [annee]).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
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
          {/* UN SEUL CHIFFRE DOMINANT : LE RÉSULTAT.
              Cinq indicateurs se partageaient le premier écran — chiffre d'affaires, dépenses,
              marge, dividendes, gain du mois — et TROIS D'ENTRE EUX SE DÉDUISENT DES AUTRES.
              Sans dépense, ils affichaient littéralement la même somme trois fois : « 1 031 € »
              en CA, en marge, et en gain du mois. Cinq tuiles pour un seul renseignement.
              Le calcul est désormais ÉCRIT plutôt que réparti : recettes − dépenses = marge.
              On lit d'où vient le résultat au lieu de le recomposer de tuile en tuile. */}
          <div className="bilan" style={{ "--ton": data.marge >= 0 ? "var(--green)" : "var(--ember1)" }}>
            <div className="bilan-t">Résultat {periode}</div>
            <div className="bilan-n tnum" style={{ color: data.marge >= 0 ? "var(--green)" : "var(--ember1)" }}>
              {euro(data.marge)}
            </div>
            <div className="bilan-calc">
              <span><b className="tnum">{euro(data.ca.total)}</b> de recettes</span>
              <i aria-hidden="true">−</i>
              <span><b className="tnum">{euro(data.totalDepenses)}</b> de dépenses</span>
              <i aria-hidden="true">=</i>
              <span><b className="tnum">{data.margePct}%</b> de marge</span>
            </div>
            <div className="bilan-sat">
              <span>
                <b className="tnum">{euro(data.dividendeRealiste)}</b> de dividendes réalistes
                <i> ({data.partRealistePct}% du CA)</i>
              </span>
              {/* LA LIGNE « GAIN DU MOIS » A DISPARU. Elle existait parce qu'elle était le SEUL
                  chiffre à suivre le sélecteur, avec sa propre règle d'attribution. Maintenant que
                  toute la page suit le mois — et avec la même règle — elle répéterait mot pour mot
                  le résultat affiché juste au-dessus. */}
            </div>
          </div>

          {/* Composition du CA (3 cartes %) */}
          <Card title={T("calculator", "Composition du chiffre d'affaires")}>
            <div className="grid cols-3">
              <CaPart label="Inscriptions" value={data.ca.inscriptions} total={data.ca.total} color={CA_COLORS.insc} />
              <CaPart label="Ventes de matériel" value={data.ca.materiel} total={data.ca.total} color={CA_COLORS.mat} />
              <CaPart label="Produits divers" value={data.ca.extra} total={data.ca.total} color={CA_COLORS.extra} />
            </div>
          </Card>

          {/* Camemberts */}
          <div className="grid cols-2">
            <Card title={T("target", "Répartition du chiffre d'affaires")}>
              <DonutBlock
                centerLabel="CA total" centerValue={euro(data.ca.total)}
                segments={[
                  { label: "Inscriptions", value: data.ca.inscriptions, color: CA_COLORS.insc },
                  { label: "Ventes de matériel", value: data.ca.materiel, color: CA_COLORS.mat },
                  { label: "Produits divers", value: data.ca.extra, color: CA_COLORS.extra },
                ]}
              />
            </Card>
            <Card title={T("receipt", "Dépenses par poste")}>
              <DonutBlock
                centerLabel="Dépenses" centerValue={euro(data.totalDepenses)}
                segments={data.postes.map((p) => ({ label: p.label, value: p.total, color: POSTE_COLOR[p.categorie] }))}
              />
            </Card>
          </div>

          {/* Comment se calcule le CA */}
          <Card title={T("help", "Comment se calcule le chiffre d'affaires ?")}>
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
            <Card title={T("receipt", "Enregistrer une dépense")}>
              {/* Les quatre étiquettes de ce formulaire étaient visibles mais non RELIÉES :
                  cliquer « Montant HT » ne plaçait pas le curseur dans la case, et un lecteur
                  d'écran annonçait quatre champs anonymes à la suite. */}
              <div className="field"><label htmlFor="dep-libelle">Libellé</label>
                <input id="dep-libelle" className="inp" value={dep.label} onChange={(e) => setDep({ ...dep, label: e.target.value })} placeholder="Facture farine, loyer avril…" /></div>
              <div className="row2">
                <div className="field"><label htmlFor="dep-poste">Poste</label>
                  <select id="dep-poste" value={dep.categorie} onChange={(e) => setDep({ ...dep, categorie: e.target.value })}>
                    {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                  </select></div>
                <div className="field"><label htmlFor="dep-montant">Montant HT (€)</label>
                  <input id="dep-montant" className="inp" inputMode="decimal" value={dep.montantHT} onChange={(e) => setDep({ ...dep, montantHT: e.target.value })} placeholder="0" /></div>
              </div>
              <div className="field"><label htmlFor="dep-date">Date</label>
                <input id="dep-date" className="inp" type="date" value={dep.date} onChange={(e) => setDep({ ...dep, date: e.target.value })} /></div>
              <button className="btn primary" style={{ width: "100%" }} disabled={savingDep} onClick={submitDep}>
                {savingDep ? "Enregistrement…" : "+ Ajouter la dépense"}
              </button>
            </Card>
          </div>

          {/* Listes dépenses + produits divers */}
          <div className="grid cols-2">
            <Card title={T("receipt", `Dépenses ${periode}`)}>
              {data.depenses.length === 0 ? (
                <EmptyState icon="receipt" title="Aucune dépense saisie"
                  text="Ajoutez vos factures et charges avec le formulaire ci-dessus : elles alimentent la répartition par poste et le résultat de la période." />
              ) : (
                <div>{data.depenses.map((d) => (
                  <ListRow key={d.id} titre={d.label} sous={`${CATS.find((c) => c.v === d.category)?.label ?? d.category} · ${new Date(d.date).toLocaleDateString("fr-FR")}`} montant={euro(d.amount_ht)} onDel={() => delDep(d)} />
                ))}</div>
              )}
            </Card>
            <Card title={T("coins", `Produits divers ${periode} · ${euro(data.ca.extra)}`)}>
              {(!data.revenus || data.revenus.length === 0) ? (
                <EmptyState icon="handshake" title="Aucun produit divers"
                  text="Les commissions et apports des partenaires se saisissent depuis la page Partenaires ; ils remontent ici automatiquement." />
              ) : (
                <div>{data.revenus.map((r) => (
                  <ListRow key={r.id} titre={r.label} sous={`${REV_LABEL[r.category] ?? r.category} · ${new Date(r.date).toLocaleDateString("fr-FR")}`} montant={euro(r.amount)} onDel={() => delRev(r)} />
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
      <div className="tnum" style={{ fontWeight: 700, fontSize: 18, color: "var(--blue)", marginTop: 4 }}>{euro(value)}</div>
    </div>
  );
}

function SourceCA({ n, color, titre, montant, desc, href, lien }) {
  return (
    <div className="src-ca">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="src-n" style={{ background: color }}>{n}</span>
        <b style={{ flex: 1 }}>{titre}</b>
        <b className="tnum" style={{ color: "var(--blue)" }}>{montant}</b>
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
      <b className="tnum" style={{ color: "var(--blue)" }}>{montant}</b>
      <button type="button" className="iconbtn del" title="Supprimer" onClick={onDel}><Icon name="trash" size={15} /></button>
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
              <div className="tnum" style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.15, color: "var(--blue)" }}>{centerValue}</div>
            </>
          )}
        </div>
      </div>
      <div style={{ flex: 1, width: "100%" }}>
        {total === 0 ? <p className="lead" style={{ margin: 0 }}>Aucune donnée sur cette période.</p> : segments.map((s, i) => {
          if (s.value <= 0) return null;
          const pct = Math.round((s.value / total) * 100);
          const on = active === i;
          return (
            <div key={i} className="legend-row" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              style={{ background: on ? "var(--surface2)" : "transparent", opacity: active !== null && !on ? 0.5 : 1 }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              <b className="tnum" style={{ color: "var(--blue)" }}>{euro(s.value)}</b>
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
    <Card title={T("coins", `Dividendes — objectif ${data.dividendeCible}% du CA`)}>
      <p className="sub" style={{ marginTop: -4 }}>La part distribuable ne peut jamais dépasser la marge.</p>
      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <Mini label="Marge distribuable" value={euro(data.dividendePossible)} tone={data.dividendePossible > 0 ? "var(--green)" : "var(--ember1)"} />
        <Mini label={`Objectif (${data.dividendeCible}% du CA)`} value={euro(data.dividendeVise)} tone="var(--blue)" />
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
        <PerfCard label="Chiffre d'affaires" icon="euro" tone="blue" cur={euro(c.caTotal)} prev={euro(p.caTotal)} rc={c.caTotal} rp={p.caTotal} an={d.anneePrec} />
        <PerfCard label="Stagiaires (distincts)" icon="users" tone="green" cur={nb(c.nbStagiaires)} prev={nb(p.nbStagiaires)} rc={c.nbStagiaires} rp={p.nbStagiaires} an={d.anneePrec} />
        <PerfCard label="Inscriptions" icon="user-plus" tone="orange" cur={nb(c.nbInscriptions)} prev={nb(p.nbInscriptions)} rc={c.nbInscriptions} rp={p.nbInscriptions} an={d.anneePrec} />
        <PerfCard label="Ticket moyen" icon="coins" tone="ember" cur={euro(c.ticketMoyen)} prev={euro(p.ticketMoyen)} rc={c.ticketMoyen} rp={p.ticketMoyen} an={d.anneePrec} />
        <PerfCard label="Stagiaires moyens / session" icon="users" tone="blue" cur={String(c.stagiairesMoyens)} prev={String(p.stagiairesMoyens)} rc={c.stagiairesMoyens} rp={p.stagiairesMoyens} an={d.anneePrec} />
        <PerfCard label="Sessions" icon="calendar" tone="orange" cur={nb(c.nbSessions)} prev={nb(p.nbSessions)} rc={c.nbSessions} rp={p.nbSessions} an={d.anneePrec} />
        <PerfCard label="Dépenses" icon="receipt" tone="ember" cur={euro(c.depensesTotal)} prev={euro(p.depensesTotal)} rc={c.depensesTotal} rp={p.depensesTotal} an={d.anneePrec} invert />
        <PerfCard label="Marge" icon="target" tone="green" cur={euro(c.marge)} prev={euro(p.marge)} rc={c.marge} rp={p.marge} an={d.anneePrec} />
      </div>
      <Card title={T("receipt", `Dépenses par poste — ${d.annee} vs ${d.anneePrec}`)}>
        <DataTable
          rows={d.postesLabels}
          rowKey={(pl) => pl.categorie}
          cols={[
            { k: "poste", t: "Poste", principal: true, cell: (pl) => pl.label },
            { k: "cur", t: String(d.annee), th: { className: "ta-r" }, td: { textAlign: "right" },
              cell: (pl) => <span className="tnum">{euro(c.postes[pl.categorie] ?? 0)}</span> },
            { k: "prev", t: String(d.anneePrec), th: { className: "ta-r" }, td: { textAlign: "right", color: "var(--muted)" },
              cell: (pl) => <span className="tnum">{euro(p.postes[pl.categorie] ?? 0)}</span> },
            // `invert` : sur des DÉPENSES, une hausse est une mauvaise nouvelle — l'écart doit
            // donc se colorer à l'envers d'un chiffre d'affaires.
            { k: "ecart", t: "Écart", th: { className: "ta-r" }, td: { textAlign: "right" },
              cell: (pl) => <span className="tnum"><Ecart diff={(c.postes[pl.categorie] ?? 0) - (p.postes[pl.categorie] ?? 0)} invert /></span> },
          ]}
          pied={{
            poste: "Total",
            cur: <span className="tnum">{euro(c.depensesTotal)}</span>,
            prev: <span className="tnum">{euro(p.depensesTotal)}</span>,
            ecart: <span className="tnum"><Ecart diff={c.depensesTotal - p.depensesTotal} invert /></span>,
          }}
        />
      </Card>
    </div>
  );
}

function PerfCard({ label, cur, prev, rc, rp, an, invert, icon, tone = "blue" }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="lbl">{label}</div>
        {icon && <span className={`kpi-ic tone-${tone}`}><Icon name={icon} size={18} /></span>}
      </div>
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
  return <span style={{ color, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name={diff >= 0 ? "arrow-up" : "arrow-down"} size={12} /> {Math.abs(pct)}%</span>;
}

function Ecart({ diff, invert }) {
  const good = diff === 0 ? null : invert ? diff < 0 : diff > 0;
  const color = good === null ? "var(--muted)" : good ? "var(--green)" : "var(--ember1)";
  return <span style={{ color, fontWeight: 600 }}>{diff > 0 ? "+" : ""}{euro(diff)}</span>;
}

export default Comptabilite;
