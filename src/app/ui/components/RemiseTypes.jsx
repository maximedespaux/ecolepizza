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
 * SA FICHE EST PLUS COURTE QUE CELLE D'UNE PIÈCE, et c'est voulu : nombre de fichiers, taille
 * maximale et formats acceptés servent à CADRER un envoi qu'on ne maîtrise pas — un stagiaire
 * qui photographie sa carte d'identité. Ici c'est l'école qui dépose : elle sait ce qu'elle
 * envoie, et lui imposer des règles à elle-même n'éviterait aucun problème réel.
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
    const payload = { code: edite.code, label: edite.label, consigne: edite.consigne, active: edite.active !== false };
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
          Ce que l'école <b>remet</b> à un stagiaire en particulier (diplôme obtenu ailleurs, attestation d'un
          certificateur, carte professionnelle). Le stagiaire en <b>accuse réception</b>, et c'est cet accusé qui
          termine l'étape. Pour un document identique à tous — livret d'accueil, règlement — utilisez plutôt un
          modèle de document avec un PDF joint. Rattachez-les à un parcours dans <b>Formations → Parcours documentaire</b>.
        </p>
        <button type="button" className="btn sm primary" style={{ flex: "none" }}
          onClick={() => setEdite({ _new: true, code: "", label: "", consigne: "", active: true })}>＋ Ajouter une remise</button>
      </div>

      {items.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Aucune remise au référentiel. « ＋ Ajouter une remise » pour en créer une.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border-soft)", borderRadius: 10, opacity: r.active ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{r.label}</b>{!r.active && <span className="hint"> · inactive</span>}
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
                  <label>Consigne (lue par le stagiaire)</label>
                  <input className="inp" value={edite.consigne || ""} maxLength={400}
                    placeholder="Conservez-le : il vous sera demandé à l'inscription au CAP."
                    onChange={(e) => setEdite((p) => ({ ...p, consigne: e.target.value }))} />
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
