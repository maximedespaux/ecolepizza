import { useEffect, useState } from "react";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { getChampsPartenaires, updateOrganisation } from "../api/apiClient.js";

/**
 * CE QUE L'ÉCOLE TRANSMET AUX PARTENAIRES — le choix, et la phrase qui en découle.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * L'APERÇU DE LA PHRASE EST LE CŒUR DE CET ÉCRAN, pas une décoration.
 *
 * Cocher « Téléphone » n'a l'air de rien. Lire « J'accepte que l'école communique mon nom, mon
 * téléphone… » fait comprendre qu'on est en train d'écrire le texte que des dizaines de personnes
 * vont lire et accepter. Sans l'aperçu, l'écran serait une liste de cases dont on ne mesure pas
 * la portée — et la formulation n'apparaîtrait qu'au stagiaire, trop tard pour la corriger.
 *
 * La phrase vient du SERVEUR, produite par la fonction qui produit le texte réel. La recomposer
 * ici donnerait une seconde rédaction à maintenir, donc une occasion de montrer à l'école une
 * phrase que le stagiaire ne verra jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * RETIRER ET AJOUTER N'ONT PAS LE MÊME EFFET, et l'écran doit le dire.
 *
 * Retirer un champ s'applique IMMÉDIATEMENT à tout le monde : on transmet moins que ce qui a été
 * accepté, ce qui est toujours permis. Ajouter un champ ne vaut QUE pour les consentements
 * recueillis ensuite — les accords déjà donnés ne le couvrent pas, la personne ne pouvait pas
 * consentir à ce qu'elle ignorait. Sans cet avertissement, on croirait l'ajout rétroactif et l'on
 * s'étonnerait qu'une colonne reste vide dans l'export.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * TOUT DÉCOCHER EST PERMIS, et c'est un réglage légitime : l'école cesse de transmettre quoi que
 * ce soit. L'écran le dit en clair plutôt que de bloquer — un organisme qui veut tout arrêter ne
 * doit pas avoir à décocher une case de moins que zéro.
 */
