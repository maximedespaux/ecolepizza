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
  const rubrique = PAGE_TITLES[n.link] || entityLabel(n.entity) || "Activité";
  return { titre: label, corps: n.auteur ? `par ${n.auteur}` : null, ton: tone, etiquette: rubrique };
}

function Notifications() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  /* Le bouton n'apparaît que si le droit existe VRAIMENT. Un bouton visible qui répond 403 est
     pire que pas de bouton : il fait croire à une panne là où il n'y a qu'un droit non accordé.
     Les propriétaires l'ont d'office — même liste que `ROLES_SUPPRESSION_DOFFICE` au serveur. */
  const peutSupprimer = !!user && (OWNER_ROLES.includes(user.role) || aLaCapacite(user, "cap:delete-notifications"));
  const [rows, setRows] = useState(null); // `null` = on charge, `[]` = aucune notification
  const [status, setStatus] = useState(null);

  async function load() {
    try { setRows((await getNotifications()).data); }
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
      <PageHead
        eyebrow="Système"
        title="Notifications"
        actions={<button className="btn sm" onClick={readAll}>Tout marquer comme lu</button>}
      />
      <StatusMessage status={status} />

      <Card>
        {rows == null ? (
          <Squelette lignes={6} h={52} />
        ) : rows.length === 0 ? (
          <EmptyState icon="bell" title="Aucune notification"
            text="Les signatures, relances et alertes de conformité s'afficheront ici, avec les changements faits par le reste de l'équipe." />
        ) : (
          <div className="notif-liste">
            {rows.map((n) => {
              const { titre, corps, ton, etiquette } = ligneLisible(n);
              const agissable = n.link || (!n.is_read && n.type !== "ACTIVITE");
              const agir = () => agissable && open(n);
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
                      onClick={(e) => { e.stopPropagation(); supprimer(n); }}
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
        )}
      </Card>
    </>
  );
}

export default Notifications;
