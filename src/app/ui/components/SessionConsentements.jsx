import { useEffect, useMemo, useState } from "react";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { dateHeure } from "../lib/format.js";
/* L'ENVOI A QUITTÉ CET ÉCRAN. Il vit sur la fiche du partenaire, où il couvre une PÉRIODE — c'est
   là qu'on choisit à qui l'on écrit. Cette carte garde le SUIVI des consentements, qui est son
   sujet : qui a accepté, qui a refusé, qui n'a jamais été sollicité. */
import { getSessionConsents, setSessionConsent } from "../api/apiClient.js";

/**
 * TRANSMISSION AUX PARTENAIRES — le suivi des consentements d'une session, et la liste qui en sort.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN REMPLACE : un courriel écrit à la main, session par session.
 *
 * Un courriel composé à la main ne consulte aucun registre. Rien n'y empêche d'inclure quelqu'un
 * qui a refusé, et rien ne garde trace de ce qui est parti. Recueillir un consentement puis
 * continuer d'envoyer une liste faite à la main est PIRE que de n'avoir rien demandé : on se
 * constitue une preuve qui documente sa propre infraction.
 *
 * D'où le principe : LA LISTE EST PRODUITE PAR LE SERVEUR. Cet écran ne compose rien, il affiche
 * ce que le serveur a retenu. Il n'existe aucune case à décocher pour y ajouter quelqu'un — le
 * filtre sur le consentement n'est pas une option, c'est la seule façon dont la liste existe.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, PAS DEUX, et le troisième est celui qui appelle une action.
 *
 * « Jamais sollicité » n'est pas un refus : c'est une question qu'on n'a pas posée. Les confondre
 * ferait disparaître les silencieux comme s'ils avaient dit non, alors qu'ils n'ont rien dit. Ils
 * sont donc affichés EN PREMIER, puisque ce sont les seuls sur lesquels l'organisme a quelque
 * chose à faire.
 *
 * UNE ORIGINE PARTAGÉE EN TÊTE, plutôt qu'un sélecteur par ligne : le secrétariat saisit une PILE
 * de formulaires papier, pas un cas isolé. Répéter le choix à chaque ligne le ferait cliquer
 * quinze fois sur la même valeur, et un clic répété n'est plus un choix — c'est un réflexe qui
 * finit par écrire « papier » sur une réponse donnée au téléphone.
 *
 * ON PEUT TOUJOURS CHANGER UNE RÉPONSE, y compris un « oui » en « non » : se rétracter doit être
 * aussi simple qu'accepter (art. 7.3). Rien n'est écrasé pour autant — chaque clic AJOUTE une
 * ligne au registre, et l'historique reste la preuve de ce qui était vrai à chaque envoi passé.
 */

const ETATS = {
  jamais: { cle: "jamais", titre: "Jamais sollicité", classe: "n", icone: "help" },
  oui: { cle: "oui", titre: "A accepté", classe: "g", icone: "check-circle" },
  non: { cle: "non", titre: "A refusé", classe: "r", icone: "x-circle" },
};

const etatDe = (s) => (s.accorde === null ? ETATS.jamais : s.accorde ? ETATS.oui : ETATS.non);

