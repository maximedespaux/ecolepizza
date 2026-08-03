import { useEffect, useMemo, useState } from "react";
import { getAudit } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Squelette } from "../components/Squelette.jsx";
import { auditLabel, entityLabel } from "../lib/auditLabels.js";

const pad = (n) => String(n).padStart(2, "0");
const jourDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* « Aujourd'hui » et « Hier » plutôt qu'une date : dans un journal, ce qu'on cherche d'abord
   est la distance au présent, pas le quantième. Les jours calculés au rendu et non au chargement
   du module — une page ouverte toute la nuit annoncerait sinon « Aujourd'hui » sur la veille. */
function libelleJour(j) {
  const auj = jourDe(new Date());
  if (j === auj) return "Aujourd'hui";
  if (j === jourDe(new Date(Date.now() - 864e5))) return "Hier";
  const d = new Date(`${j}T00:00:00`);
  if (Number.isNaN(d.getTime())) return j || "Date inconnue";
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Audit() {
  const [rows, setRows] = useState(null); // `null` = on charge, `[]` = journal vide
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(null);

  async function load(query = "") {
    try { setRows((await getAudit(query)).data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  /* Le journal arrive déjà trié du plus récent au plus ancien : un Map suffit à le découper
     par jour EN CONSERVANT cet ordre, là où un tri par clé le casserait. */
  const jours = useMemo(() => {
    if (!rows) return null;
    const m = new Map();
    for (const r of rows) {
      const j = String(r.created_at || "").slice(0, 10);
      if (!m.has(j)) m.set(j, []);
      m.get(j).push(r);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <>
      <PageHead eyebrow="Système" title="Journal d'audit" lead="Traçabilité des actions sensibles (100 dernières)." />
      <StatusMessage status={status} />

      <div className="filtres">
        <input className="inp filtres-q" aria-label="Rechercher une action dans le journal" placeholder="Rechercher une action…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card title={`Événements${rows ? ` (${rows.length})` : ""}`}>
        {rows == null ? (
          <Squelette lignes={6} h={44} />
        ) : rows.length === 0 ? (
          <EmptyState icon="history" title="Aucun événement"
            text="Le journal est vide, ou aucun événement ne correspond aux filtres choisis." />
        ) : (
          /* GROUPÉ PAR JOUR. Une liste plate ne disait pas si un événement datait de ce matin
             ou de trois semaines — or dans un journal, la date EST l'information. L'intitulé du
             jour reste collé en haut pendant qu'on descend : on sait toujours quand on est.
             La date disparaît des lignes, qui ne portent plus que l'heure — elle était répétée
             cent fois pour dire cent fois la même chose. */
          <div className="aud">
            {jours.map(([j, evs]) => (
              <div key={j} className="aud-j">
                <div className="aud-jt">
                  <b>{libelleJour(j)}</b>
                  <span>{evs.length} événement{evs.length > 1 ? "s" : ""}</span>
                </div>
                {evs.map((r) => {
                  const { label, tone } = auditLabel(r.action, r.entity);
                  const who = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Système";
                  return (
                    /* La couleur porte le TYPE d'action — vert pour ce qui aboutit, tomate pour
                       ce qui supprime. Une pastille et un intitulé teinté plutôt que cent
                       étiquettes empilées : sur une page entière, tout mettre en avant revient
                       à ne rien mettre en avant. On balaie la colonne de couleur, on s'arrête
                       sur le rouge. */
                    <div key={r.id} className={`aud-l ton-${tone}`}>
                      <span className="aud-h tnum">{String(r.created_at || "").slice(11, 16) || "-"}</span>
                      <span className="aud-pt" aria-hidden="true" />
                      <span className="aud-a">{label}</span>
                      <span className="aud-e">{entityLabel(r.entity)}</span>
                      <span className="aud-q">{who}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default Audit;
