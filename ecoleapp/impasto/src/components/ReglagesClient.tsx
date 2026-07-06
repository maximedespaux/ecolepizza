"use client";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";

interface Org {
  raisonSociale?: string; sigle?: string; responsable?: string; siret?: string; nda?: string; nafApe?: string;
  adresse?: string; codePostal?: string; ville?: string; telephone?: string; email?: string;
  juridiction?: string; qualiopi?: boolean;
}

export default function ReglagesClient() {
  const [org, setOrg] = useState<Org>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    fetch("/api/organisation").then((r) => r.json()).then((j) => { setOrg(j.data ?? {}); setLoading(false); });
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
  }, []);

  const set = (k: keyof Org, v: string) => setOrg((o) => ({ ...o, [k]: v }));

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/organisation", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(org) });
    setSaving(false);
    toast(res.ok ? "Organisme enregistré" : "Erreur lors de l'enregistrement", res.ok ? "ok" : "err");
  };

  const switchTheme = (t: string) => {
    setTheme(t); localStorage.setItem("impasto_theme", t);
    document.documentElement.setAttribute("data-theme", t);
    toast(t === "dark" ? "Thème sombre" : "Thème clair");
  };

  const field = (label: string, k: keyof Org, hint?: string) => (
    <div className="field"><label>{label} {hint && <span className="hint">{hint}</span>}</label>
      <input className="inp" value={(org[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} /></div>
  );

  if (loading) return <div className="empty">Chargement…</div>;

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Système</div><h1>Organisme</h1>
          <p className="lead">Ces informations figurent sur <b>tous les documents générés</b> (devis, contrats, conventions, certificats…). Modifiez-les et enregistrez.</p></div>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "💾 Enregistrer"}</button>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Identité légale</h3>
          <div className="row2">{field("Raison sociale", "raisonSociale")}{field("Sigle", "sigle", "nom court")}</div>
          <div className="row2">{field("Responsable", "responsable")}{field("SIRET", "siret")}</div>
          <div className="row2">{field("NDA", "nda", "déclaration d'activité")}{field("NAF / APE", "nafApe")}</div>
          {field("Adresse", "adresse")}
          <div className="row3">{field("Code postal", "codePostal")}{field("Ville", "ville")}{field("Téléphone", "telephone")}</div>
          <div className="row2">{field("Email", "email")}{field("Juridiction", "juridiction", "tribunal compétent")}</div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Apparence</h3>
            <div className="seg">
              <button className={theme === "light" ? "on" : ""} onClick={() => switchTheme("light")}>☀ Clair</button>
              <button className={theme === "dark" ? "on" : ""} onClick={() => switchTheme("dark")}>☾ Sombre</button>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>Charte École Pizza — bleu marine &amp; rouge tomate.</p>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Aperçu sur les documents</h3>
            <p className="lead" style={{ marginTop: 0 }}>
              <b>{org.raisonSociale || "—"}</b>{org.sigle ? ` (${org.sigle})` : ""}<br />
              {org.adresse || "—"}{org.codePostal || org.ville ? `, ${org.codePostal ?? ""} ${org.ville ?? ""}` : ""}<br />
              SIRET {org.siret || "—"} · NDA {org.nda || "—"} · Certifié Qualiopi
            </p>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Confidentialité (RGPD)</h3>
            <p className="lead" style={{ marginTop: 0 }}>
              Les données stagiaires sont des données personnelles conservées dans votre base locale.
              Les modèles Word et les visuels de l&apos;école sont intégrés à l&apos;application.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
