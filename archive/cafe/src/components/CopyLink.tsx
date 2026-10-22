"use client";

import { useState } from "react";

export function CopyLink({ url, shareText }: { url: string; shareText?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, url });
      } catch {
        /* cancelled */
      }
    } else {
      await copy();
    }
  }

  return (
    <div className="stack">
      <div className="share">
        <label htmlFor="invite-link" className="visually-hidden">
          Uitnodigingslink
        </label>
        <input id="invite-link" type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={copy}>
          {copied ? "Gekopieerd" : "Kopieer link"}
        </button>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {copied ? "Link gekopieerd" : ""}
      </p>
      <button type="button" className="btn secondary" onClick={share} style={{ alignSelf: "flex-start" }}>
        Delen via een app…
      </button>
    </div>
  );
}
