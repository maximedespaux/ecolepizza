import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import DoughBar from "../components/DoughBar.jsx";
import { euro, colorOf } from "../lib/format.js";
import { computeBuild, gfmt } from "../lib/dough.js";
import { garnitureItems, garnitureCost, realisationAxes, svcLabel, fourLabel } from "../lib/garnitures.js";
import { cadreFor, cadrePorteDe, useCadreChoisi } from "../lib/cadres.js";
import { UserContext } from "../context/UserContext.jsx";
import { parseAvatar, pingCommunaute } from "../lib/gamification.js";
import { getSharedRecipes, getRecipe, createRecipe, getAuthorProfile, likeRecipe, addRecipeComment, updateRecipeComment, deleteRecipeComment, markCommunitySeen, markRecipeRead } from "../api/apiClient.js";

/**
 * Temps de présence à l'écran avant qu'un halo « j'aime » s'éteigne.
 *
 * Cale sur la durée d'UNE pulsation dorée (voir .comm-card2.halo-aime dans app.css) : le halo
 * joue son cycle en entier, puis s'efface. À 1,2 s il s'interrompait au milieu d'une
 * respiration — on voyait quelque chose bouger sans avoir le temps de lire quoi.
 *
 * Si l'un des deux change, changer l'autre : c'est leur égalité qui produit l'effet.
 */
const VU_DELAI_MS = 2000;

/**
 * Une carte de la galerie, et ses deux halos.
 *
 * LES DEUX SIGNAUX NE S'ÉTEIGNENT PAS AU MÊME MOMENT, et c'est tout l'objet de ce composant :
 *
 *   · COMMENTAIRE — il appelle une réponse. Son halo bat jusqu'à ce qu'on OUVRE la fiche.
 *     Traverser la galerie ne suffit pas : on ne les a pas lus. L'extinction est portée par
 *     le serveur (recipe_read), donc elle survit à un rechargement et à dix visites.
 *
 *   · J'AIME — il n'appelle rien. Le VOIR suffit. Son halo s'éteint dès que la carte a
 *     réellement passé un moment à l'écran, ici même, sans rien demander au serveur : la
 *     visite l'a déjà éteint côté base (community_seen_at).
 *
 * D'où l'IntersectionObserver : « vu » veut dire vu, pas « présent dans une page qu'on a
 * ouverte ». Une carte tout en bas d'une galerie de 200, jamais atteinte par le défilement,
 * n'a pas été vue — son halo l'attendra.
 */
function CommCard({ recipe: s, children }) {
  const ref = useRef(null);
  const [aimeVu, setAimeVu] = useState(false);
  /**
   * `new_likes` est FIGÉ à la première vue, et c'est indispensable.
   *
   * La page marque la visite dès la galerie reçue — c'est ce qui fait retomber la pastille du
   * menu. Mais du coup, toute relecture ultérieure de la galerie renvoie `new_likes: 0` : la
   * visite a eu lieu, le serveur a raison de le dire. Sans ce gel, cette seconde réponse
   * éteignait le halo à la milliseconde où elle arrivait — mesuré à 1 ms en développement, où
   * React monte les composants deux fois.
   *
   * Autrement dit, la page invalidait elle-même la donnée dont son propre affichage dépendait.
   * Le halo appartient à la visite en cours ; seul l'IntersectionObserver l'éteint.
   *
   * Les commentaires, eux, RESTENT réactifs : ouvrir une fiche remet son `new_comments` à zéro
   * dans la liste, et c'est ainsi que leur halo doit s'éteindre.
   */
  const [aimeInitial] = useState(() => s.new_likes > 0);
  const haloAime = aimeInitial && !aimeVu;
  const haloCom = s.new_comments > 0;

  useEffect(() => {
    if (!haloAime || !ref.current) return;
    // Sans IntersectionObserver (navigateur ancien), on n'insiste pas : le halo restera le
    // temps de la visite, ce qui est un défaut bien plus discret qu'un halo jamais éteint.
    if (typeof IntersectionObserver === "undefined") return;
    let minuteur = null;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        // Repartir avant la fin ne compte pas : le minuteur est annulé plus bas.
        minuteur = setTimeout(() => setAimeVu(true), VU_DELAI_MS);
      } else if (minuteur) {
        clearTimeout(minuteur); minuteur = null;
      }
    }, { threshold: 0.6 });
    obs.observe(ref.current);
    return () => { if (minuteur) clearTimeout(minuteur); obs.disconnect(); };
  }, [haloAime]);

  const cls = ["comm-card2", haloCom ? "halo-com" : "", haloAime ? "halo-aime" : ""].filter(Boolean).join(" ");
  return <div ref={ref} className={cls}>{children}</div>;
}

