import { Icon } from "./Icon.jsx";
import Card from "./Card.jsx";
import { euroFixe } from "../lib/format.js";
import { GARN_BASES, pairSuggestions, num, perWeightUnit, unitShort, lireComposition, dansMercuriale } from "../lib/garnitures.js";

/**
 * ACCORDS DE SAVEURS — le guide d'une fiche RÉALISATION (déplacé de la préparation le 2026-09-29).
 *
 * Une préparation est UN ingrédient préparé (une sauce, une crème) ; c'est la réalisation qui
 * assemble une pâte, des préparations et d'autres ingrédients, et c'est là qu'on se demande quoi
 * mettre avec quoi. Le guide ne demande donc plus rien : il LIT la composition (`lireComposition`,
 * lib/garnitures.js) — sa base, souvent une préparation importée (« Sauce tomate San Marzano »),
 * et les produits déjà posés — puis `pairSuggestions` remonte ce que l'école associe à l'ensemble
 * (relations ASYMÉTRIQUES : cf. lib/garnitures.js). Rien n'est gardé ici : ajouter une suggestion
 * l'ajoute à la composition, qui la relit aussitôt — elle sort des suggestions, et ses propres
 * affinités y entrent.
 *
 * Une suggestion s'ajoute depuis MA MERCURIALE quand le produit y figure (« Mozzarella fior di
 * latte » pour la mozzarella, avec son prix et son produit Metro), sinon au prix indicatif.
 */
const etoiles = (s) => "★".repeat(s >= 3 ? 3 : s >= 2 ? 2 : 1);

export default function PairingSuggest({ lignes, merc, onAdd, bare = false }) {
  const { base, ligneBase, presents } = lireComposition(lignes);
  const suggestions = pairSuggestions(presents, base ? base.key : null);

  // La ligne à ajouter : le produit de ma mercuriale s'il y est, sinon le produit de l'école.
  const ligneDe = (p) => {
    const m = dansMercuriale(merc, p);
    if (!m) return { label: p.label, unit: "g", unit_price: num(p.price), qty: p.qty || 40 };
    const auPoids = perWeightUnit(m.unit);
    return { label: m.label, product_id: m.catalog_product_id || null, unit: auPoids ? "g" : "piece", unit_price: num(m.price), qty: auPoids ? (p.qty || 40) : 1 };
  };
  const prixDe = (p) => {
    const m = dansMercuriale(merc, p);
    return m ? `prix de ta mercuriale : ${euroFixe(num(m.price))}/${unitShort(m.unit)}` : `prix indicatif : ${euroFixe(num(p.price))}/kg`;
  };

  // `bare` : sans sa carte ni son titre, quand l'appelant l'enveloppe déjà (section repliable).
  const Cadre = bare ? Nu : Card;
  return (
    <Cadre title={<span className="card-ttl"><Icon name="star" size={16} /> Accords de saveurs <span className="hint" style={{ fontWeight: 400 }}>· ce que l'école associe</span></span>}>
      {base ? (
        <p className="fe-accord-base">
          <span className="fiche-tag">{base.emoji} {base.label}</span>
          {ligneBase && ligneBase.label !== base.label && <span className="hint">« {ligneBase.label} »</span>}
        </p>
      ) : (
        <div className="fe-accord-sans-base">
          <p className="hint" style={{ margin: 0 }}>
            Aucune base dans la composition. Ajoute ta préparation (sauce, crème…) par le champ d'ajout, ou pars d'une base de l'école :
          </p>
          <div className="fe-accord-puces">
            {GARN_BASES.filter((b) => (b.pairs || []).length).map((b) => (
              <button key={b.key} type="button" className="btn sm ghost" onClick={() => onAdd(ligneDe(b))} title={prixDe(b)}>
                {b.emoji} {b.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {suggestions.length > 0 ? (
        <div className="fe-accord-puces">
          {suggestions.map((p) => (
            <button key={p.key} type="button" className="btn sm ghost" onClick={() => onAdd(ligneDe(p))}
              title={`Avec ${p.matches.join(", ")} · ${prixDe(p)}`}>
              <Icon name="plus" size={12} /> {p.emoji} {p.label} <span style={{ color: "var(--gold)", letterSpacing: 1 }}>{etoiles(p.score)}</span>
            </button>
          ))}
        </div>
      ) : base ? (
        <p className="hint" style={{ margin: 0 }}>Plus de suggestion : ta composition couvre déjà les accords de l'école.</p>
      ) : null}
    </Cadre>
  );
}

function Nu({ children }) { return <>{children}</>; }
