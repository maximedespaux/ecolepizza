import { useEffect, useState } from "react";
import { getRemiseTypes, createRemiseType, updateRemiseType, deleteRemiseType } from "../api/apiClient.js";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";

/**
 * RÉFÉRENTIEL DES REMISES — ce que l'école peut REMETTRE au stagiaire (migration 160).
 *
 * Le pendant du référentiel des pièces à fournir, juste au-dessus dans l'écran : là, ce que
 * l'école DEMANDE ; ici, ce qu'elle REMET. Les deux se rattachent ensuite à un parcours dans
 * Formations, comme un document ou un QCM.
 *
 * SA FICHE EST PLUS COURTE QUE CELLE D'UNE PIÈCE : taille maximale et formats acceptés cadrent un
 * envoi qu'on ne maîtrise pas (un stagiaire qui photographie sa carte d'identité) — ici c'est
 * l'école qui dépose, elle sait ce qu'elle envoie. Un SEUL cadrage a du sens, ajouté le 2026-10-06 :
 * le NOMBRE de documents (migration 203), pour qu'un même type en porte plusieurs — « au plus X » ou
 * « il en faut X » — au lieu de multiplier les types pour un même envoi (l'AGEFICE en quatre pièces).
 *
 * COMPOSANT À PART plutôt qu'une branche de l'éditeur des pièces : celui-ci porte sept champs
 * dont cinq n'ont pas de sens ici. Les fondre obligerait à masquer la moitié d'un formulaire
 * selon un type — la forme la plus sûre de faire diverger deux écrans qui se ressemblent.
 */
