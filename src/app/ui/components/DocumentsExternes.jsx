import { useContext, useEffect, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { peutEcrire } from "../lib/nav.js";
import Card from "./Card.jsx";
import Badge from "./Badge.jsx";
import EmptyState from "./EmptyState.jsx";
import { Icon } from "./Icon.jsx";
import BoutonsDocument from "./BoutonsDocument.jsx";
import { getDocumentsSession, envoyerDocumentSession, deleteDocument } from "../api/apiClient.js";

/**
 * DOCUMENTS DE LA SESSION SIGNÉS PAR UN INTERVENANT EXTERNE — contrat d'hygiène, convention
 * de prestation…
 *
 * CE QUI EST PROPOSÉ, ET RIEN D'AUTRE : les modèles dont la case « Externe » est cochée. Le
 * critère n'est pas un réglage de plus, c'est celui que l'organisme règle déjà dans l'éditeur
 * de modèles — deux cases pour la même question finiraient par se contredire.
 *
 * À QUI : un intervenant AFFECTÉ à cette session. « Externe » ne veut pas dire « n'importe
 * qui », et il ne s'agit pas d'une adresse à saisir : la personne a un compte, un espace, et une
 * signature enregistrée. Elle retrouvera le document chez elle et le signera d'un clic.
 *
 * CE QUE LA CARTE MONTRE ENSUITE : ce qui est parti, et ce qui est signé. C'est la question
 * qu'on se pose une semaine plus tard, et la seule à laquelle un tableau doit répondre d'un
 * coup d'œil.
 *
 * ELLE DISPARAÎT QUAND ELLE N'A RIEN À DIRE — aucun modèle « Externe », aucun intervenant, et
 * rien d'envoyé. La plupart des sessions sont dans ce cas : une carte vide sur chacune ferait
 * du bruit pour rien, comme la commission de jury juste à côté.
 */
function DocumentsExternes({ sessionId, onStatus }) {
  /* DEUX RUBRIQUES, DEUX DROITS : l'envoi passe par /sessions, la suppression par /documents,
     que le serveur range sous /stagiaires. Un seul drapeau « admin » reçu du parent ne pouvait
     dire ni l'un ni l'autre à un formateur dont l'accès est réglé rubrique par rubrique. */
  const { user } = useContext(UserContext);
  const peutEnvoyer = peutEcrire(user, "/sessions");
  const peutSupprimer = peutEcrire(user, "/stagiaires");
  const [data, setData] = useState(null);
  const [modele, setModele] = useState("");
  const [qui, setQui] = useState("");
  const [occupe, setOccupe] = useState(false);

  const charger = () => getDocumentsSession(sessionId)
    .then((r) => setData(r.data)).catch(() => setData(null));
  useEffect(() => { charger(); }, [sessionId]);

  /* SUPPRIMER CE QU'ON A ENVOYÉ — côté organisme seulement. On se trompe de modèle, on se
     trompe d'intervenant : sans ce geste, le document restait là pour toujours, et l'écran
     accumulait des lignes qu'on ne savait plus lire.
     LA CONFIRMATION NOMME LE DOCUMENT ET SON ÉTAT : effacer un contrat DÉJÀ SIGNÉ n'est pas le
     même geste qu'annuler un envoi de la minute d'avant, et la phrase doit le dire avant, pas
     le regretter après. */
  async function supprimer(d) {
    const signe = d.signe_le ? `\n\nCe document est SIGNÉ depuis le ${d.signe_le}. La signature sera perdue.` : "";
    if (!window.confirm(`Supprimer « ${d.title} » ?${signe}\n\nCette action est irréversible.`)) return;
    try {
      await deleteDocument(d.id);
      onStatus?.({ type: "success", message: "Document supprimé." });
      charger();
    } catch (e) { onStatus?.({ type: "error", message: e.message }); }
  }

  async function envoyer() {
    if (!modele || !qui) return;
    setOccupe(true);
    try {
      const r = await envoyerDocumentSession(sessionId, { template_slug: modele, user_id: qui });
      onStatus?.({ type: "success", message: r.message || "Document envoyé." });
      setModele(""); setQui("");
      charger();
    } catch (e) { onStatus?.({ type: "error", message: e.message }); }
    finally { setOccupe(false); }
  }

  if (!data) return null;
  const { modeles = [], intervenants = [], envoyes = [] } = data;
  if (!modeles.length && !envoyes.length) return null;

  return (
    <Card title={<span className="card-ttl"><Icon name="send" size={16} /> Documents à signer par un intervenant</span>}>
      {peutEnvoyer && (
        modeles.length === 0 ? (
          <p className="hint" style={{ marginTop: 0 }}>
            Aucun modèle n'est signable par un intervenant externe. Cochez « Externe » parmi les
            signataires d'un modèle, dans Modèles de documents.
          </p>
        ) : intervenants.length === 0 ? (
          /* LE CAS LE PLUS FRÉQUENT D'ÉCHEC, dit avant qu'on essaie : on ne peut pas envoyer à
             quelqu'un qui n'est pas là. Le geste manquant est nommé. */
          <p className="hint" style={{ marginTop: 0 }}>
            Aucun intervenant n'est affecté à cette session : affectez-en un ci-dessus pour
            pouvoir lui envoyer un document.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <select className="inp" style={{ maxWidth: 280 }} value={modele} aria-label="Modèle de document"
              onChange={(e) => setModele(e.target.value)}>
              <option value="">Quel document ?</option>
              {modeles.map((m) => <option key={m.slug} value={m.slug}>{m.label}</option>)}
            </select>
            <select className="inp" style={{ maxWidth: 260 }} value={qui} aria-label="Intervenant"
              onChange={(e) => setQui(e.target.value)}>
              <option value="">À quel intervenant ?</option>
              {intervenants.map((i) => (
                <option key={i.id} value={i.id}>{i.nom}{i.specialty ? ` · ${i.specialty}` : ""}</option>
              ))}
            </select>
            <button className="btn primary" disabled={occupe || !modele || !qui} onClick={envoyer}>
              {occupe ? "Envoi…" : "Envoyer le document"}
            </button>
          </div>
        )
      )}

      {envoyes.length === 0 ? (
        <EmptyState icon="send">Aucun document envoyé pour cette session.</EmptyState>
      ) : (
        <div className="grid" style={{ gap: 6 }}>
          {envoyes.map((d) => (
            <div key={d.id} className="arch-doc">
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{d.title}</b>
                <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                  envoyé le {d.envoye_le}
                  {d.signataire ? ` à ${String(d.signataire).trim()}` : ""}
                  {d.signe_le ? ` · signé le ${d.signe_le}` : ""}
                  {/* L'ORGANISME CONTRESIGNE APRÈS : on le CONSTATE, on ne le promet pas. Dire
                      « sera contresigné » avant que ce soit fait, c'est annoncer un état qu'on
                      ne tient pas encore. */}
                  {d.org_signe_le ? ` · contresigné le ${d.org_signe_le}` : ""}
                </span>
              </span>
              {d.signe_le ? <Badge tone="g">Signé</Badge> : <Badge tone="a">En attente</Badge>}
              <BoutonsDocument id={d.id} nom={d.title} />
              {peutSupprimer && (
                <button type="button" className="iconbtn del" title="Supprimer ce document"
                  aria-label={`Supprimer ${d.title}`} onClick={() => supprimer(d)}>
                  <Icon name="trash" size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default DocumentsExternes;