/**
 * Communauté — les fiches techniques partagées par les stagiaires de l'organisme,
 * en galerie de cartes. Chaque carte porte son type (pâte / préparation / recette),
 * son auteur, ses « j'aime » et ses commentaires. Un clic ouvre le détail en modale
 * (ingrédients, coût, prix conseillé, fil de commentaires). On peut aimer, commenter,
 * ou enregistrer une fiche dans ses propres fiches pour l'adapter.
 */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// Wishlist (« mettre de côté ») — distincte de « Enregistrer » (qui copie la fiche). Stockée en
// localStorage en attendant un endpoint serveur (comme les likes) → à synchroniser plus tard.
const WISH_KEY = "impasto.wishlist";
const readWish = () => { try { return new Set(JSON.parse(localStorage.getItem(WISH_KEY)) || []); } catch { return new Set(); } };
const writeWish = (s) => { try { localStorage.setItem(WISH_KEY, JSON.stringify([...s])); } catch { /* ignore */ } };
const KIND_TABS = [
  { k: "ALL", label: "Toutes" },
  { k: "PATE", label: "Empâtements" },
  { k: "PREPARATION", label: "Garnitures" },
  { k: "RECETTE", label: "Réalisations" },
];
// Type de fiche → libellé, couleur d'accent et icône (badges).
const kindMeta = (k) => (
  k === "PATE" ? { label: "Empâtement", color: "var(--gold)", icon: "wheat" }
    : k === "PREPARATION" ? { label: "Garniture", color: "var(--green)", icon: "list-checks" }
      : { label: "Réalisation", color: "var(--ember1)", icon: "pizza" }
);
// Hashtags (#tag) de la description → badges.
const TAG_RE = /#[\p{L}\p{N}_-]+/gu;
const parseTags = (s) => Array.from(new Set((String(s || "").match(TAG_RE) || []).map((t) => t.slice(1))));
function Tags({ text }) {
  const tags = parseTags(text);
  if (!tags.length) return null;
  return <div className="tag-row">{tags.map((t) => <span key={t} className="badge-tag">#{t}</span>)}</div>;
}

// Petite pastille cliquable « auteur » (avatar + nom) → ouvre son profil.
// Le `cadre` est résolu par le parent (cf. `cadreDe`) : lui seul sait qui est l'utilisateur
// courant, et lui seul est rerendu quand ce dernier change de cadre.
function AuthorChip({ id, name, avatar, cadre, onOpen }) {
  const av = avatar ? parseAvatar(avatar) : null;
  return (
    <button className="author-chip" title={`Voir le profil${cadre.id !== "aucun" ? ` · cadre ${cadre.nom}` : ""}`}
      onClick={(e) => { e.stopPropagation(); if (id) onOpen(id); }}>
      <span className={`author-ava ${cadre.id !== "aucun" ? `cadre cadre-${cadre.id}` : ""}`}
        style={av ? { background: av.color, color: "#fff", fontSize: 11 } : null}>
        {av ? av.emoji : <Icon name="user" size={11} />}
      </span>{name || "Stagiaire"}
    </button>
  );
}

/**
 * Les visages de ceux qui ont commenté, en rang serré sur la carte.
 *
 * Un compteur dit COMBIEN, il ne dit pas QUI — et « 4 commentaires » n'a pas le même poids
 * selon qu'ils viennent d'inconnus ou du formateur. Reconnaître un visage évite d'ouvrir la
 * fiche pour le découvrir.
 *
 * Le chevauchement est volontaire : il tient dans la place d'un seul avatar et demi, et se
 * lit comme un groupe plutôt que comme une liste. Le plus récent devant — c'est celui dont
 * la réponse attend.
 *
 * Chaque pastille est cliquable et ouvre le profil, comme l'auteur juste au-dessus : une
 * pastille qui ressemble à l'AuthorChip et ne réagirait pas serait une fausse promesse.
 */
function Commenters({ gens, total, onOpen }) {
  if (!gens || !gens.length) return null;
  const reste = Math.max(0, (total || gens.length) - gens.length);
  return (
    <span className="comm-faces" title={gens.map((g) => g.name || "Stagiaire").join(", ") + (reste ? ` et ${reste} autre${reste > 1 ? "s" : ""}` : "")}>
      {gens.map((g, i) => {
        const av = g.avatar ? parseAvatar(g.avatar) : null;
        return (
          <button key={g.user_id || i} className="comm-face" aria-label={g.name || "Stagiaire"}
            style={{ zIndex: gens.length - i, ...(av ? { background: av.color, color: "#fff" } : null) }}
            onClick={(e) => { e.stopPropagation(); if (g.user_id) onOpen(g.user_id); }}>
            {av ? av.emoji : <Icon name="user" size={10} />}
          </button>
        );
      })}
      {reste > 0 && <span className="comm-face reste">+{reste}</span>}
    </span>
  );
}

// Fenêtre profil de l'auteur : avatar, nom, nombre de fiches partagées, cœurs reçus.
function ProfileModal({ profile, loading, cadre: cadreProfil, onClose }) {
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
              {/* Le cadre de parcours entoure le grand avatar : c'est le seul endroit de la
                  Communauté où on regarde quelqu'un en face, il mérite l'effet complet. */}
              <span className={`prof-ava ${cadreProfil.id !== "aucun" ? `cadre cadre-${cadreProfil.id}` : ""}`}
                style={{ background: av ? av.color : "var(--surface2)" }}>{av ? av.emoji : <Icon name="user" size={26} />}</span>
              {cadreProfil.id !== "aucun" && (
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginTop: 8 }}>Cadre {cadreProfil.nom}</div>
              )}
              <div style={{ fontWeight: 800, fontSize: 18, marginTop: 10 }}>{profile.name}</div>
              {profile.company && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><Icon name="building" size={13} /> {profile.company}</div>}
              {profile.badges && profile.badges.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginTop: 10 }}>
                  {/* Même repli que partout ailleurs (profil personnel, carte Pizza Quest,
                      fiches formation) : à défaut de couleur choisie par l'organisme, on
                      DÉRIVE une couleur stable du code. Le repli « navy » qui traînait ici
                      peignait en bleu marine toutes les formations sans couleur — le même
                      niveau n'avait donc pas la même teinte selon le profil consulté. */}
                  {profile.badges.map((b) => (
                    <span key={b.code} className="badge n mono" title={b.title || b.code}
                      style={{ background: b.color || colorOf(b.code), color: "#fff", borderColor: "transparent", fontSize: 10, padding: "2px 8px" }}>
                      {b.code}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 16 }}>
                <span><b style={{ fontSize: 18 }}>{profile.shared_count}</b><br /><span className="hint">fiche{profile.shared_count > 1 ? "s" : ""} partagée{profile.shared_count > 1 ? "s" : ""}</span></span>
                <span><b style={{ fontSize: 18 }}>♥ {profile.likes_received}</b><br /><span className="hint">cœur{profile.likes_received > 1 ? "s" : ""} reçu{profile.likes_received > 1 ? "s" : ""}</span></span>
              </div>
              {(profile.phone || profile.email) && (
                <div style={{ marginTop: 16, textAlign: "left", display: "flex", flexDirection: "column", gap: 6 }}>
                  {profile.phone && <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}><Icon name="phone" size={13} /> {profile.phone}</span>}
                  {profile.email && <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}><Icon name="mail" size={13} /> {profile.email}</span>}
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

// Coûts d'une fiche (pour le détail) : coût matière par pizza + prix conseillé.
function costs(d) {
  const nb = Math.max(1, num(d.servings));
  const dough = ((num(d.paton_g) / 1000) / 1.68) * num(d.flour_price);
  const line = (t) => (t.unit === "g" ? (num(t.qty) / 1000) * num(t.unit_price) : num(t.qty) * num(t.unit_price));
  const topping = (d.ingredients || []).reduce((s, t) => s + line(t), 0);
  const per = dough + topping;
  return { per, price: per * (1 + num(d.margin_pct) / 100), nb, line, ingSum: topping };
}

// Fil de commentaires — défini AU NIVEAU MODULE (hors de Communaute). S'il était défini dans
// le composant, il serait recréé à chaque frappe et le <textarea> perdrait le focus (une lettre
// puis sortie du champ). Les états/handlers sont passés en props.
function CommentThread({ id, comments, editing, setEditing, draft, setDraft, onSubmit, onSaveEdit, onDelete }) {
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
                  <button className="btn sm primary" disabled={!editing[c.id].trim()} onClick={() => onSaveEdit(id, c.id)}><Icon name="check" size={12} /> Enregistrer</button>
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
              <button className="iconbtn del" title="Supprimer" onClick={() => onDelete(id, c.id)}><Icon name="trash" size={13} /></button>
            </span>
          )}
        </div>
      ))}
      <textarea className="inp" rows={2} value={draft[id] || ""} onChange={(e) => setDraft((m) => ({ ...m, [id]: e.target.value }))} placeholder="Ajoute un commentaire…" style={{ marginTop: 10, width: "100%" }} />
      <button className="btn sm primary" disabled={!(draft[id] || "").trim()} onClick={() => onSubmit(id)} style={{ marginTop: 6 }}><Icon name="send" size={13} /> Commenter</button>
    </div>
  );
}

