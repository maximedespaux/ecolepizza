import { useContext, useEffect, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { peutEcrire } from "../lib/nav.js";
import Card from "./Card.jsx";
import Badge from "./Badge.jsx";
import EmptyState from "./EmptyState.jsx";
import { Icon } from "./Icon.jsx";
import BoutonsDocument from "./BoutonsDocument.jsx";
import SignatureModal from "./SignatureModal.jsx";
import { getDocumentsSession, envoyerDocumentSession, deleteDocument, getMesCasesSession, signerMesCases } from "../api/apiClient.js";

/**
 * DOCUMENTS DE LA SESSION À FAIRE SIGNER — contrat d'hygiène, procès-verbal, convention de
 * prestation… par les personnes de la session : intervenants, FORMATEURS et JURY.
 *
 * CE QUI EST PROPOSÉ, ET RIEN D'AUTRE : les modèles dont la case « Externe » est cochée. Le
 * critère n'est pas un réglage de plus, c'est celui que l'organisme règle déjà dans l'éditeur
 * de modèles — deux cases pour la même question finiraient par se contredire.
 *
 * QUI SIGNE QUOI : un modèle porte des CADRES nommés (« Formateur », « Jury 1 », « Président du
 * jury », « Signature de l'intervenant »…). À l'envoi, on choisit pour chacun une personne
 * AFFECTÉE à la session. Elle le retrouve dans son espace — le formateur ici même, sur la page de
 * la session, là où il signe déjà ses émargements — et le signe. Le document n'est « signé »
 * que lorsque tous ses cadres le sont ; l'organisme contresigne alors, en dernier.
 *
 * ELLE DISPARAÎT QUAND ELLE N'A RIEN À DIRE — aucun modèle « Externe », rien d'envoyé, rien à
 * signer. La plupart des sessions sont dans ce cas : une carte vide sur chacune ferait du bruit.
 */
function DocumentsExternes({ sessionId, onStatus }) {
  /* DEUX RUBRIQUES, DEUX DROITS : l'envoi passe par /sessions, la suppression par /documents,
     que le serveur range sous /stagiaires. Un seul drapeau « admin » reçu du parent ne pouvait
     dire ni l'un ni l'autre à un formateur dont l'accès est réglé rubrique par rubrique. */
  const { user } = useContext(UserContext);
  const peutEnvoyer = peutEcrire(user, "/sessions");
  const peutSupprimer = peutEcrire(user, "/stagiaires");
  const [data, setData] = useState(null);
  const [mes, setMes] = useState([]);
  const [modele, setModele] = useState("");
  const [attrib, setAttrib] = useState({});   // cadre → personne choisie
  const [qui, setQui] = useState("");         // modèle SANS cadre : l'intervenant, comme avant
  const [occupe, setOccupe] = useState(false);
  const [dessiner, setDessiner] = useState(null);

  const charger = () => {
    getDocumentsSession(sessionId).then((r) => setData(r.data)).catch(() => setData(null));
    getMesCasesSession(sessionId).then((r) => setMes(r.data || [])).catch(() => setMes([]));
  };
  useEffect(() => { charger(); }, [sessionId]);

  /* SUPPRIMER CE QU'ON A ENVOYÉ — côté organisme seulement. On se trompe de modèle, on se
     trompe de personne : sans ce geste, le document restait là pour toujours.
     LA CONFIRMATION NOMME LE DOCUMENT ET SON ÉTAT : effacer un document DÉJÀ SIGNÉ n'est pas le
     même geste qu'annuler un envoi de la minute d'avant. */
  async function supprimer(d) {
    const signe = d.signe_le ? `\n\nCe document est SIGNÉ depuis le ${d.signe_le}. La signature sera perdue.` : "";
    if (!window.confirm(`Supprimer « ${d.title} » ?${signe}\n\nCette action est irréversible.`)) return;
    try {
      await deleteDocument(d.id);
      onStatus?.({ type: "success", message: "Document supprimé." });
      charger();
    } catch (e) { onStatus?.({ type: "error", message: e.message }); }
  }

  const modeles = (data && data.modeles) || [];
  const choisi = modeles.find((m) => m.slug === modele) || null;
  const cases = (choisi && choisi.cases) || [];
  const attributions = cases.filter((c) => attrib[c.slot]).map((c) => ({ slot: c.slot, user_id: attrib[c.slot] }));
  const pret = !!modele && (cases.length ? attributions.length > 0 : !!qui);

  async function envoyer() {
    if (!pret) return;
    setOccupe(true);
    try {
      const corps = cases.length ? { template_slug: modele, attributions } : { template_slug: modele, user_id: qui };
      const r = await envoyerDocumentSession(sessionId, corps);
      onStatus?.({ type: "success", message: r.message || "Document envoyé." });
      setModele(""); setAttrib({}); setQui("");
      charger();
    } catch (e) { onStatus?.({ type: "error", message: e.message }); }
    finally { setOccupe(false); }
  }

  async function signer(d, signature_data) {
    setOccupe(true);
    try {
      await signerMesCases(d.id, signature_data ? { signature_data } : {});
      onStatus?.({ type: "success", message: "Document signé." });
      setDessiner(null);
      charger();
    } catch (e) { onStatus?.({ type: "error", message: e.message }); }
    finally { setOccupe(false); }
  }

  if (!data) return null;
  const { formateurs = [], intervenants = [], envoyes = [] } = data;
  const aSigner = mes.filter((d) => d.a_signer);
  if (!modeles.length && !envoyes.length && !aSigner.length) return null;
  const personnes = formateurs.length + intervenants.length;
  const monNom = [user?.first_name, user?.last_name].filter(Boolean).join(" ");

  return (
    <Card title={<span className="card-ttl"><Icon name="send" size={16} /> Documents à faire signer</span>}>
      {/* CE QU'ON ME DEMANDE À MOI, en tête : c'est la seule ligne de la carte qui attend un geste
          de la personne qui la lit. */}
      {aSigner.length > 0 && (
        <div className="grid" style={{ gap: 6, marginBottom: 14 }}>
          <b style={{ fontSize: 13 }}>À signer par vous</b>
          {aSigner.map((d) => (
            <div key={d.id} className="arch-doc">
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{d.title}</b>
                <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                  {d.cases.filter((c) => !c.signe_le).map((c) => c.label).join(", ")}
                </span>
              </span>
              <BoutonsDocument id={d.id} nom={d.title} />
              <button className="btn sm primary" disabled={occupe} onClick={() => setDessiner(d)}>Signer</button>
            </div>
          ))}
        </div>
      )}

      {peutEnvoyer && (
        modeles.length === 0 ? (
          <p className="hint" style={{ marginTop: 0 }}>
            Aucun modèle n'est signable par les personnes de la session. Cochez « Externe » parmi
            les signataires d'un modèle, dans Modèles de documents.
          </p>
        ) : personnes === 0 ? (
          /* LE CAS LE PLUS FRÉQUENT D'ÉCHEC, dit avant qu'on essaie : on ne peut pas envoyer à
             quelqu'un qui n'est pas là. Le geste manquant est nommé. */
          <p className="hint" style={{ marginTop: 0 }}>
            Aucun formateur ni intervenant n'est affecté à cette session : affectez-en un ci-dessus
            pour pouvoir lui faire signer un document.
          </p>
        ) : (
          <div className="grid" style={{ gap: 8, marginBottom: 12 }}>
            <select className="inp" style={{ maxWidth: 320 }} value={modele} aria-label="Modèle de document"
              onChange={(e) => { setModele(e.target.value); setAttrib({}); setQui(""); }}>
              <option value="">Quel document ?</option>
              {modeles.map((m) => <option key={m.slug} value={m.slug}>{m.label}</option>)}
            </select>
            {choisi && cases.length > 0 && cases.map((c) => (
              <div key={c.slot} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ flex: "0 0 180px", minWidth: 0, fontSize: 13 }}>« {c.label} »</span>
                <select className="inp" style={{ maxWidth: 280 }} value={attrib[c.slot] || ""}
                  aria-label={`Qui signe « ${c.label} » ?`}
                  onChange={(e) => setAttrib((a) => ({ ...a, [c.slot]: e.target.value }))}>
                  <option value="">Personne (se signe à la main)</option>
                  {formateurs.length > 0 && (
                    <optgroup label="Formateurs">
                      {formateurs.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                    </optgroup>
                  )}
                  {intervenants.length > 0 && (
                    <optgroup label="Intervenants et jury">
                      {intervenants.map((p) => (
                        <option key={p.id} value={p.id}>{p.nom}{p.specialty ? ` · ${p.specialty}` : ""}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            ))}
            {choisi && cases.length === 0 && (
              /* UN MODÈLE SANS CADRE NOMMÉ : l'envoi d'avant, à un intervenant — mais on le dit, la
                 signature ne s'imprimera nulle part sur la page. */
              <>
                <select className="inp" style={{ maxWidth: 280 }} value={qui} aria-label="Intervenant"
                  onChange={(e) => setQui(e.target.value)}>
                  <option value="">À quel intervenant ?</option>
                  {intervenants.map((i) => (
                    <option key={i.id} value={i.id}>{i.nom}{i.specialty ? ` · ${i.specialty}` : ""}</option>
                  ))}
                </select>
                <p className="hint" style={{ margin: 0 }}>
                  Ce modèle n'a aucun cadre de signature : la signature ne s'affichera pas sur la page.
                  Ajoutez « Signature de l'intervenant », « Formateur » ou « Jury 1 » dans l'éditeur.
                </p>
              </>
            )}
            <div>
              <button className="btn primary" disabled={occupe || !pret} onClick={envoyer}>
                {occupe ? "Envoi…" : "Envoyer le document"}
              </button>
            </div>
          </div>
        )
      )}

      {envoyes.length === 0 ? (
        <EmptyState icon="send">Aucun document envoyé pour cette session.</EmptyState>
      ) : (
        <div className="grid" style={{ gap: 6 }}>
          {envoyes.map((d) => {
            const signes = (d.cases || []).filter((c) => c.signe_le).length;
            return (
              <div key={d.id} className="arch-doc">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{d.title}</b>
                  <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                    envoyé le {d.envoye_le}
                    {/* L'ORGANISME CONTRESIGNE APRÈS TOUS LES AUTRES : on le CONSTATE, on ne le
                        promet pas. */}
                    {d.org_signe_le ? ` · contresigné le ${d.org_signe_le}` : ""}
                  </span>
                  {/* CHAQUE CADRE, sa personne et son état : « qui manque ? » est la question qu'on
                      se pose une semaine plus tard. */}
                  {(d.cases || []).map((c) => (
                    <span key={c.slot} style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                      {c.label} : {c.signataire || "—"} {c.signe_le ? `· signé le ${c.signe_le}` : "· en attente"}
                    </span>
                  ))}
                </span>
                {d.signe_le
                  ? <Badge tone="g">Signé</Badge>
                  : <Badge tone="a">{(d.cases || []).length > 1 ? `${signes}/${d.cases.length} signés` : "En attente"}</Badge>}
                <BoutonsDocument id={d.id} nom={d.title} />
                {peutSupprimer && (
                  <button type="button" className="iconbtn del" title="Supprimer ce document"
                    aria-label={`Supprimer ${d.title}`} onClick={() => supprimer(d)}>
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dessiner && (
        <SignatureModal doc={{ label: dessiner.title }} defaultName={monNom}
          onConfirm={({ signature_data }) => signer(dessiner, signature_data)}
          onClose={() => setDessiner(null)} />
      )}
    </Card>
  );
}

export default DocumentsExternes;
