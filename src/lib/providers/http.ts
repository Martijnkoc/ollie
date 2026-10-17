/**
 * Resilient JSON-over-HTTPS for data providers: a hard timeout per attempt, a bounded number of
 * retries with exponential back-off and jitter for transient failures (network, timeout, 5xx,
 * 429 with a short Retry-After), and no retries for errors that will not go away by themselves.
 *
 * Secrets are sent in headers by the callers and never appear in URLs, errors or logs.
 */

export type ProviderErrorKind =
  "auth" | "forbidden" | "not_found" | "bad_request" | "rate_limited" | "server" | "timeout" | "network" | "invalid_response";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly status?: number,
    /** Seconds until the provider accepts requests again, when it told us. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get transient() {
    return this.kind === "server" || this.kind === "timeout" || this.kind === "network" || this.kind === "rate_limited";
  }
}

export interface RequestRecord {
  /** Path without query string or credentials, for logs. */
  path: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  rateRemaining: number | null;
}

export interface HttpOptions {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  /** Longest Retry-After we are willing to wait inside one request. */
  maxRetryAfterMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onRequest?: (record: RequestRecord) => void;
  /** Extracts the remaining-requests counter from a response, if the provider reports one. */
  rateRemaining?: (headers: Headers, body: unknown) => number | null;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "bad_request";
}

/** Text from an error body, cut short and without anything that looks like a token. */
function safeMessage(body: unknown): string | undefined {
  const raw = typeof body === "object" && body && "message" in body ? String((body as { message: unknown }).message) : undefined;
  return raw?.replace(/[A-Za-z0-9]{32,}/g, "[…]").slice(0, 200);
}

export async function getJson(
  url: URL,
  headers: Record<string, string>,
  options: HttpOptions = {},
): Promise<{ status: number; body: unknown }> {
  const { timeoutMs = 10_000, retries = 2, baseDelayMs = 400, maxRetryAfterMs = 8_000, fetchImpl = fetch, sleep = defaultSleep } = options;
  const path = url.pathname;
  let lastError: ProviderError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = lastError?.retryAfterSeconds !== undefined ? lastError.retryAfterSeconds * 1000 : baseDelayMs * 2 ** (attempt - 1);
      await sleep(Math.min(wait, maxRetryAfterMs) + Math.floor(Math.random() * baseDelayMs * 0.25));
    }
    const started = Date.now();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      lastError = new ProviderError(
        timedOut ? `Time-out na ${timeoutMs} ms` : "Netwerkfout bij de databron",
        timedOut ? "timeout" : "network",
      );
      options.onRequest?.({ path, status: null, ok: false, durationMs: Date.now() - started, rateRemaining: null });
      continue;
    }

    let body: unknown;
    const text = await response.text().catch(() => "");
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = undefined;
    }
    const remaining = options.rateRemaining?.(response.headers, body) ?? null;
    options.onRequest?.({ path, status: response.status, ok: response.ok, durationMs: Date.now() - started, rateRemaining: remaining });

    if (response.ok) {
      if (body === undefined) throw new ProviderError("De databron stuurde geen geldige JSON", "invalid_response", response.status);
      return { status: response.status, body };
    }

    const kind = kindForStatus(response.status);
    const after = retryAfterMs(response.headers);
    lastError = new ProviderError(
      safeMessage(body) ?? `HTTP ${response.status} van de databron`,
      kind,
      response.status,
      after !== undefined ? Math.ceil(after / 1000) : undefined,
    );
    // A long cool-down is not worth waiting for inside one request: give up and let the scheduler back off.
    if (kind === "rate_limited" && after !== undefined && after > maxRetryAfterMs) throw lastError;
    if (!lastError.transient) throw lastError;
  }
  throw lastError ?? new ProviderError("Onbekende fout bij de databron", "network");
}
