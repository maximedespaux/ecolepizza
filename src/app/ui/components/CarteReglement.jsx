import { useState } from "react";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";
import ChampMontant from "./ChampMontant.jsx";
import { euro, dateFr } from "../lib/format.js";
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
export default function CarteReglement({ learnerId, reglements, canEdit, onSaved }) {
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  // Texte du champ « acompte » en cours d'édition, par dossier (sinon on lit la valeur du serveur).
  const [saisieAcompte, setSaisieAcompte] = useState({});

  if (!reglements) return <Card title={<Titre />}><p className="hint" style={{ margin: 0 }}>Chargement…</p></Card>;
  if (reglements.length === 0) {
    return <Card title={<Titre />}><p className="hint" style={{ margin: 0 }}>Aucun dossier : le règlement se suit une fois le stagiaire inscrit à une session.</p></Card>;
  }

  async function enregistrer(enrollmentId, patch) {
    setErreur(""); setEnCours(true);
    try { await updateReglement(learnerId, enrollmentId, patch); onSaved?.(); }
    catch (e) { setErreur(e.message || "Enregistrement impossible."); }
    finally { setEnCours(false); }
  }

  return (
    <Card title={<Titre />} className="cols-2">
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
                titre="Acompte" ligne={d.acompte} canEdit={canEdit} enCours={enCours} migration194={d.migration_194}
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
              />

              <Ligne
                titre="Solde (reste)" ligne={{ ...d.solde, montant: reste }} canEdit={canEdit} enCours={enCours} migration194={d.migration_194}
                onDate={(iso) => enregistrer(d.enrollment_id, { solde_paye_le: iso })}
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
   porte — de quoi la saisir (montant de l'acompte, date « payé le… »). */
function Ligne({ titre, ligne, champMontant, onDate, canEdit, enCours, migration194 }) {
  const { montant, paye, date, source, saisissable, montantPaye } = ligne;
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
      </span>
      {saisissable && canEdit && (
        <span className="regl-ligne-saisie">
          {migration194 ? (
            <label className="regl-datelbl" title="Coche « payé le… » : laisser vide tant que ce n'est pas réglé">
              Payé le
              <input type="date" className="inp regl-date" value={date || ""} disabled={enCours}
                onChange={(e) => onDate(e.target.value || null)} />
            </label>
          ) : (
            <span className="hint regl-nomig">Coche « payé » : migration 194 non jouée</span>
          )}
        </span>
      )}
    </div>
  );
}
