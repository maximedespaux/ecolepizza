import { useEffect, useRef, useState } from "react";
import { getDossierRemises, deposerRemise, remiseFichierUrl, supprimerRemiseFichier,
  basculerRemiseSansObjet } from "../api/apiClient.js";
import Badge from "./Badge.jsx";
import { Icon } from "./Icon.jsx";
import { dateHeure } from "../lib/format.js";
import { reduireSiImage, PROFILS } from "../lib/image.js";

/**
 * DOCUMENTS REMIS AU STAGIAIRE — côté PERSONNEL, pour un dossier (enrollment) donné.
 *
 * Le miroir de `PiecesReview`, dans l'autre sens : là-bas le stagiaire dépose et l'école valide ;
 * ici l'école dépose et le stagiaire confirme. La carte ne s'affiche pas si aucune remise n'est
 * prévue au parcours de cette formation.
 *
 * CE QUI NE S'Y TROUVE PAS, ET C'EST VOULU : aucun bouton pour marquer « reçu ». L'accusé
 * appartient au stagiaire, et une preuve de remise signée par l'école à sa place ne vaudrait
 * rien — c'est exactement ce qu'un contrôle vient chercher. Le serveur refuse d'ailleurs le
 * personnel sur cette route ; le bouton absent et le refus disent la même chose.
 */
const ETAT = {
  RECUE: ["Reçue", "g"],
  REMISE: ["En attente de l'accusé", "a"],
  ATTENDUE: ["À remettre", "n"],
};

/* `taille` est la taille CLAIRE, celle du fichier d'origine — les octets stockés sont chiffrés
   et plus volumineux. On l'affiche pour distinguer deux documents qui portent le même nom. */
