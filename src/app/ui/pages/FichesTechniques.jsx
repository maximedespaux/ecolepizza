import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import BuilderHub from "../components/BuilderHub.jsx";
import FicheRecette from "./FicheRecette.jsx";
import { getMyRecipes, deleteRecipe, unshareRecipe, photoFicheUrl } from "../api/apiClient.js";
import { resumeFiche, RAYONS, KIND_MODE, MODE_KIND } from "../lib/rayonsFiches.js";

/**
 * MES FICHES TECHNIQUES — l'outil UNIQUE (2026-09-29) qui réunit les empâtements, préparations et
 * réalisations d'autrefois. Une fiche = des ingrédients (puisés dans la mercuriale) + d'autres
 * fiches importées (à leur coût au kg) + une procédure ; toutes vivent dans la même table `recipe`,
 * distinguées par leur `kind`. Ici : la liste de TOUTES les fiches (tous types, filtrables) et
 * l'entrée vers l'éditeur (FicheRecette embarqué) pour créer ou modifier.
 *
 * UN RAYON PAR TYPE (demandé le 2026-09-30). Cliquer « Empâtement », « Préparation » ou
 * « Réalisation » ouvrait l'éditeur sur une fiche VIDE : pour rouvrir la sauce de la semaine
 * dernière, il fallait revenir en arrière et la chercher dans la liste du bas. Le clic ouvre
 * désormais le RAYON : d'abord les fiches déjà enregistrées de ce type, en cartes, puis le bouton
 * qui en crée une — « Nouvel empâtement », « Nouvelle préparation », « Nouvelle réalisation ».
 *
 * LE RAYON OUVERT VIT DANS L'ADRESSE (`?type=empatement`). En état du composant, la touche Retour
 * du téléphone — le geste le plus naturel pour « revenir aux trois choix » — quittait la page
 * entière. L'éditeur, lui, reste un état : y entrer n'ajoute rien à l'historique, comme avant.
 *
 * Le PARTAGE à la communauté se fait dans l'éditeur (bouton « Partager », qui écrit la fiche
 * ENTIÈRE) ; on peut retirer du partage d'ici, car `unshareRecipe` est une route dédiée qui ne
 * touche qu'à la visibilité (repartager depuis la liste réécrirait la fiche sans ses ingrédients).
 */
const KIND_LABEL = { PATE: "Empâtement", PREPARATION: "Préparation", RECETTE: "Réalisation" };
// Même pastille que l'éditeur : chaque type a sa couleur (elles étaient toutes du même beige).
const KIND_ICON = { PATE: "wheat", PREPARATION: "list-checks", RECETTE: "pizza" };
const FILTERS = [
  { key: "", label: "Toutes" },
  { key: "PATE", label: "Empâtements" },
  { key: "PREPARATION", label: "Préparations" },
  { key: "RECETTE", label: "Réalisations" },
];

