import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Squelette } from "../components/Squelette.jsx";
import { Icon } from "../components/Icon.jsx";
import { dateHeure } from "../lib/format.js";
import { auditLabel, entityLabel } from "../lib/auditLabels.js";
import { PAGE_TITLES, aLaCapacite, OWNER_ROLES } from "../lib/nav.js";
import { UserContext } from "../context/UserContext.jsx";

const TONE = { SIGNATURE: "g", PAIEMENT: "a", RELANCE: "r", QUALIOPI: "b", BOUTIQUE: "b", INFO: "n", SYSTEME: "n" };

/**
 * Une ligne d'ACTIVITÉ n'arrive pas rédigée : le serveur envoie le code brut du journal
 * (`learner.create` + `Learner`) et la traduction se fait ICI, avec le dictionnaire qui sert
 * déjà au journal d'audit et au tableau de bord. C'est la règle posée dans `auditLabels.js` :
 * la base garde le code stable, l'interface l'écrit en français. Une seconde table côté serveur
 * aurait divergé — c'est exactement ce qui était arrivé au tableau de bord.
 *
 * L'ÉTIQUETTE PORTE LA RUBRIQUE, pas l'entité. Mettre l'entité redisait le libellé mot pour
 * mot — « Dépense » suivi de « Dépense supprimée », « Publication » suivi de « Publication
 * supprimée » : deux fois la même information, aucune ajoutée. La rubrique, elle, répond à une
 * question que le libellé ne traite pas — OÙ ça s'est passé — et c'est justement là que mène le
 * lien de la ligne. Reste l'entité en repli, pour une rubrique qu'on ne saurait pas nommer.
 *
 * Au total la ligne dit : QUOI (le libellé), QUI (le corps), OÙ (l'étiquette), QUAND (la date).
 */
function ligneLisible(n) {
  if (n.type !== "ACTIVITE") {
    return { titre: n.title, corps: n.body, ton: TONE[n.type] || "n", etiquette: n.type };
  }
  const { label, tone } = auditLabel(n.action, n.entity);
  /* LA RUBRIQUE VIENT DE `section`, PAS DE `link`. Elle se lisait dans le lien tant que le
     lien ÉTAIT la rubrique ; depuis que le serveur n'envoie un lien que s'il mène à
     l'enregistrement lui-même, `link` vaut « /stagiaires/<id> » ou rien du tout — et
     l'étiquette serait retombée sur le nom de l'entité, ou aurait disparu. */
  const rubrique = PAGE_TITLES[n.section] || PAGE_TITLES[n.link] || entityLabel(n.entity) || "Activité";
  // « ×12 » : l'inscription d'un groupe crée douze fiches d'un coup. Le journal les garde une
  // par une ; ici on dit le nombre plutôt que de répéter douze fois la même phrase.
  const titre = n.nombre > 1 ? `${label} ×${n.nombre}` : label;
  return { titre, corps: n.auteur ? `par ${n.auteur}` : null, ton: tone, etiquette: rubrique };
}

/**
 * UNE SEULE ÉCRITURE DE LA LIGNE, rendue par les deux blocs.
 *
 * Au niveau du module, et non dans la page : un composant défini dans le corps du rendu est
 * recréé à chaque passage, React remonte alors tout le sous-arbre, et le focus clavier saute.
 */
