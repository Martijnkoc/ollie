"use client";

import { useState } from "react";

/** Uses the phone's share sheet when there is one, otherwise copies the link. */
export function ShareButton({ path, title, className = "btn secondary" }: { path: string; title: string; className?: string }) {
  const [status, setStatus] = useState("");
  async function share() {
    const url = `${location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("Link gekopieerd");
    } catch {
      setStatus("");
    }
    setTimeout(() => setStatus(""), 2500);
  }
  return (
    <>
      <button type="button" className={className} onClick={share}>
        {status || "Delen"}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {status}
      </span>
    </>
  );
}
