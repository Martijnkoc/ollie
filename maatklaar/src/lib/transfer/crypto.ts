/**
 * End-to-end encryption for moving a project between a phone and a computer. The key is made in the browser
 * and travels only in the fragment of the transfer link (never sent to a server); the server stores
 * ciphertext it cannot read. AES-GCM 256 via WebCrypto, tokens are random and only their SHA-256 is stored.
 */
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomToken = (bytes = 24) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Sealed = { iv: string; data: string };

async function importKey(key: string) {
  return crypto.subtle.importKey("raw", fromB64url(key), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(value: unknown, key: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(key), new TextEncoder().encode(JSON.stringify(value)));
  return { iv: b64url(iv), data: b64url(new Uint8Array(data)) };
}

/** Throws when the key is wrong or the data was changed on the way. */
export async function open<T>(sealed: Sealed, key: string): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(sealed.iv) }, await importKey(key), fromB64url(sealed.data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** The link fragment: transfer id, one-time token and key. Nothing personal. */
export function transferFragment(id: string, token: string, key: string) {
  return `${id}.${token}.${key}`;
}

export function parseFragment(hash: string): { id: string; token: string; key: string } | null {
  const m = /^#?([A-Za-z0-9_-]{16,40})\.([A-Za-z0-9_-]{20,60})\.([A-Za-z0-9_-]{40,50})$/.exec(hash);
  return m ? { id: m[1]!, token: m[2]!, key: m[3]! } : null;
}