function Liste({ lignes, onOuvrir, onSupprimer, peutSupprimer }) {
  return (
    <div className="notif-liste">
              {lignes.map((n) => {
                const { titre, corps, ton, etiquette } = ligneLisible(n);
                const agissable = n.link || (!n.is_read && n.type !== "ACTIVITE");
                const agir = () => agissable && onOuvrir(n);
                return (
                  // Une notification se lisait à la souris seule : `<div onClick>` sans rôle ni
                  // tabindex. Or c'est une LISTE D'ACTIONS — chaque ligne mène quelque part.
                  // Le nom accessible reprend le titre ET le corps : onze lignes « Document
                  // signé » ne se distinguent que par « signé par qui ».
                  <div
                    key={n.id}
                    className={"notif-ligne" + (n.is_read ? "" : " neuf")}
                    role={agissable ? "button" : undefined}
                    tabIndex={agissable ? 0 : undefined}
                    aria-label={agissable ? `${titre}${corps ? `, ${corps}` : ""}${n.is_read ? "" : " (non lue)"}` : undefined}
                    onClick={agir}
                    onKeyDown={agissable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); agir(); } } : undefined}
                    title={n.link ? "Ouvrir" : (n.is_read || n.type === "ACTIVITE" ? undefined : "Marquer comme lu")}
                  >
                    <Badge tone={ton}>{etiquette}</Badge>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{titre}</b>
                      {corps && <span className="notif-corps">{corps}</span>}
                    </span>
                    {/* Le « ↗ » littéral devient l'icône du jeu, comme partout ailleurs, et
                        `aria-hidden` : il redit ce que le nom de la ligne annonce déjà. */}
                    {n.link && <Icon name="chevron-right" size={15} aria-hidden="true" />}
                    <span className="notif-date">{dateHeure(n.created_at)}</span>
                    {/* Pas de corbeille sur une ligne d'ACTIVITÉ : elle vient du journal d'audit,
                        qui ne s'efface pas. Le serveur refuse d'ailleurs explicitement — le bouton
                        absent et le refus disent la même chose, ce qui est le but. */}
                    {peutSupprimer && n.type !== "ACTIVITE" && (
                      <button type="button" className="icon-btn sm"
                        onClick={(e) => { e.stopPropagation(); onSupprimer(n); }}
                        title="Supprimer cette notification"
                        aria-label={`Supprimer la notification : ${titre}`}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                    {!n.is_read && <span className="notif-point" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
  );
}

function Notifications() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  /* Le journal est réservé aux rôles d'audit : proposer le lien à un formateur l'enverrait
     sur une page fermée. On ne montre que ce qui s'ouvre. */
  const journalVisible = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'AUDITEUR'].includes(user?.role);
  /* Le bouton n'apparaît que si le droit existe VRAIMENT. Un bouton visible qui répond 403 est
     pire que pas de bouton : il fait croire à une panne là où il n'y a qu'un droit non accordé.
     Les propriétaires l'ont d'office — même liste que `ROLES_SUPPRESSION_DOFFICE` au serveur. */
  const peutSupprimer = !!user && (OWNER_ROLES.includes(user.role) || aLaCapacite(user, "cap:delete-notifications"));
  /* `null` = on charge ; sinon `{ alertes, activite }` — DEUX listes, parce que ce sont deux
     natures. Une seule liste triée par date laissait l'activité du jour recouvrir les alertes
     adressées : la relance d'émargement la plus récente arrivait au onzième rang. */
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState(null);

  async function load() {
    try { const r = await getNotifications(); setRows({ alertes: r.data || [], activite: r.activite || [] }); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);
  useAutoRefresh(load, { interval: 25000 });

  // Ces deux actions échouaient EN SILENCE. « Tout marquer comme lu » ne faisait alors
  // simplement rien : ni changement à l'écran, ni message. On recliquait, sans comprendre.
  async function readAll() {
    try { await markAllNotificationsRead(); setStatus(null); load(); }
    catch (e) { setStatus({ type: "error", message: e.message || "Impossible de tout marquer comme lu." }); }
  }

  async function supprimer(n) {
    // Une notification d'organisme part pour tout le monde : on le dit AVANT, pas après.
    if (!window.confirm("Supprimer cette notification ? Si elle s'adresse à tout l'organisme, elle disparaîtra pour chacun.")) return;
    try { await deleteNotification(n.id); setStatus(null); load(); }
    catch (e) { setStatus({ type: "error", message: e.message || "Suppression impossible." }); }
  }

  // Clic sur une notification : la marque comme lue puis redirige (si un lien existe).
  async function open(n) {
    /* Une ligne d'activité ne se marque PAS individuellement : sa lecture est une date unique
       (« j'ai lu jusqu'ici »), pas un état par ligne. L'appeler ici ne ferait rien côté serveur
       — un identifiant `activite:…` n'existe pas dans la table `notification` — et la ligne
       resterait neuve après le clic, ce qui donnerait un bouton qui ment. C'est
       « Tout marquer comme lu » qui fait avancer la date. */
    if (!n.is_read && n.type !== "ACTIVITE") {
      try { await markNotificationRead(n.id); }
      catch (e) { setStatus({ type: "error", message: e.message || "Impossible de marquer comme lue." }); }
    }
    if (n.link) navigate(n.link);
    else load();
  }

  return (
    <>
      {/* LES DEUX ÉCRANS DOIVENT SE DISTINGUER À LA LECTURE, pas seulement dans le code. Sans
          ces deux phrases, la cloche et le journal se ressemblaient au point qu'on ne savait pas
          lequel ouvrir — ils lisent la même table. */}
      <PageHead
        eyebrow="Système"
        title="Notifications"
        lead="Ce qui bouge dans les dossiers et appelle un geste. Les réglages de l'outil (modèles, tarifs, paramètres) ne sonnent pas : ils se retrouvent dans le journal d'audit."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {journalVisible && (
              <button className="btn sm ghost" onClick={() => navigate("/audit")}
                title="La trace complète : toutes les actions, y compris les vôtres et les réglages">
                Journal d'audit
              </button>
            )}
            <button className="btn sm" onClick={readAll}>Tout marquer comme lu</button>
          </div>
        }
      />
      <StatusMessage status={status} />

      <Card title="Ce qui appelle un geste">
        {rows == null ? (
          <Squelette lignes={4} h={52} />
        ) : rows.alertes.length === 0 ? (
          <EmptyState icon="bell" title="Rien à traiter"
            text="Les émargements à signer, dépôts de pièces, commandes et signatures s'afficheront ici." />
        ) : (
          <Liste lignes={rows.alertes} onOuvrir={open} onSupprimer={supprimer} peutSupprimer={peutSupprimer} />
        )}
      </Card>

      {/* CE QUI S'EST PASSÉ, et qui n'appelle rien. Séparé du bloc ci-dessus parce que les deux
          se disputaient les mêmes quarante lignes et que l'activité, plus récente par nature,
          gagnait toujours : la relance d'émargement la plus récente arrivait au onzième rang.
          Aucune de ces lignes n'est cliquable sauf si elle mène à une fiche précise. */}
      <Card title="Activité de l'équipe">
        {rows == null ? (
          <Squelette lignes={4} h={52} />
        ) : rows.activite.length === 0 ? (
          <EmptyState icon="history" title="Aucune activité"
            text="Ce que fait le reste de l'équipe sur les dossiers s'affichera ici." />
        ) : (
          <Liste lignes={rows.activite} onOuvrir={open} onSupprimer={supprimer} peutSupprimer={peutSupprimer} />
        )}
      </Card>
    </>
  );
}

export default Notifications;
