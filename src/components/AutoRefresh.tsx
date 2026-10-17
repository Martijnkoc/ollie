"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Keeps a server-rendered match page current: polls a tiny, edge-cached version stamp and only
 * re-renders the page when the stamp changes. Paused in background tabs; backs off on errors.
 */
export function AutoRefresh({ matchId, version, seconds }: { matchId: number; version: string; seconds: number }) {
  const router = useRouter();
  const current = useRef(version);
  const [failed, setFailed] = useState(0);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    current.current = version;
  }, [version]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/v1/matches/${matchId}`);
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { version: string };
          setFailed(0);
          setOffline(false);
          if (data.version !== current.current) {
            current.current = data.version;
            router.refresh();
          }
        } catch {
          setFailed((n) => n + 1);
          if (!navigator.onLine) setOffline(true);
        }
      }
      timer = setTimeout(tick, failed > 0 ? Math.min(seconds * 1000 * 2 ** failed, 300_000) : seconds * 1000);
    };
    timer = setTimeout(tick, seconds * 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [matchId, seconds, router, failed]);

  if (offline)
    return (
      <p className="notice notice-warn small" role="status">
        Je bent offline; deze stand wordt niet bijgewerkt.
      </p>
    );
  if (failed > 1)
    return (
      <p className="notice notice-warn small" role="status">
        Verversen lukt even niet; wat je ziet is mogelijk niet actueel.
      </p>
    );
  return null;
}
