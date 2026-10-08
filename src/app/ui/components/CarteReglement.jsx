import { useState } from "react";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";
import ChampMontant from "./ChampMontant.jsx";
import { euro, dateFr } from "../lib/format.js";
import { moyensConfigures, libelleMoyen, refDemandee } from "../lib/moyensPaiement.js";
import { updateReglement } from "../api/apiClient.js";

/**
 * CARTE « RÈGLEMENT » de la fiche stagiaire (demandée le 2026-09-30) — l'acompte est-il payé ? et le
 * reste ? Un bloc par DOSSIER, deux lignes chacune : acompte et solde. Chaque ligne dit son MONTANT,
 * si elle est PAYÉE, la DATE, et D'OÙ on le sait (la facture, ou une coche à la main).
 *
 * HYBRIDE, et la facture l'emporte (le calcul vit côté serveur, lib/reglementDossier.js) :
 *   · une ligne portée par une FACTURE se lit seule (paiement dans `payment`) et ne se saisit pas —
 *     « d'après la facture N° » ;
 *   · une ligne SANS facture se coche à la main : « payé le … » (un champ date), et le montant de
 *     l'acompte s'y saisit (colonne `enrollment.acompte`). Le solde est toujours le reste calculé
 *     (prix − acompte), jamais saisi.
 *
 * Écriture réservée au bureau (`canEdit`). Sans la migration 194, la coche « payé le… » est absente
 * et le dit ; le montant de l'acompte, lui, se saisit déjà (sa colonne préexiste).
 */
/* `onUpdate(enrollmentId, patch)` : l'écriture d'un dossier. Fourni par la fiche ENTREPRISE
   (updateReglementEntreprise) ; à défaut, on écrit côté stagiaire (updateReglement(learnerId, …)),
   la fiche stagiaire ne passant que `learnerId`. `videMessage` adapte le texte « aucun dossier ». */
