import { useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { TIPOS } from "../lib/dough.js";
import { FICHES, GESTION, LEXIQUE, A_VALIDER, EXEMPLES } from "../lib/notions.js";
import { SCHEMAS } from "../components/Schemas.jsx";

/**
 * Notions & lexique — page d'information de l'espace stagiaire, en 3 volets :
 *  • Le manuel : les fiches techniques reprises du Manuel Technique Niveau I (farine, levure, eau,
 *    sel, huile, unités de calcul, protocole, adjonctions, substitutions, allergènes).
 *  • Gestion : coût matière, ticket moyen (théorique/réel), règle d'Omnès, matrice BCG.
 *  • Lexique : tout le vocabulaire, cherchable.
 * Le contenu vit dans lib/notions.js ; les chiffres sont ceux du manuel (ils alimentent dough.js).
 */

// Recette de référence pour 1 unité de calcul (protocole empâtement direct), ordre d'incorporation.
const REF_UNITE = [
  { ic: "wheat", color: "#fcb900", k: "Farine (type 00)", g: "1000 g", pct: "100 %", note: "Riche en gluten" },
  { ic: "yeast", color: "#ff6900", k: "Levure fraîche", g: "3 g", pct: "0,3 %", note: "Émiettée dans la farine (1 mn d'oxygénation)" },
  { ic: "droplet", color: "#3aa0e0", k: "Eau de coulage", g: "620 g", pct: "62 %", note: "D'un coup — garder un verre pour le bassinage" },
  { ic: "salt", color: "#c9cede", k: "Sel fin", g: "20 g", pct: "2 %", note: "Petit à petit, après 12 mn de pétrissage" },
  { ic: "oil", color: "#7bb661", k: "Huile d'olive", g: "25 g", pct: "2,5 %", note: "1 mn après le sel" },
];

// Tableau générique (head + rows) d'une section de fiche.
function Tbl({ t }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 360 }}>
        <thead><tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
          {t.head.map((h, i) => <th key={i} style={{ padding: "6px 12px 6px 0", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--border-soft)" }}>
              {r.map((c, j) => <td key={j} style={{ padding: "7px 12px 7px 0", color: j === 0 ? "var(--text)" : "var(--muted)", fontWeight: j === 0 ? 700 : 400, lineHeight: 1.45 }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Une section d'une fiche : titre + paragraphe / liste / schéma / tableau / encadré.
function Section({ s, color }) {
  const Sch = s.schema ? SCHEMAS[s.schema] : null;
  return (
    <div style={{ marginBottom: 18 }}>
      {s.t && <div className="ate-lbl" style={{ marginBottom: 7 }}>{s.t}</div>}
      {s.p && <p style={{ margin: "0 0 8px", fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)" }}>{s.p}</p>}
      {s.ul && (
        <ul style={{ margin: "0 0 8px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
          {s.ul.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
      {Sch && (
        <div style={{ margin: "12px 0", padding: "14px 10px", background: "var(--surface2)", border: "1px solid var(--border-soft)", borderRadius: 12, display: "grid", placeItems: "center" }}>
          <Sch />
        </div>
      )}
      {s.table && <Tbl t={s.table} />}
      {s.note && (
        <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "var(--muted)", padding: "9px 12px", background: "var(--surface2)", borderRadius: 9, borderLeft: `3px solid ${color}` }}>{s.note}</p>
      )}
    </div>
  );
}

// Une fiche complète (farine, levure, coût matière…). Elle se termine TOUJOURS par un exemple
// concret et chiffré : c'est ce qui fait passer la notion.
function Fiche({ f, extra }) {
  const ex = EXEMPLES[f.key];
  return (
    <Card style={{ marginBottom: 16, borderTop: `3px solid ${f.color}` }}
      title={<span className="card-ttl"><span style={{ color: f.color, display: "inline-flex" }}><Icon name={f.icon} size={17} /></span> {f.title}</span>}>
      {f.intro && <p style={{ margin: "0 0 16px", fontSize: 13, color: f.color, fontWeight: 600 }}>{f.intro}</p>}
      {f.sections.map((s, i) => <Section key={i} s={s} color={f.color} />)}
      {extra}
      {ex && (
        <div style={{ marginTop: 18, padding: "13px 15px", borderRadius: 12, background: `color-mix(in srgb, ${f.color} 9%, var(--surface))`, border: `1px solid color-mix(in srgb, ${f.color} 32%, transparent)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <span style={{ fontSize: 15 }}>💡</span>
            <b style={{ fontSize: 11.5, letterSpacing: ".05em", textTransform: "uppercase", color: f.color }}>En pratique</b>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}>{ex}</p>
        </div>
      )}
    </Card>
  );
}

// Nav à puces pour filtrer les fiches d'un volet.
function FicheNav({ list, sel, setSel }) {
  return (
    <div className="rayon-tabs" style={{ marginBottom: 14 }}>
      <button className={"rayon-tab" + (sel === "" ? " on" : "")} onClick={() => setSel("")}>Tout</button>
      {list.map((f) => (
        <button key={f.key} className={"rayon-tab" + (sel === f.key ? " on" : "")} onClick={() => setSel(f.key)}>
          <span style={{ color: sel === f.key ? "#fff" : f.color, display: "inline-flex" }}><Icon name={f.icon} size={13} /></span> {f.title}
        </button>
      ))}
    </div>
  );
}

// Une proposition à valider : ce qu'on affiche / ce que dit la source / pourquoi ça compte.
const KIND = { conflit: { l: "Contradiction", c: "var(--ember1)" }, ajout: { l: "Manque", c: "var(--blue)" }, precision: { l: "Précision", c: "var(--gold)" } };
function ValiderCard({ v }) {
  const k = KIND[v.kind] || KIND.precision;
  const bloc = (t, txt, color) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: color || "var(--dim)", marginBottom: 3 }}>{t}</div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--muted)" }}>{txt}</p>
    </div>
  );
  return (
    <Card style={{ marginBottom: 14, borderLeft: `3px solid ${k.c}` }}
      title={<span className="card-ttl" style={{ flexWrap: "wrap" }}>
        <span className="badge n" style={{ background: k.c, color: "#fff", borderColor: "transparent" }}>{k.l}</span> {v.fiche}
      </span>}>
      <div style={{ display: "grid", gap: 12 }}>
        {bloc("Aujourd'hui dans l'app", v.now)}
        {bloc("Ce que dit la source", v.found, k.c)}
        {bloc("Pourquoi ça compte", v.why)}
        {v.srcs && v.srcs.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 5 }}>Sources</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {v.srcs.map((s) => (
                <a key={s.u} href={s.u} target="_blank" rel="noreferrer" className="chip" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name="book-open" size={11} /> {s.l}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Notions() {
  const [tab, setTab] = useState("manuel");
  const [selM, setSelM] = useState("");
  const [selG, setSelG] = useState("");
  const [q, setQ] = useState("");

  const fichesM = selM ? FICHES.filter((f) => f.key === selM) : FICHES;
  const fichesG = selG ? GESTION.filter((f) => f.key === selG) : GESTION;
  const lex = LEXIQUE.filter((l) => !q.trim() || (l.t + " " + l.d).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.t.localeCompare(b.t, "fr"));

  // Table des types France ↔ Italie, injectée dans la fiche « farine ».
  const typesTable = (
    <div style={{ marginTop: 4 }}>
      <div className="ate-lbl" style={{ marginBottom: 7 }}>Les types — France ↔ Italie</div>
      <Tbl t={{ head: ["France", "Italie", "Caractère", "Eau bue"], rows: TIPOS.map((t) => [t.fr, `Tipo ${t.it}`, t.name, t.water ? `+${t.water} %` : "—"]) }} />
      <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "var(--muted)", padding: "9px 12px", background: "var(--surface2)", borderRadius: 9, borderLeft: "3px solid #fcb900" }}>
        6 types en France, 5 en Italie. Plus le type monte, plus il reste de son — et plus la farine boit d'eau (à compenser en bassinage). Pour la pizza on reste souvent en 00/0 (T45–T65).
      </p>
    </div>
  );

  return (
    <>
      <PageHead eyebrow="Outils · information" title="Notions & lexique"
        lead="Tout le technique du manuel — la farine, la levure, l'eau, le sel, l'huile, les protocoles — plus les notions de gestion pour tenir une carte rentable." />

      <span className="seg" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        <button className={"seg-btn" + (tab === "manuel" ? " on" : "")} onClick={() => setTab("manuel")}><Icon name="book-open" size={13} /> Le manuel</button>
        <button className={"seg-btn" + (tab === "gestion" ? " on" : "")} onClick={() => setTab("gestion")}><Icon name="coins" size={13} /> Gestion</button>
        <button className={"seg-btn" + (tab === "lexique" ? " on" : "")} onClick={() => setTab("lexique")}><Icon name="list-checks" size={13} /> Lexique</button>
      </span>

      {tab === "manuel" && (
        <>
          <Card className="uc-hero" title={<span className="card-ttl"><Icon name="wheat" size={16} /> L'unité de calcul = 1 kg de farine</span>} style={{ marginBottom: 16 }}>
            <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.55, color: "var(--muted)" }}>
              On raisonne toujours pour <b style={{ color: "var(--text)" }}>1 kg de farine</b> (= 100 %). Chaque ingrédient s'exprime en <b style={{ color: "var(--text)" }}>% du poids de la farine</b> (pourcentage boulanger). Une unité donne <b style={{ color: "var(--text)" }}>≈ 6 pâtons de 280 g</b>. Pour 10 unités, on multiplie tout par 10.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {REF_UNITE.map((i, idx) => (
                <div key={i.k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: idx < REF_UNITE.length - 1 ? "1px solid var(--border-soft)" : "none", flexWrap: "wrap" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: i.color, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, flex: "none" }}>{idx + 1}</span>
                  <span style={{ color: i.color, display: "inline-flex" }}><Icon name={i.ic} size={17} /></span>
                  <b style={{ fontSize: 13.5, minWidth: 118 }}>{i.k}</b>
                  <span className="hint" style={{ flex: 1, fontSize: 12, minWidth: 150 }}>{i.note}</span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)", width: 48, textAlign: "right" }}>{i.pct}</span>
                  <b className="tnum" style={{ width: 66, textAlign: "right" }}>{i.g}</b>
                </div>
              ))}
            </div>
            <p className="hint" style={{ margin: "12px 0 0", fontSize: 11.5 }}>Ordre du protocole direct : farine + levure (1 mn d'oxygénation) → eau d'un coup (12 mn) → sel → huile (2-3 mn) → bassinage si besoin.</p>
          </Card>

          <FicheNav list={FICHES} sel={selM} setSel={setSelM} />
          {fichesM.map((f) => <Fiche key={f.key} f={f} extra={f.key === "farine" ? typesTable : null} />)}
        </>
      )}

      {tab === "gestion" && (
        <>
          <Card style={{ marginBottom: 16, background: "var(--surface2)" }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)" }}>
              Savoir faire une belle pizza ne suffit pas à en vivre. Ces quatre notions sont celles qu'on utilise pour <b style={{ color: "var(--text)" }}>construire une carte qui tient</b> : ce que coûte une pizza, ce que le client dépense, comment étaler ses prix, et quels produits garder.
            </p>
          </Card>
          <FicheNav list={GESTION} sel={selG} setSel={setSelG} />
          {fichesG.map((f) => <Fiche key={f.key} f={f} />)}
        </>
      )}

      {tab === "lexique" && (
        <Card title={<span className="card-ttl"><Icon name="list-checks" size={16} /> Lexique <span className="hint" style={{ fontWeight: 400 }}>({lex.length} termes)</span></span>}>
          <div style={{ position: "relative", marginBottom: 14, maxWidth: 340 }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "inline-flex" }}><Icon name="search" size={15} /></span>
            <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un terme…" style={{ paddingLeft: 34, width: "100%" }} />
          </div>
          {lex.length === 0 ? <p className="hint" style={{ margin: 0 }}>Aucun terme ne correspond.</p> : (
            <dl style={{ margin: 0, display: "flex", flexDirection: "column" }}>
              {lex.map((l) => (
                <div key={l.t} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <dt style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                    {l.t}
                    {l.g && <span className="chip" style={{ color: "var(--gold)" }}>gestion</span>}
                  </dt>
                  <dd style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>{l.d}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      )}
    </>
  );
}
