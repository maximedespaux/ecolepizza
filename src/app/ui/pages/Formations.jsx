import { useEffect, useState } from "react";
import { getFormations } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { euro, colorOf } from "../lib/format.js";

function Formations() {
  const [programs, setPrograms] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await getFormations();
        setPrograms(response.data);
      } catch (err) {
        setStatus({ type: "error", message: err.message });
      }
    }
    load();
  }, []);

  return (
    <>
      <PageHead eyebrow="Catalogue" title="Formations" lead="Les programmes proposés par l'École Pizza." />
      <StatusMessage status={status} />

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Intitulé</th>
              <th>Jours</th>
              <th>Heures</th>
              <th>Prix</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="badge n mono" style={{ color: "#fff", background: colorOf(p.code), borderColor: "transparent" }}>{p.code}</span>
                </td>
                <td><b>{p.title}</b></td>
                <td>{p.days}</td>
                <td>{p.hours}</td>
                <td className="mono">{euro(p.price)}</td>
                <td>{p.rs_code ? <Badge tone="b">Certifiante</Badge> : p.hygiene ? <Badge tone="a">Hygiène</Badge> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default Formations;
