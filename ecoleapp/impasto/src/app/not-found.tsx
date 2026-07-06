import Link from "next/link";

export default function NotFound() {
  return (
    <div className="nf-wrap">
      <div className="nf-visual" aria-hidden>
        <div className="nf-pizza">🍕</div>
        <div className="nf-bite" />
      </div>
      <div className="nf-code">404</div>
      <h1 className="nf-title">Cette part a été mangée</h1>
      <p className="nf-text">
        La page que vous cherchez n&apos;existe pas — ou elle a fini au fond du four.
        Pas de panique, il en reste plein d&apos;autres.
      </p>
      <div className="nf-actions">
        <Link className="btn primary" href="/dashboard">Retour au tableau de bord</Link>
        <Link className="btn ghost" href="/login">Se connecter</Link>
      </div>
    </div>
  );
}
