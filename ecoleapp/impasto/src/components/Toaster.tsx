"use client";
import { useEffect, useState } from "react";

interface T { id: number; message: string; type: string }

export default function Toaster() {
  const [toasts, setToasts] = useState<T[]>([]);
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener("impasto-toast", handler);
    return () => window.removeEventListener("impasto-toast", handler);
  }, []);
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={"toast" + (t.type === "err" ? " err" : "")}>
          <span className="tdot" />{t.message}
        </div>
      ))}
    </div>
  );
}
