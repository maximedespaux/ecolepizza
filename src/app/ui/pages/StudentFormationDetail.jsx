import { useContext, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMyFormation, signMyEmargement, getDossierPieces, deposerPiece, pieceFichierUrl,
  getDossierRemises, remiseFichierUrl, accuserRemise } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import SignatureModal from "../components/SignatureModal.jsx";
import QuizModal from "../components/QuizModal.jsx";
import { Icon } from "../components/Icon.jsx";
import { dateHeure } from "../lib/format.js";
import { etatPourLeStagiaire } from "../lib/documentsDossier.js";
import { reduireSiImage, PROFILS } from "../lib/image.js";
import { ACCEPT_PIECE } from "../lib/formatsDepot.js";

const SLOT = { MATIN: "Matin", APRES_MIDI: "Après-midi", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };
const frDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }) : "");

/* ÉTAT VISUEL D'UNE ÉTAPE — la « pastille » du parcours. `done` (fait), `wait` (déposé, en cours de
   vérification), `refused` (à refaire), `current` (l'étape sur laquelle agir maintenant), `todo`. */
const PASTILLE = {
  done:    { bg: "var(--green)", ic: "check", label: "Fait" },
  wait:    { bg: "var(--gold, #c79a2e)", ic: "clock", label: "En vérification" },
  refused: { bg: "var(--red, #c0392b)", ic: "x", label: "À refaire" },
  current: { bg: "var(--blue)", ic: "chevron-right", label: "À faire" },
  todo:    { bg: "var(--border)", ic: "circle", label: "À venir" },
};
const PIECE_ETAT = { VALIDEE: "done", DEPOSEE: "wait", REFUSEE: "refused", ATTENDUE: "todo" };
/* REMISES — L'INVERSE DES PIÈCES, jusque dans les états. « ATTENDUE » veut dire que l'école n'a
   rien déposé : le stagiaire n'a RIEN à faire, donc `wait`. « REMISE » veut dire que le document
   est là et qu'il reste à en accuser réception : c'est à LUI de jouer, donc `todo` — la seule
   valeur qui rende l'étape éligible à la pastille « À faire ». */
const REMISE_ETAT = { RECUE: "done", REMISE: "todo", ATTENDUE: "wait" };
/* Et ses propres libellés : « En vérification » ne veut rien dire pour un document qu'on reçoit.
   La pastille garde son dessin, seul le mot change. */
const REMISE_LABEL = { done: "Reçue", wait: "Pas encore remis", current: "À confirmer", todo: "À confirmer", refused: "À confirmer" };