const poids = (o) => (o >= 1024 * 1024 ? `${Math.round((o / 1024 / 1024) * 10) / 10} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

export default function RemisesReview({ enrollmentId, refresh }) {
  const [remises, setRemises] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(null);
  const champs = useRef({});

  function load() {
    if (!enrollmentId) { setRemises([]); return; }
    getDossierRemises(enrollmentId).then((r) => setRemises(r.data || [])).catch(() => setRemises([]));
  }
  useEffect(() => { load(); }, [enrollmentId, refresh]);

  async function envoyer(remiseTypeId, file) {
    if (!file) return;
    setOccupe(remiseTypeId); setErreur(null);
    /* MÊME TRI QU'AILLEURS : un PDF part intact, un scan photographié est réduit. Le plafond
       du serveur est ici de 10 Mo, mais rien ne sert d'y loger 8 Mo de photo pour un document
       qui sera lu à l'écran. */
    try { await deposerRemise(enrollmentId, remiseTypeId, await reduireSiImage(file, PROFILS.piece)); load(); }
    catch (e) { setErreur(e.message); }
    finally { setOccupe(null); }
  }

  async function retirer(f, libelle, accuse) {
    /* LE RETRAIT ANNULE L'ACCUSÉ, et la confirmation le dit. Sans cet avertissement, on
       retirerait un document en croyant corriger une pièce jointe, et on effacerait au passage
       une preuve de remise déjà donnée par le stagiaire. */
    const perte = accuse ? "\n\nL'accusé de réception du stagiaire sera ANNULÉ : il devra confirmer à nouveau." : "";
    if (!window.confirm(`Retirer « ${f.nom || "ce fichier"} » de la remise « ${libelle} » ?${perte}`)) return;
    try { await supprimerRemiseFichier(f.id); setErreur(null); load(); }
    catch (e) { setErreur(e.message); }
  }

  /* ÉCARTER N'EFFACE RIEN, et la confirmation le dit dans les deux sens. Une remise écartée
     sort du décompte de conformité pour cette personne — ni due, ni faite — et se rétablit d'un
     clic, avec ses fichiers et son accusé intacts. */
  async function basculer(r) {
    const exclu = !r.sans_objet;
    const phrase = exclu
      ? `Écarter « ${r.label} » du dossier de ce stagiaire ?\n\nElle cessera de compter comme due. Rien n'est supprimé : vous pourrez la rétablir.`
      : `Rétablir « ${r.label} » dans le dossier de ce stagiaire ?`;
    if (!window.confirm(phrase)) return;
    try { await basculerRemiseSansObjet(enrollmentId, r.remise_type_id, exclu); setErreur(null); load(); }
    catch (e) { setErreur(e.message); }
  }

  if (!remises || remises.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="file-text" size={16} /> Documents remis au stagiaire
      </h3>
      {erreur && <p className="hint" style={{ color: "var(--red, #c0392b)", marginTop: 0 }}>{erreur}</p>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {remises.map((r) => {
          const [label, tone] = ETAT[r.statut] || [r.statut, "n"];
          const fichiers = r.fichiers || [];
          return (
            <div key={r.remise_type_id} style={{ padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 140 }}>
                  <b>{r.label}</b>
                  {r.consigne && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{r.consigne}</span>}
                  {/* LES DEUX DATES SE DISENT SÉPARÉMENT : quand l'école a déposé, et quand le
                      stagiaire a confirmé. Les confondre effacerait la seule chose qu'un contrôle
                      vient lire — le délai entre la mise à disposition et la réception. */}
                  {r.remis_le && (
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)" }}>
                      Déposé{r.remis_par ? ` par ${r.remis_par}` : ""} · {dateHeure(r.remis_le)}
                    </span>
                  )}
                  {r.accuse_le && (
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--green, #2e9e5b)" }}>
                      Réception confirmée par le stagiaire · {dateHeure(r.accuse_le)}
                    </span>
                  )}
                </span>
                <Badge tone={r.sans_objet ? "n" : tone}>{r.sans_objet ? "Sans objet" : label}</Badge>
                <button className="btn sm ghost" onClick={() => basculer(r)}
                  title={r.sans_objet ? "Cette remise concerne à nouveau ce stagiaire" : "Cette remise ne concerne pas ce stagiaire"}>
                  {r.sans_objet ? "Rétablir" : "Sans objet"}
                </button>
                <input type="file" ref={(el) => { champs.current[r.remise_type_id] = el; }} style={{ display: "none" }}
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; envoyer(r.remise_type_id, f); }} />
                {/* Rien a deposer sur une remise ecartee : la commande disparait plutot que de
                    rester vivante sur une etape qui ne concerne plus personne. */}
                {!r.sans_objet && <button className="btn sm primary" disabled={occupe === r.remise_type_id}
                  onClick={() => champs.current[r.remise_type_id]?.click()}
                  aria-label={`Déposer un document pour « ${r.label} »`}>
                  <Icon name="plus" size={14} /> {occupe === r.remise_type_id ? "Envoi…" : "Déposer"}
                </button>}
              </div>

              {fichiers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, paddingLeft: 2 }}>
                  {fichiers.map((f, i) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flexWrap: "wrap" }}>
                      <span style={{ color: "var(--dim)", flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={f.nom || `Fichier ${i + 1}`}>{f.nom || `Fichier ${i + 1}`}</span>
                      {f.taille != null && <span style={{ color: "var(--dim)", flex: "0 0 auto" }}>{poids(f.taille)}</span>}
                      <button className="btn sm ghost" style={{ flex: "0 0 auto" }}
                        aria-label={`Voir ${f.nom || `le fichier ${i + 1}`} de ${r.label}`}
                        onClick={() => window.open(remiseFichierUrl(f.id), "_blank", "noopener")}>
                        <Icon name="eye" size={13} /> Voir
                      </button>
                      <button className="btn sm ghost danger" style={{ flex: "0 0 auto" }}
                        aria-label={`Retirer ${f.nom || `le fichier ${i + 1}`} de ${r.label}`}
                        onClick={() => retirer(f, r.label, !!r.accuse_le)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
