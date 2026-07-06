"use client";
// toast("Enregistré") depuis n'importe quel composant client.
export function toast(message: string, type: "ok" | "err" | "info" = "ok") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("impasto-toast", { detail: { message, type } }));
}