function ChampsPartenaires() {
  const [data, setData] = useState(null);
  const [choisis, setChoisis] = useState([]);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getChampsPartenaires()
      .then((r) => { setData(r.data); setChoisis(r.data.choisis); })
      // Migration 135 non jouée, ou route absente : la section ne s'affiche pas, plutôt que
      // d'offrir un réglage qui ne s'enregistrerait pas.
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  const initial = data.choisis;
  const ajoutes = choisis.filter((c) => !initial.includes(c));
  const retires = initial.filter((c) => !choisis.includes(c));
  const modifie = ajoutes.length > 0 || retires.length > 0;

  const basculer = (cle) => setChoisis((l) => (l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle]));

  async function enregistrer() {
    setSaving(true); setStatus(null);
    try {
      /* L'ORDRE ENVOYÉ N'A PAS D'IMPORTANCE : le serveur réordonne selon l'ordre d'annonce, pour
         qu'un même choix produise toujours la même phrase. Deux écoles qui cochent les mêmes
         cases dans un ordre différent doivent obtenir le même texte. */
      const rep = await updateOrganisation({ partner_fields: choisis.join(",") });
      /* LE SERVEUR DIT CE QU'IL A LAISSÉ TOMBER. Sans cette vérification, une colonne absente
         (migration 135 non jouée) donnait « enregistré » alors que rien n'avait changé — et
         l'écran se rechargeait sur l'ancienne valeur, ce qui se lit comme un bug d'affichage
         plutôt que comme une migration manquante. */
      if (rep?.ignores?.includes("partner_fields")) {
        setStatus({ type: "error", message: "Migration 135 non jouée : ce choix ne peut pas encore être enregistré. Rien n'a été modifié." });
        setSaving(false);
        return;
      }
      const r = await getChampsPartenaires();
      setData(r.data); setChoisis(r.data.choisis);
      setStatus({ type: "success", message: "Informations transmises enregistrées." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <Card title={<span className="card-ttl"><Icon name="handshake" size={16} /> Informations transmises aux partenaires</span>}
      style={{ marginBottom: 16 }}>
      <p className="hint" style={{ marginTop: 0 }}>
        Ce que l'école communique aux partenaires pour les stagiaires qui l'ont accepté. Chaque
        case cochée apparaît dans la phrase soumise au stagiaire, et dans la liste exportée.
      </p>

      <StatusMessage status={status} />

      <div className="champs-grille">
        {data.catalogue.map((c) => (
          <label key={c.cle} className={"champ-case" + (choisis.includes(c.cle) ? " on" : "")}>
            <input type="checkbox" checked={choisis.includes(c.cle)} onChange={() => basculer(c.cle)} />
            <span>{c.libelle}</span>
          </label>
        ))}
      </div>

      {/* CE QUE LE STAGIAIRE LIRA, mot pour mot. L'aperçu suit la sélection en direct : on voit
          la phrase se former en cochant, ce qui est la seule façon de juger d'un texte. */}
      <div className="champs-apercu">
        <b><Icon name="eye" size={13} /> Ce que le stagiaire lira</b>
        <p>{apercuLocal(data, choisis)}</p>
      </div>

      {modifie && (
        <div className="champs-effet">
          {retires.length > 0 && (
            <div className="reca-ligne ton-o">
              <Icon name="check-circle" size={13} />
              <span>
                <b>{libelles(data, retires)}</b> ne sera plus transmis — <b>y compris pour les
                consentements déjà recueillis</b>. Transmettre moins que ce qui a été accepté est
                toujours permis.
              </span>
            </div>
          )}
          {ajoutes.length > 0 && (
            <div className="reca-ligne ton-r">
              <Icon name="alert-triangle" size={13} />
              <span>
                <b>{libelles(data, ajoutes)}</b> ne partira <b>que pour les consentements
                recueillis après ce changement</b>. Les personnes ayant déjà répondu n'ont pas pu
                consentir à ce qu'elles ignoraient : leur ligne restera vide dans l'export tant
                qu'elles n'auront pas répondu à la nouvelle formulation.
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn primary sm" disabled={saving || !modifie} onClick={enregistrer}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        {modifie && (
          <button className="btn ghost sm" onClick={() => setChoisis(initial)}>Annuler</button>
        )}
      </div>
    </Card>
  );
}

/** Les libellés d'une liste de clés, séparés par des virgules. */
function libelles(data, cles) {
  return cles.map((c) => data.catalogue.find((x) => x.cle === c)?.libelle || c).join(", ");
}

/**
 * L'aperçu PENDANT la saisie. Le serveur rend la phrase de la sélection ENREGISTRÉE ; tant qu'on
 * coche sans avoir enregistré, il faut bien la recomposer ici — sinon l'aperçu montrerait l'état
 * d'avant, c'est-à-dire l'inverse de ce à quoi il sert.
 *
 * Il retombe sur la phrase du serveur dès que la sélection correspond à l'enregistré : c'est elle
 * qui fait foi, et la comparer permettrait de repérer une divergence entre les deux rédactions.
 */
function apercuLocal(data, choisis) {
  const memes = choisis.length === data.choisis.length && choisis.every((c) => data.choisis.includes(c));
  if (memes) return data.apercu;
  const ordre = data.catalogue.map((c) => c.cle).filter((c) => choisis.includes(c));
  if (!ordre.length) return "Aucune information ne sera transmise aux partenaires de l'école.";
  const mots = ordre.map((c) => ANNONCES[c] || c);
  const quoi = mots.length === 1 ? mots[0]
    : `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}`;
  return `J'accepte que l'école communique ${quoi} à ses partenaires, afin qu'ils puissent me `
    + "proposer leurs offres et me contacter directement. Je peux revenir sur ce choix à tout "
    + "moment depuis mon profil. Refuser n'a aucune conséquence sur ma formation, mon inscription "
    + "ou mon accès aux services de l'école.";
}

/* LES MÊMES MOTS QUE LE SERVEUR (`CHAMPS_TRANSMISSIBLES`). La duplication est inévitable — la
   phrase doit se former à la frappe, avant tout enregistrement — mais elle est bornée à ces huit
   fragments, et un test compare les deux listes pour qu'elles ne divergent pas. */
const ANNONCES = {
  nom: "mon nom",
  prenom: "mon prénom",
  email: "mon adresse e-mail",
  telephone: "mon téléphone",
  formation: "la formation que je suis",
  dates_session: "les dates de ma session",
  entreprise: "le nom de l'entreprise qui finance ma formation",
  ville: "ma ville",
};

export default ChampsPartenaires;
