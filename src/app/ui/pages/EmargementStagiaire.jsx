import { useContext, useEffect, useState } from "react";
import { getMyEmargement, signMyEmargement } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import SignatureModal from "../components/SignatureModal.jsx";

const SLOT = { MATIN: "Matin", APRES_MIDI: "Après-midi", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };
const frDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }) : "");

function EmargementStagiaire() {
  const { user } = useContext(UserContext);
  const [data, setData] = useState({ today: "", records: [] });
  const [status, setStatus] = useState(null);
  const [signing, setSigning] = useState(null); // record en cours de signature

  async function load() {
    try { const r = await getMyEmargement(); setData(r.data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function onConfirm({ signer_name, signature_data }) {
    try {
      await signMyEmargement(signing.record_id, { signer_name, signature_data });
      setSigning(null);
      setStatus({ type: "success", message: "Émargement signé. Merci !" });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const recs = data.records || [];
  const pending = recs.filter((r) => !r.signed && r.date <= data.today).length;

  return (
    <>
      <PageHead eyebrow="Émargement" title="Ma feuille de présence"
        lead="Signez votre présence pour chaque demi-journée de formation. Une signature par matin et après-midi." />
      <StatusMessage status={status} />

      {recs.length === 0 ? (
        <Card><EmptyState icon="✍️">Aucune demi-journée à émarger pour le moment.</EmptyState></Card>
      ) : (
        <Card title={pending ? `${pending} demi-journée(s) à signer` : "Présences"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recs.map((r) => {
              const future = r.date > data.today;
              return (
                <div key={r.record_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ textTransform: "capitalize" }}>{frDate(r.date)} — {SLOT[r.slot] || r.slot}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                      {r.program_code ? `${r.program_code} · ` : ""}{r.program_title || ""}
                    </span>
                  </span>
                  {r.signed ? (
                    <Badge tone="g">Signé{r.signed_at ? ` · ${r.signed_at}` : ""}</Badge>
                  ) : future ? (
                    <span className="hint">À venir</span>
                  ) : (
                    <button className="btn sm primary" onClick={() => setSigning(r)}>✍ Signer</button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {signing && (
        <SignatureModal
          doc={{ label: `Émargement — ${SLOT[signing.slot] || signing.slot} ${frDate(signing.date)}` }}
          defaultName={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
          onConfirm={onConfirm}
          onClose={() => setSigning(null)}
        />
      )}
    </>
  );
}

export default EmargementStagiaire;
