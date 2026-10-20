"use client";

import { BRAND } from "@/config/brand";
import Link from "next/link";
import { useEffect, useState } from "react";
import { findProjectByOrder, saveProject } from "@/lib/projects/store";
import { refreshPayment } from "./payment-client";

type State =
  | { kind: "checking" }
  | { kind: "paid"; projectId: string; demo: boolean }
  | { kind: "waiting"; projectId: string }
  | { kind: "not-paid"; projectId: string; status: string }
  | { kind: "no-project" }
  | { kind: "error"; projectId: string };

const NOT_PAID: Record<string, string> = {
  failed: "De betaling is niet gelukt. Er is niets afgeschreven.",
  canceled: "Je hebt de betaling geannuleerd. Er is niets afgeschreven.",
  expired: "De betaling is verlopen. Je kunt het opnieuw proberen.",
  refunded: "Deze betaling is terugbetaald.",
};

export function PaymentReturn({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let alive = true;
    let tries = 0;
    async function check() {
      const project = orderId ? await findProjectByOrder(orderId).catch(() => null) : null;
      if (!project?.payment) {
        if (alive) setState({ kind: "no-project" });
        return;
      }
      const next = await refreshPayment(project.payment).catch(() => null);
      if (!alive) return;
      if (!next) return setState({ kind: "error", projectId: project.id });
      await saveProject({ ...project, payment: next, updatedAt: new Date().toISOString() });
      if (next.status === "paid") {
        setState({ kind: "paid", projectId: project.id, demo: next.mode === "demo" });
        setTimeout(() => alive && window.location.assign(`/project/${project.id}#plinten-ramen`), 1500);
      } else if ((next.status === "open" || next.status === "pending") && tries < 10) {
        // Bank transfers via iDEAL usually settle within seconds; keep asking the server for a short while.
        tries++;
        setState({ kind: "waiting", projectId: project.id });
        setTimeout(() => alive && void check(), 2000);
      } else if (next.status === "open" || next.status === "pending") {
        setState({ kind: "waiting", projectId: project.id });
      } else setState({ kind: "not-paid", projectId: project.id, status: next.status });
    }
    void check();
    return () => {
      alive = false;
    };
  }, [orderId]);

  return (
    <div className="container app-shell">
      <div className="panel stack" aria-live="polite">
        {state.kind === "checking" && (
          <>
            <h1>We controleren je betaling</h1>
            <p className="muted">We vragen de status op bij de betaalprovider. Dit duurt meestal een paar seconden.</p>
          </>
        )}
        {state.kind === "paid" && (
          <>
            <h1>Betaling ontvangen</h1>
            <p>
              {state.demo
                ? "DEMO: de nagebootste betaling is gelukt. Er is geen geld afgeschreven."
                : "Dank je wel. Je volledige rapport is ontgrendeld."}
            </p>
            <Link className="btn btn-primary" href={`/project/${state.projectId}#plinten-ramen`}>
              Naar plinten en ramen
            </Link>
          </>
        )}
        {state.kind === "waiting" && (
          <>
            <h1>Je betaling is nog niet bevestigd</h1>
            <p className="muted">
              De betaalprovider heeft de betaling nog niet als geslaagd gemeld. Zodra dat gebeurt, wordt je rapport ontgrendeld. Je kunt
              deze pagina open laten of later je project openen; we controleren het dan opnieuw.
            </p>
            <Link className="btn" href={`/project/${state.projectId}#plinten-ramen`}>
              Terug naar mijn project
            </Link>
          </>
        )}
        {state.kind === "not-paid" && (
          <>
            <h1>Niet betaald</h1>
            <p>{NOT_PAID[state.status] ?? "De betaling is niet afgerond."}</p>
            <Link className="btn btn-primary" href={`/project/${state.projectId}#plinten-ramen`}>
              Terug naar mijn project
            </Link>
          </>
        )}
        {state.kind === "error" && (
          <>
            <h1>Status nu niet op te halen</h1>
            <p className="muted">
              We konden de betaalstatus nu niet controleren. Je project is bewaard; open het later opnieuw, dan proberen we het nog eens.
            </p>
            <Link className="btn" href={`/project/${state.projectId}#plinten-ramen`}>
              Naar mijn project
            </Link>
          </>
        )}
        {state.kind === "no-project" && (
          <>
            <h1>We vinden je project niet in deze browser</h1>
            <p>
              Je project staat in de browser waarin je begon. Na een betaling via de app van je bank kom je soms in een andere browser
              terug. Open {BRAND.name} in de browser waarin je begon en open je project via <strong>Mijn projecten</strong>: daar
              controleren we de betaling opnieuw en ontgrendelen we je rapport.
            </p>
            <p className="small muted">
              Je betaalreferentie: {orderId ? <span className="code">{orderId}</span> : "onbekend"}. Bewaar deze voor vragen over je
              betaling.
            </p>
            <Link className="btn" href="/project">
              Mijn projecten in deze browser
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
