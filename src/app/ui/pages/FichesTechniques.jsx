import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import BuilderHub from "../components/BuilderHub.jsx";
import FicheRecette from "./FicheRecette.jsx";
import { getMyRecipes, deleteRecipe, unshareRecipe } from "../api/apiClient.js";

/**
 * MES FICHES TECHNIQUES — l'outil UNIQUE (2026-09-29) qui réunit les empâtements, garnitures et
 * réalisations d'autrefois. Une fiche = des ingrédients (puisés dans la mercuriale) + d'autres
 * fiches importées (à leur coût au kg) + une procédure ; toutes vivent dans la même table `recipe`,
 * distinguées par leur `kind`. Ici : la liste de TOUTES les fiches (tous types, filtrables) et
 * l'entrée vers l'éditeur (FicheRecette embarqué) pour créer ou modifier.
 *
 * Le PARTAGE à la communauté se fait dans l'éditeur (bouton « Partager », qui écrit la fiche
 * ENTIÈRE) ; on peut retirer du partage d'ici, car `unshareRecipe` est une route dédiée qui ne
 * touche qu'à la visibilité (repartager depuis la liste réécrirait la fiche sans ses ingrédients).
 */
const KIND_MODE = { PATE: "empatement", PREPARATION: "garniture", RECETTE: "realisation" };
const KIND_LABEL = { PATE: "Empâtement", PREPARATION: "Garniture", RECETTE: "Réalisation" };
// Même pastille que l'éditeur : chaque type a sa couleur (elles étaient toutes du même beige).
const KIND_ICON = { PATE: "wheat", PREPARATION: "list-checks", RECETTE: "pizza" };
const FILTERS = [
  { key: "", label: "Toutes" },
  { key: "PATE", label: "Empâtements" },
  { key: "PREPARATION", label: "Garnitures" },
  { key: "RECETTE", label: "Réalisations" },
];

export default function FichesTechniques() {
  const [fiches, setFiches] = useState([]);
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState(null); // null | { mode, id } — id null = nouvelle fiche
  const reload = () => getMyRecipes().then((r) => setFiches(r.data || [])).catch(() => {});
  useEffect(() => { reload(); }, []);

  // Éditeur embarqué : créer ou modifier une fiche, puis revenir à la liste (rechargée). Depuis
  // l'éditeur, on ouvre aussi une AUTRE fiche (celle qu'une réalisation importe, ou une
  // réalisation qui utilise la fiche) : la clé remonte l'éditeur, qui repart de zéro.
  if (edit) {
    return (
      <FicheRecette key={edit.id || `nouvelle-${edit.mode}`} mode={edit.mode} openId={edit.id} embedded
        onExit={() => { setEdit(null); reload(); }}
        onOpen={(kind, id) => setEdit({ mode: KIND_MODE[kind] || "realisation", id })} />
    );
  }

  const shown = filter ? fiches.filter((f) => f.kind === filter) : fiches;
  const count = (k) => fiches.filter((f) => f.kind === k).length;
  const remove = async (id) => { if (!window.confirm("Supprimer cette fiche ?")) return; try { await deleteRecipe(id); reload(); } catch { /* barre d'erreur globale */ } };
  const unshare = async (id) => { try { await unshareRecipe(id); reload(); } catch { /* ignore */ } };

  return (
    <>
      <PageHead icon="file-text" eyebrow="Outils · fiches techniques" title="Mes fiches techniques"
        lead="Tes empâtements, garnitures et réalisations réunis. Compose une fiche à partir de ta mercuriale, importe une fiche dans une autre à son coût au kg, et partage-la à la communauté." />

      <BuilderHub cards={[
        { title: "Empâtement", badge: count("PATE") || "0", desc: "Calcule ta pâte au pourcentage boulanger (hydratation, sel, huile, levure).", icon: "wheat", color: "#e0ac48", onClick: () => setEdit({ mode: "empatement", id: null }) },
        { title: "Garniture", badge: count("PREPARATION") || "0", desc: "Compose une base, une sauce, une garniture ; chiffrée depuis ta mercuriale.", icon: "list-checks", color: "#3aa0e0", onClick: () => setEdit({ mode: "garniture", id: null }) },
        { title: "Réalisation", badge: count("RECETTE") || "0", desc: "Assemble une pizza : importe tes fiches et des ingrédients, coût matière et prix.", icon: "pizza", color: "#5f9e3f", onClick: () => setEdit({ mode: "realisation", id: null }) },
      ]} />

      <Card title={<span className="card-ttl"><Icon name="history" size={16} /> Mes fiches enregistrées</span>} style={{ marginTop: 20 }}>
        <div className="rayon-tabs" style={{ marginBottom: 14 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={"rayon-tab" + (filter === f.key ? " on" : "")} onClick={() => setFilter(f.key)}>
              {f.label}{f.key ? ` (${count(f.key)})` : ""}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Aucune fiche pour l'instant. Crée-en une ci-dessus.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {shown.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--border-soft)" }}>
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
                <button className="btn sm ghost" onClick={() => setEdit({ mode: KIND_MODE[s.kind] || "realisation", id: s.id })}><Icon name="pencil" size={13} /> Ouvrir</button>
                <button className="iconbtn del" title="Supprimer" onClick={() => remove(s.id)}><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