export default function RemiseTypes({ onStatus }) {
  const [items, setItems] = useState([]);
  const [edite, setEdite] = useState(null); // { _new?, id?, code, label, consigne, active }

  function load() {
    getRemiseTypes().then((r) => setItems(r.data || [])).catch(() => setItems([]));
  }
  useEffect(() => { load(); }, []);

  async function enregistrer(e) {
    e.preventDefault();
    const payload = { code: edite.code, label: edite.label, consigne: edite.consigne, active: edite.active !== false,
      destinataire: edite.destinataire === "ENTREPRISE" ? "ENTREPRISE" : "STAGIAIRE",
      nb_documents: Math.max(0, Math.min(99, Math.round(Number(edite.nb_documents) || 0))),
      nb_mode: edite.nb_mode === "REQUIS" ? "REQUIS" : "PLAFOND" };
    try {
      if (edite._new) await createRemiseType(payload); else await updateRemiseType(edite.id, payload);
      setEdite(null); onStatus?.({ type: "success", message: "Remise enregistrée." }); load();
    } catch (err) { onStatus?.({ type: "error", message: err.message }); }
  }

  async function supprimer(r) {
    /* LA CONFIRMATION NOMME CE QUI SERAIT PERDU. Le serveur refuse si le type a déjà servi — les
       fichiers remis et les accusés de réception sont des preuves — mais l'écran doit le dire
       AVANT le clic, pas après un 409. */
    if (!window.confirm(`Supprimer « ${r.label} » du référentiel ?\n\n`
      + "Impossible si ce type a déjà servi : les accusés de réception sont des preuves de remise. "
      + "Dans ce cas, désactivez-le plutôt.")) return;
    try { await deleteRemiseType(r.id); onStatus?.({ type: "success", message: "Remise supprimée." }); load(); }
    catch (err) { onStatus?.({ type: "error", message: err.message }); }
  }

  return (
    <Card title={`Documents remis au stagiaire (${items.length})`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <p className="hint" style={{ margin: 0 }}>
          Ce que l'école <b>remet</b> pour un stagiaire en particulier (diplôme obtenu ailleurs, attestation d'un
          certificateur, carte professionnelle), à lui ou à son entreprise. Le destinataire en <b>accuse réception</b>,
          et c'est cet accusé qui termine l'étape. Pour un document identique à tous — livret d'accueil, règlement — utilisez plutôt un
          modèle de document avec un PDF joint. Rattachez-les à un parcours dans <b>Formations → Parcours documentaire</b>.
        </p>
        <button type="button" className="btn sm primary" style={{ flex: "none" }}
          onClick={() => setEdite({ _new: true, code: "", label: "", consigne: "", active: true, destinataire: "STAGIAIRE", nb_documents: 0, nb_mode: "PLAFOND" })}>＋ Ajouter une remise</button>
      </div>

      {items.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Aucune remise au référentiel. « ＋ Ajouter une remise » pour en créer une.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border-soft)", borderRadius: 10, opacity: r.active ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{r.label}</b>{!r.active && <span className="hint"> · inactive</span>}
                {r.destinataire === "ENTREPRISE" && <span className="badge b" style={{ marginLeft: 8 }}>pour l'entreprise</span>}
                {Number(r.nb_documents) > 0 && (
                  <span className="badge n" style={{ marginLeft: 8 }}>
                    {r.nb_mode === "REQUIS" ? `${r.nb_documents} requis` : `au plus ${r.nb_documents}`}
                  </span>
                )}
                <div className="hint" style={{ fontSize: 12 }}>{r.code}{r.consigne ? ` · ${r.consigne}` : ""}</div>
              </div>
              <button type="button" className="btn sm ghost" onClick={() => setEdite({ ...r })}><Icon name="settings" size={14} /> Réglages</button>
              <button type="button" className="btn sm ghost" onClick={() => supprimer(r)}>Supprimer</button>
            </div>
          ))}
        </div>
      )}

      {edite && (
        <div className="overlay">
          <div className="modal">
            <div className="mhead">
              <h3>{edite._new ? "Nouvelle remise" : "Réglages de la remise"}</h3>
              <button className="x" onClick={() => setEdite(null)} aria-label="Fermer"><Icon name="x" size={16} /></button>
            </div>
            <form onSubmit={enregistrer}>
              <div className="mbody">
                <div className="row2">
                  <div className="field">
                    <label>Intitulé</label>
                    <input className="inp" value={edite.label} autoFocus required
                      placeholder="Diplôme HACCP" onChange={(e) => setEdite((p) => ({ ...p, label: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Code</label>
                    {/* Le code est l'IDENTIFIANT du type dans l'organisme : il sert à le reconnaître
                        d'un parcours à l'autre, et se saisit en capitales sans espaces. */}
                    <input className="inp" value={edite.code} required placeholder="DIPLOME_HACCP"
                      onChange={(e) => setEdite((p) => ({ ...p, code: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Consigne (lue par {edite.destinataire === "ENTREPRISE" ? "l'entreprise" : "le stagiaire"})</label>
                  <input className="inp" value={edite.consigne || ""} maxLength={400}
                    placeholder="Conservez-le : il vous sera demandé à l'inscription au CAP."
                    onChange={(e) => setEdite((p) => ({ ...p, consigne: e.target.value }))} />
                </div>
                {/* À QUI LE DOCUMENT EST REMIS (migration 188, décidé le 2026-09-28). L'entreprise le
                    reçoit dans son espace et en accuse réception ; un stagiaire inscrit sans entreprise,
                    ou dont l'entreprise n'a pas d'espace, le reçoit lui-même, sinon personne ne pourrait
                    en accuser réception (cf. `pourEntreprise`, remise.controller.js). */}
                <div className="field">
                  <label>Destinataire</label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 400 }}>
                    <input type="radio" name="destinataire" checked={edite.destinataire !== "ENTREPRISE"}
                      onChange={() => setEdite((p) => ({ ...p, destinataire: "STAGIAIRE" }))} />
                    Le stagiaire, dans son espace
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 400 }}>
                    <input type="radio" name="destinataire" checked={edite.destinataire === "ENTREPRISE"}
                      onChange={() => setEdite((p) => ({ ...p, destinataire: "ENTREPRISE" }))} />
                    L'entreprise, dans son espace entreprise
                  </label>
                  <p className="hint" style={{ margin: "4px 0 0" }}>
                    C'est le destinataire qui accuse réception. Un stagiaire inscrit sans entreprise, ou dont l'entreprise
                    n'a pas d'espace, le reçoit lui-même.
                  </p>
                </div>
                {/* NOMBRE DE DOCUMENTS (migration 203) : au lieu de créer 4-5 types pour un même envoi, un
                    seul type peut en porter plusieurs — soit « au plus X » (plafond), soit « il en faut X »
                    (requis : l'accusé de réception n'est possible qu'une fois tous déposés). 0 = sans limite. */}
                <div className="field">
                  <label>Nombre de documents</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input className="inp" type="number" min="0" max="99" style={{ maxWidth: 90 }}
                      value={edite.nb_documents ?? 0}
                      onChange={(e) => setEdite((p) => ({ ...p, nb_documents: Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))) }))} />
                    <span className="hint">0 = sans limite : un ou plusieurs, au choix.</span>
                  </div>
                  {Number(edite.nb_documents) > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 400 }}>
                        <input type="radio" name="nb_mode" checked={edite.nb_mode !== "REQUIS"}
                          onChange={() => setEdite((p) => ({ ...p, nb_mode: "PLAFOND" }))} />
                        Au plus {edite.nb_documents} — on peut en déposer moins ; fait dès l'accusé de réception.
                      </label>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 400 }}>
                        <input type="radio" name="nb_mode" checked={edite.nb_mode === "REQUIS"}
                          onChange={() => setEdite((p) => ({ ...p, nb_mode: "REQUIS" }))} />
                        Il en faut {edite.nb_documents} — l'accusé de réception n'est possible qu'une fois tous déposés.
                      </label>
                    </div>
                  )}
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                  <input type="checkbox" checked={edite.active !== false}
                    onChange={(e) => setEdite((p) => ({ ...p, active: e.target.checked }))} />
                  Active — proposée dans les parcours
                </label>
              </div>
              <div className="mfoot">
                <button type="button" className="btn ghost" onClick={() => setEdite(null)}>Annuler</button>
                <button type="submit" className="btn primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
