import "server-only";
import { randomUUID } from "node:crypto";
import { IMAGE_MAX_BYTES, UPLOAD_LIMITS, type UploadPurpose } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { limit } from "./ratelimit";

/**
 * supabase – Supabase Storage (public bucket); the browser uploads straight to a signed URL.
 * local    – files on this server's disk (.data/uploads), for development and the automated tests only.
 * none     – not configured: uploading says so instead of pretending.
 */
export function storageMode(): "supabase" | "local" | "none" {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  if (process.env.NODE_ENV !== "production") return "local";
  if (process.env.STORAGE_PROVIDER === "local" && process.env.ALLOW_TEST_TRANSPORTS === "true") return "local";
  return "none";
}

const BUCKET = () => process.env.SUPABASE_STORAGE_BUCKET ?? "media";
const LOCAL_DIR = () => process.env.UPLOAD_DIR ?? ".data/uploads";

/** Only these types are accepted, and only when the stored bytes match. No SVG: it can carry scripts. */
export const TYPES: Record<string, { kind: "image" | "video"; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" },
};

export const KEY_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm|mov)$/;

/** Recognises the file type from its first bytes; the browser's claim is never trusted on its own. */
export function sniff(head: Uint8Array): string | undefined {
  const b = head;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (ascii(4, 8) === "ftyp") return ascii(8, 10) === "qt" ? "video/quicktime" : "video/mp4";
  return undefined;
}

export function mediaUrl(key: string | null | undefined) {
  if (!key) return null;
  if (storageMode() === "supabase") {
    return `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET()}/${key}`;
  }
  return `/media/${key}`;
}

function maxBytes(purpose: UploadPurpose, kind: "image" | "video") {
  return Math.min(UPLOAD_LIMITS[purpose].maxBytes, kind === "image" ? IMAGE_MAX_BYTES : Infinity);
}

async function supabase() {
  const { StorageClient } = await import("@supabase/storage-js");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return new StorageClient(`${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1`, {
    apikey: key,
    Authorization: `Bearer ${key}`,
  }).from(BUCKET());
}

export type UploadTicket = { id: string; uploadUrl: string; headers: Record<string, string> };

