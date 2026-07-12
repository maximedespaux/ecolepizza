import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";
import { getSharedRecipes, getRecipe, createRecipe } from "../api/apiClient.js";

/**
 * Communauté — les fiches techniques partagées par les stagiaires de l'organisme.
 * Consultation en lecture seule ; on peut copier une recette dans ses propres recettes.
 */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// Hashtags (#tag) de la description → badges.
const TAG_RE = /#[\p{L}\p{N}_-]+/gu;
const parseTags = (s) => Array.from(new Set((String(s || "").match(TAG_RE) || []).map((t) => t.slice(1))));
function Tags({ text }) {
  const tags = parseTags(text);
  if (!tags.length) return null;
  return <div className="tag-row">{tags.map((t) => <span key={t} className="badge-tag">#{t}</span>)}</div>;
}
function costs(d) {
  const nb = Math.max(1, num(d.servings));
  const dough = ((num(d.paton_g) / 1000) / 1.68) * num(d.flour_price);
  const line = (t) => (t.unit === "g" ? (num(t.qty) / 1000) * num(t.unit_price) : num(t.qty) * num(t.unit_price));
  const topping = (d.ingredients || []).reduce((s, t) => s + line(t), 0);
  const per = dough + topping;
  return { per, price: per * (1 + num(d.margin_pct) / 100), nb, line };
}

export default function Communaute() {
  const [list, setList] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { getSharedRecipes().then((r) => setList(r.data || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    getRecipe(openId).then((r) => setDetail(r.data)).catch(() => setDetail(null));
  }, [openId]);

  async function copyToMine(d) {
    setBusy(true);
    try {
      await createRecipe({ ...d, id: null, name: `${d.name} (copie)`, visibility: "PRIVATE" });
      navigate("/fiche-recette");
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHead eyebrow="Outils · communauté" title="Communauté"
        lead="Les fiches techniques partagées par les autres stagiaires. Inspire-toi, ou copie-en une dans tes recettes pour l'adapter." />

      {list.length === 0 ? (
        <EmptyState icon="users">Aucune recette partagée pour l'instant. Sois le premier : partage une fiche technique depuis « Fiche technique ».</EmptyState>
      ) : (
        <div className="grid cols-2" style={{ alignItems: "start" }}>
          <Card title={<span className="card-ttl"><Icon name="users" size={16} /> Recettes partagées ({list.length})</span>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {list.map((s) => (
                <button key={s.id} className={"comm-row" + (openId === s.id ? " on" : "")} onClick={() => setOpenId((cur) => (cur === s.id ? null : s.id))}>
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <b>{s.name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{s.type} · par {s.author_name || "Stagiaire"} · {s.updated_at}</span>
                    <Tags text={s.description} />
                  </span>
                  <Icon name="chevron-right" size={16} />
                </button>
              ))}
            </div>
          </Card>

          <div>
            {!detail ? (
              <Card><p className="hint" style={{ margin: 0 }}>Sélectionne une recette pour voir le détail.</p></Card>
            ) : (
              <Card title={<span className="card-ttl"><Icon name="pizza" size={16} /> {detail.name}</span>}
                more={<button className="btn sm primary" disabled={busy} onClick={() => copyToMine(detail)}><Icon name="plus" size={13} /> Copier</button>}>
                <div className="hint" style={{ marginTop: -4 }}>{detail.type} · par {detail.author_name || "Stagiaire"}</div>
                {detail.description && <p style={{ fontSize: 13.5, margin: "10px 0" }}>{detail.description}</p>}
                <Tags text={detail.description} />
                {(() => { const c = costs(detail); return (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0" }}>
                      {(detail.ingredients || []).map((t, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--border-soft)", paddingBottom: 4 }}>
                          <span>{t.label} <span className="hint">· {num(t.qty)} {t.unit}</span></span>
                          <span className="mono">{euro(c.line(t))}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                      <span className="hint">Coût {euro(c.per)} / pizza · marge {detail.margin_pct} %</span>
                      <b style={{ fontSize: 18, color: "var(--ember1)" }}>{euro(c.price)} <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>/ pizza</span></b>
                    </div>
                  </>
                ); })()}
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