export default function Communaute() {
  const [list, setList] = useState([]);
  const [openId, setOpenId] = useState(null);       // fiche dont le détail est ouvert (modale)
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [likeState, setLikeState] = useState({});   // id -> { liked, count }
  const [comments, setComments] = useState({});     // id -> [commentaire] (chargé à la demande)
  const [draft, setDraft] = useState({});           // id -> texte du nouveau commentaire
  const [editing, setEditing] = useState({});       // cid -> texte en cours d'édition
  const [sort, setSort] = useState("recent");       // "recent" | "liked"
  const [query, setQuery] = useState("");           // recherche plein texte
  const [kindFilter, setKindFilter] = useState("ALL"); // ALL | PATE | PREPARATION | RECETTE
  const [wish, setWish] = useState(readWish);           // fiches mises de côté (localStorage)
  const [onlyWish, setOnlyWish] = useState(false);      // filtre « ma wishlist »
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileId, setProfileId] = useState(null);  // à qui appartient le profil ouvert
  const toggleWish = (id) => setWish((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); writeWish(n); return n; });
  const navigate = useNavigate();

  const { user } = useContext(UserContext);
  const moi = user?.id;
  // Le choix de cadre vit dans le navigateur de chacun : on ne le connaît donc QUE pour
  // l'utilisateur courant. Pour les autres, on retombe sur leur cadre de parcours, seule
  // information dont le serveur dispose aujourd'hui (cf. CHANTIERS.md §4.2 point 6).
  const monChoix = useCadreChoisi(moi);
  const cadreDe = (id, done = 0) =>
    (id && id === moi ? cadrePorteDe(monChoix, done) : cadreFor(done).cadre);

  function openProfile(userId) {
    setProfile(null); setProfileId(userId); setProfileOpen(true);
    getAuthorProfile(userId).then((r) => setProfile(r.data)).catch(() => setProfileOpen(false));
  }

  useEffect(() => {
    getSharedRecipes().then((r) => {
      const data = r.data || [];
      setList(data);
      const ls = {}; data.forEach((s) => { ls[s.id] = { liked: !!s.liked, count: s.like_count || 0 }; });
      setLikeState(ls);
      // « Vu » seulement UNE FOIS LA GALERIE REÇUE, et jamais avant : le serveur calcule les
      // repères de nouveauté à partir de cette même date. La poser à l'entrée dans la page
      // les effacerait avant qu'on ait pu les voir. Les repères de CETTE visite restent
      // affichés — ils vivent dans `data`, déjà en main — et auront disparu à la suivante.
      // Les j'aime s'eteignent a la VISITE : on le dit au serveur tout de suite, la pastille
      // du menu retombe d'autant. Les halos de CETTE visite restent affiches — ils vivent
      // dans `data`, deja en main — et auront disparu a la suivante.
      markCommunitySeen().then(pingCommunaute).catch(() => {});
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    setDetail(null);
    // Ouvrir la fiche, c'est LIRE ses commentaires : le halo s'eteint ici et nulle part
    // ailleurs. On le retire aussi de la liste en memoire, sans recharger la galerie —
    // sinon la carte resterait cerclee derriere la modale qu'on vient d'ouvrir.
    markRecipeRead(openId).then(pingCommunaute).catch(() => {});
    setList((l) => l.map((x) => (x.id === openId ? { ...x, new_comments: 0 } : x)));
    getRecipe(openId).then((r) => { setDetail(r.data); ingest(r.data); }).catch(() => setDetail(null));
  }, [openId]);

  // Mémorise les infos sociales (likes + commentaires) renvoyées par getRecipe.
  const ingest = (d) => {
    setLikeState((m) => ({ ...m, [d.id]: { liked: !!d.liked, count: d.like_count || 0 } }));
    setComments((m) => ({ ...m, [d.id]: d.comments || [] }));
  };
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
      navigate(d.kind === "PATE" ? "/empatements" : d.kind === "PREPARATION" ? "/garnitures" : "/realisations");
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  // Liste filtrée + triée.
  const q = query.trim().toLowerCase();
  const shown = list.filter((s) => {
    if (onlyWish && !wish.has(s.id)) return false;
    if (kindFilter !== "ALL" && s.kind !== kindFilter) return false;
    if (!q) return true;
    return [s.name, s.description, s.type, s.author_name].some((f) => String(f || "").toLowerCase().includes(q));
  }).sort((a, b) => {
    if (sort !== "liked") return 0; // ordre serveur = plus récentes d'abord
    const la = likeState[a.id]?.count ?? a.like_count ?? 0;
    const lb = likeState[b.id]?.count ?? b.like_count ?? 0;
    return lb - la || (b.comment_count || 0) - (a.comment_count || 0);
  });

  return (
    <>
      <PageHead eyebrow="Outils · communauté" title="Communauté"
        lead="Les fiches partagées par les autres stagiaires : empâtements, garnitures et réalisations. Aime, commente, mets de côté (wishlist), ou enregistre-en une dans tes fiches pour l'adapter." />

      {list.length === 0 ? (
        <EmptyState icon="users">Aucune fiche partagée pour l'instant. Sois le premier : partage une pâte, une préparation ou une recette depuis « Fiche technique » ou le « Calculateur de pâte ».</EmptyState>
      ) : (
        <>
          {/* Barre d'outils : recherche + type + tri */}
          <div className="comm-toolbar">
            <span className="gs-search" style={{ flex: 1, minWidth: 200 }}>
              <Icon name="search" size={14} />
              <input placeholder="Rechercher (nom, description, #tag, auteur)…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && <button className="gs-clear" title="Effacer" onClick={() => setQuery("")}><Icon name="x" size={13} /></button>}
            </span>
            <span className="seg" style={{ flexWrap: "wrap" }}>
              {KIND_TABS.map((t) => (
                <button key={t.k} className={"seg-btn" + (kindFilter === t.k ? " on" : "")} onClick={() => setKindFilter(t.k)}>{t.label}</button>
              ))}
            </span>
            <span className="seg">
              <button className={"seg-btn" + (sort === "recent" ? " on" : "")} onClick={() => setSort("recent")}>Récentes</button>
              <button className={"seg-btn" + (sort === "liked" ? " on" : "")} onClick={() => setSort("liked")}><Icon name="heart" size={12} /> Populaires</button>
            </span>
            <button className={"btn sm " + (onlyWish ? "primary" : "ghost")} onClick={() => setOnlyWish((w) => !w)} title="N'afficher que ma wishlist">
              <Icon name="bookmark" size={13} fill={onlyWish ? "currentColor" : "none"} /> Ma wishlist{wish.size ? ` (${wish.size})` : ""}
            </button>
          </div>

          {shown.length === 0 ? (
            <EmptyState icon={onlyWish ? "bookmark" : "search"}>{onlyWish ? "Ta wishlist est vide — mets des fiches de côté avec le marque-page." : "Aucune fiche ne correspond à ta recherche."}</EmptyState>
          ) : (
            <div className="comm-grid">
              {shown.map((s) => {
                const km = kindMeta(s.kind);
                const lk = likeState[s.id] || { liked: false, count: s.like_count || 0 };
                return (
                  <CommCard key={s.id} recipe={s}>
                    <div className="comm-card2-body" onClick={() => setOpenId(s.id)} role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") setOpenId(s.id); }}>
                      <span className="comm-kind" style={{ background: `color-mix(in srgb, ${km.color} 15%, var(--surface))`, color: km.color }}>
                        <Icon name={km.icon} size={12} /> {km.label}{s.kind === "RECETTE" && s.type ? ` · ${s.type}` : ""}
                      </span>
                      <div className="comm-title">
                        {s.name}
                        {/* La pastille du menu dit qu'il y a du nouveau ; ces reperes disent OU.
                            Deux etiquettes distinctes parce que les deux signaux ne s'eteignent
                            pas au meme moment — voir CommCard. */}
                        {s.new_comments > 0 && (
                          <span className="comm-neuf" title={`${s.new_comments} nouveau${s.new_comments > 1 ? "x" : ""} commentaire${s.new_comments > 1 ? "s" : ""} — ouvrez la fiche pour les lire`}>
                            <Icon name="message-circle" size={11} /> {s.new_comments}
                          </span>
                        )}
                        {s.new_likes > 0 && (
                          <span className="comm-neuf aime" title={`${s.new_likes} nouveau${s.new_likes > 1 ? "x" : ""} j'aime sur votre fiche`}>
                            <Icon name="heart" size={11} fill="currentColor" /> {s.new_likes}
                          </span>
                        )}
                      </div>
                      <div className="comm-meta">
                        <AuthorChip id={s.author_user_id} name={s.author_name} avatar={s.author_avatar} cadre={cadreDe(s.author_user_id, s.author_done)} onOpen={openProfile} />
                        <span>· {s.updated_at}</span>
                      </div>
                      <Tags text={s.description} />
                    </div>
                    <div className="comm-foot">
                      <button className={"btn sm " + (lk.liked ? "primary" : "ghost")} onClick={() => toggleLike(s.id)} title={lk.liked ? "Je n'aime plus" : "J'aime"}>
                        <Icon name="heart" size={13} fill={lk.liked ? "currentColor" : "none"} /> {lk.count}
                      </button>
                      <button className="btn sm ghost" onClick={() => setOpenId(s.id)} title="Voir &amp; commenter">
                        <Icon name="message-circle" size={13} /> {commentCount(s)}
                      </button>
                      <Commenters gens={s.commenters} total={s.commenters_total} onOpen={openProfile} />
                      <button className={"btn sm " + (wish.has(s.id) ? "primary" : "ghost") + " comm-save"} onClick={() => toggleWish(s.id)}
                        title={wish.has(s.id) ? "Retirer de ma wishlist" : "Mettre de côté (wishlist)"}>
                        <Icon name="bookmark" size={13} fill={wish.has(s.id) ? "currentColor" : "none"} />
                      </button>
                      <button className="btn sm ghost" disabled={busy} onClick={() => copyToMine(s)} title="Enregistrer dans mes fiches"><Icon name="folder-check" size={14} /></button>
                    </div>
                  </CommCard>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modale détail : ingrédients, coût, prix, commentaires */}
      {openId && createPortal(
        <div className="overlay" onClick={() => setOpenId(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            {!detail ? (
              <div className="mbody" style={{ padding: 28 }}><p className="hint" style={{ margin: 0 }}>Chargement…</p></div>
            ) : (() => {
              const km = kindMeta(detail.kind);
              const c = costs(detail);
              const lk = likeState[detail.id] || { liked: false, count: 0 };
              return (
                <>
                  <div className="mhead">
                    <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span className="comm-kind" style={{ background: `color-mix(in srgb, ${km.color} 15%, var(--surface))`, color: km.color, flex: "none" }}>
                        <Icon name={km.icon} size={12} /> {km.label}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.name}</span>
                    </h3>
                    <button className="x" onClick={() => setOpenId(null)} aria-label="Fermer"><Icon name="x" size={16} /></button>
                  </div>
                  <div className="mbody">
                    <div className="hint" style={{ marginTop: -2, display: "flex", alignItems: "center", gap: 5 }}>
                      par <AuthorChip id={detail.author_user_id} name={detail.author_name} avatar={detail.author_avatar} cadre={cadreDe(detail.author_user_id, detail.author_done)} onOpen={openProfile} /> · {detail.updated_at}
                    </div>
                    {detail.description && <p style={{ fontSize: 13.5, margin: "10px 0 6px" }}>{detail.description}</p>}
                    <Tags text={detail.description} />

                    {detail.kind === "PATE" && (() => {
                      const dpv = typeof detail.dough_params === "string" ? (() => { try { return JSON.parse(detail.dough_params); } catch { return {}; } })() : (detail.dough_params || {});
                      const B = computeBuild({ ...detail, dough_params: dpv });
                      return (
                        <div style={{ margin: "14px 0 0" }}>
                          <div className="hint" style={{ marginBottom: 8 }}>{B.preset.nom}{B.napoSpec ? ` · ${B.napoSpec.label}` : ""} · {String(B.dp.method || "direct").toLowerCase()}{B.dp.autolyse ? " · autolyse" : ""} · W {B.w} · {B.hydraTotal} % hydratation · {B.effNb} pâtons de {B.patonG} g</div>
                          <DoughBar items={B.dough} total={B.totalDough} />
                          {B.dough.map((i) => (
                            <div key={i.k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, borderBottom: "1px solid var(--border-soft)", padding: "5px 0" }}>
                              <span style={{ color: i.color, display: "inline-flex" }}><Icon name={i.ic} size={15} /></span>
                              <b style={{ flex: 1 }}>{i.k}</b><span className="hint">{i.pct}</span><span className="mono">{gfmt(i.v)}</span>
                            </div>
                          ))}
                          {B.dp.shareCost !== false && <p className="hint" style={{ marginTop: 10 }}>Coût matière : <b>{euro(B.costPerPaton)}</b> / pâton · <b>{euro(B.costPerKg)}</b> / kg</p>}
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Déroulé des étapes ({B.steps.length})</summary>
                            <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 6 }}>
                              {B.steps.map((s, i) => <li key={i}><b style={{ color: "var(--text)" }}>{s.t}.</b> {s.d}</li>)}
                            </ol>
                          </details>
                        </div>
                      );
                    })()}

                    {detail.kind === "PREPARATION" && (() => {
                      const dpv = typeof detail.dough_params === "string" ? (() => { try { return JSON.parse(detail.dough_params); } catch { return {}; } })() : (detail.dough_params || {});
                      if (!dpv.garn) return null;
                      const gc = garnitureCost(dpv.garn);
                      return (
                        <div style={{ margin: "14px 0 0" }}>
                          {gc.items.map((i) => (
                            <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, borderBottom: "1px solid var(--border-soft)", padding: "5px 0" }}>
                              <span>{i.emoji}</span><b style={{ flex: 1 }}>{i.label}{i.fragile ? " ❄️" : ""}</b><span className="hint">{num(i.qty)} g</span><span className="mono">{euro((num(i.qty) / 1000) * num(i.price))}</span>
                            </div>
                          ))}
                          {dpv.shareCost !== false && <p className="hint" style={{ marginTop: 10 }}>Coût matière : <b>{euro(gc.total)}</b> / pizza</p>}
                        </div>
                      );
                    })()}

                    {detail.kind === "RECETTE" && (() => {
                      const dpv = typeof detail.dough_params === "string" ? (() => { try { return JSON.parse(detail.dough_params); } catch { return {}; } })() : (detail.dough_params || {});
                      const rl = dpv.real; if (!rl) return null;
                      const cm = (rl.emp ? computeBuild(rl.emp).costPerPaton : 0) + garnitureCost((rl.garn?.dough_params || {}).garn).total;
                      const price = cm * (1 + num(detail.margin_pct) / 100);
                      const axes = realisationAxes({ service: rl.service, doughType: rl.emp?.type, garn: (rl.garn?.dough_params || {}).garn });
                      const tone = { ok: "#7bb661", warn: "var(--orange)", bad: "var(--ember1)" };
                      return (
                        <div style={{ margin: "14px 0 0" }}>
                          <div className="hint" style={{ marginBottom: 8 }}>{[svcLabel(rl.service), fourLabel(rl.four)].filter(Boolean).join(" · ")}</div>
                          {rl.emp && <div style={{ display: "flex", gap: 8, fontSize: 13, padding: "4px 0" }}><Icon name="wheat" size={15} /><b style={{ flex: 1 }}>{rl.emp.name}</b></div>}
                          {rl.garn && <div style={{ display: "flex", gap: 8, fontSize: 13, padding: "4px 0" }}><Icon name="pizza" size={15} /><b style={{ flex: 1 }}>{rl.garn.name}</b></div>}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                            <span className="hint">Coût {euro(cm)} · marge {detail.margin_pct} %</span>
                            <b style={{ fontSize: 19, color: "var(--ember1)" }}>{euro(price)} <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>/ pizza</span></b>
                          </div>
                          <div style={{ marginTop: 10 }}>
                            {axes.map((a, i) => (
                              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone[a.tone], marginTop: 5, flexShrink: 0 }} />
                                <div><b style={{ fontSize: 12.5 }}>{a.t}</b><div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.4 }}>{a.d}</div></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {(detail.ingredients || []).length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "14px 0 0" }}>
                        {detail.ingredients.map((t, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid var(--border-soft)", paddingBottom: 4 }}>
                            <span>{t.label} <span className="hint">· {num(t.qty)} {t.unit}</span></span>
                            <span className="mono">{euro(c.line(t))}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {detail.kind === "RECETTE" && (detail.ingredients || []).length > 0 ? (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
                        <span className="hint">Coût {euro(c.per)} / pizza · marge {detail.margin_pct} %</span>
                        <b style={{ fontSize: 20, color: "var(--ember1)" }}>{euro(c.price)} <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>/ pizza</span></b>
                      </div>
                    ) : (detail.ingredients || []).length > 0 ? (
                      <p className="hint" style={{ marginTop: 12 }}>Coût des ingrédients : <b>{euro(c.ingSum)}</b></p>
                    ) : null}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      <button className={"btn sm " + (lk.liked ? "primary" : "ghost")} onClick={() => toggleLike(detail.id)} title={lk.liked ? "Je n'aime plus" : "J'aime"}>
                        <Icon name="heart" size={14} fill={lk.liked ? "currentColor" : "none"} /> {lk.count} j'aime
                      </button>
                      <button className={"btn sm " + (wish.has(detail.id) ? "primary" : "ghost")} onClick={() => toggleWish(detail.id)} title={wish.has(detail.id) ? "Retirer de ma wishlist" : "Mettre de côté"}>
                        <Icon name="bookmark" size={14} fill={wish.has(detail.id) ? "currentColor" : "none"} /> {wish.has(detail.id) ? "Mise de côté" : "Wishlist"}
                      </button>
                      <button className="btn sm primary comm-save" disabled={busy} onClick={() => copyToMine(detail)} title="Enregistrer dans mes fiches"><Icon name="folder-check" size={14} /> Enregistrer</button>
                    </div>

                    {/* Commentaires */}
                    <div style={{ marginTop: 18, borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
                      <div className="card-ttl" style={{ fontSize: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}><Icon name="message-circle" size={15} /> Commentaires ({(comments[detail.id] || []).length})</div>
                      <CommentThread id={detail.id} comments={comments} editing={editing} setEditing={setEditing}
                        draft={draft} setDraft={setDraft} onSubmit={submitComment} onSaveEdit={saveEdit} onDelete={delComment} />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {profileOpen && <ProfileModal profile={profile} loading={!profile} cadre={cadreDe(profileId, profile?.done)} onClose={() => setProfileOpen(false)} />}
    </>
  );
}
