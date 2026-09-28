import { useCallback, useEffect, useRef, useState } from "react";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";
import {
  getMoyensPaiement, createMoyenPaiement, updateMoyenPaiement, deleteMoyenPaiement, ordonnerMoyensPaiement, getTemplates,
} from "../api/apiClient.js";

/**
 * MOYENS DE PAIEMENT — la liste de l'école, et le modèle de facture de chacun (migration 187).
 *
 * Demandé le 2026-09-28 : « dans Facturation, choisir quel modèle de FACTURE utiliser pour chaque
 * moyen de paiement, avec la possibilité d'en ajouter ». Décidé le même jour : UNE liste ici (les
 * entités émettrices ne tiennent plus la leur), et le moyen choisi à la caisse ou en facturant une
 * demande PRÉ-SÉLECTIONNE son modèle, qui reste modifiable avant de valider.
 *
 * Chaque geste s'enregistre aussitôt, comme une case qu'on coche : pas de bouton « Enregistrer » à
 * oublier en bas d'une carte. Le nom se valide en quittant le champ (ou par Entrée) ; Échap
 * l'abandonne.
 */

const MAX = 30; // la taille de `invoice.payment_method` : un moyen seul n'y est jamais coupé

export default function MoyensPaiement({ onError }) {
  const [moyens, setMoyens] = useState(null); // null = on charge
  const [disponible, setDisponible] = useState(true);
  const [modeles, setModeles] = useState(null); // modèles FACTURE actifs ; null = on charge
  const [noms, setNoms] = useState({}); // renommages en cours de saisie, par identifiant
  const [nouveau, setNouveau] = useState("");
  const [nouveauModele, setNouveauModele] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null); // { ok, texte }
  /* ÉCHAP ABANDONNE LA SAISIE — marqué dans une ref, pas dans l'état : la perte du focus qui suit
     lirait encore l'ancien état (la mise à jour n'est pas encore passée) et renommerait quand même. */
  const abandons = useRef(new Set());

  /* Stable (aucune dépendance) : l'effet de chargement peut la nommer sans se relancer à chaque
     rendu de la page. Un échec de lecture se dit DANS la carte. */
  const charger = useCallback(() => getMoyensPaiement()
    .then((r) => { setMoyens(r.data || []); setDisponible(r.disponible !== false); })
    .catch((e) => { setMoyens([]); setMessage({ ok: false, texte: e.message }); }), []);

  useEffect(() => {
    charger();
    getTemplates()
      .then((r) => setModeles((r.data || []).filter((t) => String(t.doc_type || "").toUpperCase() === "FACTURE"
        && t.active !== false && t.active !== 0)))
      .catch(() => setModeles([]));
  }, [charger]);

  /* Un geste : il part, la liste se relit, et le message dit ce qui a été fait. Une erreur du
     serveur (doublon, dernier moyen, modèle refusé) remonte telle quelle en tête de page. */
  async function agir(fn, succes) {
    setEnCours(true); setMessage(null);
    try { await fn(); onError?.(null); await charger(); if (succes) setMessage({ ok: true, texte: succes }); }
    catch (e) { onError?.(e.message); await charger(); }
    finally { setEnCours(false); }
  }

  const nomDe = (m) => (noms[m.id] ?? m.libelle);
  const oublier = (id) => setNoms((n) => { const c = { ...n }; delete c[id]; return c; });

  function renommer(m) {
    const nom = nomDe(m).replace(/\s+/g, " ").trim();
    oublier(m.id);
    if (abandons.current.delete(m.id)) return;
    if (!nom || nom === m.libelle) return;
    agir(() => updateMoyenPaiement(m.id, { libelle: nom }),
      `Renommé en « ${nom} ». Les factures déjà émises gardent « ${m.libelle} ».`);
  }

  function choisirModele(m, slug) {
    const t = (modeles || []).find((x) => x.slug === slug);
    agir(() => updateMoyenPaiement(m.id, { template_slug: slug || null }),
      slug ? `« ${m.libelle} » pré-sélectionnera « ${t ? (t.label || t.slug) : slug} ».`
        : `« ${m.libelle} » : modèle choisi selon l'acheteur.`);
  }

  function deplacer(i, sens) {
    const ids = moyens.map((m) => m.id);
    const j = i + sens;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    agir(() => ordonnerMoyensPaiement(ids));
  }

  function supprimer(m) {
    if (!window.confirm(`Retirer « ${m.libelle} » de la liste ?\nLes factures déjà émises gardent ce moyen de paiement.`)) return;
    agir(() => deleteMoyenPaiement(m.id), `« ${m.libelle} » retiré de la liste.`);
  }

  function ajouter() {
    const nom = nouveau.replace(/\s+/g, " ").trim();
    if (!nom) return;
    agir(async () => {
      await createMoyenPaiement({ libelle: nom, template_slug: nouveauModele || null });
      setNouveau(""); setNouveauModele("");
    }, `« ${nom} » ajouté.`);
  }

  /* LE MODÈLE PEUT AVOIR DISPARU depuis qu'on l'a choisi (supprimé, désactivé, passé d'un autre
     type) : le moyen retombe alors en automatique à l'édition. On le DIT sur la ligne, plutôt que
     d'afficher un « Automatique » qui ferait croire que rien n'avait été choisi. */
  const introuvable = (m) => !!m.template_slug && modeles !== null && !modeles.some((t) => t.slug === m.template_slug);

  const options = (m) => (
    <>
      <option value="">Automatique (selon l'acheteur)</option>
      {(modeles || []).map((t) => <option key={t.slug} value={t.slug}>{t.label || t.slug}</option>)}
      {m && introuvable(m) && <option value={m.template_slug}>{m.template_slug} (introuvable)</option>}
    </>
  );

  return (
    <Card title={<span className="card-ttl"><Icon name="coins" size={16} /> Moyens de paiement</span>} style={{ marginTop: 16 }}>
      <p className="hint" style={{ marginTop: 0 }}>
        Ceux que la caisse propose, et ceux d'une demande boutique qu'on facture. Choisir un moyen
        <b> pré-sélectionne son modèle de facture</b>, qu'on peut toujours changer avant de valider ;
        un règlement en plusieurs moyens suit le premier. {"«\u00a0Automatique\u00a0»"} : le modèle se choisit
        selon l'acheteur, comme avant. Le premier de la liste est proposé d'office.
      </p>
      {message && <p className="hint" style={{ color: message.ok ? "var(--green)" : "var(--ember1)" }}>{message.texte}</p>}
      {!disponible && (
        <p className="hint" style={{ color: "var(--ember1)" }}>
          La liste modifiable arrive avec la migration 187, pas encore jouée. En attendant, la caisse
          propose les moyens ci-dessous, repris des entités émettrices, sans modèle attaché.
        </p>
      )}

      {moyens === null ? (
        <p className="hint">Chargement…</p>
      ) : (
        <div className="mp-liste">
          {moyens.map((m, i) => (
            <div key={m.id || m.libelle} className="mp-ligne">
              {disponible ? (
                <input className="inp mp-nom" value={nomDe(m)} maxLength={MAX} disabled={enCours}
                  aria-label={`Nom du moyen de paiement ${m.libelle}`}
                  onChange={(e) => setNoms((n) => ({ ...n, [m.id]: e.target.value }))}
                  onBlur={() => renommer(m)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                    if (e.key === "Escape") { abandons.current.add(m.id); e.currentTarget.blur(); }
                  }} />
              ) : <b className="mp-nom">{m.libelle}</b>}
              <div className="mp-modele">
                <select className="inp" value={m.template_slug || ""} disabled={!disponible || enCours || modeles === null}
                  aria-label={`Modèle de facture pour ${m.libelle}`}
                  onChange={(e) => choisirModele(m, e.target.value)}>
                  {options(m)}
                </select>
                {introuvable(m) && (
                  <span className="hint" style={{ color: "var(--ember1)", fontSize: 12 }}>
                    Ce modèle n'existe plus ou n'est plus actif : la facture sera choisie selon l'acheteur.
                  </span>
                )}
              </div>
              {disponible && (
                <div className="mp-actions">
                  <button type="button" className="iconbtn" disabled={enCours || i === 0}
                    aria-label={`Monter ${m.libelle}`} title="Monter" onClick={() => deplacer(i, -1)}>
                    <Icon name="arrow-up" size={14} />
                  </button>
                  <button type="button" className="iconbtn" disabled={enCours || i === moyens.length - 1}
                    aria-label={`Descendre ${m.libelle}`} title="Descendre" onClick={() => deplacer(i, 1)}>
                    <Icon name="arrow-down" size={14} />
                  </button>
                  {/* Jamais le dernier : une caisse sans moyen ne pourrait plus encaisser. */}
                  <button type="button" className="iconbtn" disabled={enCours || moyens.length <= 1}
                    aria-label={`Retirer ${m.libelle}`} title={moyens.length <= 1 ? "Il faut au moins un moyen de paiement" : "Retirer"}
                    onClick={() => supprimer(m)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {disponible && moyens !== null && (
        <div className="mp-ligne mp-ajout">
          <input className="inp mp-nom" value={nouveau} maxLength={MAX} placeholder="Ex. Chèque vacances"
            aria-label="Nom du nouveau moyen de paiement" disabled={enCours}
            onChange={(e) => setNouveau(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }} />
          <div className="mp-modele">
            <select className="inp" value={nouveauModele} disabled={enCours || modeles === null}
              aria-label="Modèle de facture du nouveau moyen" onChange={(e) => setNouveauModele(e.target.value)}>
              {options(null)}
            </select>
          </div>
          <div className="mp-actions">
            <button type="button" className="btn sm primary" disabled={enCours || !nouveau.trim()} onClick={ajouter}>
              <Icon name="plus" size={14} /> Ajouter
            </button>
          </div>
        </div>
      )}
      {modeles !== null && modeles.length === 0 && (
        <p className="hint" style={{ margin: "10px 0 0" }}>
          Aucun modèle de type FACTURE actif : créez-en un dans Modèles de documents pour l'attacher à un moyen.
        </p>
      )}
    </Card>
  );
}
