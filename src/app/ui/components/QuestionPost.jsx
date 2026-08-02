import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.jsx";
import AvatarCadre from "./AvatarCadre.jsx";
import { initials, dateHeure } from "../lib/format.js";
import { cadreValeur } from "../lib/cadres.js";
import { parseAvatar } from "../lib/gamification.js";
import { useEchap } from "../lib/useEchap.js";
import { reduireImage, PHOTO_MAX_KO, PHOTO_MAX_PX } from "../lib/image.js";
import PriseDePhoto from "./PriseDePhoto.jsx";
import { getPost, createPost, deletePost, addAnswer, deleteAnswer, updatePost, postImageUrl, uploadPostImage } from "../api/apiClient.js";

/**
 * L'espace d'échange : poser une QUESTION, y répondre, marquer ce qui a aidé.
 *
 * Ces pièces vivent dans le MÊME FIL que les fiches partagées, et pas dans un onglet à part.
 * Avec une trentaine de stagiaires actifs, deux salles séparées seraient deux salles à moitié
 * vides — et personne ne va voir l'onglet où il n'a rien posté. Une question croise donc les
 * fiches, ce qui est aussi la façon la plus naturelle de la découvrir.
 *
 * Le cadre de l'auteur est résolu par le parent (`cadreDe`) : lui seul sait qui est
 * l'utilisateur courant, et lui seul est rerendu quand celui-ci change de cadre.
 */

/**
 * Le corps d'une annonce, ses hashtags MIS EN AVANT.
 *
 * Une annonce se termine souvent par ce qu'elle concerne — « …report de la session #niveau2 ».
 * En texte brut, ce mot se noie dans la phrase alors que c'est lui qu'on cherche du regard en
 * parcourant le bandeau. Les fiches, elles, ont leurs tags en pastilles depuis toujours
 * (`.badge-tag`) : l'annonce était le seul endroit où un `#` restait de la ponctuation.
 *
 * Mis en valeur SUR PLACE, dans la phrase, et non extraits en pastilles au-dessous : une
 * annonce est une phrase à lire, pas une fiche à indexer. Déplacer ses tags à la fin la
 * couperait de son sens — « la session est décalée » et « #niveau2 » ne se lisent bien
 * qu'ensemble.
 *
 * Le découpage garde les séparateurs (`split` avec un groupe capturant) : le texte ressort
 * intact, ponctuation comprise.
 */
