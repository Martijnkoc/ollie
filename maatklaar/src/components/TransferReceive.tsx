"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { open, parseFragment, type Sealed } from "@/lib/transfer/crypto";
import { mergeIncoming } from "@/lib/transfer/merge";
import { projectSchema } from "@/lib/projects/schema";
import { loadProject, saveProject } from "@/lib/projects/store";
import { saveReturnContext, type Outbound } from "./project/transfer-client";

// One fetch per link, also when React runs effects twice in development: the code works only once.
const fetched = new Set<string>();

/** Opens a project sent from another device: fetch once, decrypt here, save on this device, continue. */
export function TransferReceive() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const f = parseFragment(window.location.hash);
    // The key and token leave the address bar and history right away.
    history.replaceState(null, "", "/overdracht");
    if (!f) {
      setError("Deze link is niet compleet. Scan de QR-code op je computer opnieuw.");
      return;
    }
    if (fetched.has(f.id)) return;
    fetched.add(f.id);
    void (async () => {
      try {
        const res = await fetch(`/api/overdracht/${f.id}/ophalen`, { method: "POST", headers: { "x-transfer-token": f.token } });
        const body = (await res.json().catch(() => ({}))) as { payload?: Sealed; error?: string };
        if (!res.ok || !body.payload) {
          setError(body.error ?? "Deze code werkt niet (meer). Maak op je computer een nieuwe.");
          return;
        }
        const data = await open<Outbound>(body.payload, f.key);
        const incoming = projectSchema.parse(data.project);
        const existing = await loadProject(incoming.id);
        await saveProject(existing ? mergeIncoming(existing, incoming).project : incoming);
        saveReturnContext(incoming.id, {
          id: f.id,
          token: data.returnToken,
          key: f.key,
          until: new Date(Date.now() + 2 * 3600_000).toISOString(),
        });
        router.replace(`/project/${incoming.id}#plinten-ramen`);
      } catch {
        setError("Dit project kon niet worden geopend. Maak op je computer een nieuwe code.");
      }
    })();
  }, [router]);

  return (
    <div className="container stack" style={{ padding: "40px 0", maxWidth: 560 }}>
      <h1 style={{ fontSize: "1.6rem" }}>Project overnemen</h1>
      {error ? (
        <>
          <p className="notice notice-warn" role="alert">
            {error}
          </p>
          <p>
            <Link href="/project">Naar je projecten op dit apparaat</Link>
          </p>
        </>
      ) : (
        <p role="status">Je project wordt veilig opgehaald…</p>
      )}
    </div>
  );
}
