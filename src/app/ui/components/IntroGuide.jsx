import { createPortal } from "react-dom";
import { useEchap } from "../lib/useEchap.js";
import { Icon } from "./Icon.jsx";

/**
 * Modal « Comment ça marche ». Deux variantes :
 *  • sans `page` → vue d'ensemble des 3 outils (utilisée sur les hubs, auto une fois).
 *  • avec `page` (empatement | garniture | realisation) → explique l'outil en cours de construction.
 * Modal intégré à l'app (pas une popup navigateur).
 */
export const GUIDE_KEY = "impasto.guideSeen.v1";

const OVERVIEW = [
  { n: 1, color: "#dc3e37", icon: "wheat", title: "Mes empâtements", body: "Crée ta pâte pas-à-pas (typologie, force W, hydratation, levure…). Enregistre-la : fiche technique, déroulé imprimable et coût matière par pâton." },
  { n: 2, color: "#5f9e3f", icon: "pizza", title: "Mes garnitures", body: "Compose ta garniture (base, produits, fromage). Le food-pairing t'aide à associer les saveurs, et le coût matière par pizza est calculé." },
  { n: 3, color: "#ff6900", icon: "flame", title: "Mes réalisations", body: "Assemble empâtement + garniture selon le service et la cuisson → le coût réel de la pizza, avec les axes d'amélioration." },
];

const TOOL = {
  empatement: {
    color: "#dc3e37", icon: "wheat", title: "L'assistant empâtement",
    steps: [
      "Choisis la typologie de pizza, puis la quantité (en unités de calcul ou en pâtons).",
      "Règle la farine : force W, type/Tipo et éventuels mélanges (autres blés, céréales).",
      "Ajuste l'hydratation, la levure & le stockage, puis la température de coulage.",
      "Le panneau de droite calcule tout (composition, coût, déroulé). Enregistre à la dernière étape.",
    ],
    tip: "Renseigne les prix dans l'onglet Coût pour obtenir le coût réel par pâton.",
  },
  garniture: {
    color: "#5f9e3f", icon: "pizza", title: "L'assistant garniture",
    steps: [
      "Choisis la base (sauce tomate, crème, ratatouille…).",
      "Ajoute les produits, le food-pairing te suggère des associations qui fonctionnent.",
      "Ajoute un ou plusieurs produits laitiers (mozzarella, burrata…).",
      "Le coût matière par pizza et des idées d'amélioration s'affichent à droite.",
    ],
    tip: "Tu peux aussi chercher un produit directement dans la base (catalogue).",
  },
  realisation: {
    color: "#ff6900", icon: "flame", title: "L'assistant réalisation",
    steps: [
      "Choisis le type de service (sur place, emporter, livraison, distributeur).",
      "Choisis la cuisson (gaz, électrique, bois, convoyeur…).",
      "Sélectionne un empâtement puis une garniture parmi tes enregistrements.",
      "On calcule le coût réel de la pizza + les axes d'amélioration selon tes choix.",
    ],
    tip: "Crée d'abord tes empâtements et tes garnitures pour les réutiliser ici.",
  },
};

export default function IntroGuide({ open, onClose, page }) {
  useEchap(onClose, open);
  if (!open) return null;
  const tool = page ? TOOL[page] : null;
  return createPortal(
    /* `stu-app` : le portail sort de StudentLayout et perdrait sinon Fredoka, les coins 22 px
       et le retour tactile — sur le TOUT PREMIER écran d'un nouveau stagiaire. `stu-app-nu`
       coupe le halo, qui serait sinon peint une seconde fois par-dessus le voile. */
    <div className="stu-app stu-app-nu">
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name={tool ? tool.icon : "book-open"} size={18} /> {tool ? `${tool.title}, comment ça marche ?` : "Comment ça marche ?"}
          </h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          {tool ? (
            <>
              <p style={{ fontSize: 14, lineHeight: 1.55, margin: "0 0 14px" }}>Cet assistant te guide, étape par étape&nbsp;:</p>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 11 }}>
                {tool.steps.map((s, i) => (
                  <li key={i} style={{ display: "flex", gap: 12 }}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: tool.color, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.5, paddingTop: 2 }}>{s}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, lineHeight: 1.55, margin: "0 0 6px" }}>Ces outils t'assistent pour concevoir tes pizzas et <b>maîtriser tes coûts</b>, comme un vrai pizzaïolo. En 3 étapes&nbsp;:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "16px 0" }}>
                {OVERVIEW.map((s) => (
                  <div key={s.n} style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                    <span style={{ position: "relative", flexShrink: 0 }}>
                      <span style={{ width: 42, height: 42, borderRadius: 12, background: `color-mix(in srgb, ${s.color} 16%, var(--surface))`, color: s.color, display: "grid", placeItems: "center" }}><Icon name={s.icon} size={20} /></span>
                      <span style={{ position: "absolute", top: -6, left: -6, width: 20, height: 20, borderRadius: "50%", background: s.color, color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", border: "2px solid var(--surface)" }}>{s.n}</span>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14.5, color: s.color }}>{s.title}</b>
                      <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, marginTop: 16, background: "color-mix(in srgb, var(--gold) 12%, var(--surface))", border: "1px solid color-mix(in srgb, var(--gold) 30%, var(--border))" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>💡</span>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>{tool ? tool.tip : <>Pense à renseigner les <b>prix (€/kg)</b> dans l'onglet <b>Coût</b> de chaque outil : c'est ce qui permet de calculer le <b>coût réel</b> de tes pâtons et de tes pizzas.</>}</p>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button className="btn primary" onClick={onClose}><Icon name="check" size={15} /> {tool ? "J'ai compris" : "C'est parti"}</button>
          </div>
        </div>
      </div>
    </div>
    </div>,
    document.body
  );
}