/** Échappement CSV : une virgule ou un guillemet dans un nom casserait la colonne suivante. */
const csvCell = (v) => {
  const t = String(v ?? "");
  return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function SessionConsentements({ sessionId, canEdit }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [status, setStatus] = useState(null);
  const [source, setSource] = useState("papier");
  const [busy, setBusy] = useState(null);

  async function charger() {
    try {
      const r = await getSessionConsents(sessionId);
      setData(r.data);
      setErreur(null);
    } catch (e) {
      // 409 = migration 130 non jouée. On le DIT, au lieu d'afficher une carte vide qui se
      // lirait comme « personne n'a consenti ».
      setErreur(e.message);
      setData(null);
    }
  }

  useEffect(() => {
    charger();
  }, [sessionId]);

  const groupes = useMemo(() => {
    const g = { jamais: [], oui: [], non: [] };
    for (const s of data?.stagiaires || []) g[etatDe(s).cle].push(s);
    return g;
  }, [data]);

  async function repondrePour(learnerId, accorde) {
    setBusy(learnerId); setStatus(null);
    try {
      await setSessionConsent(sessionId, learnerId, accorde, source);
      await charger();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setBusy(null); }
  }







  const titre = (
    <span className="card-ttl">
      <Icon name="handshake" size={16} /> Transmission aux partenaires
    </span>
  );

  if (erreur) {
    return (
      <Card title={titre}>
        <StatusMessage type="error" message={erreur} />
      </Card>
    );
  }
  if (!data) return null;
  if (!data.stagiaires.length) {
    return (
      <Card title={titre}>
        <p className="hint" style={{ margin: 0 }}>Aucun stagiaire inscrit à cette session.</p>
      </Card>
    );
  }

  const rendreGroupe = (cle) => {
    const membres = groupes[cle];
    if (!membres.length) return null;
    const e = ETATS[cle];
    return (
      <div key={cle} className="consent-groupe">
        <div className="consent-groupe-tt">
          <Icon name={e.icone} size={14} />
          <b>{e.titre}</b>
          <span className={"badge " + e.classe}>{membres.length}</span>
        </div>
        {membres.map((s) => (
          <div key={s.learner_id} className="consent-ligne">
            <span className="consent-nom">{s.last_name} {s.first_name}</span>
            {s.decide_at && (
              <span className="hint consent-quand">
                {dateHeure(s.decide_at)}
                {s.source && data.sources[s.source] ? ` · ${data.sources[s.source]}` : ""}
              </span>
            )}
            {/* ─────────────────────────────────────────────────────────────────────────────
                LA PAROLE DU STAGIAIRE NE S'ÉCRASE PAS D'ICI.

                Cette saisie existe pour les réponses recueillies HORS LIGNE — un stagiaire sans
                compte qui remplit un formulaire papier. Elle s'arrête net dès que la personne
                s'est exprimée elle-même : un « non » cliqué depuis son espace puis retourné en
                « oui » depuis un écran d'administration ne serait plus un consentement, et la
                trace ferait croire qu'il l'est.

                On MASQUE les boutons plutôt que de les désactiver : un bouton grisé invite à
                chercher comment le réactiver. Une phrase dit ce qui s'est passé et qui peut en
                changer. */}
            {canEdit && (
              /* `repondu_lui_meme` ET NON `source` : la source ne dit que la DERNIÈRE ligne, et
                 une saisie de l'organisme suffirait à la changer — le verrou se désactiverait en
                 le forçant une fois. Ici, c'est « s'est-il exprimé UNE FOIS QUELCONQUE ». */
              s.repondu_lui_meme ? (
                <span className="consent-verrou" title={`Répondu depuis son espace le ${dateHeure(s.repondu_lui_meme)}`}>
                  <Icon name="lock" size={12} /> a répondu lui-même
                </span>
              ) : (
                <span className="consent-actions">
                  <button
                    className={"btn sm" + (s.accorde === true ? " primary" : "")}
                    disabled={busy === s.learner_id}
                    onClick={() => repondrePour(s.learner_id, true)}
                    title="Enregistrer un accord donné hors ligne"
                  >
                    <Icon name="check" size={12} /> Accepté
                  </button>
                  <button
                    className={"btn sm" + (s.accorde === false ? " danger" : "")}
                    disabled={busy === s.learner_id}
                    onClick={() => repondrePour(s.learner_id, false)}
                    title="Enregistrer un refus"
                  >
                    <Icon name="x" size={12} /> Refusé
                  </button>
                </span>
              )
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card title={titre}>
      <p className="hint" style={{ marginTop: 0 }}>
        Les coordonnées d'un stagiaire ne partent chez un partenaire que s'il l'a accepté. Cette
        liste est composée par le serveur : elle écarte d'elle-même les refus et les personnes
        jamais sollicitées.
      </p>

      {status && <StatusMessage type={status.type} message={status.message} />}

      {canEdit && (
        <div className="consent-source">
          <label htmlFor="consent-src">
            <Icon name="clipboard-check" size={13} /> Origine des réponses que je saisis
          </label>
          <select id="consent-src" value={source} onChange={(e) => setSource(e.target.value)}>
            {Object.entries(data.sources)
              /* « Espace stagiaire » est exclu : c'est la seule origine que le stagiaire produit
                 lui-même, et l'offrir ici permettrait d'inscrire au registre un accord « donné en
                 ligne » que personne n'a cliqué. */
              .filter(([k]) => k !== "espace_stagiaire")
              .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="hint">
            Une réponse saisie ici est enregistrée à votre nom : elle reste distinguable d'un
            accord donné par le stagiaire depuis son espace. <b>Un stagiaire qui a répondu
            lui-même ne peut pas être modifié ici</b> — lui seul peut en changer, depuis son
            profil.
          </span>
        </div>
      )}

      {["jamais", "oui", "non"].map(rendreGroupe)}

    </Card>
  );
}

export default SessionConsentements;
