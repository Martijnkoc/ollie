"use client";

import { useState } from "react";

export function CopyLink({ url, shareText }: { url: string; shareText?: string }) {
  const [copied, setCopied] = useState(false);
  const text = shareText ? `${shareText} ${url}` : url;

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
        <input type="text" readOnly value={url} aria-label="Uitnodigingslink" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={copy}>
          {copied ? "Gekopieerd ✓" : "Kopieer link"}
        </button>
      </div>
      <div className="row">
        <button type="button" className="btn secondary" onClick={share}>
          Delen…
        </button>
        <a className="btn secondary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          Via WhatsApp
        </a>
      </div>
    </div>
  );
}
