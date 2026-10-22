import "server-only";

/**
 * A short-lived Server-Sent Events stream that polls for new rows. The browser's EventSource
 * reconnects by itself and sends Last-Event-ID, so nothing is missed between connections.
 * Access is checked by the caller before the stream starts, with the same rules as the pages.
 */
export function pollingStream<T extends { id: number }>(
  req: Request,
  after: number,
  poll: (after: number) => Promise<T[]>,
  lifetimeMs = 25_000,
) {
  const encoder = new TextEncoder();
  let last = after;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      send("retry: 1500\n\n");
      const until = Date.now() + lifetimeMs;
      try {
        while (Date.now() < until && !req.signal.aborted) {
          for (const row of await poll(last)) {
            send(`id: ${row.id}\nevent: message\ndata: ${JSON.stringify(row)}\n\n`);
            last = row.id;
          }
          send(": ping\n\n");
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch {
        // The client reconnects; the next connection re-checks access.
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function startId(req: Request) {
  const fromHeader = Number(req.headers.get("last-event-id"));
  const fromQuery = Number(new URL(req.url).searchParams.get("after"));
  return Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : Number.isFinite(fromQuery) ? fromQuery : 0;
}
