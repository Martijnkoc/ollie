"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/projects/schema";
import { deletePhotos, loadProject, persistent, purgeExpired, saveProject } from "@/lib/projects/store";

export type SaveState = "saved" | "saving" | "error";

/**
 * Loads one project from the browser and saves every change shortly after it happens (and immediately on
 * `flush`, e.g. right before the payment redirect). Calculations always run on the latest state.
 */
export function useProject(id: string) {
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [project, setProject] = useState<Project | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const latest = useRef<Project | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      await purgeExpired().catch(() => 0);
      const p = await loadProject(id).catch(() => null);
      if (p) void deletePhotos(p.id).catch(() => undefined);
      if (!alive) return;
      latest.current = p;
      setProject(p);
      setStatus(p ? "ready" : "missing");
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!latest.current) return;
    setSaveState("saving");
    try {
      await saveProject(latest.current);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  // `latest` is the source of truth, updated synchronously, so a flush right after an update (before the
  // payment redirect) always writes the newest state.
  const update = useCallback(
    (fn: (p: Project) => Project) => {
      const prev = latest.current;
      if (!prev) return;
      const next = { ...fn(prev), updatedAt: new Date().toISOString() };
      latest.current = next;
      setProject(next);
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 300);
    },
    [flush],
  );

  /** Stops pending saves, e.g. right before the project is deleted. */
  const discard = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    latest.current = null;
  }, []);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  return { status, project, update, flush, discard, saveState, persistent };
}
