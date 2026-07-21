import { Link } from "react-router-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import HygieneRefPanel from "../components/HygieneRefPanel.jsx";
import HygienePresetsPanel from "../components/HygienePresetsPanel.jsx";
import { Icon } from "../components/Icon.jsx";

/**
 * Paramétrage centralisé de la maîtrise sanitaire — le « configurez une fois » du logiciel métier.
 * Tout ce qui évite de répondre deux fois à la même question vit ici : points de contrôle (seuils),
 * plan de nettoyage, fournisseurs et produits fréquents (avec DLC secondaire par défaut).
 */
const SECTIONS = [
  { icon: "thermometer", accent: "blue", title: "Points de contrôle", hint: "Vos frigos, congélateurs, fours, friteuses — avec leurs seuils. Les relevés se jugent contre eux.", mode: "equipment" },
  { icon: "spray-can", accent: "teal", title: "Plan de nettoyage", hint: "Vos tâches récurrentes par zone. Elles alimentent la checklist du jour.", mode: "task" },
  { icon: "cart", accent: "amber", title: "Fournisseurs", hint: "Proposés en autocomplétion à la réception — vous ne les retapez plus.", preset: "SUPPLIER" },
  { icon: "file-text", accent: "violet", title: "Produits fréquents", hint: "Choisir un produit remplit sa DLC secondaire (+ sa nature) tout seul sur les étiquettes.", preset: "PRODUCT" },
];

export default function HygieneReglages() {
  return (
    <div>
      <PageHead
        eyebrow={<Link to="/hygiene" className="hs-back"><Icon name="chevron-left" size={14} /> Maîtrise sanitaire</Link>}
        title="Paramétrage"
        lead="Réglez tout une bonne fois : ensuite, la saisie du quotidien se fait en quelques taps, sans jamais reposer les mêmes questions."
      />
      {SECTIONS.map((s) => (
        <Card key={s.title} className="hs-reglage"
          title={<span className="hs-reglage-t"><span className={`hs-reglage-ic accent-${s.accent}`}><Icon name={s.icon} size={16} /></span> {s.title}</span>}>
          <p className="hs-reglage-hint">{s.hint}</p>
          {s.mode
            ? <HygieneRefPanel mode={s.mode} />
            : <HygienePresetsPanel kind={s.preset} />}
        </Card>
      ))}
    </div>
  );
}
