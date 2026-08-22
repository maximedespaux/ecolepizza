import { useEffect, useState } from "react";
import { getOrganisation, updateOrganisation } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

/**
 * MAILING — les e-mails transactionnels que l'organisme envoie automatiquement.
 *
 * Un interrupteur par TYPE. Décoché = l'organisme ne l'envoie plus : le filtrage est appliqué
 * CÔTÉ SERVEUR (lib/orgContext.js `mailActif`, consulté par `sendMail({ …, kind })`), pas
 * seulement ici. Les cinq clés correspondent aux colonnes `mail_*` de `organization` (migration
 * 138) et aux `kind` passés à sendMail.
 */
const MAILS = [
  ["mail_credentials", "Compte créé — identifiants de connexion", "Au stagiaire, quand un compte lui est créé (avec son mot de passe)."],
  ["mail_reset", "Réinitialisation du mot de passe", "Quand vous réinitialisez le mot de passe d'un stagiaire depuis sa fiche."],
  ["mail_forgot", "Lien « mot de passe oublié »", "Quand un utilisateur demande lui-même à réinitialiser son mot de passe."],
  ["mail_security", "Alerte de sécurité (changement d'e-mail / mot de passe)", "Prévient la personne d'un changement, avec un lien « ce n'était pas moi ». Le couper retire ce garde-fou."],
  ["mail_notifications", "Notifications par e-mail", "Double par e-mail les notifications importantes adressées à une personne."],
];

function Mailing() {
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOrganisation().then((r) => setForm(r.data)).catch((e) => setStatus({ type: "error", message: e.message }));
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      // On n'envoie QUE les cinq interrupteurs : updateOrganisation ignore les champs absents,
      // inutile de renvoyer toute la fiche organisme depuis cet écran.
      const payload = Object.fromEntries(MAILS.map(([k]) => [k, form[k] !== 0 ? 1 : 0]));
      await updateOrganisation(payload);
      setStatus({ type: "success", message: "Réglages d'e-mails enregistrés." });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead eyebrow="Organisme" title="Mailing" lead="Les e-mails que l'organisme envoie automatiquement." />
      <StatusMessage status={status} />
      {form && (
        <Card title="E-mails automatiques">
          <form onSubmit={save}>
            <p className="sub" style={{ marginTop: 0 }}>
              Décocher un type en coupe l'envoi — côté serveur aussi, pas seulement l'affichage.
              Sans SMTP configuré, aucun e-mail ne part de toute façon.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "4px 0 16px" }}>
              {MAILS.map(([k, label, hint]) => (
                <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
                  {/* `!== 0` et non `!!` : une colonne absente (migration non jouée) ou NULL vaut
                      « activé », comme le serveur. Seul un 0 explicite décoche la case. */}
                  <input type="checkbox" style={{ marginTop: 3 }}
                    checked={form[k] !== 0}
                    onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.checked ? 1 : 0 }))} />
                  <span>
                    {label}
                    <span className="sub" style={{ display: "block", fontSize: 11.5 }}>{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

export default Mailing;
