import { useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { TIPOS } from "../lib/dough.js";

/**
 * Notions & lexique — page d'information de l'espace stagiaire.
 *  • Notions de base : les fourchettes clés (hydratation, sel, huile, levure…) + conseils.
 *  • Lexique par niveau : le vocabulaire à retenir, regroupé par niveau de formation.
 * Valeurs issues du Manuel École Pizza + cahiers des charges (AVPN/STG).
 */
const NOTIONS = [
  { ic: "droplet", color: "#3aa0e0", t: "Taux d'hydratation (T.H.)", v: "55 – 90 %", note: "Varie selon la farine, la consistance souhaitée et le type de pizza/pain. Débutant : vise 56-62 % (plus facile à manipuler, notamment en napolitaine)." },
  { ic: "salt", color: "#c9cede", t: "Sel", v: "2 – 3,75 % / kg", note: "École (classique) : 20 g/kg = 2 %. Napolitaine AVPN : 40 à 60 g de sel par litre d'eau (pour 1,6 à 1,8 kg de farine) = 2,2 à 3,75 %." },
  { ic: "oil", color: "#7bb661", t: "Huile d'olive", v: "0 – 8 %", note: "Facultative. Elle maintient le pâton dans le temps : au froid, ce corps gras fige et forme une fine pellicule qui protège le pâton et l'empêche de « tomber » trop vite. Sans huile → on complète par de l'eau." },
  { ic: "yeast", color: "#ff6900", t: "Levure", v: "0,003 – 3 %", note: "Selon le type (fraîche, sèche active, sèche instantanée), la durée et la température de fermentation." },
  { ic: "wheat", color: "#fcb900", t: "Levain", v: "1 – 30 %", note: "Proportion selon le temps de fermentation." },
  { ic: "refresh", color: "#7b3f9e", t: "Pré-ferments (biga, pâte fermentée)", v: "10 – 30 %", note: "Biga, poolish, pâte fermentée : habituellement utilisés entre 10 et 30 % de la farine." },
];

// Recette de référence pour 1 unité de calcul (Manuel École Pizza — fiche technique pâton + protocole
// empâtement direct), dans l'ordre chronologique d'incorporation.
const REF_UNITE = [
  { ic: "wheat", color: "#fcb900", k: "Farine (type 00)", g: "1000 g", pct: "100 %", note: "Riche en gluten" },
  { ic: "yeast", color: "#ff6900", k: "Levure fraîche", g: "3 g", pct: "0,3 %", note: "Diluée dans un peu d'eau tiède" },
  { ic: "droplet", color: "#3aa0e0", k: "Eau", g: "620 g", pct: "62 %", note: "Froide (≈ 18 °C)" },
  { ic: "salt", color: "#c9cede", k: "Sel fin", g: "20 g", pct: "2 %", note: "Dissous dans l'eau" },
  { ic: "oil", color: "#7bb661", k: "Huile d'olive", g: "25 g", pct: "2,5 %", note: "En fin de pétrissage" },
];

const LEXIQUE = [
  {
    level: "Unités de calcul", color: "var(--gold)", intro: "La base pour dimensionner un empâtement.", terms: [
      ["Unité de calcul", "Base de référence pour dimensionner une pâte : 1 unité = 1 kg de farine (= 100 %). On calcule tout pour 1 unité, puis on multiplie par le nombre d'unités voulu. Une unité donne ≈ 6 pâtons de 280 g. Tous les autres ingrédients s'expriment en % de la farine (pourcentage boulanger)."],
      ["Pourcentage boulanger", "Chaque ingrédient est exprimé en % du poids de la farine (farine = 100 %). Ex. hydratation 60 % = 600 g d'eau pour 1 kg de farine."],
    ],
  },
  {
    level: "Niveau I", color: "var(--green)", intro: "Le socle : farine, eau, sel, levure, empâtement direct.", terms: [
      ["Gluten", "Réseau protéique (gliadine + gluténine) qui se forme au pétrissage ; il retient le CO₂ des levures et donne élasticité et tenue à la pâte."],
      ["Indice de force W", "Mesure la « force boulangère » de la farine (travail pour déformer le pâton). Il ne figure pas sur le sac. Napolitaine : W 250-310."],
      ["Rapport P/L", "Équilibre entre ténacité (P) et extensibilité (L) de la pâte. Idéal ≈ 0,50-0,70."],
      ["Eau de coulage", "L'eau utilisée pour le pétrissage. Sa température se calcule avec la formule TB 50."],
      ["TB 50", "Température de base = 50. Eau de coulage = 50 − (2 × température de la farine). Vise une pâte à ≈ 23-25 °C en fin de pétrissage."],
      ["Sel", "17 à 22 g/kg. Il renforce la maille du gluten, régularise la fermentation et améliore la coloration/croustillant."],
      ["Empâtement direct", "Tous les ingrédients sont mélangés en une seule fois (méthode du Niveau I)."],
      ["Autolyse", "Repos de la farine + eau (30-60 min) avant d'ajouter sel et levure → pâte plus extensible."],
      ["Pointage", "Première fermentation « en masse », juste après le pétrissage."],
      ["Apprêt / détente", "Repos des pâtons après le boulage, avant l'étalage."],
      ["Pâton", "Boule de pâte destinée à une pizza. Napolitaine : 180-280 g selon le diamètre."],
      ["Bassinage", "Eau ajoutée en fin de pétrissage, par petits filets, pour corriger la texture (2-3 %)."],
    ],
  },
  {
    level: "Niveau II", color: "var(--blue)", intro: "Les empâtements indirects (pré-ferments).", terms: [
      ["Empâtement indirect", "On prépare d'abord un pré-ferment, puis on l'incorpore à la pâte finale. Nécessite une farine forte (≥ W320)."],
      ["Biga", "Pré-ferment sec (≈ 45-50 % d'hydratation)."],
      ["Poolish", "Pré-ferment liquide (≈ 100 % d'hydratation)."],
      ["Pâte fermentée (P.F.)", "Un empâtement (direct ou indirect) qu'on a laissé fermenter 24 h à température ambiante, ou 2 à 5 jours en chambre froide."],
      ["Maturation", "Transformation enzymatique de la pâte (goût, digestibilité), à distinguer de la fermentation (production de gaz)."],
    ],
  },
  {
    level: "Spécialisations", color: "var(--ember1)", intro: "Napolitaine, In Teglia & In Pala.", terms: [
      ["Napolitaine (STG / AVPN)", "Deux cahiers des charges : STG (Règlement UE) et AVPN (Associazione Verace Pizza Napoletana). Cuisson au four à bois, 60-90 s."],
      ["Cornicione", "Le bord surélevé et alvéolé de la pizza napolitaine."],
      ["Staglio", "La découpe et le boulage des pâtons après le pointage."],
      ["In Teglia (al taglio)", "Pizza « à la coupe », cuite en plaque rectangulaire, très haute hydratation (jusqu'à 80 %)."],
      ["In Pala", "Pizza allongée servie sur pelle, cuite sur pierre, haute hydratation."],
    ],
  },
];

export default function Notions() {
  const [tab, setTab] = useState("notions");
  return (
    <>
      <PageHead eyebrow="Outils · information" title="Notions & lexique"
        lead="L'essentiel à retenir sur la pâte : les fourchettes clés et le vocabulaire, regroupé par niveau de formation." />

      <span className="seg" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        <button className={"seg-btn" + (tab === "notions" ? " on" : "")} onClick={() => setTab("notions")}><Icon name="droplet" size={13} /> Notions de base</button>
        <button className={"seg-btn" + (tab === "lexique" ? " on" : "")} onClick={() => setTab("lexique")}><Icon name="book-open" size={13} /> Lexique par niveau</button>
      </span>

      {tab === "notions" ? (
        <>
          <Card className="uc-hero" title={<span className="card-ttl"><Icon name="wheat" size={16} /> L'unité de calcul = 1 kg de farine</span>} style={{ marginBottom: 16 }}>
            <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.55, color: "var(--muted)" }}>
              On raisonne toujours pour <b style={{ color: "var(--text)" }}>1 kg de farine</b> (= 100 %). Chaque ingrédient s'exprime en <b style={{ color: "var(--text)" }}>% du poids de la farine</b> (pourcentage boulanger). Une unité de calcul donne <b style={{ color: "var(--text)" }}>≈ 6 pâtons de 280 g</b> (soit 1,68 kg de pâte). Pour 10 unités, on multiplie tout par 10.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {REF_UNITE.map((i, idx) => (
                <div key={i.k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: idx < REF_UNITE.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: i.color, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, flex: "none" }}>{idx + 1}</span>
                  <span style={{ color: i.color, display: "inline-flex" }}><Icon name={i.ic} size={17} /></span>
                  <b style={{ fontSize: 13.5, minWidth: 130 }}>{i.k}</b>
                  <span className="hint" style={{ flex: 1, fontSize: 12 }}>{i.note}</span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)", width: 48, textAlign: "right" }}>{i.pct}</span>
                  <b className="tnum" style={{ width: 70, textAlign: "right" }}>{i.g}</b>
                </div>
              ))}
            </div>
            <p className="hint" style={{ margin: "12px 0 0", fontSize: 11.5 }}>Ordre chronologique d'incorporation (empâtement direct) : farine + levure (oxygénation 1 mn) → eau → sel → huile → bassinage (correction finale).</p>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
            {NOTIONS.map((n) => (
              <div key={n.t} className="card" style={{ borderTop: `3px solid ${n.color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ color: n.color, display: "inline-flex" }}><Icon name={n.ic} size={18} /></span>
                  <b style={{ fontSize: 14.5 }}>{n.t}</b>
                </div>
                <div style={{ font: "800 20px/1 var(--font-d)", color: n.color, marginBottom: 8 }}>{n.v}</div>
                <p className="hint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>{n.note}</p>
              </div>
            ))}
          </div>

          <Card title={<span className="card-ttl"><Icon name="wheat" size={16} /> Types de farine — France ↔ Italie</span>} style={{ marginTop: 16 }}>
            <p className="hint" style={{ margin: "0 0 12px", fontSize: 13 }}>Les farines se classent par taux de cendres (extraction). La France note en « T… », l'Italie en « Tipo ». Voici les équivalences (avec le W, c'est le critère clé du choix de la farine).</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
                  <th style={{ padding: "6px 10px 6px 0" }}>France</th><th style={{ padding: "6px 10px" }}>Italie</th><th style={{ padding: "6px 0" }}>Caractère</th>
                </tr></thead>
                <tbody>
                  {TIPOS.map((t) => (
                    <tr key={t.key} style={{ borderTop: "1px solid var(--border-soft)" }}>
                      <td style={{ padding: "8px 10px 8px 0" }}><b>{t.fr}</b></td>
                      <td style={{ padding: "8px 10px" }}><span className="badge n" style={{ background: "color-mix(in srgb, var(--gold) 16%, var(--surface))", color: "var(--orange)", borderColor: "transparent" }}>Tipo {t.it}</span></td>
                      <td style={{ padding: "8px 0", color: "var(--muted)" }}>{t.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint" style={{ margin: "10px 0 0", fontSize: 11.5 }}>Repères : <b>Tipo 1 ≈ T80</b> (semi-complète), <b>Tipo 2 ≈ T110</b> (complète), <b>intégrale ≈ T150</b>. Pour la pizza on reste souvent en 00/0 (T45–65).</p>
          </Card>

          <Card className="notions-tips" title={<span className="card-ttl"><Icon name="flame" size={16} /> Nos conseils</span>} style={{ marginTop: 16 }}>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, lineHeight: 1.5 }}>
              <li>Ne débute pas avec une pâte trop hydratée : un T.H. entre <b>56 % et 62 %</b> est plus facile à manipuler, notamment pour la napolitaine.</li>
              <li>Choisis une farine adaptée : un indice <b>W supérieur à 250</b>, et idéalement <b>au-delà de 300</b> pour les longues fermentations (+ de 24 h).</li>
            </ul>
          </Card>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {LEXIQUE.map((g) => (
            <Card key={g.level} title={<span className="card-ttl" style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span className="badge n" style={{ background: g.color, color: "#fff", borderColor: "transparent" }}>{g.level}</span>
              <span className="hint" style={{ fontWeight: 400 }}>{g.intro}</span>
            </span>}>
              <dl style={{ margin: 0, display: "flex", flexDirection: "column" }}>
                {g.terms.map(([term, def]) => (
                  <div key={term} style={{ padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <dt style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>{term}</dt>
                    <dd style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{def}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