function StudentFormationDetail() {
  const { id } = useParams(); // = enrollment_id (le dossier)
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const [data, setData] = useState(null);
  const [pieces, setPieces] = useState([]); // pièces à fournir (dossier de cette inscription)
  const [remises, setRemises] = useState([]); // documents que l'école REMET (migration 160)
  const [status, setStatus] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [quizDoc, setQuizDoc] = useState(null);
  const [signing, setSigning] = useState(null);
  const fileRef = useRef(null);
  const pieceCible = useRef(null); // pieceTypeId pour lequel on ouvre le sélecteur de fichier

  function load() {
    getMyFormation(id).then((r) => setData(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
    getDossierPieces(id).then((r) => setPieces(r.data || [])).catch(() => setPieces([]));
    getDossierRemises(id).then((r) => setRemises(r.data || [])).catch(() => setRemises([]));
  }
  useEffect(() => { load(); }, [id]);

  async function onSign({ signer_name, signature_data }) {
    try {
      await signMyEmargement(signing.record_id, { signer_name, signature_data });
      setSigning(null);
      setStatus({ type: "success", message: "Émargement signé. Merci !" });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  /* `multiple` SE POSE AVANT LE CLIC : une pièce peut attendre plusieurs fichiers — un
     justificatif de domicile en six pages — et le plafond vient de son type. Sans cela, le
     stagiaire photographie six pages et n'en envoie qu'une, sans que rien ne le lui dise. */
  function choisirFichier(pieceTypeId, attendus = 1) {
    pieceCible.current = pieceTypeId;
    if (fileRef.current) fileRef.current.multiple = (attendus || 1) > 1;
    fileRef.current?.click();
  }

  async function onFichier(e) {
    // Lus AVANT la remise à zéro : vider le champ vide aussi sa liste de fichiers.
    const fichiers = Array.from(e.target.files || []);
    e.target.value = "";
    if (!fichiers.length || !pieceCible.current) return;
    /* UN FICHIER PAR REQUÊTE, EN SÉRIE : la route est `single('fichier')`, et c'est elle qui
       compte les fichiers déjà déposés pour refuser celui de trop. En parallèle, deux envois
       liraient le même compte et passeraient tous les deux le plafond. */
    let envoyes = 0;
    const echecs = [];
    for (const f of fichiers) {
      /* ON CONTINUE après un refus : le motif est souvent PROPRE au fichier (taille, format),
         et abandonner les suivants les perdrait sans raison. Chaque refus garde le NOM du
         fichier, sans quoi il reste à deviner lequel n'est pas passé. */
      /* LA PHOTO DE LA CARTE EST RÉDUITE AVANT DE PARTIR. C'est le cas d'usage de cet écran :
         le stagiaire photographie sa pièce depuis son téléphone, et le cliché pèse 3 à 8 Mo pour
         un plafond à 3. Le profil `piece` est LARGE et s'arrête à une qualité haute : ce document
         doit rester LISIBLE, quelqu'un doit y lire un nom et une date. Un PDF passe intact. */
      try { await deposerPiece(id, pieceCible.current, await reduireSiImage(f, PROFILS.piece)); envoyes += 1; }
      catch (err) { echecs.push(`${f.name} (${err.message})`); }
    }
    if (envoyes) load();
    if (echecs.length) {
      setStatus({
        type: "error",
        message: envoyes
          ? `${envoyes} document${envoyes > 1 ? "s" : ""} sur ${fichiers.length} envoyé${envoyes > 1 ? "s" : ""}. Refusé${echecs.length > 1 ? "s" : ""} : ${echecs.join(" · ")}`
          : `Refusé${echecs.length > 1 ? "s" : ""} : ${echecs.join(" · ")}`,
      });
    } else {
      setStatus({
        type: "success",
        message: envoyes > 1
          ? `${envoyes} documents envoyés. Ils seront vérifiés par l'école.`
          : "Document envoyé. Il sera vérifié par l'école.",
      });
    }
  }

  /* CONFIRMER, C'EST S'ENGAGER — donc on demande. Le clic produit une preuve horodatée que
     l'école pourra opposer lors d'un contrôle ; la phrase dit exactement ce qu'on signe, et
     invite à ouvrir le document d'abord. Un « oui » donné par réflexe sur un document jamais
     ouvert vaut mieux que rien, mais le dire évite qu'on le regrette. */
  async function confirmerRemise(r) {
    if (!window.confirm(`Confirmer que vous avez bien reçu « ${r.label} » ?\n\n`
      + "Ouvrez-le d'abord si ce n'est pas déjà fait : votre confirmation est datée et vaut preuve de remise.")) return;
    try {
      await accuserRemise(r.remise_id);
      setStatus({ type: "success", message: "Réception confirmée. Merci." });
      getDossierRemises(id).then((x) => setRemises(x.data || [])).catch(() => {});
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  // Construit la liste ordonnée des ÉTAPES : d'abord les pièces à fournir, puis les documents.
  /* UNE PIÈCE PEUT ATTENDRE PLUSIEURS FICHIERS (un justificatif en six pages). Tant qu'elle n'est
     pas VALIDÉE et qu'il reste de la place (`nb < max`), le stagiaire doit pouvoir en ajouter —
     sinon, le premier fichier déposé faisait passer l'étape en « à vérifier » et le bouton
     disparaissait, bloquant les cinq pages suivantes jusqu'à un refus de l'école. On s'arrête donc
     à l'accord (VALIDÉE) OU au plafond (`fichiers_attendus`), selon ce qui vient en premier. */
  const etapesPieces = pieces.map((p) => {
    const etat = PIECE_ETAT[p.statut] || "todo";
    const nb = p.fichiers?.length || 0;
    const max = Math.max(1, Number(p.fichiers_attendus) || 1);
    return { kind: "piece", key: `p-${p.piece_type_id}`, p, etat, nb, max, peutAjouter: etat === "wait" && nb < max };
  });
  /* « SIGNÉ OU PAS » NE SUFFISAIT PAS : un livret d'accueil, qui n'a aucun signataire, restait
     « À signer » et « à faire » pour toujours — et prenait la pastille « À faire » à l'étape qui
     en avait vraiment besoin. L'état vient désormais de qui doit signer (cf. lib/documentsDossier.js). */
  const etapesDocs = (data?.documents || []).map((d) => ({ kind: "doc", key: `d-${d.id}`, d, etat: etatPourLeStagiaire(d) }));
  /* Les remises viennent APRÈS les documents : on fournit ses pièces au début, on signe pendant,
     on reçoit son attestation à la fin. L'ordre de la liste raconte le déroulé. */
  const etapesRemises = remises.map((r) => ({ kind: "remise", key: `r-${r.remise_type_id}`, r, etat: REMISE_ETAT[r.statut] || "wait" }));
  const etapes = [...etapesPieces, ...etapesDocs, ...etapesRemises];
  // La PREMIÈRE étape non terminée (et non en attente de vérif) porte la pastille « en cours ».
  const idxCourant = etapes.findIndex((e) => e.etat === "todo" || e.etat === "refused");

  return (
    <>
      <div className="hero" style={{ background: "var(--grad-navy)" }}>
        {/* 16 px de haut : le seul chemin de retour de la page était une cible de moins d'un
            demi-doigt. La marge négative rend la hauteur gagnée par le rembourrage — rien ne bouge. */}
        <button className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "12px 0", margin: "-12px 0", color: "rgba(255,255,255,.8)" }} onClick={() => navigate("/mon-espace")}>
          <Icon name="chevron-left" size={14} /> Mes documents
        </button>
        <h1>{data ? data.program_title : "Formation"}</h1>
        {data && (
          <p>{data.start_date && data.end_date ? `Du ${dateHeure(data.start_date)} au ${dateHeure(data.end_date)} · ` : ""}Semaine {data?.week} · {data?.year} · {data?.program_hours} h</p>
        )}
      </div>

      {/* Onglets : autres sessions du même programme */}
      {data && data.sessions && data.sessions.length > 1 && (
        <div className="sess-tabs">
          {data.sessions.map((s) => (
            <button key={s.enrollment_id}
              className={"sess-tab" + (s.enrollment_id === data.enrollment_id ? " on" : "")}
              onClick={() => { if (s.enrollment_id !== data.enrollment_id) navigate(`/formations/${s.enrollment_id}`); }}
              title={s.start_date && s.end_date ? `Du ${dateHeure(s.start_date)} au ${dateHeure(s.end_date)}` : ""}>
              <Icon name="calendar" size={13} /> Semaine {s.week} · {s.year}
            </button>
          ))}
        </div>
      )}

      <StatusMessage status={status} />

      {/* Sélecteur de fichier partagé (déclenché par « Fournir »/« Renvoyer »). */}
      {/* `image/*` laissait choisir un SVG ou un HEIC, que le serveur refuse : la liste est
          désormais celle qu'il accepte vraiment (lib/formatsDepot.js). */}
      <input ref={fileRef} type="file" accept={ACCEPT_PIECE} style={{ display: "none" }} onChange={onFichier} />

      {data && (
        <Card title="Mon parcours">
          {etapes.length === 0 ? (
            <EmptyState icon="file-text">Aucune étape pour le moment.</EmptyState>
          ) : (
            <div className="parcours">
              {etapes.map((e, i) => {
                const etat = i === idxCourant ? "current" : e.etat;
                const pas = PASTILLE[etat] || PASTILLE.todo;
                const dernier = i === etapes.length - 1;
                return (
                  <div key={e.key} className="parcours-etape" style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                    {/* Rail vertical : pastille + trait de liaison. */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", background: pas.bg, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
                        <Icon name={pas.ic} size={14} />
                      </span>
                      {!dernier && <span style={{ width: 2, flex: 1, background: "var(--border-soft)", marginTop: 2 }} />}
                    </div>
                    {/* Contenu de l'étape. */}
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: dernier ? 0 : 14 }}>
                      {e.kind === "piece" ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {/* `flex: 1 1 160px` et non `flex: 1` : une base nulle laissait le titre se
                                réduire à la place restante — sur téléphone, badge, « Voir » et
                                « Renvoyer » sur la même ligne le tassaient à un mot par ligne
                                (« Justificatif / de / domicile… »). Sous 160 px, ce sont les boutons
                                qui passent à la ligne, pas le titre qui s'écrase. */}
                            <b style={{ flex: "1 1 160px", minWidth: 0 }}>Fournir&nbsp;: {e.p.label}</b>
                            <Badge tone={{ done: "g", wait: "a", refused: "r", todo: "n", current: "b" }[etat]}>{pas.label}</Badge>
                            {/* COMBIEN SUR COMBIEN, dès qu'une pièce en attend plusieurs et qu'au
                                moins un fichier est là : le stagiaire voit ce qu'il a déposé et
                                combien il peut encore en ajouter. */}
                            {e.max > 1 && e.nb > 0 && (
                              <span className="hint" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                                {e.nb} sur {e.max} déposé{e.nb > 1 ? "s" : ""}
                              </span>
                            )}
                            {/* UN SEUL FICHIER : un bouton « Voir » suffit, la ligne reste courte.
                                PLUSIEURS : ils sont listés en dessous, chacun avec son nom — le
                                bouton unique pointait `fichiers[0]`, et le stagiaire qui envoyait
                                six pages n'avait aucun moyen de vérifier que les six étaient
                                parties. */}
                            {e.p.fichiers?.length === 1 && (
                              <button className="btn sm ghost" onClick={() => window.open(pieceFichierUrl(e.p.fichiers[0].id), "_blank", "noopener")}>
                                <Icon name="eye" size={14} /> Voir
                              </button>
                            )}
                            {/* AJOUTER TANT QUE C'EST OUVERT : à fournir (aucun fichier), refusé
                                (à renvoyer), ou déposé mais pas encore au plafond (`peutAjouter`).
                                Une fois validé — ou le plafond atteint — plus de bouton. */}
                            {(e.etat === "todo" || e.etat === "refused" || e.peutAjouter) && (
                              <button className="btn sm primary" onClick={() => choisirFichier(e.p.piece_type_id, e.p.fichiers_attendus)}>
                                <Icon name="upload" size={14} /> {e.etat === "refused" ? "Renvoyer" : e.peutAjouter ? "Ajouter" : "Fournir"}
                              </button>
                            )}
                          </div>
                          {e.p.fichiers?.length > 1 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, margin: "5px 0 0" }}>
                              {e.p.fichiers.map((f, k) => (
                                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
                                  <span style={{ color: "var(--dim)", flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>{k + 1}.</span>
                                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                    title={f.nom || `Fichier ${k + 1}`}>{f.nom || `Fichier ${k + 1}`}</span>
                                  <button className="btn sm ghost" style={{ flex: "0 0 auto" }}
                                    aria-label={`Voir ${f.nom || `le fichier ${k + 1}`}`}
                                    onClick={() => window.open(pieceFichierUrl(f.id), "_blank", "noopener")}>
                                    <Icon name="eye" size={13} /> Voir
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {e.p.consigne && <p className="hint" style={{ margin: "2px 0 0" }}>{e.p.consigne}</p>}
                          {e.etat === "refused" && e.p.motif_refus && (
                            <p className="hint" style={{ margin: "4px 0 0", color: "var(--red, #c0392b)" }}>
                              <Icon name="x" size={12} /> Refusé&nbsp;: {e.p.motif_refus} — merci d'en envoyer un nouveau.
                            </p>
                          )}
                        </>
                      ) : e.kind === "remise" ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ color: "var(--blue)", display: "inline-flex", flex: "none" }}><Icon name="file-text" size={16} /></span>
                            <b style={{ flex: "1 1 160px", minWidth: 0 }}>{e.r.label}</b>
                            <Badge tone={{ done: "g", wait: "n", todo: "b", current: "b" }[etat] || "n"}>
                              {REMISE_LABEL[etat] || REMISE_LABEL.wait}
                            </Badge>
                            {(e.r.fichiers || []).map((f, k) => (
                              <button key={f.id} className="btn sm ghost"
                                aria-label={`Voir ${f.nom || `le document ${k + 1}`} — ${e.r.label}`}
                                onClick={() => window.open(remiseFichierUrl(f.id), "_blank", "noopener")}>
                                <Icon name="eye" size={14} /> Voir{(e.r.fichiers.length > 1) ? ` (${k + 1})` : ""}
                              </button>
                            ))}
                            {/* LE BOUTON N'APPARAÎT QU'UNE FOIS LE DOCUMENT DÉPOSÉ. Confirmer la
                                réception de ce qui n'existe pas encore n'a pas de sens, et le
                                serveur refuserait (422) — un bouton qui répond par une erreur est
                                pire qu'un bouton absent. */}
                            {e.r.statut === "REMISE" && (
                              <button className="btn sm primary" onClick={() => confirmerRemise(e.r)}>
                                <Icon name="check" size={14} /> J'ai bien reçu
                              </button>
                            )}
                          </div>
                          {e.r.consigne && <p className="hint" style={{ margin: "2px 0 0" }}>{e.r.consigne}</p>}
                          {e.r.statut === "ATTENDUE" && (
                            <p className="hint" style={{ margin: "2px 0 0" }}>L'école ne l'a pas encore déposé.</p>
                          )}
                          {e.r.accuse_le && (
                            <p className="hint" style={{ margin: "2px 0 0", color: "var(--green, #2e9e5b)" }}>
                              Réception confirmée le {dateHeure(e.r.accuse_le)}.
                            </p>
                          )}
                        </>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ color: "var(--blue)", display: "inline-flex", flex: "none" }}><Icon name={e.d.quiz_id ? "list-checks" : "file-text"} size={16} /></span>
                          <b style={{ flex: "1 1 160px", minWidth: 0 }}>{e.d.title}{e.d.signed_at && <span style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>Signé le {dateHeure(e.d.signed_at)}</span>}</b>
                          {e.d.quiz_id ? (
                            <>
                              <Badge tone={e.d.status === "SIGNE" ? "g" : "b"}>{e.d.status === "SIGNE" ? "Répondu" : "QCM à faire"}</Badge>
                              <button className="btn sm primary" onClick={() => setQuizDoc(e.d.id)}>{e.d.status === "SIGNE" ? "Voir" : "Répondre"}</button>
                            </>
                          ) : (
                            <>
                              {/* Mêmes mots que « Mes documents » : « À signer » seulement quand
                                  LUI doit signer. Un document que signe son entreprise, ou que
                                  personne ne signe, se consulte. */}
                              {e.d.status === "SIGNE" ? <Badge tone="g">Signé</Badge>
                                : e.etat === "todo" ? <Badge tone="b">À signer</Badge>
                                : e.etat === "wait" ? <Badge tone="a">À signer par l'entreprise</Badge>
                                : <Badge tone="n">À consulter</Badge>}
                              <button className="btn sm primary" onClick={() => setViewId(e.d.id)}>{e.d.status !== "SIGNE" && e.etat === "todo" ? "Consulter / signer" : "Consulter"}</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {data && (() => {
        const gate = data.emargement_gate || {};
        const locked = !!gate.locked;
        return (
        <Card title="Émargement, ma présence">
          {locked && (
            <div className="emarg-lock">
              <Icon name="lock" size={15} />
              <span>Émargement verrouillé, signe d'abord tes documents{gate.break_label ? <> jusqu'à « <b>{gate.break_label}</b> »</> : null}. <b>{gate.done}/{gate.need}</b> document{gate.need > 1 ? "s" : ""} signé{gate.done > 1 ? "s" : ""}.</span>
            </div>
          )}
          {(!data.emargement || data.emargement.length === 0) ? (
            <EmptyState icon="pencil">Aucune demi-journée à émarger pour cette session.</EmptyState>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {data.emargement.map((r) => {
                const future = r.date > (data.today || "");
                return (
                  <div key={r.record_id} className="stu-row">
                    <span style={{ color: r.signed ? "var(--green)" : "var(--blue)", display: "inline-flex", flex: "none" }}><Icon name="calendar" size={16} /></span>
                    <span className="stu-row-t">
                      <b style={{ textTransform: "capitalize" }}>{frDate(r.date)}, {SLOT[r.slot] || r.slot}</b>
                    </span>
                    {r.signed ? (
                      <Badge tone="g">Signé{r.signed_at ? ` · ${dateHeure(r.signed_at)}` : ""}</Badge>
                    ) : locked ? (
                      <span className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="lock" size={13} /> Documents requis</span>
                    ) : future ? (
                      <span className="hint">À venir</span>
                    ) : (
                      <button className="btn sm primary" onClick={() => setSigning(r)}>Signer</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        );
      })()}

      {viewId && (
        <DocumentViewModal id={viewId} canSign defaultName={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
          onClose={() => setViewId(null)} onChanged={load} />
      )}

      {quizDoc && (
        <QuizModal documentId={quizDoc} onClose={() => { setQuizDoc(null); load(); }} />
      )}

      {signing && (
        <SignatureModal
          doc={{ label: `Émargement, ${SLOT[signing.slot] || signing.slot} ${frDate(signing.date)}` }}
          defaultName={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
          onConfirm={onSign}
          onClose={() => setSigning(null)}
        />
      )}
    </>
  );
}

export default StudentFormationDetail;