const TAG_ANNONCE = /(#[\p{L}\p{N}_-]+)/gu;
/* Deux expressions, et ce n'est pas un doublon : `test()` sur une regex `/g` est À ÉTAT — son
   `lastIndex` persiste d'un appel au suivant, si bien qu'un même morceau ressort vrai puis faux
   une fois sur deux. Un tag sur deux serait passé en texte brut, au hasard de l'ordre de rendu.
   La seconde est ancrée et sans `g` : elle ne décide que d'un morceau à la fois. */
const EST_TAG = /^#[\p{L}\p{N}_-]+$/u;
function CorpsAvecTags({ texte }) {
  return String(texte || "").split(TAG_ANNONCE).map((bout, i) => (
    EST_TAG.test(bout) ? <b key={i} className="annonce-tag">{bout}</b> : <span key={i}>{bout}</span>
  ));
}

/* Même découpe que dans `TetePost` : « Prénom Nom » → « PN ». Un nom en un seul mot ne doit
   pas produire « undefined » — d'où le second défaut. */
const initiales = (nom) => { const [p = "", n = ""] = String(nom || "Stagiaire").split(" "); return initials(p, n); };

/** En-tête d'auteur — même forme que sur une fiche : qui parle, avant ce qui est dit. */
function TetePost({ id, name, avatar, cadre, date, onOpen }) {
  const av = avatar ? parseAvatar(avatar) : null;
  const ouvrir = (e) => { e.stopPropagation(); if (id) onOpen(id); };
  return (
    <div className="post-head">
      <AvatarCadre avatar={av} initiales={initiales(name)} cadre={cadreValeur(cadre)} size={38}
        title={`Voir le profil${cadre && cadre.id !== "aucun" ? ` · cadre ${cadre.nom}` : ""}`} onClick={ouvrir} />
      <span className="post-who">
        <button className="post-name" onClick={ouvrir}>{name || "Stagiaire"}</button>
        <span className="post-date">{dateHeure(date)}</span>
      </span>
    </div>
  );
}

/**
 * Carte d'une question dans le fil.
 *
 * Deux repères la distinguent d'une fiche au premier coup d'œil : la pastille « Question »
 * (ou « Annonce ») et, quand une réponse a été retenue, un liseré vert avec « Résolue ». Ce
 * dernier compte autant que le reste : une question résolue ne demande plus d'aide, elle
 * en APPORTE — c'est elle qu'on veut relire.
 */
export function QuestionCard({ post, cadre, onOpen, onProfil }) {
  const annonce = post.kind === "ANNONCE";
  const resolue = !!post.resolved_answer_id;
  return (
    <div className={"comm-card2 q-card" + (resolue ? " resolue" : "") + (annonce ? " annonce" : "")}>
      <div className="comm-card2-body" onClick={() => onOpen(post.id)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(post.id); } }}>
        <TetePost id={post.author_user_id} name={post.author_name} avatar={post.author_avatar}
          cadre={cadre} date={post.created_at} onOpen={onProfil} />
        <span className={"comm-kind " + (annonce ? "k-annonce" : "k-question")}>
          <Icon name={annonce ? "bell" : "help"} size={12} /> {annonce ? "Annonce" : "Question"}
        </span>
        <div className="comm-title">{post.title}</div>
        {post.body && <p className="q-extrait">{post.body}</p>}
        {post.has_image > 0 && (
          <img className="q-vignette" src={postImageUrl(post.id)} alt="" loading="lazy" />
        )}
      </div>
      <div className="comm-foot">
        <span className="q-pied">
          <Icon name="message-circle" size={13} /> {post.answers || 0} réponse{post.answers > 1 ? "s" : ""}
        </span>
        {resolue && <span className="q-resolue"><Icon name="check-circle" size={13} /> Résolue</span>}
      </div>
    </div>
  );
}

/**
 * Une ANNONCE, dans le bandeau de l'école — pas une carte du fil.
 *
 * POURQUOI ELLE EN SORT. Une annonce n'est pas une publication de plus : elle vient de
 * l'école, elle s'adresse à tout le monde, et elle a une date de péremption (« la session de
 * mardi est décalée »). Mélangée aux fiches, elle se classait par « Populaires » ou par date
 * comme le reste, et une question très commentée pouvait la pousser hors du premier écran.
 * Elle vit donc dans son propre bandeau, en tête, avant les filtres — qui ne la concernent pas.
 *
 * La forme est volontairement LARGE et non une carte : une annonce se lit, elle ne se
 * parcourt pas du regard au milieu de vignettes.
 */
