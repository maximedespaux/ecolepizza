import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";
import { parseAvatar } from "../lib/gamification.js";
import { getSharedRecipes, getRecipe, createRecipe, getAuthorProfile, likeRecipe, addRecipeComment, updateRecipeComment, deleteRecipeComment } from "../api/apiClient.js";

/**
 * Communauté — les fiches techniques partagées par les stagiaires de l'organisme.
 * Chaque carte porte son bouton « j'aime » (❤️) et sa section commentaires en ligne
 * (ajouter / modifier / supprimer les siens). Le détail (ingrédients + coût) s'ouvre à droite.
 */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const KIND_TABS = [
  { k: "ALL", label: "Toutes" },
  { k: "PATE", label: "Pâtes" },
  { k: "PREPARATION", label: "Préparations" },
  { k: "RECETTE", label: "Recettes" },
];
// Hashtags (#tag) de la description → badges.
const TAG_RE = /#[\p{L}\p{N}_-]+/gu;
const parseTags = (s) => Array.from(new Set((String(s || "").match(TAG_RE) || []).map((t) => t.slice(1))));
function Tags({ text }) {
  const tags = parseTags(text);
  if (!tags.length) return null;
  return <div className="tag-row">{tags.map((t) => <span key={t} className="badge-tag">#{t}</span>)}</div>;
}
// Libellé affiché : la préparation n'a pas de « type », on montre son genre.
const typeLabel = (s) => (s.kind === "PREPARATION" ? "Préparation" : s.type || (s.kind === "PATE" ? "Pâte" : ""));

// Petite pastille cliquable « auteur » (icône + nom) → ouvre son profil.
function AuthorChip({ id, name, onOpen }) {
  return (
    <button className="author-chip" title="Voir le profil"
      onClick={(e) => { e.stopPropagation(); if (id) onOpen(id); }}>
      <span className="author-ava"><Icon name="user" size={11} /></span>{name || "Stagiaire"}
    </button>
  );
}

// Fenêtre profil de l'auteur : avatar, nom, nombre de fiches partagées, cœurs reçus.
function ProfileModal({ profile, loading, onClose }) {
  const av = profile && profile.avatar ? parseAvatar(profile.avatar) : null;
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Profil</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody" style={{ textAlign: "center", padding: "22px 20px" }}>
          {loading || !profile ? <p className="hint">Chargement…</p> : (
            <>
              <span className="prof-ava" style={{ background: av ? av.color : "var(--surface2)" }}>{av ? av.emoji : <Icon name="user" size={26} />}</span>
              <div style={{ fontWeight: 800, fontSize: 18, marginTop: 10 }}>{profile.name}</div>
              {profile.company && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>🏢 {profile.company}</div>}
              <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 16 }}>
                <span><b style={{ fontSize: 18 }}>{profile.shared_count}</b><br /><span className="hint">fiche{profile.shared_count > 1 ? "s" : ""} partagée{profile.shared_count > 1 ? "s" : ""}</span></span>
                <span><b style={{ fontSize: 18 }}>❤️ {profile.likes_received}</b><br /><span className="hint">cœur{profile.likes_received > 1 ? "s" : ""} reçu{profile.likes_received > 1 ? "s" : ""}</span></span>
              </div>
              {(profile.phone || profile.email) && (
                <div style={{ marginTop: 16, textAlign: "left", display: "flex", flexDirection: "column", gap: 4 }}>
                  {profile.phone && <span style={{ fontSize: 13 }}>📞 {profile.phone}</span>}
                  {profile.email && <span style={{ fontSize: 13 }}>✉️ {profile.email}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
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
  const [openId, setOpenId] = useState(null);       // fiche dont le détail est ouvert (droite)
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [likeState, setLikeState] = useState({});   // id -> { liked, count }
  const [comments, setComments] = useState({});     // id -> [commentaire] (chargé à la demande)
  const [threadOpen, setThreadOpen] = useState(null); // id dont le fil est déplié en ligne
  const [draft, setDraft] = useState({});           // id -> texte du nouveau commentaire
  const [editing, setEditing] = useState({});       // cid -> texte en cours d'édition
  const [sort, setSort] = useState("recent");       // "recent" | "liked"
  const [query, setQuery] = useState("");           // recherche plein texte
  const [kindFilter, setKindFilter] = useState("ALL"); // ALL | PATE | PREPARATION | RECETTE
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const navigate = useNavigate();

  function openProfile(userId) {
    setProfile(null); setProfileOpen(true);
    getAuthorProfile(userId).then((r) => setProfile(r.data)).catch(() => setProfileOpen(false));
  }

  useEffect(() => {
    getSharedRecipes().then((r) => {
      const data = r.data || [];
      setList(data);
      const ls = {}; data.forEach((s) => { ls[s.id] = { liked: !!s.liked, count: s.like_count || 0 }; });
      setLikeState(ls);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    getRecipe(openId).then((r) => { setDetail(r.data); ingest(r.data); }).catch(() => setDetail(null));
  }, [openId]);

  // Mémorise les infos sociales (likes + commentaires) renvoyées par getRecipe.
  const ingest = (d) => {
    setLikeState((m) => ({ ...m, [d.id]: { liked: !!d.liked, count: d.like_count || 0 } }));
    setComments((m) => ({ ...m, [d.id]: d.comments || [] }));
  };
  const loadComments = (id) => { if (comments[id]) return; getRecipe(id).then((r) => ingest(r.data)).catch(() => {}); };
  const bumpList = (id, patch) => setList((ls) => ls.map((x) => (x.id === id ? { ...x, ...patch(x) } : x)));
  const commentCount = (s) => (comments[s.id] ? comments[s.id].length : (s.comment_count || 0));

  async function toggleLike(id) {
    try {
      const r = await likeRecipe(id);
      setLikeState((m) => ({ ...m, [id]: { liked: r.data.liked, count: r.data.like_count } }));
      bumpList(id, () => ({ like_count: r.data.like_count, liked: r.data.liked }));
    } catch { /* ignore */ }
  }
  async function submitComment(id) {
    const body = (draft[id] || "").trim();
    if (!body) return;
    try {
      const r = await addRecipeComment(id, body);
      setComments((m) => ({ ...m, [id]: [...(m[id] || []), r.data] }));
      bumpList(id, (x) => ({ comment_count: (x.comment_count || 0) + 1 }));
      setDraft((m) => ({ ...m, [id]: "" }));
    } catch { /* ignore */ }
  }
  async function saveEdit(id, cid) {
    const body = (editing[cid] || "").trim();
    if (!body) return;
    try {
      const r = await updateRecipeComment(id, cid, body);
      setComments((m) => ({ ...m, [id]: (m[id] || []).map((c) => (c.id === cid ? { ...c, body: r.data.body } : c)) }));
      setEditing((m) => { const n = { ...m }; delete n[cid]; return n; });
    } catch { /* ignore */ }
  }
  async function delComment(id, cid) {
    try {
      await deleteRecipeComment(id, cid);
      setComments((m) => ({ ...m, [id]: (m[id] || []).filter((c) => c.id !== cid) }));
      bumpList(id, (x) => ({ comment_count: Math.max(0, (x.comment_count || 0) - 1) }));
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

  // Fil de commentaires réutilisé (carte en ligne + détail).
  const Thread = ({ id }) => {
    const cs = comments[id];
    return (
      <div className="comm-thread">
        {!cs ? <p className="hint" style={{ margin: 0 }}>Chargement…</p> : cs.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Sois le premier à commenter cette fiche.</p>
        ) : cs.map((c) => (
          <div key={c.id} className="comm-c">
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12 }}><b>{c.author_name || "Stagiaire"}</b> <span className="hint">· {c.created_at || "à l'instant"}</span></span>
              {editing[c.id] != null ? (
                <div style={{ marginTop: 4 }}>
                  <textarea className="inp" rows={2} value={editing[c.id]} onChange={(e) => setEditing((m) => ({ ...m, [c.id]: e.target.value }))} style={{ width: "100%" }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button className="btn sm primary" disabled={!editing[c.id].trim()} onClick={() => saveEdit(id, c.id)}><Icon name="check" size={12} /> Enregistrer</button>
                    <button className="btn sm ghost" onClick={() => setEditing((m) => { const n = { ...m }; delete n[c.id]; return n; })}>Annuler</button>
                  </div>
                </div>
              ) : (
                <span style={{ display: "block", fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.body}</span>
              )}
            </div>
            {c.mine && editing[c.id] == null && (
              <span style={{ display: "flex", gap: 2 }}>
                <button className="iconbtn" title="Modifier" onClick={() => setEditing((m) => ({ ...m, [c.id]: c.body }))}><Icon name="pencil" size={13} /></button>
                <button className="iconbtn del" title="Supprimer" onClick={() => delComment(id, c.id)}><Icon name="trash" size={13} /></button>
              </span>
            )}
          </div>
        ))}
        <textarea className="inp" rows={2} value={draft[id] || ""} onChange={(e) => setDraft((m) => ({ ...m, [id]: e.target.value }))} placeholder="Ajoute un commentaire…" style={{ marginTop: 10, width: "100%" }} />
        <button className="btn sm primary" disabled={!(draft[id] || "").trim()} onClick={() => submitComment(id)} style={{ marginTop: 6 }}><Icon name="send" size={13} /> Commenter</button>
      </div>
    );
  };

  return (
    <>
      <PageHead eyebrow="Outils · communauté" title="Communauté"
        lead="Les fiches techniques partagées par les autres stagiaires. Aime, commente, ou copie-en une dans tes recettes pour l'adapter." />

      {list.length === 0 ? (
        <EmptyState icon="users">Aucune recette partagée pour l'instant. Sois le premier : partage une fiche technique depuis « Fiche technique ».</EmptyState>
      ) : (
        <div className="grid cols-2" style={{ alignItems: "start" }}>
          <Card title={<span className="card-ttl"><Icon name="users" size={16} /> Recettes partagées ({list.length})</span>}
            more={<span className="seg">
              <button className={"seg-btn" + (sort === "recent" ? " on" : "")} onClick={() => setSort("recent")}>Récentes</button>
              <button className={"seg-btn" + (sort === "liked" ? " on" : "")} onClick={() => setSort("liked")}><span aria-hidden>❤️</span> Populaires</button>
            </span>}>
            {/* Filtres : recherche plein texte + type de fiche */}
            <div className="comm-filters">
              <span className="gs-search" style={{ flex: 1 }}>
                <span aria-hidden style={{ fontSize: 13, opacity: 0.6 }}>🔍</span>
                <input placeholder="Rechercher (nom, description, #tag, auteur)…" value={query} onChange={(e) => setQuery(e.target.value)} />
                {query && <button className="gs-clear" title="Effacer" onClick={() => setQuery("")}><Icon name="x" size={13} /></button>}
              </span>
              <span className="seg" style={{ flexWrap: "wrap" }}>
                {KIND_TABS.map((t) => (
                  <button key={t.k} className={"seg-btn" + (kindFilter === t.k ? " on" : "")} onClick={() => setKindFilter(t.k)}>{t.label}</button>
                ))}
              </span>
            </div>
            {(() => {
              const q = query.trim().toLowerCase();
              const shown = list.filter((s) => {
                if (kindFilter !== "ALL" && s.kind !== kindFilter) return false;
                if (!q) return true;
                return [s.name, s.description, s.type, s.author_name].some((f) => String(f || "").toLowerCase().includes(q));
              }).sort((a, b) => {
                if (sort !== "liked") return 0; // ordre serveur = plus récentes d'abord
                const la = likeState[a.id]?.count ?? a.like_count ?? 0;
                const lb = likeState[b.id]?.count ?? b.like_count ?? 0;
                return lb - la || (b.comment_count || 0) - (a.comment_count || 0);
              });
              if (shown.length === 0) return <p className="hint" style={{ margin: "6px 2px" }}>Aucune fiche ne correspond à ta recherche.</p>;
              return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {shown.map((s) => {
                const lk = likeState[s.id] || { liked: false, count: s.like_count || 0 };
                const tOpen = threadOpen === s.id;
                return (
                  <div key={s.id} className={"comm-card" + (openId === s.id ? " on" : "")}>
                    <div className="comm-main" onClick={() => setOpenId((cur) => (cur === s.id ? null : s.id))}>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <b>{s.name}</b>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>{typeLabel(s)} · <AuthorChip id={s.author_user_id} name={s.author_name} onOpen={openProfile} /> · {s.updated_at}</span>
                        <Tags text={s.description} />
                      </span>
                      <Icon name={openId === s.id ? "chevron-down" : "chevron-right"} size={16} />
                    </div>
                    <div className="comm-bar">
                      <button className={"btn sm " + (lk.liked ? "primary" : "ghost")} onClick={() => toggleLike(s.id)} title={lk.liked ? "Je n'aime plus" : "J'aime"}>
                        <span aria-hidden>{lk.liked ? "❤️" : "🤍"}</span> {lk.count}
                      </button>
                      <button className={"btn sm " + (tOpen ? "primary" : "ghost")} onClick={() => { setThreadOpen(tOpen ? null : s.id); if (!tOpen) loadComments(s.id); }}>
                        <span aria-hidden>💬</span> {commentCount(s)}
                      </button>
                      <button className="btn sm ghost" disabled={busy} onClick={() => copyToMine(s)} title="Enregistrer dans mes recettes"><Icon name="folder-check" size={13} /> Enregistrer</button>
                    </div>
                    {tOpen && <Thread id={s.id} />}
                  </div>
                );
              })}
            </div>
              );
            })()}
          </Card>

          <div>
            {!detail ? (
              <Card><p className="hint" style={{ margin: 0 }}>Sélectionne une recette pour voir le détail (ingrédients &amp; coût).</p></Card>
            ) : (
              <Card title={<span className="card-ttl"><Icon name="pizza" size={16} /> {detail.name}</span>}
                more={<span style={{ display: "flex", gap: 8 }}>
                  <button className={"btn sm " + ((likeState[detail.id]?.liked) ? "primary" : "ghost")} onClick={() => toggleLike(detail.id)} title={(likeState[detail.id]?.liked) ? "Je n'aime plus" : "J'aime"}>
                    <span aria-hidden>{(likeState[detail.id]?.liked) ? "❤️" : "🤍"}</span> {likeState[detail.id]?.count || 0}
                  </button>
                  <button className="btn sm primary" disabled={busy} onClick={() => copyToMine(detail)} title="Enregistrer dans mes recettes"><Icon name="folder-check" size={13} /> Enregistrer</button>
                </span>}>
                <div className="hint" style={{ marginTop: -4, display: "flex", alignItems: "center", gap: 5 }}>{typeLabel(detail)} · <AuthorChip id={detail.author_user_id} name={detail.author_name} onOpen={openProfile} /></div>
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
                <div style={{ marginTop: 18, borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
                  <div className="card-ttl" style={{ fontSize: 14, marginBottom: 10 }}>💬 Commentaires ({(comments[detail.id] || []).length})</div>
                  <Thread id={detail.id} />
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {profileOpen && <ProfileModal profile={profile} loading={!profile} onClose={() => setProfileOpen(false)} />}
    </>
  );
}
