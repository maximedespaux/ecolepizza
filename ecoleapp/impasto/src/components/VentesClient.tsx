"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";

interface Sale { id: string; date: string; produit: string; categorie: string; quantite: number; montant: string; learnerNom?: string | null; note?: string | null }
interface Stats { total: number; count: number; byCategorie: Record<string, number> }

const CATS = ["Four", "Pétrin", "Matière première", "Accessoire", "Livre", "Autre"];
const euro = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const CAT_ICON: Record<string, string> = { Four: "🔥", "Pétrin": "🌀", "Matière première": "🌾", Accessoire: "🧰", Livre: "📘", Autre: "📦" };

const today = () => new Date().toISOString().slice(0, 10);
const blank = { produit: "", categorie: "Four", quantite: "1", montant: "", date: today(), learnerNom: "", note: "" };

export default function VentesClient() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, count: 0, byCategorie: {} });
  const [form, setForm] = useState({ ...blank });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const j = await (await fetch("/api/ventes")).json(); setSales(j.data ?? []); setStats(j.stats ?? { total: 0, count: 0, byCategorie: {} }); }
    catch { toast("Chargement impossible", "err"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.produit.trim() || !form.montant) { toast("Produit et montant requis", "err"); return; }
    setSaving(true);
    const r = await fetch("/api/ventes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (r.ok) { setForm({ ...blank }); toast("Vente enregistrée", "ok"); load(); }
    else { const j = await r.json().catch(() => ({})); toast(j.error || "Erreur", "err"); }
  };

  const del = async (s: Sale) => {
    if (!confirm(`Supprimer la vente « ${s.produit} » ?`)) return;
    const r = await fetch("/api/ventes/" + s.id, { method: "DELETE" });
    if (r.ok) { toast("Vente supprimée", "ok"); load(); } else toast("Suppression impossible", "err");
  };

  const catEntries = Object.entries(stats.byCategorie).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...catEntries.map(([, v]) => v));
  const panier = stats.count ? Math.round(stats.total / stats.count) : 0;
  const RED = "linear-gradient(135deg,var(--ember1),var(--ember2))";

  return (
    <div className="space-y-5 font-sans">
      <div className="pagehead">
        <div><div className="eyebrow">Développement · Débouchés</div><h1>Ventes de matériel</h1>
          <p className="lead">Suivez les ventes de matériel (fours, pétrins, matières premières, accessoires) aux stagiaires. Le récapitulatif se construit automatiquement.</p></div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="text-[13px] text-muted">Chiffre d&apos;affaires matériel</div>
          <div className="mt-1.5 font-display text-3xl font-extrabold text-navy tabular-nums">{euro(stats.total)}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="text-[13px] text-muted">Nombre de ventes</div>
          <div className="mt-1.5 font-display text-3xl font-extrabold text-navy tabular-nums">{stats.count}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="text-[13px] text-muted">Panier moyen</div>
          <div className="mt-1.5 font-display text-3xl font-extrabold text-ember tabular-nums">{euro(panier)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Formulaire */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-display text-base font-bold text-navy mb-4">Enregistrer une vente</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[13px] font-semibold text-ink mb-1.5">Produit</label>
              <input value={form.produit} onChange={(e) => set("produit", e.target.value)} placeholder="Four à bois, farine T45, pelle…" className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Catégorie</label>
                <select value={form.categorie} onChange={(e) => set("categorie", e.target.value)} className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy">
                  {CATS.map((c) => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Date</label>
                <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Quantité</label>
                <input value={form.quantite} onChange={(e) => set("quantite", e.target.value)} inputMode="numeric" className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy" />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Montant unitaire (€)</label>
                <input value={form.montant} onChange={(e) => set("montant", e.target.value)} inputMode="decimal" placeholder="0" className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy" />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-ink mb-1.5">Stagiaire / client <span className="text-dim font-normal">(optionnel)</span></label>
              <input value={form.learnerNom} onChange={(e) => set("learnerNom", e.target.value)} placeholder="Nom du stagiaire" className="w-full rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-navy" />
            </div>
            <button onClick={submit} disabled={saving} className="w-full rounded-xl px-4 py-3 font-bold text-white shadow-lg transition hover:brightness-105 disabled:opacity-60" style={{ background: RED }}>
              {saving ? "Enregistrement…" : "+ Enregistrer la vente"}
            </button>
          </div>
        </div>

        {/* Récap par catégorie */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-display text-base font-bold text-navy mb-4">Répartition par catégorie</h3>
          {catEntries.length === 0 ? <p className="text-sm text-muted">Aucune vente enregistrée.</p> : (
            <div className="space-y-3">
              {catEntries.map(([cat, val]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-sm text-ink w-36 shrink-0">{CAT_ICON[cat] ?? "📦"} {cat}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full bg-navy" style={{ width: `${(val / catMax) * 100}%` }} />
                  </div>
                  <b className="text-sm text-navy w-20 text-right tabular-nums">{euro(val)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h3 className="font-display text-base font-bold text-navy mb-3">Ventes récentes</h3>
        {loading ? <p className="text-sm text-muted">Chargement…</p> : sales.length === 0 ? <p className="text-sm text-muted">Aucune vente. Enregistrez la première ci-dessus.</p> : (
          <div className="divide-y divide-[var(--border-soft)]">
            {sales.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-base">{CAT_ICON[s.categorie] ?? "📦"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink">{s.produit} {s.quantite > 1 && <span className="text-muted font-normal">×{s.quantite}</span>}</div>
                  <div className="text-[11px] text-dim">{s.categorie} · {new Date(s.date).toLocaleDateString("fr-FR")}{s.learnerNom ? ` · ${s.learnerNom}` : ""}</div>
                </div>
                <b className="text-sm text-navy tabular-nums">{euro(Number(s.montant) * s.quantite)}</b>
                <button onClick={() => del(s)} title="Supprimer" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-white hover:bg-ember hover:border-transparent transition">🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
