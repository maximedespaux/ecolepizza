import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import ImageLien, { ImagePlaceholder } from "./ImageLien.jsx";
import Badge from "./Badge.jsx";
import { euro, listeCategories } from "../lib/format.js";
import {
  getPartenaireProduits, createPartenaireProduit, updatePartenaireProduit, deletePartenaireProduit,
} from "../api/apiClient.js";

/**
 * Catalogue d'un partenaire — ce que le stagiaire verra dans « Offres partenaires ».
 *
 * LE CHAÎNON QUI MANQUAIT. La table `partner_product` existait, et l'espace stagiaire l'affichait
 * déjà ; mais AUCUNE route ni aucun écran ne l'écrivait. Un produit ne pouvait donc apparaître
 * dans la boutique que si quelqu'un l'insérait à la main en SQL.
 *
 * SUR UNE LIGNE PARTENAIRE, L'ÉCOLE NE VEND PAS : elle met en relation. D'où deux prix — le tarif
 * catalogue du partenaire et le tarif négocié pour les stagiaires — et aucun stock : ce n'est pas
 * l'inventaire de l'école. C'est aussi pourquoi ces lignes ne sont jamais facturées par l'école
 * (cf. invoiceShopRequest, qui ne retient que les lignes ECOLE).
 *
 * EN REPLI INLINE, PAS EN MODALE. Une modale rendue dans une carte se retrouve enfermée dedans :
 * `.card` porte un `transform`, et tout `transform` autre que `none` devient le bloc conteneur
 * d'un enfant `position:fixed` — le voile ne couvre plus la fenêtre et le pied sort de l'écran.
 * Le repli évite le problème plutôt que d'avoir à le contourner par un portail.
 */

/* `image_url` A TOUJOURS EXISTÉ EN BASE (migration 095) : la colonne était acceptée en écriture et
   déjà renvoyée à la boutique du stagiaire. Il manquait juste le champ pour la remplir — elle
   attendait son écran depuis huit migrations. */
const VIDE = { name: "", category: "", reference: "", price_public: "", price_school: "", url: "", image_url: "", note: "" };