export default function FichesTechniques() {
  // `null` : on charge. À `[]`, un rayon annonçait « aucune fiche » le temps de la réponse.
  const [fiches, setFiches] = useState(null);
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState(null); // null | { mode, id } — id null = nouvelle fiche
  const [params, setParams] = useSearchParams();
  const rayon = MODE_KIND[params.get("type")] || null;
  const reload = () => getMyRecipes().then((r) => setFiches(r.data || [])).catch(() => setFiches((f) => f || []));
  useEffect(() => { reload(); }, []);

  // Éditeur embarqué : créer ou modifier une fiche, puis revenir d'où l'on vient — le rayon ouvert,
  // ou l'accueil (rechargés). Depuis l'éditeur, on ouvre aussi une AUTRE fiche (celle qu'une
  // réalisation importe, ou une réalisation qui utilise la fiche) : la clé remonte l'éditeur, qui
  // repart de zéro.
  if (edit) {
    return (
      <FicheRecette key={edit.id || `nouvelle-${edit.mode}`} mode={edit.mode} openId={edit.id} embedded
        onExit={() => { setEdit(null); reload(); }}
        onOpen={(kind, id) => setEdit({ mode: KIND_MODE[kind] || "realisation", id })} />
    );
  }

  const toutes = fiches || [];
  const count = (k) => toutes.filter((f) => f.kind === k).length;
  const ouvrir = (s) => setEdit({ mode: KIND_MODE[s.kind] || "realisation", id: s.id });
  const remove = async (id) => { if (!window.confirm("Supprimer cette fiche ?")) return; try { await deleteRecipe(id); reload(); } catch { /* barre d'erreur globale */ } };
  const unshare = async (id) => { try { await unshareRecipe(id); reload(); } catch { /* ignore */ } };

  if (rayon) {
    const r = RAYONS[rayon];
    const miennes = toutes.filter((f) => f.kind === rayon);
    const creer = () => setEdit({ mode: KIND_MODE[rayon], id: null });
    return (
      <>
        <button type="button" className="ft-retour" onClick={() => setParams({})}>
          <Icon name="chevron-left" size={16} /> Mes fiches techniques
        </button>
        <PageHead icon={KIND_ICON[rayon]} eyebrow="Outils · fiches techniques" title={r.titre} lead={r.lead}
          actions={<button type="button" className="btn primary" onClick={creer}><Icon name="plus" size={15} /> {r.creer}</button>} />

        {fiches === null ? (
          <p className="hint">Chargement…</p>
        ) : miennes.length === 0 ? (
          <Card>
            <EmptyState icon={KIND_ICON[rayon]} title={r.vide} text={r.attente}>
              <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={creer}><Icon name="plus" size={15} /> {r.premier}</button>
            </EmptyState>
          </Card>
        ) : (
          <div className="ft-grille">
            {miennes.map((s) => (
              <article key={s.id} className={"ft-carte fe-k-" + s.kind}>
                {/* LA CARTE ENTIÈRE OUVRE LA FICHE ; retirer du partage et supprimer restent à part,
                    hors du bouton — un bouton dans un bouton ne se clique pas au clavier. */}
                <button type="button" className="ft-carte-ouvrir" onClick={() => ouvrir(s)} aria-label={`Ouvrir ${s.name}`}>
                  {s.photo_v
                    ? <img className="ft-carte-photo" src={photoFicheUrl(s.id, s.photo_v)} alt="" loading="lazy" />
                    : <span className="ft-carte-photo vide" aria-hidden="true"><Icon name={KIND_ICON[s.kind] || "file-text"} size={34} /></span>}
                  <span className="ft-carte-texte">
                    <b className="ft-carte-nom">{s.name}</b>
                    <span className="ft-carte-resume">{resumeFiche(s)}</span>
                  </span>
                </button>
                <div className="ft-carte-pied">
                  {s.visibility === "SHARED"
                    ? <span className="ft-carte-partage"><Icon name="users" size={13} /> Partagée</span>
                    : <span className="ft-carte-partage prive"><Icon name="lock" size={13} /> Privée</span>}
                  <span className="ft-carte-actions">
                    {s.visibility === "SHARED" && (
                      <button type="button" className="btn sm ghost" onClick={() => unshare(s.id)} title="Rendre privée (retirer du partage)">Retirer</button>
                    )}
                    <button type="button" className="iconbtn del" title="Supprimer" aria-label={`Supprimer ${s.name}`} onClick={() => remove(s.id)}><Icon name="trash" size={14} /></button>
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </>
    );
  }

  const shown = filter ? toutes.filter((f) => f.kind === filter) : toutes;
  const versRayon = (kind) => () => setParams({ type: KIND_MODE[kind] });

  return (
    <>
      <PageHead icon="file-text" eyebrow="Outils · fiches techniques" title="Mes fiches techniques"
        lead="Tes empâtements, préparations et réalisations réunis. Compose une fiche à partir de ta mercuriale, importe une fiche dans une autre à son coût au kg, et partage-la à la communauté." />

      <BuilderHub cards={[
        { title: "Empâtement", badge: count("PATE") || "0", desc: "Calcule ta pâte au pourcentage boulanger (hydratation, sel, huile, levure).", icon: "wheat", color: "#e0ac48", onClick: versRayon("PATE") },
        { title: "Préparation", badge: count("PREPARATION") || "0", desc: "Un ingrédient que tu prépares : une sauce, une base, une crème… Chiffré depuis ta mercuriale.", icon: "list-checks", color: "#3aa0e0", onClick: versRayon("PREPARATION") },
        { title: "Réalisation", badge: count("RECETTE") || "0", desc: "Ta pizza : une pâte, tes préparations et les autres ingrédients. Coût matière, prix conseillé et accords de saveurs.", icon: "pizza", color: "#5f9e3f", onClick: versRayon("RECETTE") },
      ]} />

      <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes fiches enregistrées</span>} style={{ marginTop: 20 }}>
        <div className="rayon-tabs" style={{ marginBottom: 14 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={"rayon-tab" + (filter === f.key ? " on" : "")} onClick={() => setFilter(f.key)}>
              {f.label}{f.key ? ` (${count(f.key)})` : ""}
            </button>
          ))}
        </div>
        {fiches === null ? (
          <p className="hint" style={{ margin: 0 }}>Chargement…</p>
        ) : shown.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Aucune fiche pour l'instant. Crée-en une ci-dessus.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {shown.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--border-soft)" }}>
                {s.photo_v
                  ? <img className="fe-vignette" src={photoFicheUrl(s.id, s.photo_v)} alt="" loading="lazy" />
                  : <span className={"fe-vignette vide fe-k-" + s.kind} aria-hidden="true"><Icon name={KIND_ICON[s.kind] || "file-text"} size={18} /></span>}
                <span className={"fe-kind sm fe-k-" + s.kind}><Icon name={KIND_ICON[s.kind] || "file-text"} size={12} /> {KIND_LABEL[s.kind]}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{s.name}</b>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                    {s.kind === "RECETTE" && s.type ? s.type : KIND_LABEL[s.kind]}{s.visibility === "SHARED" ? " · partagée" : ""}
                  </span>
                </span>
                {s.visibility === "SHARED" && (
                  <button className="btn sm ghost" onClick={() => unshare(s.id)} title="Rendre privée (retirer du partage)"><Icon name="lock" size={13} /> Retirer</button>
                )}
                <button className="btn sm ghost" onClick={() => ouvrir(s)}><Icon name="pencil" size={13} /> Ouvrir</button>
                <button className="iconbtn del" title="Supprimer" onClick={() => remove(s.id)}><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
