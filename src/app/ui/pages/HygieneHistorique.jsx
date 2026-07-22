import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import { GROUPS, REGISTERS, registerByEnum, STATUS_META, fmtDateTime, fmtDate } from "../lib/hygiene.js";
import { getHygieneEntries } from "../api/apiClient.js";

/**
 * Historique unifié de la maîtrise sanitaire : TOUS les logs, tous registres confondus, sur une
 * seule page. Filtres par domaine (les 3 colonnes du hub), par registre, non-conformités, ou DLC.
 * C'est la « preuve de conformité » à présenter en cas de contrôle.
 */
export default function HygieneHistorique() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [migration, setMigration] = useState(false);

  const group = params.get("groupe") || "";      // TRACA | TEMP | HYGIENE
  const reg = params.get("reg") || "";           // clé de registre
  const only = params.get("filtre") || "";       // 'nc' (non conformes) | 'dlc'
  const q = params.get("q") || "";               // recherche libre (produit / n° de lot)

  useEffect(() => {
    setLoading(true);
    getHygieneEntries({ limit: 500 })
      .then((r) => { setRows(r.data || []); setMigration(!!r.migration); })
      .catch((e) => setStatus({ type: "error", message: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k === "groupe") p.delete("reg"); // changer de domaine réinitialise le sous-filtre registre
    setParams(p, { replace: true });
  };

  const filtered = useMemo(() => {
    let list = rows;
    if (group) list = list.filter((e) => registerByEnum(e.register)?.group === group);
    if (reg) list = list.filter((e) => registerByEnum(e.register)?.key === reg);
    if (only === "nc") list = list.filter((e) => e.status === "NON_CONFORME" || e.status === "OUVERT");
    if (only === "dlc") list = list.filter((e) => e.due_at);
    if (q.trim()) {
      // Recherche produit / n° de lot — le cœur du « rappel produit » : on retrouve d'un coup
      // toutes les préparations, réceptions et étiquettes portant un lot ou un nom donné.
      const needle = q.trim().toLowerCase();
      list = list.filter((e) =>
        `${e.title || ""} ${e.meta?.lot || ""} ${e.meta?.supplier || ""}`.toLowerCase().includes(needle));
    }
    return list;
  }, [rows, group, reg, only, q]);

  // Regroupement par jour pour des en-têtes de date lisibles.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      const key = fmtDate(e.occurred_at) || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return [...map.entries()];
  }, [filtered]);

  const regsForGroup = group ? REGISTERS.filter((r) => r.group === group) : [];

  return (
    <div>
      <PageHead
        eyebrow={<Link to="/hygiene" className="hs-back"><Icon name="chevron-left" size={14} /> Maîtrise sanitaire</Link>}
        title="Historique complet"
        lead="Tous vos enregistrements d'hygiène, réunis. Filtrez par domaine, par module, ou n'affichez que ce qui a coincé."
      />

      {migration && (
        <div className="status" style={{ background: "var(--amber-bg)", color: "var(--text)" }}>
          L'historique se remplira dès la mise à jour de la base (migration 103).
        </div>
      )}

      {/* Recherche produit / n° de lot — rappel produit */}
      <div className="hs-search">
        <Icon name="search" size={16} />
        <input
          className="inp" type="search" value={q}
          placeholder="Rechercher un produit ou un n° de lot (rappel produit)…"
          onChange={(e) => setParam("q", e.target.value)}
        />
        {q && <button className="icon-btn" onClick={() => setParam("q", "")} aria-label="Effacer"><Icon name="x" size={15} /></button>}
      </div>
      {q.trim() && (
        <p className="hs-search-hint">
          <Icon name="info" size={14} /> {filtered.length} résultat{filtered.length > 1 ? "s" : ""} pour « {q.trim()} » — toutes les traces portant ce nom ou ce lot.
        </p>
      )}

      {/* Filtres par domaine */}
      <div className="hs-filters">
        <button className={`seg-btn ${!group ? "on" : ""}`} onClick={() => setParam("groupe", "")}>Tout</button>
        {GROUPS.map((g) => (
          <button key={g.key} className={`seg-btn ${group === g.key ? "on" : ""}`} onClick={() => setParam("groupe", g.key)}>{g.label}</button>
        ))}
        <span className="hs-filters-sep" />
        <button className={`seg-btn ${only === "nc" ? "on" : ""}`} onClick={() => setParam("filtre", only === "nc" ? "" : "nc")}>
          <Icon name="alert-triangle" size={13} /> Non conformes
        </button>
        <button className={`seg-btn ${only === "dlc" ? "on" : ""}`} onClick={() => setParam("filtre", only === "dlc" ? "" : "dlc")}>
          <Icon name="clock" size={13} /> DLC
        </button>
      </div>

      {/* Sous-filtre par registre du domaine choisi */}
      {regsForGroup.length > 0 && (
        <div className="hs-filters sub">
          <button className={`chip-btn ${!reg ? "on" : ""}`} onClick={() => setParam("reg", "")}>Tous</button>
          {regsForGroup.map((r) => (
            <button key={r.key} className={`chip-btn ${reg === r.key ? "on" : ""}`} onClick={() => setParam("reg", r.key)}>
              <Icon name={r.icon} size={13} /> {r.short}
            </button>
          ))}
        </div>
      )}

      <StatusMessage status={status} />

      <Card more={<span className="chip">{filtered.length}</span>} title="Journal">
        {loading ? (
          <p className="muted" style={{ padding: "8px 2px" }}>Chargement…</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon="history">
            <b>Aucun enregistrement.</b><br />Les entrées de vos registres apparaîtront ici.
          </EmptyState>
        ) : (
          byDay.map(([day, items]) => (
            <div key={day} className="hs-hist-day">
              <div className="hs-hist-date">{day}</div>
              <ul className="hs-hist-list">
                {items.map((e) => <HistRow key={e.id} entry={e} />)}
              </ul>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function HistRow({ entry }) {
  const cfg = registerByEnum(entry.register);
  if (!cfg) return null;
  const sm = entry.status ? STATUS_META[entry.status] : null;
  const val = cfg.value?.(entry);
  const secondary = cfg.secondary?.(entry);
  const time = fmtDateTime(entry.occurred_at)?.split(" ").pop();
  return (
    <li className="hs-hist-row">
      <Link to={`/hygiene/${cfg.key}`} className={`hs-hist-ic accent-${cfg.accent}`} title={cfg.title}>
        <Icon name={cfg.icon} size={16} />
      </Link>
      <div className="hs-hist-main">
        <div className="hs-hist-top">
          <b>{cfg.primary(entry)}</b>
          {val && <span className="hs-log-val">{val}</span>}
          {sm && <span className={`hs-badge ${sm.tone}`}>{sm.label}</span>}
        </div>
        <div className="hs-hist-sub">
          <span className="hs-hist-reg">{cfg.short}</span>
          <span>· {time}</span>
          {secondary && <span>· {secondary}</span>}
          {entry.due_at && <span className="hs-due">· DLC {fmtDate(entry.due_at)}</span>}
        </div>
      </div>
    </li>
  );
}
