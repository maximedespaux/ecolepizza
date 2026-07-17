import { useContext, useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { CAT_ART, CAT_ICON } from "../components/CatIcon.jsx";
import CreneauCalendrier from "../components/CreneauCalendrier.jsx";
import ConseilMateriel from "../components/ConseilMateriel.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { euro } from "../lib/format.js";
import {
  getCart, addToCart, setQty, setBroderie, clearCart, cartTotals, cartCount,
  lineKey, brodValue, variantValue, brodOk, CART_EVENT,
} from "../lib/cart.js";
import {
  getBoutique, getBoutiquePartenaires, createShopRequest, getMyShopRequests,
} from "../api/apiClient.js";

/**
 * Boutique de l'espace stagiaire.
 *
 * DEUX SOURCES, à ne pas fusionner :
 *  ① « Le matériel de l'école » (prioritaire) — l'école achète à son tarif et revend en marge.
 *    Elle est LE MARCHAND : elle fixe le prix, encaisse, facture.
 *  ② « Offres partenaires » — le partenaire vend ; l'école présente et met en relation.
 * Les mélanger mentirait au stagiaire sur qui vend, qui facture et qui assure le SAV.
 *
 * PAS DE PAIEMENT EN LIGNE : le stagiaire est dans le bâtiment cinq jours. Il compose son
 * panier → ça devient une DEMANDE → l'école prépare → il retire en main propre et paie sur
 * place. Le panier est un brouillon, la demande est la donnée.
 */

const STATUS_LABEL = {
  NOUVELLE: "Reçue", EN_PREPARATION: "En préparation", PRETE: "Prête à retirer",
  PAYE: "Payé", FACTUREE: "Facturé", REMISE: "Remis", ANNULEE: "Annulée",
};
// Étapes visibles par le stagiaire (progression de sa demande).
const DEMANDE_FLOW = ["NOUVELLE", "EN_PREPARATION", "PRETE", "FACTUREE", "PAYE", "REMISE"];

function DemandeSteps({ status }) {
  const idx = DEMANDE_FLOW.indexOf(status);
  if (idx < 0) return <p className="hint" style={{ margin: "6px 0 0", color: "var(--ember1)" }}><Icon name="x" size={13} style={{ verticalAlign: "-2px" }} /> Demande annulée.</p>;
  return (
    <div className="cmd-steps" style={{ marginTop: 12 }}>
      {DEMANDE_FLOW.map((s, i) => (
        <div key={s} className={"cmd-step" + (i < idx ? " done" : i === idx ? " on" : "")}>
          <span className="cmd-dot">{i < idx ? <Icon name="check" size={12} /> : i + 1}</span>
          <span className="cmd-step-lbl">{STATUS_LABEL[s]}</span>
        </div>
      ))}
    </div>
  );
}
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/* Une date « 2026-07-22 » se lit à la main : `new Date("2026-07-22")` la prendrait pour de
   l'UTC et pourrait afficher le 21 selon le fuseau. Cf. api/lib/horaires.js. */
function labelJour(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS[dt.getDay()]} ${d} ${MOIS[m - 1]}`;
}

const CatGlyph = ({ category, size = 30 }) => {
  const id = CAT_ICON[category];
  if (!id) return <Icon name="package" size={size} />;
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      {CAT_ART[id]}
    </svg>
  );
};

/**
 * Choix de la déclinaison. Des BOUTONS et pas un <select> : quatre tailles et deux coupes
 * tiennent à l'écran, et un menu déroulant cache le choix derrière un clic de plus — sur
 * téléphone, c'est le pire des contrôles pour six options.
 */
function VariantPicker({ variants, taille, coupe, onChange }) {
  if (!variants) return null;
  return (
    <div className="grid cols-2" style={{ gap: 12 }}>
      <div>
        <label className="var-lbl">Taille</label>
        <div className="var-row">
          {variants.tailles.map((t) => (
            <button key={t} type="button" className={"var-btn" + (taille === t ? " on" : "")}
              onClick={() => onChange({ taille: t })}>{t}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="var-lbl">Coupe</label>
        <div className="var-row">
          {variants.coupes.map((c) => (
            <button key={c} type="button" className={"var-btn wide" + (coupe === c ? " on" : "")}
              onClick={() => onChange({ coupe: c })}>{c}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Modale d'ajout d'un article BRODÉ. Le nom est demandé à l'ajout, pas au moment de valider :
 * c'est là que le stagiaire a l'article sous les yeux et sait pour qui il le prend.
 * Pré-remplie avec son identité — il commande le plus souvent pour lui — mais modifiable :
 * une broderie ne se découd pas, et il peut prendre une veste pour son associé.
 */
function BroderieModal({ produit, defaults, onClose, onAdd }) {
  const [nom, setNom] = useState(defaults.nom || "");
  const [prenom, setPrenom] = useState(defaults.prenom || "");
  const [taille, setTaille] = useState("");
  const [coupe, setCoupe] = useState("");
  // Les quatre sont exigés : sans le nom on ne sait pas quoi broder, sans la taille on ne sait
  // pas quelle veste sortir du carton.
  const ok = nom.trim() && prenom.trim() && taille && coupe;
  const valider = () => { if (ok) { onAdd({ nom: nom.trim(), prenom: prenom.trim(), taille, coupe }); onClose(); } };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{produit.name}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <p className="hint" style={{ marginTop: 0 }}>
            <Icon name="info" size={13} style={{ verticalAlign: "-2px" }} /> Cet article est <b>brodé</b> :
            indique le nom et le prénom à broder dessus. Tu pourras encore les corriger dans ton panier.
          </p>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Nom</label>
              <input className="inp" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60}
                placeholder="DESPAUX" autoFocus /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Prénom</label>
              <input className="inp" value={prenom} onChange={(e) => setPrenom(e.target.value)} maxLength={60}
                placeholder="Guillaume" onKeyDown={(e) => e.key === "Enter" && valider()} /></div>
          </div>
          <div style={{ marginTop: 14 }}>
            <VariantPicker variants={produit.variants} taille={taille} coupe={coupe}
              onChange={(p) => { if (p.taille) setTaille(p.taille); if (p.coupe) setCoupe(p.coupe); }} />
          </div>
          {ok ? (
            <p className="brod-apercu">
              <span>Tu commandes :</span> <b>{`${taille} · ${coupe}`}</b>
              <span> — brodé </span><b>{`${nom.trim().toUpperCase()} ${prenom.trim()}`}</b>
            </p>
          ) : null}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={valider} disabled={!ok}>
            <Icon name="plus" size={15} /> Ajouter au panier
          </button>
        </div>
      </div>
    </div>
  );
}

function AddBtn({ line, produit }) {
  const { user } = useContext(UserContext);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const flash = () => { setDone(true); setTimeout(() => setDone(false), 1200); };
  const click = () => {
    if (line.personalizable) { setOpen(true); return; } // il faut savoir quoi broder
    addToCart(line); flash();
  };
  return (
    <>
      {/* PAS `primary` : trente cartes, trente boutons rouges pleine largeur, et plus aucune
          hiérarchie — la grille criait sans rien mettre en avant. Un seul CTA primaire par écran
          (c'est « Valider ma demande », dans le panier). Ici le bouton reste neutre et ne
          s'allume qu'au survol de sa carte (cf. .shop-add). Il vire au vert une fois ajouté :
          la couleur suit l'état, elle ne décore pas. */}
      <button className={"btn sm shop-add" + (done ? " ok" : "")} onClick={click} style={{ marginTop: 8, width: "100%" }}>
        <Icon name={done ? "check" : "plus"} size={14} /> {done ? "Ajouté" : "Ajouter"}
      </button>
      {open ? (
        <BroderieModal produit={produit} onClose={() => setOpen(false)}
          defaults={{ nom: user?.last_name || "", prenom: user?.first_name || "" }}
          onAdd={(b) => { addToCart({ ...line, ...b }); flash(); }} />
      ) : null}
    </>
  );
}

function EcoleTab() {
  const [items, setItems] = useState(null);
  const [cat, setCat] = useState("");
  useEffect(() => { getBoutique().then((r) => setItems(r.data || [])).catch(() => setItems([])); }, []);

  if (!items) return <p className="hint">Chargement…</p>;
  if (!items.length) {
    return <EmptyState icon="package" title="La boutique arrive"
      text="Le matériel de l'école n'est pas encore en ligne. Demande à ton formateur, il a tout sur place." />;
  }
  const cats = [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const shown = cat ? items.filter((i) => i.category === cat) : items;

  return (
    <>
      <div className="rayon-tabs" style={{ marginBottom: 14 }}>
        <button className={"rayon-tab" + (cat === "" ? " on" : "")} onClick={() => setCat("")}>Tout ({items.length})</button>
        {cats.map((c) => (
          <button key={c} className={"rayon-tab" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>
            <CatGlyph category={c} size={15} /> {c}
          </button>
        ))}
      </div>

      <div className="shop-grid">
        {shown.map((p) => (
          <div key={p.id} className="shop-card">
            {/* Le glyphe est une marque de RAYON, pas une photo du produit : quatre catégories de
                pelles partagent le même dessin, et « Coupe-pâte » sortirait des ciseaux. Seul, en
                haut de la carte, il se lisait comme l'image de l'article — donc il mentait. Collé
                au nom du rayon, il redevient ce qu'il est. Masqué quand un rayon est déjà filtré :
                le répéter 6 fois sous son propre onglet n'apprend rien. */}
            {!cat ? (
              <span className="shop-rayon">
                <CatGlyph category={p.category} size={13} /> {p.category || "Divers"}
              </span>
            ) : null}
            <b className="shop-name">{p.name}</b>
            {p.personalizable ? <span className="shop-brod"><Icon name="edit" size={11} /> Brodé à ton nom</span> : null}
            <span className="shop-price">
              <b className="tnum">{euro(p.price_ttc)} <span className="shop-unit">TTC</span></b>
              <span className="shop-ht tnum">{euro(p.price_ht)} HT</span>
            </span>
            {/* Uniquement quand l'article N'EST PAS là. « En stock » répété sur les 30 cartes est
                du bruit qu'on apprend à ne plus voir — et le jour où il manque vraiment, on ne le
                voit pas non plus. Jamais le nombre : « 2 restants » presse le stagiaire comme un
                marchand, ce n'est pas le rapport qu'on a avec lui. */}
            {!p.in_stock ? (
              <span className="shop-stock"><Icon name="clock" size={12} /> Sur commande</span>
            ) : null}
            <AddBtn produit={p} line={{ source: "ECOLE", id: p.id, label: p.name, price_ht: p.price_ht,
              tax_rate: p.tax_rate, personalizable: p.personalizable, variants: p.variants }} />
          </div>
        ))}
      </div>
    </>
  );
}

/* Badges de caractéristiques d'un four/pétrin, depuis `specs` (JSON servi par l'API). Tous en
   `.badge.n` (neutre) : c'est le seul variant de badge qui passe le contraste dans les deux
   thèmes. L'AVPN se distingue par l'étoile + le mot, pas par une couleur qui échoue. */
const ENERGIE_LBL = { ELECTRIQUE: "Électrique", GAZ: "Gaz", BOIS: "Bois", COMBINE: "Bois + gaz", HYBRIDE: "Hybride", CONVOYEUR: "Convoyeur" };
function SpecsBadges({ specs }) {
  if (!specs) return null;
  return (
    <span className="spec-badges">
      {specs.energie ? <span className="badge n">{ENERGIE_LBL[specs.energie] || specs.energie}</span> : null}
      {specs.temp_max_c ? <span className="badge n tnum">{specs.temp_max_c} °C</span> : null}
      {specs.pizzas ? <span className="badge n tnum">{specs.pizzas} pizzas</span> : null}
      {specs.sole_rotative ? <span className="badge n">sole rotative</span> : null}
      {specs.avpn ? <span className="badge n"><Icon name="star" size={10} /> AVPN</span> : null}
    </span>
  );
}

/* Le comparateur : la fourchette de prix constatés chez les revendeurs, dépliable sur le
   détail. C'est l'ÉCART qui a de la valeur — « 9 000 → 15 200 € » dit au stagiaire qu'un four
   identique se paie du simple au double selon où il l'achète. Chaque prix porte son revendeur
   et sa date : un prix sans provenance périme dans son dos. « Sur devis » quand le partenaire
   ne publie rien (Marana). */
function ComparateurPrix({ p }) {
  const [ouvert, setOuvert] = useState(false);
  const prix = p.prix || [];
  const devis = p.specs && p.specs.devis;

  if (!prix.length) {
    return <span className="cmp-devis"><Icon name="send" size={12} /> {devis ? "Sur devis auprès du partenaire" : "Tarif sur demande"}</span>;
  }
  const ecart = p.prix_max > p.prix_min ? Math.round((p.prix_max / p.prix_min - 1) * 100) : 0;
  return (
    <div className="cmp">
      <span className="cmp-src">Constaté chez {prix.length} revendeur{prix.length > 1 ? "s" : ""}</span>
      <div className="cmp-range">
        <b className="tnum">{euro(p.prix_min)}{p.prix_max > p.prix_min ? <> → {euro(p.prix_max)}</> : null} <span className="shop-unit">HT</span></b>
        {ecart > 0 ? <span className="cmp-ecart">+{ecart} % d'un revendeur à l'autre</span> : null}
      </div>
      {prix.length > 1 ? (
        <button className="cmp-toggle" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}>
          <Icon name={ouvert ? "chevron-down" : "chevron-right"} size={12} /> {ouvert ? "Masquer" : "Voir les prix"}
        </button>
      ) : null}
      {ouvert ? (
        <ul className="cmp-list">
          {prix.map((x, i) => (
            <li key={i}>
              <a href={x.url} target="_blank" rel="noopener noreferrer">
                {x.reseller} <Icon name="link" size={10} />
              </a>
              <span className="tnum">{euro(x.price_ht)}{x.includes_install ? " · posé" : ""}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PartenairesTab() {
  const [groups, setGroups] = useState(null);
  const [aide, setAide] = useState(false);
  useEffect(() => { getBoutiquePartenaires().then((r) => setGroups(r.data || [])).catch(() => setGroups([])); }, []);

  // L'aide au choix vit EN TÊTE de l'onglet, avant le catalogue : un stagiaire qui équipe sa
  // pizzeria a d'abord besoin de savoir QUOI chercher (énergie, type de pétrin) avant de
  // comparer des prix. Repliée par défaut pour ne pas noyer ceux qui savent déjà.
  const aideBloc = (
    <Card key="aide">
      <button className="cm-open" onClick={() => setAide((v) => !v)} aria-expanded={aide}>
        <span className="card-ttl"><Icon name="compass" size={16} /> Aide au choix — quel four, quel pétrin ?</span>
        <Icon name={aide ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      {aide ? <div style={{ marginTop: 14 }}><ConseilMateriel /></div> : null}
    </Card>
  );

  if (!groups) return <p className="hint">Chargement…</p>;
  if (!groups.length) {
    return <>{aideBloc}<EmptyState icon="users" title="Les offres partenaires arrivent"
      text="On négocie les tarifs école avec nos partenaires (fours, pétrins, distributeurs). Reviens bientôt." /></>;
  }
  return <>{aideBloc}{groups.map((g) => (
    <Card key={g.partner_id} title={
      <span className="card-ttl">
        <Icon name="users" size={16} /> {g.partner_name}
        <span className="badge n" style={{ marginLeft: 8 }}>{g.partner_category}</span>
        {g.discount_pct ? <span className="badge g" style={{ marginLeft: 6 }}>−{g.discount_pct} % école</span> : null}
      </span>
    }>
      <div className="shop-grid">
        {g.products.map((p) => {
          const eco = p.price_school != null, pub = p.price_public != null;
          // La puce ne s'affiche que si elle APPREND quelque chose : sous « Marana — FOUR »,
          // répéter « Four » sur les trois cartes ne fait qu'ajouter du bruit. Elle reste utile
          // chez un partenaire aux produits variés (Gilac : « Bac » vs « Préparation »).
          const repete = String(p.category || "").toLowerCase() === String(g.partner_category || "").toLowerCase();
          return (
            <div key={p.id} className="shop-card">
              {/* Le glyphe n'apparaît QUE si la catégorie en a un vraiment : les catégories
                  partenaires (Four, Bac, Préparation) n'en ont pas, et CatGlyph retombait sur
                  l'icône « package » — dix-neuf boîtes grises identiques qui ne disaient rien
                  de plus que le mot déjà écrit à côté. */}
              {p.category && !repete ? (
                <span className="shop-rayon">
                  {CAT_ICON[p.category] ? <CatGlyph category={p.category} size={13} /> : null}
                  {p.category}
                </span>
              ) : null}
              <b className="shop-name">{p.name}</b>
              {/* La référence fabricant seulement si elle existe : « — » n'informe personne. */}
              {p.reference ? <span className="shop-ref">{p.reference}</span> : null}
              <SpecsBadges specs={p.specs} />
              {/* Un tarif école négocié prime sur le comparateur (c'est CE que le stagiaire paie).
                  Sinon, la fourchette revendeurs. Sinon « sur devis ». */}
              {eco ? (
                <span className="shop-price">
                  <b className="tnum" style={{ color: "var(--green)" }}>{euro(p.price_school)} <span className="shop-unit">école</span></b>
                  {pub ? <span className="shop-old">{euro(p.price_public)}</span> : null}
                </span>
              ) : <ComparateurPrix p={p} />}
              {p.note ? <span className="shop-note">{p.note}</span> : null}
              <AddBtn produit={p} line={{ source: "PARTENAIRE", id: p.id, label: `${p.name} (${g.partner_name})`,
                price_ht: eco ? p.price_school : null, tax_rate: 20 }} />
            </div>
          );
        })}
      </div>
    </Card>
  ))}</>;
}

function PanierTab({ onSent }) {
  const [lines, setLines] = useState(getCart);
  const [note, setNote] = useState("");
  const [pickup, setPickup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    const sync = () => setLines(getCart());
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, []);

  if (!lines.length) {
    return <EmptyState icon="package" title="Ton panier est vide"
      text="Ajoute du matériel depuis les onglets. Tu enverras ta demande à l'école, qui te la prépare — tu paies sur place." />;
  }
  const t = cartTotals(lines);
  const brodes = lines.filter((l) => l.personalizable);
  const manque = brodes.filter((l) => !brodOk(l));

  async function envoyer() {
    setBusy(true); setErr(null);
    try {
      const r = await createShopRequest(
        lines.map((l) => ({ source: l.source, id: l.id, qty: l.qty,
          personalization: l.personalizable ? brodValue(l) : undefined,
          variant: l.personalizable ? variantValue(l) : undefined })),
        note, pickup
      );
      clearCart(); setNote(""); setPickup(null);
      onSent(r.ref);
    } catch (e) { setErr(e.message || "Envoi impossible."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Card title={<span className="card-ttl"><Icon name="package" size={16} /> Ta demande</span>}>
        {lines.map((l) => { const k = lineKey(l); return (
          <div key={k} className="cart-row">
            <b className="cart-lbl">{l.label}
              {variantValue(l) ? <span className="badge b" style={{ marginLeft: 6 }}>{variantValue(l)}</span> : null}
              {l.source === "PARTENAIRE" ? <span className="badge n" style={{ marginLeft: 6 }}>partenaire</span> : null}</b>
            <span className="cart-qty">
              <button className="iconbtn" onClick={() => setQty(k, l.qty - 1)} aria-label="Retirer un"><Icon name="minus" size={13} /></button>
              <b className="tnum">{l.qty}</b>
              <button className="iconbtn" onClick={() => setQty(k, l.qty + 1)} aria-label="Ajouter un"><Icon name="plus" size={13} /></button>
            </span>
            <b className="tnum cart-sum">
              {l.price_ht == null ? <span className="hint">à définir</span>
                : euro(l.price_ht * l.qty * (1 + (l.tax_rate ?? 20) / 100))}
            </b>
            <button className="iconbtn del" onClick={() => setQty(k, 0)} aria-label="Retirer"><Icon name="x" size={13} /></button>
          </div>
        ); })}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 700 }}>Total indicatif</span>
          <b className="tnum" style={{ fontSize: 19 }}>{euro(t.ttc)} <span className="hint" style={{ fontWeight: 400 }}>TTC</span></b>
        </div>
        {t.aDefinir ? <p className="hint" style={{ margin: "6px 0 0", color: "var(--orange)" }}>
          Certains articles partenaires sont « sur demande » : ils ne sont pas comptés dans ce total.
        </p> : null}
      </Card>

      {/* Récapitulatif des broderies — DERNIÈRE CHANCE de corriger. Une faute passée ici part
          chez le brodeur, et une broderie ne se découd pas. D'où le rappel en clair de ce qui
          sera brodé, article par article. */}
      {brodes.length ? (
        <Card title={<span className="card-ttl"><Icon name="edit" size={16} /> Ce qu'on brode</span>}>
          <p className="hint" style={{ marginTop: 0 }}>Relis bien : une fois brodé, ça ne se découd pas.</p>
          {brodes.map((l) => { const k = lineKey(l); return (
            <div key={k} className="brod-bloc">
              <b className="brod-art">{l.label}{l.qty > 1 ? ` × ${l.qty}` : ""}</b>
              <div className="grid cols-2" style={{ gap: 10 }}>
                <div className="field" style={{ marginBottom: 0 }}><label>Nom</label>
                  <input className={"inp" + (String(l.nom || "").trim() ? "" : " ko")} defaultValue={l.nom || ""} maxLength={60}
                    placeholder="DESPAUX" onBlur={(e) => setBroderie(k, { nom: e.target.value })} /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>Prénom</label>
                  <input className={"inp" + (String(l.prenom || "").trim() ? "" : " ko")} defaultValue={l.prenom || ""} maxLength={60}
                    placeholder="Guillaume" onBlur={(e) => setBroderie(k, { prenom: e.target.value })} /></div>
              </div>
              <div style={{ marginTop: 10 }}>
                <VariantPicker variants={l.variants} taille={l.taille} coupe={l.coupe}
                  onChange={(p) => setBroderie(k, p)} />
              </div>
              {brodOk(l) ? (
                <p className="brod-apercu">
                  <span>Tu commandes :</span> <b>{variantValue(l)}</b>
                  <span> — brodé </span><b>{brodValue(l)}</b>
                </p>
              ) : <p className="brod-apercu ko"><span>Complète le nom, le prénom, la taille et la coupe.</span></p>}
            </div>
          ); })}
        </Card>
      ) : null}

      <Card title={<span className="card-ttl"><Icon name="calendar" size={16} /> Quand passes-tu la récupérer&nbsp;?</span>}>
        <CreneauCalendrier value={pickup} onChange={setPickup} textile={brodes.length > 0} />
        <p className="hint" style={{ margin: "12px 0 0" }}>
          Lundi, mardi, jeudi, vendredi : 9h–12h30 et 14h–17h · <b>mercredi : le matin seulement</b> · fermé le week-end.
        </p>
      </Card>

      <Card>
        <div className="field">
          <label>Un mot pour l'école <span className="hint" style={{ fontWeight: 400 }}>(facultatif)</span></label>
          <textarea className="inp" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. : je passe le récupérer après le stage." />
        </div>
        {err ? <div className="status err">{err}</div> : null}
        {manque.length ? <p className="hint" style={{ margin: "0 0 10px", color: "var(--ember1)" }}>
          <Icon name="info" size={13} style={{ verticalAlign: "-2px" }} /> Complète le nom et le prénom à broder avant d'envoyer.
        </p> : null}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn ghost sm" onClick={() => clearCart()}>Vider</button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={envoyer} disabled={busy || manque.length > 0}>
            <Icon name="send" size={15} /> {busy ? "Envoi…" : "Envoyer ma demande"}
          </button>
        </div>
        <p className="hint" style={{ margin: "10px 0 0" }}>
          <Icon name="info" size={13} style={{ verticalAlign: "-2px" }} /> Aucun paiement ici : l'école prépare ta
          demande, tu retires ton matériel sur place et tu règles là-bas.
        </p>
      </Card>
    </>
  );
}

/* La couleur SUIT l'état, elle ne décore pas : vert = il y a quelque chose à faire (viens la
   chercher), ambre = ça bouge, bleu = c'est fini, rouge = ça n'aboutira pas. Le libellé porte
   déjà le sens seul — la couleur ne fait que le rendre repérable d'un coup d'œil. */
const STATUS_BADGE = {
  NOUVELLE: "n", EN_PREPARATION: "a", PRETE: "g", PAYE: "a", FACTUREE: "b", REMISE: "b", ANNULEE: "r",
};

/* Total d'une demande. Une ligne partenaire n'a pas de prix (« tarif sur demande ») : on ne
   l'additionne pas ET on le signale, sinon le total mentirait par omission. */
function totalDemande(lines) {
  let ttc = 0, aDefinir = false;
  for (const l of lines) {
    if (l.unit_price_ht == null) { aDefinir = true; continue; }
    ttc += l.unit_price_ht * l.qty * (1 + (l.tax_rate ?? 20) / 100);
  }
  return { ttc: +ttc.toFixed(2), aDefinir };
}

function MesDemandes() {
  const [rows, setRows] = useState(null);
  useEffect(() => { getMyShopRequests().then((r) => setRows(r.data || [])).catch(() => setRows([])); }, []);

  if (!rows) return <p className="hint">Chargement…</p>;
  if (!rows.length) {
    return <EmptyState icon="history" title="Aucune demande pour l'instant"
      text="Compose ton panier depuis le matériel de l'école ou les offres partenaires : tes demandes s'afficheront ici, avec leur avancement." />;
  }

  return rows.map((r) => {
    const t = totalDemande(r.lines);
    return (
      <Card key={r.id} title={
        <span className="card-ttl">
          <Icon name="history" size={16} /> <b className="tnum">{r.ref}</b>
          <span className={"badge " + (STATUS_BADGE[r.status] || "n")} style={{ marginLeft: 8 }}>
            {STATUS_LABEL[r.status] || r.status}
          </span>
        </span>
      }>
        {/* Progression de la demande : où en est ma commande. */}
        <DemandeSteps status={r.status} />

        {/* Le créneau d'abord : c'est la seule ligne qui engage le stagiaire à se déplacer. */}
        <p className={"dem-retrait" + (r.status === "PRETE" ? " prete" : "")} style={{ marginTop: 12 }}>
          <Icon name="clock" size={14} />
          {r.pickup_at
            ? <>Retrait le <b>{labelJour(String(r.pickup_at).slice(0, 10))} à {String(r.pickup_at).slice(11, 16)}</b></>
            : <>Sans rendez-vous — passe quand tu veux pendant nos horaires</>}
        </p>

        <ul className="dem-lignes">
          {r.lines.map((l, i) => (
            <li key={i}>
              <span className="dem-qty tnum">{l.qty} ×</span>
              <span className="dem-lbl">
                {l.label}
                {l.variant ? <span className="badge n dem-var">{l.variant}</span> : null}
                {l.personalization ? <em className="dem-brod">brodé {l.personalization}</em> : null}
              </span>
              <span className="dem-prix tnum">
                {l.unit_price_ht == null
                  ? <span className="hint">sur demande</span>
                  : euro(l.unit_price_ht * l.qty * (1 + (l.tax_rate ?? 20) / 100))}
              </span>
            </li>
          ))}
        </ul>

        <div className="dem-pied">
          <span className="hint">
            Demandée le {labelJour(String(r.created_at).slice(0, 10))}
            {t.aDefinir ? " · hors articles au tarif partenaire" : ""}
          </span>
          <b className="tnum">{euro(t.ttc)} TTC</b>
        </div>
        {r.note ? <p className="dem-note"><Icon name="info" size={12} /> Ton mot : « {r.note} »</p> : null}
      </Card>
    );
  });
}

/**
 * Panier PERSISTANT à gauche de l'écran : toujours visible, il liste les articles ajoutés
 * (via le localStorage géré par lib/cart.js). Le bouton « Valider » ouvre le récapitulatif
 * complet (broderie + créneau) ; à l'envoi, le panier (localStorage) est vidé.
 */
function CartAside({ count, onCheckout }) {
  const [lines, setLines] = useState(getCart);
  useEffect(() => {
    const sync = () => setLines(getCart());
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, []);
  const t = cartTotals(lines);
  return (
    <aside className="shop-aside">
      <div className="card" style={{ padding: 14 }}>
        <div className="card-ttl" style={{ marginBottom: 10 }}><Icon name="shopping-cart" size={16} /> Mon panier{count ? ` (${count})` : ""}</div>
        {lines.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Panier vide. Ajoute du matériel depuis la boutique.</p>
        ) : (
          <>
            <div className="cart-mini-list">
              {lines.map((l) => { const k = lineKey(l); return (
                <div key={k} className="cart-mini">
                  <span className="cart-mini-lbl">{l.label}
                    {variantValue(l) ? <span className="badge b" style={{ marginLeft: 4 }}>{variantValue(l)}</span> : null}</span>
                  <span className="cart-mini-qty">
                    <button className="iconbtn" onClick={() => setQty(k, l.qty - 1)} aria-label="Retirer un"><Icon name="minus" size={12} /></button>
                    <b className="tnum">{l.qty}</b>
                    <button className="iconbtn" onClick={() => setQty(k, l.qty + 1)} aria-label="Ajouter un"><Icon name="plus" size={12} /></button>
                  </span>
                  <button className="iconbtn del" onClick={() => setQty(k, 0)} aria-label="Retirer"><Icon name="x" size={12} /></button>
                </div>
              ); })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <b className="tnum">{euro(t.ttc)} TTC</b>
            </div>
            {t.aDefinir ? <p className="hint" style={{ margin: "4px 0 0", fontSize: 11 }}>Hors articles au tarif partenaire.</p> : null}
            <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={onCheckout}>
              <Icon name="send" size={14} /> Valider ma demande
            </button>
            <button className="btn ghost sm" style={{ width: "100%", marginTop: 6 }} onClick={() => clearCart()}>Vider le panier</button>
          </>
        )}
      </div>
    </aside>
  );
}

function Boutique() {
  const [tab, setTab] = useState("ecole");
  const [checkout, setCheckout] = useState(false); // récapitulatif (broderie + créneau) avant envoi
  const [showCart, setShowCart] = useState(true);   // panier affiché/masqué (le catalogue s'élargit)
  const [n, setN] = useState(cartCount);
  const [sent, setSent] = useState(null);
  const [pretes, setPretes] = useState(0);
  useEffect(() => {
    const sync = () => setN(cartCount());
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, []);
  // Combien de demandes attendent d'être retirées. C'est la seule chose, dans tout cet écran,
  // qui demande au stagiaire de se déplacer — donc la seule qui mérite une pastille. On la
  // relit à chaque envoi (`sent`) pour que l'onglet ne mente pas juste après une commande.
  useEffect(() => {
    getMyShopRequests()
      .then((r) => setPretes((r.data || []).filter((x) => x.status === "PRETE").length))
      .catch(() => setPretes(0));
  }, [sent]);

  return (
    <>
      <PageHead eyebrow="Espace stagiaire · boutique" title="La boutique"
        lead="Le matériel de l'école, à retirer sur place — et les offres négociées chez nos partenaires." />

      {sent ? (
        <div className="ok-banner">
          <Icon name="check-circle" size={18} />
          <span>Demande <b className="tnum">{sent}</b> envoyée. L'école la prépare et te recontacte —
            garde cette référence, elle sert à la retrouver.</span>
          <button className="btn sm ghost" onClick={() => setSent(null)}>Fermer</button>
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn sm ghost" onClick={() => setShowCart((v) => !v)} title={showCart ? "Masquer le panier" : "Afficher le panier"}>
          <Icon name={showCart ? "chevron-right" : "shopping-cart"} size={14} /> {showCart ? "Masquer le panier" : `Panier${n ? ` (${n})` : ""}`}
        </button>
      </div>

      <div className={"shop-layout" + (showCart ? "" : " no-cart")}>
        <div className="shop-main">
          {checkout ? (
            <>
              <button className="btn ghost sm" style={{ marginBottom: 14 }} onClick={() => setCheckout(false)}>
                <Icon name="chevron-left" size={14} /> Continuer mes achats
              </button>
              <PanierTab onSent={(ref) => { setSent(ref); setCheckout(false); setTab("demandes"); }} />
            </>
          ) : (
            <>
              <div className="kind-seg" style={{ marginBottom: 18 }}>
                <button className={"kind-btn" + (tab === "ecole" ? " on" : "")} onClick={() => setTab("ecole")}>
                  <Icon name="package" size={15} /> Le matériel de l'école
                </button>
                <button className={"kind-btn" + (tab === "partenaires" ? " on" : "")} onClick={() => setTab("partenaires")}>
                  <Icon name="users" size={15} /> Offres partenaires
                </button>
                <button className={"kind-btn" + (tab === "demandes" ? " on" : "")} onClick={() => setTab("demandes")}>
                  <Icon name="history" size={15} /> Mes demandes
                  {pretes ? <span className="kind-pastille" title="prête(s) à retirer">{pretes}</span> : null}
                </button>
              </div>

              {tab === "ecole" ? <EcoleTab />
                : tab === "partenaires" ? <PartenairesTab />
                : <MesDemandes />}
            </>
          )}
        </div>

        {showCart && <CartAside count={n} onCheckout={() => setCheckout(true)} />}
      </div>
    </>
  );
}

export default Boutique;