/** Step 1: the server decides where the file may go. Nothing is public until step 3 has checked it. */
export async function startUpload(
  db: Db,
  userId: string,
  input: { purpose: string; contentType: string; size: number },
  now = new Date(),
): Promise<UploadTicket> {
  const mode = storageMode();
  if (mode === "none") throw new UserError("Uploaden is nog niet geconfigureerd: er is geen opslag ingesteld.");
  if (!(input.purpose in UPLOAD_LIMITS)) throw new UserError("Onbekend soort upload.");
  const purpose = input.purpose as UploadPurpose;
  const type = TYPES[input.contentType];
  const allowed = UPLOAD_LIMITS[purpose].kinds as readonly string[];
  if (!type || !allowed.includes(type.kind)) {
    throw new UserError(
      allowed.includes("video") ? "Kies een foto (JPG, PNG, WebP) of video (MP4, WebM, MOV)." : "Kies een foto: JPG, PNG of WebP.",
    );
  }
  const max = maxBytes(purpose, type.kind);
  if (!Number.isFinite(input.size) || input.size <= 0) throw new UserError("Dit bestand is leeg.");
  if (input.size > max) throw new UserError(`Dit bestand is te groot. Het maximum is ${Math.round(max / 1024 / 1024)} MB.`);
  await limit(db, "uploads", userId, now);

  const id = randomUUID();
  const key = `${userId}/${id}.${type.ext}`;
  await db.query(
    `insert into media (id, owner_id, purpose, kind, storage_key, content_type, size_bytes, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, purpose, type.kind, key, input.contentType, input.size, now],
  );
  if (mode === "local") return { id, uploadUrl: `/api/uploads/${id}`, headers: { "content-type": input.contentType } };
  const { data, error } = await (await supabase()).createSignedUploadUrl(key);
  if (error || !data) {
    await db.query(`delete from media where id = $1`, [id]);
    throw new UserError("De opslag is nu niet bereikbaar. Probeer het zo nog eens.");
  }
  return {
    id,
    uploadUrl: data.signedUrl,
    headers: { "content-type": input.contentType, "cache-control": "max-age=31536000", "x-upsert": "false" },
  };
}

/** Step 2 (local mode only): our own endpoint receives the bytes, capped at the announced size. */
export async function receiveLocal(db: Db, userId: string, mediaId: string, body: ReadableStream<Uint8Array> | null) {
  const m = await one<{ storage_key: string; size_bytes: string; status: string; owner_id: string }>(
    db,
    `select storage_key, size_bytes, status, owner_id from media where id = $1`,
    [mediaId],
  );
  if (!m || m.owner_id !== userId || m.status !== "pending") throw new UserError("Deze upload bestaat niet.");
  if (!body) throw new UserError("Er kwam geen bestand mee.");
  const cap = Number(m.size_bytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new UserError("Het bestand is groter dan aangekondigd.");
    }
    chunks.push(value);
  }
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(/*turbopackIgnore: true*/ LOCAL_DIR(), m.storage_key);
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  await fs.writeFile(/*turbopackIgnore: true*/ file, Buffer.concat(chunks));
}

async function stored(key: string): Promise<{ size: number; head: Uint8Array } | undefined> {
  if (storageMode() === "local") {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    try {
      const handle = await fs.open(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ LOCAL_DIR(), key));
      try {
        const { size } = await handle.stat();
        const head = new Uint8Array(16);
        await handle.read(head, 0, 16, 0);
        return { size, head };
      } finally {
        await handle.close();
      }
    } catch {
      return undefined;
    }
  }
  const bucket = await supabase();
  const { data, error } = await bucket.info(key);
  if (error || !data) return undefined;
  const res = await fetch(mediaUrl(key)!, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
  if (!res.ok) return undefined;
  return { size: Number(data.size ?? 0), head: new Uint8Array(await res.arrayBuffer()).slice(0, 16) };
}

export async function removeObjects(keys: string[]) {
  if (!keys.length) return;
  try {
    if (storageMode() === "local") {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      await Promise.all(
        keys.map((k) => fs.rm(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ LOCAL_DIR(), k), { force: true })),
      );
    } else if (storageMode() === "supabase") {
      await (await supabase()).remove(keys);
    }
  } catch (err) {
    // The sweep tries again for rows that still exist; a stray object is never served without a row.
    console.error(`[storage] remove failed: ${err instanceof Error ? err.message : err}`);
  }
}

/** Step 3: check what was actually stored. Only then does the file become usable. */
export async function finishUpload(db: Db, userId: string, mediaId: string) {
  const m = await one<{
    storage_key: string;
    content_type: string;
    purpose: UploadPurpose;
    kind: "image" | "video";
    status: string;
    owner_id: string;
  }>(db, `select storage_key, content_type, purpose, kind, status, owner_id from media where id = $1`, [mediaId]);
  if (!m || m.owner_id !== userId) throw new UserError("Deze upload bestaat niet.");
  if (m.status === "ready") return { id: mediaId, url: mediaUrl(m.storage_key)!, kind: m.kind };
  const file = await stored(m.storage_key);
  const fail = async (message: string) => {
    await db.query(`delete from media where id = $1`, [mediaId]);
    await removeObjects([m.storage_key]);
    throw new UserError(message);
  };
  if (!file || file.size === 0) return fail("Het bestand is niet goed aangekomen. Probeer het opnieuw.");
  if (file.size > maxBytes(m.purpose, m.kind)) return fail("Dit bestand is te groot.");
  if (sniff(file.head) !== m.content_type) return fail("Dit bestand is niet wat het lijkt te zijn. Kies een echte foto of video.");
  await db.query(`update media set status = 'ready', size_bytes = $2 where id = $1`, [mediaId, file.size]);
  return { id: mediaId, url: mediaUrl(m.storage_key)!, kind: m.kind };
}

/** Server actions only link files that belong to the caller, are checked, and were uploaded for this purpose. */
export async function assertOwnMedia(db: Db, userId: string, mediaId: string | null | undefined, purposes: UploadPurpose[]) {
  if (!mediaId) return null;
  const m = await one<{ id: string }>(
    db,
    `select id from media where id::text = $1 and owner_id = $2 and status = 'ready' and purpose = any($3::text[])`,
    [mediaId, userId, purposes],
  );
  if (!m) throw new UserError("Deze foto of video kunnen we niet gebruiken. Upload hem opnieuw.");
  return m.id;
}

export async function readLocal(key: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return fs.open(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ LOCAL_DIR(), key));
}

/** Media rows nobody refers to (abandoned uploads, replaced photos) and their files. */
export async function deleteOrphans(db: Db, now = new Date()) {
  const rows = await db.query<{ id: string; storage_key: string }>(
    `select m.id, m.storage_key from media m
     where m.created_at < $1 - interval '1 day'
       and (m.status = 'pending' or (
         not exists (select 1 from profiles p where p.avatar_id = m.id or p.cover_id = m.id)
         and not exists (select 1 from services s where s.cover_id = m.id)
         and not exists (select 1 from portfolio_items i where i.media_id = m.id)))
     limit 500`,
    [now],
  );
  if (!rows.length) return 0;
  await db.query(`delete from media where id = any($1::uuid[])`, [rows.map((r) => r.id)]);
  await removeObjects(rows.map((r) => r.storage_key));
  return rows.length;
}