export default function CarteReglement({ learnerId, reglements, moyens, canEdit, onSaved, onUpdate, videMessage }) {
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  // Texte du champ « acompte » en cours d'édition, par dossier (sinon on lit la valeur du serveur).
  const [saisieAcompte, setSaisieAcompte] = useState({});
  // Les moyens proposés par le sélecteur « Réglé par » viennent de l'entité émettrice (transmis par
  // l'API) ; à défaut (API ancienne, liste vide), on retombe sur les quatre libellés de repli.
  const moyensProposes = moyens && moyens.length ? moyens : moyensConfigures("");

  if (!reglements) return <Card title={<Titre />}><p className="hint" style={{ margin: 0 }}>Chargement…</p></Card>;
  if (reglements.length === 0) {
    return <Card title={<Titre />}><p className="hint" style={{ margin: 0 }}>{videMessage || "Aucun dossier : le règlement se suit une fois le stagiaire inscrit à une session."}</p></Card>;
  }

  async function enregistrer(enrollmentId, patch) {
    setErreur(""); setEnCours(true);
    try { await (onUpdate ? onUpdate(enrollmentId, patch) : updateReglement(learnerId, enrollmentId, patch)); onSaved?.(); }
    catch (e) { setErreur(e.message || "Enregistrement impossible."); }
    finally { setEnCours(false); }
  }

  return (
    <Card title={<Titre />}>
      {erreur && <div className="regl-err" role="alert"><Icon name="alert-triangle" size={15} /> {erreur}</div>}
      <div className="regl-liste">
        {reglements.map((d) => {
          const reste = d.reste || 0;
          return (
            <div key={d.enrollment_id} className="regl-dossier">
              <div className="regl-head">
                <b className="regl-formation">{d.program_title || d.program_code || "Dossier"}</b>
                <span className="regl-sem">{d.week ? `S${d.week}${d.year ? ` · ${d.year}` : ""}` : ""}</span>
                <span className="regl-prix">Prix <b className="chiffres">{euro(d.prix)}</b></span>
              </div>

              <Ligne
                titre="Acompte" ligne={d.acompte} canEdit={canEdit} enCours={enCours} moyens={moyensProposes}
                migration194={d.migration_194} migration195={d.migration_195}
                champMontant={d.acompte.saisissable ? (
                  <ChampMontant className="inp regl-montant-inp" exemple="450,00"
                    value={d.enrollment_id in saisieAcompte ? saisieAcompte[d.enrollment_id] : (d.acompte_convenu ?? "")}
                    onChange={(e) => setSaisieAcompte((s) => ({ ...s, [d.enrollment_id]: e.target.value }))}
                    onBlur={() => {
                      if (!(d.enrollment_id in saisieAcompte)) return;
                      const v = saisieAcompte[d.enrollment_id];
                      // On n'écrit que si ça a changé (une valeur, ou un champ vidé).
                      if (String(v ?? "") !== String(d.acompte_convenu ?? "")) enregistrer(d.enrollment_id, { acompte: v === "" ? null : v });
                    }} />
                ) : null}
                onDate={(iso) => enregistrer(d.enrollment_id, { acompte_paye_le: iso })}
                onMoyen={(code) => enregistrer(d.enrollment_id, { acompte_moyen: code, ...(refDemandee(code) ? {} : { acompte_ref: null }) })}
                onRef={(v) => enregistrer(d.enrollment_id, { acompte_ref: v })}
              />

              <Ligne
                titre="Solde (reste)" ligne={{ ...d.solde, montant: reste }} canEdit={canEdit} enCours={enCours} moyens={moyensProposes}
                migration194={d.migration_194} migration195={d.migration_195}
                onDate={(iso) => enregistrer(d.enrollment_id, { solde_paye_le: iso })}
                onMoyen={(code) => enregistrer(d.enrollment_id, { solde_moyen: code, ...(refDemandee(code) ? {} : { solde_ref: null }) })}
                onRef={(v) => enregistrer(d.enrollment_id, { solde_ref: v })}
              />

              {d.factures && d.factures.length > 0 && (
                <div className="regl-factures">
                  <Icon name="file-text" size={13} />
                  {d.factures.map((f) => (
                    <span key={f.numero} className="regl-facture" title={`${f.type === "ACOMPTE" ? "Acompte" : "Facture"} · ${euro(f.montant)} · encaissé ${euro(f.paye)}`}>
                      {f.numero} <span className={"regl-facture-st st-" + f.statut.toLowerCase()}>{ETAT_FACTURE[f.statut] || f.statut}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const ETAT_FACTURE = { BROUILLON: "brouillon", EMISE: "émise", PAYEE: "payée", IMPAYEE: "impayée", ANNULEE: "annulée" };

function Titre() {
  return <span className="card-ttl"><Icon name="credit-card" size={16} /> Règlement</span>;
}

/* Une ligne acompte/solde : montant, état (payé + date + source), et — si aucune facture ne la
   porte — de quoi la saisir (montant de l'acompte, date « payé le… »). Le MOYEN de paiement (espèces,
   chèque, virement, carte) et sa référence se notent toujours (migration 195) : une facture peut les
   imprimer ({Moyen acompte}…), qu'ils viennent d'une coche à la main ou d'un règlement facturé. */
function Ligne({ titre, ligne, champMontant, onDate, onMoyen, onRef, canEdit, enCours, migration194, migration195, moyens }) {
  const { montant, paye, date, source, saisissable, montantPaye, moyen, ref } = ligne;
  const refLbl = refDemandee(moyen); // « N° de chèque », « Référence du virement », ou null
  /* Les options du sélecteur : les moyens de l'entité, PLUS le moyen déjà noté s'il n'y est pas —
     un ancien code (« CHEQUE ») ou un moyen retiré de l'entité depuis. Sans ce filet, une valeur
     hors liste afficherait la première option sans un mot (cf. CLAUDE.md § 3, listes déroulantes). */
  const options = (moyens || []).includes(moyen) || !moyen ? (moyens || []) : [...(moyens || []), moyen];
  return (
    <div className={"regl-ligne" + (paye ? " est-paye" : "")}>
      <span className="regl-ligne-t">{titre}</span>
      <span className="regl-ligne-montant">
        {champMontant || (montant != null ? <b className="chiffres">{euro(montant)}</b> : <span className="hint">—</span>)}
      </span>
      <span className="regl-ligne-etat">
        {paye
          ? <span className="regl-chip ok"><Icon name="check" size={13} /> Payé{date ? ` le ${dateFr(date)}` : ""}</span>
          : <span className="regl-chip attente">En attente{montant != null && montantPaye > 0 ? ` · ${euro(montantPaye)} versé` : ""}</span>}
        {source && <span className="regl-src">{source === "facture" ? "d'après la facture" : "saisi à la main"}</span>}
        {/* Le moyen déjà noté se lit même quand on ne peut pas l'éditer (lecture seule). */}
        {!canEdit && moyen && <span className="regl-src">par {libelleMoyen(moyen)}{ref ? ` (${ref})` : ""}</span>}
      </span>
      {canEdit && (saisissable || migration195) && (
        <span className="regl-ligne-saisie">
          {saisissable && (migration194 ? (
            <label className="regl-datelbl" title="Coche « payé le… » : laisser vide tant que ce n'est pas réglé">
              Payé le
              <input type="date" className="inp regl-date" value={date || ""} disabled={enCours}
                onChange={(e) => onDate(e.target.value || null)} />
            </label>
          ) : (
            <span className="hint regl-nomig">Coche « payé » : migration 194 non jouée</span>
          ))}
          {migration195 ? (
            <span className="regl-moyen">
              <label className="regl-moyenlbl" title="Comment ce règlement a été reçu">
                Réglé par
                <select className="inp regl-moyen-sel" value={moyen || ""} disabled={enCours}
                  onChange={(e) => onMoyen(e.target.value || null)}>
                  <option value="">—</option>
                  {options.map((m) => <option key={m} value={m}>{libelleMoyen(m)}</option>)}
                </select>
              </label>
              {refLbl && (
                // Non contrôlé : la `key` force un remontage quand la valeur serveur change (après save).
                <input key={(moyen || "") + "|" + (ref || "")} type="text" className="inp regl-ref"
                  placeholder={refLbl} maxLength={80} defaultValue={ref || ""} disabled={enCours}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (ref || "")) onRef(v || null); }} />
              )}
            </span>
          ) : (
            <span className="hint regl-nomig">Moyen de paiement : migration 195 non jouée</span>
          )}
        </span>
      )}
    </div>
  );
}
