import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";
import { getSharedRecipes, getRecipe, createRecipe, likeRecipe, addRecipeComment, deleteRecipeComment } from "../api/apiClient.js";

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
  const [cbody, setCbody] = useState("");
  const navigate = useNavigate();

  useEffect(() => { getSharedRecipes().then((r) => setList(r.data || [])).catch(() => {}); }, []);
  useEffect(() => {
    setCbody("");
    if (!openId) { setDetail(null); return; }
    getRecipe(openId).then((r) => setDetail(r.data)).catch(() => setDetail(null));
  }, [openId]);

  const bumpList = (id, patch) => setList((ls) => ls.map((x) => (x.id === id ? { ...x, ...patch(x) } : x)));

  async function toggleLike() {
    if (!detail) return;
    try {
      const r = await likeRecipe(detail.id);
      setDetail((d) => ({ ...d, liked: r.data.liked, like_count: r.data.like_count }));
      bumpList(detail.id, () => ({ like_count: r.data.like_count }));
    } catch { /* ignore */ }
  }
  async function submitComment() {
    const body = cbody.trim();
    if (!body || !detail) return;
    try {
      const r = await addRecipeComment(detail.id, body);
      setDetail((d) => ({ ...d, comments: [...(d.comments || []), r.data] }));
      bumpList(detail.id, (x) => ({ comment_count: (x.comment_count || 0) + 1 }));
      setCbody("");
    } catch { /* ignore */ }
  }
  async function delComment(cid) {
    if (!detail) return;
    try {
      await deleteRecipeComment(detail.id, cid);
      setDetail((d) => ({ ...d, comments: (d.comments || []).filter((c) => c.id !== cid) }));
      bumpList(detail.id, (x) => ({ comment_count: Math.max(0, (x.comment_count || 0) - 1) }));
    } catch { /* ignore */ }
  }

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
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                      {s.type} · par {s.author_name || "Stagiaire"}
                      {(s.like_count > 0 || s.comment_count > 0) && <span> · ❤️ {s.like_count || 0} · 💬 {s.comment_count || 0}</span>}
                    </span>
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
                more={<span style={{ display: "flex", gap: 8 }}>
                  <button className={"btn sm " + (detail.liked ? "primary" : "ghost")} onClick={toggleLike} title={detail.liked ? "Je n'aime plus" : "J'aime"}>
                    <span aria-hidden>{detail.liked ? "❤️" : "🤍"}</span> {detail.like_count || 0}
                  </button>
                  <button className="btn sm primary" disabled={busy} onClick={() => copyToMine(detail)}><Icon name="plus" size={13} /> Copier</button>
                </span>}>
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

                {/* Commentaires */}
                <div style={{ marginTop: 18, borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
                  <div className="card-ttl" style={{ fontSize: 14, marginBottom: 10 }}>💬 Commentaires ({(detail.comments || []).length})</div>
                  {(detail.comments || []).length === 0 && <p className="hint" style={{ margin: "0 0 10px" }}>Sois le premier à commenter cette fiche.</p>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(detail.comments || []).map((c) => (
                      <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12 }}><b>{c.author_name || "Stagiaire"}</b> <span className="hint">· {c.created_at}</span></span>
                          <span style={{ display: "block", fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.body}</span>
                        </span>
                        {c.mine && <button className="iconbtn del" title="Supprimer" onClick={() => delComment(c.id)}><Icon name="trash" size={13} /></button>}
                      </div>
                    ))}
                  </div>
                  <textarea className="inp" rows={2} value={cbody} onChange={(e) => setCbody(e.target.value)} placeholder="Ajoute un commentaire…" style={{ marginTop: 12, width: "100%" }} />
                  <button className="btn sm primary" disabled={!cbody.trim()} onClick={submitComment} style={{ marginTop: 6 }}><Icon name="send" size={13} /> Commenter</button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
