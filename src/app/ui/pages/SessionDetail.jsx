import { useContext, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { getSession, getStagiaires, createEnrollment, deleteEnrollment, deleteSession, getAssignableTrainers, setSessionTrainers, getLocations, updateSession, getCompanies, getCompany, registerCompanyStagiaires } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import { peutEcrire } from "../lib/nav.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Squelette } from "../components/Squelette.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Emargement from "../components/Emargement.jsx";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import SessionIntervenants from "../components/SessionIntervenants.jsx";
import SessionRetraits from "../components/SessionRetraits.jsx";
import SessionConsentements from "../components/SessionConsentements.jsx";
import CommissionJury from "../components/CommissionJury.jsx";
import DocumentsExternes from "../components/DocumentsExternes.jsx";
import NotesModal from "../components/NotesModal.jsx";
import { colorOf, initials, dateHeure } from "../lib/format.js";
import ProgressPct from "../components/ProgressPct.jsx";
import { lienDossier } from "../lib/lienDossier.js";

function SessionDetail() {
  const { id } = useParams();
  /* `?emargement=<feuille>` : posé par l'alerte « Émargement à signer ». Sans lui, le lien menait
     en haut d'une page dont l'émargement est la DERNIÈRE carte, sous les inscrits, les formateurs
     et les intervenants — on ouvrait l'alerte, et il fallait encore chercher quoi signer. */
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  /* Modifier la session — ce que le serveur accepte sur /sessions, pas une liste de rôles : un
     formateur à qui l'organisme a accordé Sessions en modification y écrit (cf. peutEcrire). */
  const peutModifier = peutEcrire(user, "/sessions");
  const [session, setSession] = useState(null);
  const [allLearners, setAllLearners] = useState([]);
  const [team, setTeam] = useState([]);
  const [locations, setLocations] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);
  const [notesFor, setNotesFor] = useState(null);
  // Inscription : « individuel » (recherche nominative) ou « entreprise » (on choisit
  // l'entreprise, puis les stagiaires parmi les SIENS). Deux façons de peupler la même session.
  const [mode, setMode] = useState("individuel");
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [companyLearners, setCompanyLearners] = useState(null); // null = pas encore chargé
  const [picked, setPicked] = useState(() => new Set());
  const [registering, setRegistering] = useState(false);

  async function load() {
    try {
      const r = await getSession(id);
      setSession(r.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }
  useAutoRefresh(load, { interval: 20000 });

  useEffect(() => {
    load();
    getStagiaires().then((r) => setAllLearners(r.data)).catch(() => {});
    getAssignableTrainers().then((r) => setTeam(r.data)).catch(() => {});
    getLocations().then((r) => setLocations(r.data || [])).catch(() => {});
    getCompanies().then((r) => setCompanies(r.data || [])).catch(() => {});
  }, [id]);

  // Stagiaires de l'entreprise choisie. Chargés à la demande : la liste des entreprises ne
  // porte qu'un COMPTE (learner_count), pas les stagiaires eux-mêmes.
  useEffect(() => {
    if (!companyId) { setCompanyLearners(null); setPicked(new Set()); return; }
    let vivant = true;
    setCompanyLearners(null);
    setPicked(new Set());
    getCompany(companyId)
      .then((r) => { if (vivant) setCompanyLearners(r.data?.learners || []); })
      .catch((e) => { if (vivant) { setCompanyLearners([]); setStatus({ type: "error", message: e.message }); } });
    return () => { vivant = false; };
  }, [companyId]);

  async function changeLocation(location_id) {
    setSession((s) => ({ ...s, location_id }));
    try { await updateSession(id, { location_id: location_id || null }); }
    catch (err) { setStatus({ type: "error", message: err.message }); load(); }
  }

  async function toggleTrainer(uid) {
    const current = (session.trainers || []).map((t) => t.id);
    const next = current.includes(uid) ? current.filter((x) => x !== uid) : [...current, uid];
    try { await setSessionTrainers(id, next); load(); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  // Stagiaires pas encore inscrits à cette session.
  const available = useMemo(() => {
    if (!session) return [];
    const enrolled = new Set((session.enrollments || []).map((e) => e.learner_id));
    return allLearners.filter((l) => !enrolled.has(l.id));
  }, [session, allLearners]);

  // Filtre par la recherche (nom, prénom, email). La liste ne se déploie QUE si
  // quelque chose est saisi (sinon rien affiché, pour ne pas dérouler tout le fichier).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return available
      .filter((l) => `${l.first_name} ${l.last_name} ${l.email || ""}`.toLowerCase().includes(q))
      .slice(0, 10);
  }, [available, query]);

  /* LE COMPTE NAÎT À L'INSCRIPTION (et non plus à la création de la fiche) : l'écran dit donc ici
     qu'il vient d'être créé. Le mot de passe n'arrive que si les identifiants n'ont PAS pu partir
     par e-mail — c'est alors la seule occasion de le connaître. */
  const messageCompte = (compte, nom) => {
    if (!compte) return "";
    const qui = nom ? ` de ${nom}` : "";
    return compte.envoye
      ? ` Compte de connexion${qui} créé, identifiants envoyés à ${compte.email}.`
      : ` Compte de connexion${qui} créé, mot de passe : ${compte.password} (notez-le, il ne sera plus affiché).`;
  };

  async function addStagiaire(learnerId) {
    setStatus(null);
    try {
      const r = await createEnrollment({ learner_id: learnerId, session_id: id, crm_stage: "INSCRIT" });
      setStatus({ type: "success", message: `Stagiaire inscrit.${messageCompte(r?.compte)}` });
      load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Qui est déjà dans la session ? Sert à barrer les stagiaires déjà inscrits plutôt qu'à les
  // masquer : les voir grisés dit « c'est déjà fait », alors que les cacher laisse croire que
  // l'entreprise n'a que trois salariés.
  const dejaInscrits = useMemo(
    () => new Set((session?.enrollments || []).map((e) => e.learner_id)),
    [session]
  );
  const inscriptibles = useMemo(
    () => (companyLearners || []).filter((l) => !dejaInscrits.has(l.id)),
    [companyLearners, dejaInscrits]
  );
  const nomEntreprise = useMemo(
    () => companies.find((c) => c.id === companyId)?.name || "",
    [companies, companyId]
  );

  /* Seules les entreprises AYANT au moins un stagiaire rattaché sont proposées.
   *
   * Sur les données réelles, le fichier compte environ quatre cents entreprises dont cinq
   * seulement ont un stagiaire : dérouler les quatre cents, c'est faire défiler une page entière
   * d'impasses pour trouver les rares lignes utiles. Et une entreprise sans stagiaire ne PEUT
   * rien apporter à cette session — la choisir ne mènerait qu'à un panneau vide.
   * Le compte des autres est affiché quand même : masquer sans le dire ferait croire à un bug
   * (« mon entreprise n'est pas dans la liste »). */
  const entreprisesAvecStagiaires = useMemo(
    () => companies.filter((c) => Number(c.learner_count) > 0),
    [companies]
  );
  const nbSansStagiaire = companies.length - entreprisesAvecStagiaires.length;

  function bascule(learnerId) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(learnerId)) n.delete(learnerId); else n.add(learnerId);
      return n;
    });
  }
  const tousCoches = inscriptibles.length > 0 && inscriptibles.every((l) => picked.has(l.id));
  function toutBasculer() {
    setPicked(tousCoches ? new Set() : new Set(inscriptibles.map((l) => l.id)));
  }

  async function inscrireDepuisEntreprise() {
    const ids = [...picked];
    if (!ids.length) return;
    setRegistering(true); setStatus(null);
    try {
      // Même route que la fiche entreprise : elle pose `company_id` et le financement
      // PROFESSIONNEL sur l'inscription, ce qu'une inscription individuelle ne fait pas — c'est
      // ce rattachement qui regroupe ensuite les stagiaires sous leur entreprise, ici et sur les
      // documents de groupe.
      const r = await registerCompanyStagiaires(companyId, { session_id: id, learner_ids: ids });
      const n = (r.data?.created || []).filter((c) => c.enrolled).length;
      const comptes = (r.data?.created || []).filter((c) => c.identifiants_envoyes !== null && c.identifiants_envoyes !== undefined);
      setStatus({
        type: "success",
        message: (n
          ? `${n} stagiaire${n > 1 ? "s" : ""} inscrit${n > 1 ? "s" : ""} pour ${nomEntreprise || "l'entreprise"}.`
          : "Aucun nouveau stagiaire à inscrire (déjà inscrits).")
          + comptes.map((c) => messageCompte({ email: c.email, envoye: c.identifiants_envoyes, password: c.password }, c.name)).join(""),
      });
      setPicked(new Set());
      load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setRegistering(false);
    }
  }

  async function removeStagiaire(enrollmentId) {
    setStatus(null);
    try {
      await deleteEnrollment(enrollmentId);
      load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function removeSession() {
    const n = session?.enrollments?.length || 0;
    const msg = n > 0
      ? `Supprimer cette session ? ${n} inscription(s) seront également retirées.`
      : "Supprimer cette session ?";
    if (!window.confirm(msg)) return;
    try {
      await deleteSession(id);
      navigate("/sessions");
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  if (!session) {
    // Même défaut que la fiche stagiaire : page blanche sous le titre, sans distinction entre
    // « ça charge », « c'est vide » et « ça a échoué ».
    return (
      <>
        <PageHead eyebrow="Session" title="Session" />
        <StatusMessage status={status} />
        {!status && <Squelette lignes={3} h={96} />}
      </>
    );
  }

  const enrollments = session.enrollments || [];

  return (
    <>
      <PageHead
        eyebrow={<Link to="/sessions" className="card-more" style={{ WebkitTextFillColor: "var(--ember1)" }}>← Retour au calendrier</Link>}
        title={session.program_title}
        lead={`Semaine ${session.week} · ${session.year} · du ${dateHeure(session.start_date)} au ${dateHeure(session.end_date)} · ${session.program_hours} h`}
        actions={
          <>
            <span className="badge n" style={{ background: colorOf(session.program_code), color: "#fff", borderColor: "transparent" }}>
              {session.program_code}
            </span>
            <button className="btn danger" onClick={removeSession}>Supprimer la session</button>
          </>
        }
      />
      <StatusMessage status={status} />

      {locations.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 16px", flexWrap: "wrap" }}>
          <span className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="map" size={13} /> Lieu de formation :</span>
          <select className="inp" style={{ maxWidth: 320 }} value={session.location_id || ""} onChange={(e) => changeLocation(e.target.value)}>
            <option value="">Aucun / à définir</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.town ? `, ${l.town}` : ""}</option>)}
          </select>
        </div>
      )}

      <div className="grid cols-2">
        <Card title="Inscrire des stagiaires">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "individuel"}
              className={"tab" + (mode === "individuel" ? " on" : "")}
              onClick={() => setMode("individuel")}>
              Un stagiaire
            </button>
            <button type="button" role="tab" aria-selected={mode === "entreprise"}
              className={"tab" + (mode === "entreprise" ? " on" : "")}
              onClick={() => setMode("entreprise")}>
              Via une entreprise
            </button>
          </div>

          {mode === "entreprise" ? (
            <>
              <select className="inp" style={{ marginBottom: 8 }} aria-label="Entreprise"
                value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">Choisir une entreprise</option>
                {entreprisesAvecStagiaires.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.learner_count})</option>
                ))}
              </select>

              {!companyId ? (
                <p className="hint" style={{ margin: 0 }}>
                  {entreprisesAvecStagiaires.length === 0 ? (
                    <>Aucune entreprise n'a de stagiaire rattaché.{" "}
                      <Link to="/entreprises" className="card-more">Rattacher des stagiaires →</Link></>
                  ) : (
                    <>Choisissez une entreprise pour voir ses stagiaires.
                      {nbSansStagiaire > 0 && (
                        <> {nbSansStagiaire} entreprise{nbSansStagiaire > 1 ? "s" : ""} sans stagiaire rattaché
                          {nbSansStagiaire > 1 ? " ne sont pas listées" : " n'est pas listée"}.</>
                      )}
                    </>
                  )}
                </p>
              ) : companyLearners === null ? (
                <Squelette lignes={3} h={38} />
              ) : companyLearners.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  Cette entreprise n'a aucun stagiaire rattaché.{" "}
                  <Link to={`/entreprises/${companyId}`} className="card-more">Ouvrir sa fiche →</Link>
                </p>
              ) : inscriptibles.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  Tous les stagiaires de {nomEntreprise} sont déjà inscrits à cette session.
                </p>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={tousCoches} onChange={toutBasculer} />
                      Tout sélectionner
                    </label>
                    <span className="hint">{picked.size} sélectionné{picked.size > 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
                    {companyLearners.map((l) => {
                      const dedans = dejaInscrits.has(l.id);
                      return (
                        <label key={l.id}
                          title={dedans ? "Déjà inscrit à cette session" : undefined}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
                            borderBottom: "1px solid var(--border-soft)",
                            cursor: dedans ? "default" : "pointer", opacity: dedans ? 0.5 : 1,
                          }}>
                          <input type="checkbox" disabled={dedans}
                            checked={dedans || picked.has(l.id)}
                            onChange={() => bascule(l.id)} />
                          <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                            {initials(l.first_name, l.last_name)}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b>{l.last_name} {l.first_name}</b>
                            <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email || "-"}</span>
                          </span>
                          {dedans && <Badge tone="ok">Déjà inscrit</Badge>}
                        </label>
                      );
                    })}
                  </div>
                  <button type="button" className="btn primary" style={{ marginTop: 12 }}
                    disabled={picked.size === 0 || registering}
                    onClick={inscrireDepuisEntreprise}>
                    {registering ? "Inscription…" : `Inscrire ${picked.size || ""} stagiaire${picked.size > 1 ? "s" : ""}`.trim()}
                  </button>
                </>
              )}
            </>
          ) : (
          <>
          <input
            className="inp"
            placeholder="Rechercher un stagiaire (nom, prénom ou email)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          {matches.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>
              {available.length === 0
                ? "Tous les stagiaires sont déjà inscrits."
                : !query.trim()
                  ? "Tapez un nom, prénom ou email pour rechercher un stagiaire à inscrire."
                  : "Aucun stagiaire ne correspond."}{" "}
              <Link to="/stagiaires" className="card-more">Créer un stagiaire →</Link>
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {matches.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(l.first_name, l.last_name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.last_name} {l.first_name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email || "-"}</span>
                  </span>
                  <button type="button" className="btn sm primary" onClick={() => addStagiaire(l.id)}>＋ Ajouter</button>
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </Card>

        <Card title={`Stagiaires inscrits (${enrollments.length})`}>
          {enrollments.length === 0 ? (
            <EmptyState icon="users">Aucun stagiaire inscrit.</EmptyState>
          ) : (() => {
            // Regroupe les stagiaires envoyés par une entreprise sous le nom de l'entreprise ;
            // les stagiaires individuels (sans entreprise) restent listés à plat en dessous.
            const enrollRow = (e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <span className="avatar">{initials(e.first_name, e.last_name)}</span>
                {/* `minWidth: 0` : sans lui, un bouton flexible ne rétrécit jamais sous la largeur
                    de son contenu, et un e-mail est un seul mot. Sur téléphone, la ligne poussait
                    alors « Notes de suivi » et « Retirer de la session » hors de l'écran. Le nom
                    passe à la ligne ; l'e-mail, lui, se termine en « … ». */}
                <button
                  type="button"
                  /* La fiche s'ouvre sur le dossier de CETTE session, pas sur le premier du
                     stagiaire (lib/lienDossier.js) : il a pu en suivre une autre avant. */
                  onClick={() => navigate(lienDossier(e.learner_id, e.id))}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  title="Voir la fiche du stagiaire"
                >
                  <b style={{ display: "block", color: "var(--text)", overflowWrap: "anywhere" }}>{e.last_name} {e.first_name}</b>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.email || "-"}</span>
                </button>
                {/* Même remplacement qu'au tableau de bord : `conformite_score` n'est jamais
                    recalculé, il affichait « ROUGE » pour tout le monde. */}
                <ProgressPct percent={e.percent} score={e.score} width={78} />
                <button className="iconbtn" title="Notes de suivi" onClick={() => setNotesFor({ id: e.id, name: `${e.last_name} ${e.first_name}` })}><Icon name="pencil" size={15} /></button>
                <button className="iconbtn del" title="Retirer de la session" onClick={() => removeStagiaire(e.id)}><Icon name="trash" size={15} /></button>
              </div>
            );
            const companies = new Map();
            const solo = [];
            for (const e of enrollments) {
              if (e.company_id) {
                if (!companies.has(e.company_id)) companies.set(e.company_id, { name: e.company_name, list: [] });
                companies.get(e.company_id).list.push(e);
              } else solo.push(e);
            }
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...companies.entries()].map(([cid, g]) => (
                  <div key={cid} className="sess-comp">
                    <div className="sess-comp-hd"><Icon name="building" size={14} /> {g.name || "Entreprise"} <span className="arch-count">{g.list.length}</span></div>
                    {g.list.map(enrollRow)}
                  </div>
                ))}
                {solo.length > 0 && companies.size > 0 && (
                  <div className="sess-comp-hd" style={{ marginTop: 4 }}><Icon name="user" size={14} /> Individuels <span className="arch-count">{solo.length}</span></div>
                )}
                {solo.map(enrollRow)}
              </div>
            );
          })()}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title={`Formateurs (${(session.trainers || []).length})`}>
          {peutModifier ? (
            team.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Aucun membre d'équipe. Ajoutez des formateurs depuis Équipe & accès.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {team.map((t) => {
                  const on = (session.trainers || []).some((x) => x.id === t.id);
                  return (
                    <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, border: "1px solid var(--border-soft)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", background: on ? "var(--surface2)" : "transparent" }}>
                      <input type="checkbox" checked={on} onChange={() => toggleTrainer(t.id)} />
                      {t.first_name} {t.last_name}
                    </label>
                  );
                })}
              </div>
            )
          ) : (session.trainers || []).length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Aucun formateur affecté.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {session.trainers.map((t) => <Badge key={t.id} tone="b">{t.first_name} {t.last_name}</Badge>)}
            </div>
          )}
        </Card>
      </div>

      {/* UN CONTENEUR EN COLONNE AVEC UN `gap`, ET NON UNE SIMPLE MARGE HAUTE.
          Ces trois composants partageaient un seul `<div style={{ marginTop: 16 }}>` : la marge
          s'appliquait donc AVANT LE GROUPE, et les cartes à l'intérieur se touchaient — mesuré à
          0 px entre « Transmission aux partenaires » et « Intervenants externes ».
          Le défaut était latent avant l'ajout de la carte de transmission : `SessionRetraits` rend
          `null` quand aucun retrait n'est réservé, si bien qu'il n'y avait le plus souvent qu'une
          seule carte dans ce conteneur et que rien ne pouvait se coller.
          Un enfant qui rend `null` ne crée aucun espace fantôme : le `gap` n'agit qu'entre les
          éléments réellement rendus. */}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* SUR LA PAGE DE LA SESSION, et pas dans un écran RGPD à part : l'organisme envoie ses
            listes SESSION PAR SESSION, et c'est ici qu'il vient au moment de le faire. Une page
            de conformité rangée ailleurs ne s'ouvre que quand on la cherche — donc jamais au
            moment où la question se pose vraiment.
            Réservé à qui peut MODIFIER la session : savoir qui a refusé de céder ses coordonnées
            n'aide en rien à enseigner. Un formateur n'y accède que si l'organisme lui a accordé
            Sessions en modification — c'est alors ce que le serveur lui accorde aussi.

            LES DEUX CÔTE À CÔTE, MOITIÉ-MOITIÉ (2026-09-22). C'est deux fois la MÊME question —
            qui a répondu, qui n'a rien dit — posée sur deux sujets, avec la même liste de noms
            en dessous. Empilées, elles répétaient l'exercice sur toute la hauteur de l'écran et
            repoussaient les retraits et les intervenants hors de vue ; côte à côte, on lit d'un
            coup d'œil qui manque à l'appel des deux côtés.
            `grid cols-2` ET NON DEUX LARGEURS À 50 % : la grille retombe d'elle-même sur une
            colonne quand l'écran se resserre. À 50 % en dur, deux colonnes de noms tiendraient
            encore sur un téléphone, chacune réduite à trois lettres.
            LA CONDITION EST PORTÉE PAR LE CONTENEUR, plus par chaque carte : une grille vide
            reste un enfant du conteneur au-dessus et lui prendrait un `gap` de 16 px pour rien —
            un blanc sans raison au milieu de la page, pour qui ne peut pas modifier la session. */}
        {peutModifier && (
          <div className="grid cols-2">
            <SessionConsentements sessionId={id} canEdit={peutModifier} />
            {/* LE DROIT À L'IMAGE, MÊME CARTE, MÊMES RÈGLES (2026-09-22) : qui a répondu, et la
                saisie d'une réponse donnée sur papier. Sa réponse s'imprime sur le document
                « Droit à l'image ». */}
            <SessionConsentements sessionId={id} canEdit={peutModifier} finalite="droit_image" />
          </div>
        )}
        <SessionRetraits startDate={session.start_date} endDate={session.end_date} />
        <SessionIntervenants sessionId={id} startDate={session.start_date} endDate={session.end_date} canEdit={peutModifier} />
      </div>

      {/* LA SAISIE DES NOTES A ÉTÉ RETIRÉE D'ICI — elle vit dans Notation → Note. Elle
          voisinait l'inscription, les consentements, les formateurs, les intervenants,
          l'émargement et le procès-verbal : six cartes empilées dont une seule intéressait le
          formateur venu noter. La session redevient ce qu'elle est — qui vient, quand, et avec
          quels documents. */}

      {/* LE PROCÈS-VERBAL DE LA COMMISSION, replié par défaut : la plupart des sessions n'en
          ont pas, et un formulaire de dix champs ouvert sur chaque session noierait le reste
          de la page. Il s'ouvre d'un clic, et se résume en une ligne quand il existe. */}
      {peutModifier && (
        <div style={{ marginTop: 16 }}>
          <CommissionJury sessionId={id} />
          <DocumentsExternes sessionId={id} onStatus={setStatus} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Emargement sessionId={id} feuilleVisee={params.get("emargement")} />
      </div>

      {notesFor && (
        <NotesModal enrollmentId={notesFor.id} name={notesFor.name} onClose={() => setNotesFor(null)} />
      )}
    </>
  );
}

export default SessionDetail;