export function AnnonceCard({ post, peutEpingler, onOpen, onEpingler }) {
  return (
    <div className={"annonce-row" + (post.pinned ? " epinglee" : "")}>
      <span className="annonce-ic" aria-hidden="true"><Icon name={post.pinned ? "pin" : "bell"} size={15} /></span>
      <button className="annonce-corps" onClick={() => onOpen(post.id)}>
        <span className="annonce-t">
          {post.title}
          {post.pinned > 0 && <span className="annonce-pin-badge"><Icon name="pin" size={10} /> Épinglée</span>}
        </span>
        {post.body && <span className="annonce-x"><CorpsAvecTags texte={post.body} /></span>}
        <span className="annonce-meta">
          {post.author_name} · {dateHeure(post.created_at)}
          {post.answers > 0 && <> · <Icon name="message-circle" size={11} /> {post.answers} réponse{post.answers > 1 ? "s" : ""}</>}
        </span>
      </button>
      {/* LA PHOTO NE SE VOYAIT NULLE PART DANS LE FIL. Elle était bien envoyée (le formulaire la
          propose explicitement pour une annonce — « un plan, une affiche, une photo du lieu »),
          bien stockée, et bien affichée à l'OUVERTURE de l'annonce. Mais la ligne du bandeau
          n'en disait rien : relevé sur le fil réel, six annonces sur neuf portaient une photo et
          aucune ne le montrait. Une pièce jointe que rien n'annonce n'est pas consultée.

          UNE VIGNETTE CARRÉE, pas la grande image des cartes-questions. La forme large et
          textuelle de l'annonce est un choix assumé — « une annonce se lit, elle ne se parcourt
          pas du regard au milieu de vignettes » — et une image de 150 px de haut en pleine
          largeur la transformerait en carte. Un carré de 46 px suffit à dire qu'il y a quelque
          chose à voir, ce qui est tout ce qu'on lui demande.

          Cliquable comme le reste de la ligne, mais hors du parcours clavier : le bouton voisin
          ouvre déjà la même annonce et porte son intitulé. Deux arrêts de tabulation pour la
          même action n'ajouteraient que du bruit. */}
      {post.has_image > 0 && (
        <img className="annonce-vignette" src={postImageUrl(post.id)} alt="" aria-hidden="true"
          loading="lazy" onClick={() => onOpen(post.id)} />
      )}
      {/* L'épingle EXISTAIT côté serveur (createPost, updatePost) sans qu'aucun écran ne
          l'expose : on pouvait publier une annonce, jamais la faire remonter. */}
      {peutEpingler && (
        <button className={"iconbtn" + (post.pinned ? " on" : "")} onClick={() => onEpingler(post)}
          title={post.pinned ? "Ne plus épingler" : "Épingler en tête"}
          aria-label={post.pinned ? `Ne plus épingler « ${post.title} »` : `Épingler « ${post.title} » en tête`}>
          <Icon name="pin" size={14} fill={post.pinned ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

/**
 * Détail d'une question : l'énoncé, la photo, et le fil des réponses.
 *
 * L'auteur — et lui seul — peut marquer UNE réponse « ça m'a aidé ». Pas de vote collectif :
 * il classerait les gens, pas les réponses. Et c'est bien celui qui était bloqué qui sait ce
 * qui l'a débloqué.
 */
export function QuestionModal({ id, moi, cadreDe, onClose, onProfil, onChange }) {
  const [p, setP] = useState(null);
  const [reponse, setReponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  useEchap(onClose);

  const charger = () => getPost(id).then((r) => setP(r.data)).catch(() => setP(null));
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [id]);

  async function repondre() {
    const body = reponse.trim();
    if (!body) return;
    setBusy(true); setErreur(null);
    try { await addAnswer(id, body); setReponse(""); await charger(); onChange(); }
    catch (e) { setErreur(e.message); }
    finally { setBusy(false); }
  }
  async function retirer(aid) {
    try { await deleteAnswer(aid); await charger(); onChange(); }
    catch (e) { setErreur(e.message); }
  }
  async function marquer(aid) {
    // Retaper la réponse déjà retenue la DÉ-marque : se tromper de bouton ne doit pas être
    // définitif, et rien ne justifie d'obliger à supprimer la réponse pour corriger.
    const cible = p.resolved_answer_id === aid ? null : aid;
    try { await updatePost(id, { resolved_answer_id: cible }); await charger(); onChange(); }
    catch (e) { setErreur(e.message); }
  }
  async function supprimer() {
    if (!window.confirm("Supprimer cette publication et toutes ses réponses ?")) return;
    try { await deletePost(id); onChange(); onClose(); }
    catch (e) { setErreur(e.message); }
  }

  return createPortal(
    <div className="stu-app stu-app-nu">
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
          <div className="mhead">
            <h3 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span className={"comm-kind " + (p?.kind === "ANNONCE" ? "k-annonce" : "k-question")} style={{ flex: "none" }}>
                <Icon name={p?.kind === "ANNONCE" ? "bell" : "help"} size={12} /> {p?.kind === "ANNONCE" ? "Annonce" : "Question"}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.title || "Chargement…"}</span>
            </h3>
            <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
          </div>
          {!p ? (
            <div className="mbody"><p className="hint" style={{ margin: 0 }}>Chargement…</p></div>
          ) : (
            <div className="mbody">
              <TetePost id={p.author_user_id} name={p.author_name} avatar={p.author_avatar}
                cadre={cadreDe(p.author_user_id, p.author_done, p.author_cadre, p.author_cadres_ex)}
                date={p.created_at} onOpen={onProfil} />
              {p.body && (
                <p className="q-corps">
                  {/* Même texte que dans le bandeau : si le tag y ressort et pas ici, on croit
                      avoir affaire à deux contenus différents. */}
                  {p.kind === "ANNONCE" ? <CorpsAvecTags texte={p.body} /> : p.body}
                </p>
              )}
              {p.has_image > 0 && <img className="q-photo" src={postImageUrl(p.id)} alt="Photo jointe à la publication" />}
              {erreur && <div className="status err">{erreur}</div>}

              <div className="q-reponses">
                <div className="q-reponses-t">
                  <Icon name="message-circle" size={14} /> {p.answers.length} réponse{p.answers.length > 1 ? "s" : ""}
                </div>
                {p.answers.length === 0 && <p className="hint" style={{ margin: 0 }}>Personne n'a encore répondu. Si tu sais, dis-le.</p>}
                {p.answers.map((a) => {
                  const retenue = p.resolved_answer_id === a.id;
                  return (
                    <div key={a.id} className={"q-reponse" + (retenue ? " retenue" : "")}>
                      {/* Le VISAGE de qui répond. La conversation n'avait que des noms, alors
                          que la publication au-dessus porte un avatar et son cadre : on ne
                          voyait pas qui répond, or c'est là que se joue l'entraide — et une
                          réponse de Maestro ne se lit pas comme celle d'un Bronze. */}
                      <AvatarCadre avatar={a.author_avatar ? parseAvatar(a.author_avatar) : null}
                        initiales={initiales(a.author_name)}
                        cadre={cadreValeur(cadreDe(a.user_id, a.author_done, a.author_cadre, a.author_cadres_ex))}
                        size={30} title={a.author_name}
                        onClick={a.user_id ? () => onProfil(a.user_id) : undefined} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12 }}><b>{a.author_name}</b> <span className="hint">· {dateHeure(a.created_at)}</span></span>
                        {retenue && <span className="q-badge-aide"><Icon name="check-circle" size={11} /> Ça m'a aidé</span>}
                        <span style={{ display: "block", fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2 }}>{a.body}</span>
                      </div>
                      <span style={{ display: "flex", gap: 2, flex: "none" }}>
                        {p.mine && (
                          <button className={"iconbtn" + (retenue ? " on" : "")} onClick={() => marquer(a.id)}
                            title={retenue ? "Ne plus retenir cette réponse" : "Marquer « ça m'a aidé »"}
                            aria-label={retenue ? "Ne plus retenir cette réponse" : "Marquer cette réponse comme celle qui a aidé"}>
                            <Icon name="check-circle" size={14} fill={retenue ? "currentColor" : "none"} />
                          </button>
                        )}
                        {(a.mine || p.mine || p.can_moderate) && (
                          <button className="iconbtn del" onClick={() => retirer(a.id)}
                            title={a.mine || p.mine ? "Supprimer" : "Supprimer (modération)"} aria-label="Supprimer la réponse">
                            <Icon name="trash" size={13} />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
                <textarea className="inp" rows={3} value={reponse} onChange={(e) => setReponse(e.target.value)}
                  placeholder="Ta réponse — ce qui a marché chez toi vaut mieux qu'une règle générale." style={{ marginTop: 10, width: "100%" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                  <button className="btn sm primary" disabled={busy || !reponse.trim()} onClick={repondre}>
                    <Icon name="send" size={13} /> Répondre
                  </button>
                  {/* MODÉRATION. Le serveur autorise depuis toujours le bureau à supprimer la
                      publication d'un autre — mais le bouton n'apparaissait que sur `mine` :
                      personne n'a jamais pu modérer quoi que ce soit depuis un écran. Le droit
                      vient maintenant du serveur (`can_moderate`), qui tient compte de la
                      capacité accordée dans Équipe & accès, et pas seulement du rôle. */}
                  {(p.mine || moi === p.author_user_id || p.can_moderate) && (
                    <button className="btn sm ghost danger" onClick={supprimer} style={{ marginLeft: "auto" }}>
                      <Icon name="trash" size={13} /> Supprimer {p.mine ? "la publication" : "(modération)"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Formulaire « Poser une question ».
 *
 * La photo est facultative mais mise en avant : c'est un métier manuel, et on y partage
 * aujourd'hui des chiffres sans jamais montrer le résultat. Une croûte trop pâle se voit ;
 * elle ne se décrit pas.
 *
 * La publication est créée D'ABORD, la photo envoyée ENSUITE : elle a besoin de l'identifiant
 * du billet. Si l'envoi de la photo échoue, la question existe quand même — on le dit, plutôt
 * que de perdre un texte que la personne vient d'écrire.
 */
export function QuestionForm({ onClose, onCreated, peutAnnoncer, kindInitial = "QUESTION" }) {
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  // `kindInitial` : « Créer une annonce » ouvre DÉJÀ du bon côté. Faire cliquer sur le bouton
  // puis sur l'onglet pour la même intention, c'est demander deux fois la même chose.
  const [kind, setKind] = useState(kindInitial);
  const [epingler, setEpingler] = useState(false);
  const [photo, setPhoto] = useState(null);     // Blob réduit, prêt à l'envoi
  const [apercu, setApercu] = useState(null);   // URL objet, pour l'aperçu
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const fichierRef = useRef(null);
  const appareilRef = useRef(null);
  const [appareilOuvert, setAppareilOuvert] = useState(false);
  /* DEUX CHEMINS pour « prendre une photo », et le premier couvre tout le monde.
     · `getUserMedia` — aperçu en direct dans la page, sur ordinateur COMME sur téléphone. Exige
       un contexte sécurisé (HTTPS ou localhost) ; sinon `navigator.mediaDevices` n'existe pas.
     · à défaut, l'`<input capture>` : l'appareil photo natif du téléphone. Sur ordinateur il est
       purement IGNORÉ et rouvrirait le sélecteur de fichiers — un bouton qui ment sur ce qu'il
       fait — d'où la condition sur le pointeur pour ce repli-là seulement.
     Le premier essai n'offrait QUE le repli : le bouton disparaissait donc sur poste fixe, alors
     qu'un formateur devant son écran a une webcam et veut s'en servir. */
  const [camera] = useState(() => (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
    ? "flux"
    : (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "capture" : null)));
  const annonce = kind === "ANNONCE";
  useEchap(onClose);

  // Libère l'URL d'aperçu : sans ça, chaque photo choisie laisse un blob en mémoire.
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  const choisirPhoto = (e) => accepterPhoto(e.target.files?.[0]);

  /* Un seul chemin pour les TROIS origines — fichier choisi, appareil natif, capture en direct.
     C'est ce qui garantit que le cliché passe par `reduireImage` : une photo de webcam ou de
     téléphone pèse plusieurs mégaoctets et serait refusée par le serveur telle quelle. */
  async function accepterPhoto(f) {
    if (!f) return;
    setErreur(null);
    try {
      const blob = await reduireImage(f);
      if (apercu) URL.revokeObjectURL(apercu);
      setPhoto(blob);
      setApercu(URL.createObjectURL(blob));
    } catch (err) { setErreur(err.message); }
  }

  async function publier() {
    const t = titre.trim();
    if (!t) return;
    setBusy(true); setErreur(null);
    try {
      const r = await createPost({ title: t, body: corps.trim(), kind, pinned: annonce && epingler });
      if (photo) {
        try { await uploadPostImage(r.data.id, photo); }
        catch (e) { setErreur(`${annonce ? "Annonce" : "Question"} publiée, mais la photo n'est pas passée : ${e.message}`); }
      }
      onCreated();
      if (!photo) onClose();
    } catch (e) { setErreur(e.message); }
    finally { setBusy(false); }
  }

  return createPortal(
    <div className="stu-app stu-app-nu">
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
          <div className="mhead">
            <h3 style={{ fontSize: 16 }}>{annonce ? "Publier une annonce de l'école" : "Poser une question"}</h3>
            <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
          </div>
          <div className="mbody">
            {peutAnnoncer && (
              <span className="seg" style={{ marginBottom: 12 }}>
                <button className={"seg-btn" + (kind === "QUESTION" ? " on" : "")} onClick={() => setKind("QUESTION")}>Question</button>
                <button className={"seg-btn" + (annonce ? " on" : "")} onClick={() => setKind("ANNONCE")}>Annonce de l'école</button>
              </span>
            )}
            <div className="field">
              {/* Une annonce n'est pas une question : elle ne se formule pas de la même façon,
                  et le vouvoiement change de sens quand c'est l'école qui parle. */}
              <label htmlFor="q-titre">{annonce ? "L'annonce, en une phrase" : "Ta question, en une phrase"}</label>
              <input id="q-titre" className="inp" value={titre} maxLength={200} onChange={(e) => setTitre(e.target.value)}
                placeholder={annonce
                  ? "Ex. : la session du 12 mars est décalée au 19"
                  : "Ex. : ma pâte colle au façonnage, qu'est-ce que je rate ?"} />
            </div>
            <div className="field">
              <label htmlFor="q-corps">Le détail (facultatif)</label>
              <textarea id="q-corps" className="inp" rows={4} value={corps} onChange={(e) => setCorps(e.target.value)}
                placeholder={annonce
                  ? "Ce qui change, à partir de quand, et ce que les stagiaires ont à faire."
                  : "Farine, hydratation, temps de pointage, température… Plus tu en dis, mieux on te répond."} />
            </div>
            {annonce && (
              <div className="field">
                {/* Épingler tient l'annonce en tête du bandeau. Réservé aux vraies urgences :
                    trois annonces épinglées, c'est plus aucune qui l'est. */}
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 14 }}>
                  <input type="checkbox" checked={epingler} onChange={(e) => setEpingler(e.target.checked)} />
                  <Icon name="pin" size={14} /> Épingler en tête du bandeau
                </label>
                <p className="hint" style={{ marginTop: 4 }}>
                  Une annonce épinglée passe devant les autres, quel que soit son âge. À garder
                  pour ce qui doit être vu tout de suite.
                </p>
              </div>
            )}
            <div className="field">
              <label>Une photo (facultatif)</label>
              <p className="hint" style={{ marginTop: 0 }}>
                {annonce
                  ? "Un plan, une affiche, une photo du lieu — ce qui évite d'avoir à le décrire."
                  : "C'est un métier qui se voit. Une croûte trop pâle ou une alvéole serrée se montrent mieux qu'elles ne se décrivent."}
              </p>
              {apercu && <img className="q-photo" src={apercu} alt="Aperçu de la photo choisie" />}
              <input ref={fichierRef} type="file" accept="image/*" hidden onChange={choisirPhoto} />
              {/* Deux entrées SÉPARÉES, et non un attribut qu'on bascule : poser `capture` puis
                  le retirer sur le même `<input>` laisse certains navigateurs sur leur première
                  décision. Deux éléments, deux comportements, aucun état à synchroniser.
                  `environment` = la caméra ARRIÈRE : on photographie une pâte, pas son visage. */}
              <input ref={appareilRef} type="file" accept="image/*" capture="environment" hidden onChange={choisirPhoto} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button className="btn sm ghost" onClick={() => fichierRef.current?.click()}>
                  <Icon name="image" size={14} /> {photo ? "Changer la photo" : "Choisir une photo"}
                </button>
                {camera && (
                  <button className="btn sm ghost"
                    onClick={() => (camera === "flux" ? setAppareilOuvert(true) : appareilRef.current?.click())}>
                    <Icon name="camera" size={14} /> Prendre une photo
                  </button>
                )}
                {/* La limite, ANNONCÉE — mais sans laisser croire qu'il faut la respecter soi-même :
                    toute photo est réduite avant l'envoi (une photo de téléphone pèse 3 à 8 Mo et
                    passe très bien). Dire « 550 Ko maximum » tout court aurait fait renoncer des
                    gens dont la photo serait passée sans problème.
                    Une fois choisie, on montre son poids RÉEL : c'est la seule façon de savoir
                    que la réduction a bien eu lieu, et ce que pèse vraiment ce qu'on publie. */}
                <span className="hint" style={{ margin: 0 }}>
                  {photo
                    ? <>Réduite à <b>{Math.round(photo.size / 1024)} Ko</b> · maximum {PHOTO_MAX_KO} Ko</>
                    : <>Réduite automatiquement · {PHOTO_MAX_KO} Ko et {PHOTO_MAX_PX} px maximum</>}
                </span>
              </div>
            </div>
            {erreur && <div className="status err">{erreur}</div>}
            {appareilOuvert && (
              <PriseDePhoto onClose={() => setAppareilOuvert(false)}
                onPhoto={(f) => { setAppareilOuvert(false); accepterPhoto(f); }} />
            )}
          </div>
          <div className="mfoot">
            <button className="btn ghost" onClick={onClose}>Annuler</button>
            <button className="btn primary" disabled={busy || !titre.trim()} onClick={publier}>
              <Icon name="send" size={14} /> Publier
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