function PartnerProduits({ partnerId, nbInitial = null, onErreur }) {
  const [ouvert, setOuvert] = useState(false);
  const [rows, setRows] = useState(null);      // null = pas encore chargé
  const [form, setForm] = useState(VIDE);
  const [edite, setEdite] = useState(null);    // id du produit en cours de modification
  const [busy, setBusy] = useState(false);
  /* LE FORMULAIRE EST FERMÉ AU DÉPART. Douze champs déployés en permanence sous chaque catalogue
     donnaient à croire qu'il fallait les remplir : on ouvrait « Produits en boutique » pour LIRE
     la liste, et on tombait sur une saisie. Le déplier à la demande rend la liste lisible et
     l'ajout explicite. */
  const [saisie, setSaisie] = useState(false);

  // Chargé À L'OUVERTURE seulement : une page de vingt-trois partenaires ne doit pas déclencher
  // vingt-trois requêtes pour des catalogues que personne ne regarde.
  useEffect(() => {
    if (!ouvert || rows !== null) return;
    getPartenaireProduits(partnerId).then((r) => setRows(r.data || [])).catch((e) => {
      setRows([]); onErreur?.(e.message || "Chargement des produits impossible.");
    });
  }, [ouvert, rows, partnerId, onErreur]);

  const recharger = () => getPartenaireProduits(partnerId).then((r) => setRows(r.data || [])).catch(() => {});

  /* Ouvrir en MODIFICATION : on charge la fiche et on déplie. Sans `setSaisie(true)`, le crayon
     ne ferait rien de visible — le formulaire resterait fermé et l'utilisateur cliquerait deux
     fois en pensant que le bouton est cassé. */
  function modifier(p) {
    setEdite(p.id);
    setForm({ ...VIDE, ...Object.fromEntries(Object.keys(VIDE).map((k) => [k, p[k] ?? ""])) });
    setSaisie(true);
  }
  function fermerSaisie() { setEdite(null); setForm(VIDE); setSaisie(false); }

  async function enregistrer(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      if (edite) await updatePartenaireProduit(edite, form);
      else await createPartenaireProduit(partnerId, form);
      /* APRÈS UN AJOUT LE FORMULAIRE RESTE OUVERT, vidé : on saisit rarement un seul produit, et
         refermer obligerait à recliquer entre chaque ligne d'un catalogue. Après une MODIFICATION
         il se referme — le travail sur ce produit-là est terminé, et le garder ouvert laisserait
         une ligne surlignée sans qu'on sache si l'enregistrement a eu lieu. */
      if (edite) { setEdite(null); setForm(VIDE); setSaisie(false); }
      else setForm(VIDE);
      await recharger();
    } catch (err) { onErreur?.(err.message || "Enregistrement impossible."); }
    finally { setBusy(false); }
  }

  async function basculer(p) {
    // L'inactivation plutôt que la suppression : un produit retiré de la boutique reste
    // consultable, et la commande passée qui le référence garde son libellé.
    try { await updatePartenaireProduit(p.id, { active: p.active ? 0 : 1 }); await recharger(); }
    catch (err) { onErreur?.(err.message || "Modification impossible."); }
  }

  async function supprimer(p) {
    if (!window.confirm(`Retirer « ${p.name} » du catalogue de ce partenaire ?`)) return;
    try { await deletePartenaireProduit(p.id); await recharger(); }
    catch (err) { onErreur?.(err.message || "Suppression impossible."); }
  }

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  /* LE COMPTE VIENT DE LA LISTE TANT QU'ON N'A PAS OUVERT. Il ne venait que de `rows`, chargé à
     l'ouverture : la fiche affichait donc « Produits en boutique » sans nombre, et il fallait
     déplier chaque partenaire pour savoir lequel a un catalogue. Une fois ouvert, c'est `rows`
     qui reprend la main — sinon un ajout ou un retrait ne se verrait pas dans le titre. */
  const nb = rows?.length ?? (nbInitial != null ? Number(nbInitial) : null);

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
      <button type="button" className="card-more" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}>
        <Icon name={ouvert ? "chevron-down" : "chevron-right"} size={14} style={{ verticalAlign: "-2px" }} />
        {" "}Produits en boutique{nb != null ? ` (${nb})` : ""}
      </button>

      {ouvert && (
        <div style={{ marginTop: 10 }}>
          {rows === null ? <p className="hint" style={{ margin: 0 }}>Chargement…</p>
            : rows.length === 0 ? (
              <p className="hint" style={{ margin: "0 0 10px" }}>
                Aucun produit. Ceux que vous ajoutez ici apparaissent dans l'onglet
                « Offres partenaires » de la boutique stagiaire.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                {rows.map((p) => (
                  /* LA LIGNE EN COURS DE MODIFICATION EST SURLIGNÉE. Le formulaire s'ouvre plus
                     bas, hors du champ de vision sur un catalogue de dix produits : sans repère,
                     on ne sait plus lequel on est en train de modifier — et on enregistre sur le
                     mauvais. `aria-current` porte la même information pour un lecteur d'écran, la
                     couleur ne devant jamais être seule à la dire. */
                  <div key={p.id} aria-current={edite === p.id ? "true" : undefined}
                    className={"pp-ligne" + (edite === p.id ? " en-edition" : "")}
                    style={{ opacity: p.active ? 1 : 0.5 }}>
                    <ImageLien src={p.image_url} className="pp-vignette"
                      fallback={<ImagePlaceholder className="pp-vignette" icone="package" />} />
                    {/* LE NOM SUR SA LIGNE, LES ÉTIQUETTES SUR LA LEUR.
                        En les laissant couler à la suite du nom, elles passaient à la ligne LÀ OÙ
                        LA PLACE MANQUAIT : « Four » restait collé au titre et « 400 °C,
                        électrique » tombaient dessous, ce qui donnait à croire à DEUX natures
                        d'étiquettes différentes. Et le point de coupure changeait d'un produit à
                        l'autre selon la longueur du nom — sur « AVGVSTO PR 9 — dôme à sole
                        rotative 500 °C », même le seul « Four » basculait. Un groupe stable vaut
                        mieux qu'un groupe qui se réorganise à chaque libellé. */}
                    <span className="pp-ident">
                      <b style={{ fontSize: 13 }}>{p.name}</b>
                      {/* MÊME DÉCOUPAGE QU'À LA BOUTIQUE : l'école doit voir ce que le stagiaire
                          verra. Affichée en un bloc, « Four,400 °C » se lirait comme une seule
                          catégorie mal saisie et on la « corrigerait » en retirant la virgule. */}
                      {(listeCategories(p.category).length || !p.active) ? (
                        <span className="pp-cats">
                          {listeCategories(p.category).map((c) => (
                            <span key={c} className="badge n">{c}</span>
                          ))}
                          {!p.active ? <Badge tone="n">masqué</Badge> : null}
                        </span>
                      ) : null}
                    </span>
                    {/* Le tarif ÉCOLE est celui que le stagiaire paie : c'est lui qu'on met en
                        avant, le prix public servant de repère pour mesurer la négociation. */}
                    <span className="tnum" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                      {p.price_public != null && p.price_school != null && Number(p.price_public) > Number(p.price_school) ? (
                        <span className="hint" style={{ textDecoration: "line-through", marginRight: 5 }}>{euro(p.price_public)}</span>
                      ) : null}
                      {p.price_school != null ? <b>{euro(p.price_school)}</b>
                        : p.price_public != null ? euro(p.price_public)
                          : <span className="hint">tarif sur demande</span>}
                    </span>
                    <button type="button" className="iconbtn" title={p.active ? "Masquer de la boutique" : "Afficher dans la boutique"}
                      onClick={() => basculer(p)}><Icon name={p.active ? "eye" : "eye-off"} size={14} /></button>
                    <button type="button" className="iconbtn" title="Modifier"
                      aria-pressed={edite === p.id} onClick={() => modifier(p)}>
                      <Icon name="pencil" size={14} /></button>
                    <button type="button" className="iconbtn del" title="Retirer" onClick={() => supprimer(p)}>
                      <Icon name="trash" size={14} /></button>
                  </div>
                ))}
              </div>
            )}

          {/* LE BOUTON D'ABORD, LE FORMULAIRE ENSUITE. Il porte le mot « produit » et non un
              simple « + » : sous un catalogue déjà rempli, une croix seule laisse deviner ce
              qu'elle ajoute. */}
          {!saisie && (
            <button type="button" className="btn sm" onClick={() => setSaisie(true)}>
              <Icon name="plus" size={14} /> Ajouter un produit
            </button>
          )}

          {saisie && (
          <form onSubmit={enregistrer} className={"pp-form" + (edite ? " en-edition" : "")}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* ON RAPPELLE CE QU'ON MODIFIE. Le formulaire est en bas d'un catalogue qui peut
                compter dix lignes : la ligne surlignée est souvent hors du champ de vision au
                moment où l'on tape. Sans ce titre, rien dans le formulaire ne dit s'il ajoute ou
                s'il modifie, ni quoi. */}
            <b className="pp-form-t">
              <Icon name={edite ? "pencil" : "plus"} size={13} />
              {edite ? `Modifier « ${form.name || "sans nom"} »` : "Nouveau produit"}
            </b>
            <div className="row3" style={{ gap: 8 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Produit</label>
                <input className="inp" value={form.name} onChange={set("name")} placeholder="Four à bois 100 cm" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Catégories</label>
                <input className="inp" value={form.category} onChange={set("category")}
                  placeholder="Four, 400 °C, électrique" />
                {/* L'APERÇU MONTRE LE DÉCOUPAGE PENDANT LA SAISIE. Sans lui, la virgule est une
                    convention invisible : on écrit « Four 400 °C » sans séparateur, on enregistre,
                    et il faut aller regarder la boutique pour comprendre qu'il n'y a qu'une seule
                    étiquette. Ici le résultat se voit à la frappe. */}
                {listeCategories(form.category).length > 1 ? (
                  <span className="cat-apercu">
                    {listeCategories(form.category).map((c) => (
                      <span key={c} className="badge n">{c}</span>
                    ))}
                  </span>
                ) : (
                  <span className="hint">Séparez par des virgules pour plusieurs étiquettes.</span>
                )}
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Référence</label>
                <input className="inp" value={form.reference} onChange={set("reference")} placeholder="A-32RF/60" />
              </div>
            </div>
            <div className="row3" style={{ gap: 8 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Prix public (€)</label>
                <input className="inp" type="number" min="0" step="0.01" value={form.price_public} onChange={set("price_public")} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Tarif école (€)</label>
                <input className="inp" type="number" min="0" step="0.01" value={form.price_school} onChange={set("price_school")}
                  placeholder="négocié" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Fiche produit (lien)</label>
                <input className="inp" value={form.url} onChange={set("url")} placeholder="https://…" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Photo (lien) <span className="hint" style={{ fontWeight: 400 }}>(facultatif)</span></label>
              <input className="inp" type="url" value={form.image_url} onChange={set("image_url")}
                placeholder="https://site-du-fournisseur.fr/photo.jpg" />
              {/* On dit d'où vient l'image ET ce que ça implique : elle est chargée depuis le site
                  du fournisseur, qui voit donc passer la visite. Le dire ici évite d'avoir à le
                  découvrir sur la page Confidentialité. */}
              <span className="hint">
                Clic droit sur l'image du site du fournisseur → « Copier l'adresse de l'image ».
                Elle reste hébergée chez lui : son site verra passer les visites.
              </span>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Ce qu'on en dit au stagiaire <span className="hint" style={{ fontWeight: 400 }}>(facultatif)</span></label>
              <input className="inp" value={form.note} onChange={set("note")} placeholder="Bon rapport qualité/prix pour démarrer." />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn sm primary" disabled={busy || !form.name.trim()}>
                <Icon name={edite ? "check" : "plus"} size={14} /> {edite ? "Enregistrer" : "Ajouter au catalogue"}
              </button>
              {/* « Annuler » TOUJOURS PRÉSENT, et plus seulement en modification : depuis que le
                  formulaire s'ouvre à la demande, il faut aussi pouvoir le refermer sans rien
                  saisir. Sans lui, on rouvrait la fiche du partenaire pour s'en débarrasser. */}
              <button type="button" className="btn sm ghost" onClick={fermerSaisie}>Annuler</button>
            </div>
          </form>
          )}
        </div>
      )}
    </div>
  );
}

export default PartnerProduits;
