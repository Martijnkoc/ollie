"use client";

import { useEffect, useState } from "react";
import { renderPageCanvas } from "@/lib/documents/render";
import type { PlanDocument } from "@/lib/projects/schema";
import { loadFile } from "@/lib/projects/store";

type State = { url: string | null; loading: boolean; missing: boolean; error: string | null };

const cache = new Map<string, string>();

/** Renders a plan page to an image URL for the editor background. The file never leaves the browser. */
export function usePlanImage(projectId: string, doc: PlanDocument | null, page: number, version: number) {
  const [state, setState] = useState<State>({ url: null, loading: Boolean(doc), missing: false, error: null });

  useEffect(() => {
    if (!doc) {
      setState({ url: null, loading: false, missing: false, error: null });
      return;
    }
    const key = `${projectId}:${page}:${version}`;
    const hit = cache.get(key);
    if (hit) {
      setState({ url: hit, loading: false, missing: false, error: null });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      const blob = await loadFile(projectId);
      if (!blob) {
        if (alive) setState({ url: null, loading: false, missing: true, error: null });
        return;
      }
      try {
        const { canvas } = await renderPageCanvas(blob, doc.kind, page, 2200);
        const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
        if (!out) throw new Error("render");
        const url = URL.createObjectURL(out);
        cache.set(key, url);
        if (alive) setState({ url, loading: false, missing: false, error: null });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.error("plan render", err);
        if (alive) setState({ url: null, loading: false, missing: false, error: "Deze pagina kunnen we niet weergeven." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, doc, page, version]);

  return state;
}
