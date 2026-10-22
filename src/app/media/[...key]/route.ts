import { getDb, one } from "@/lib/db";
import { KEY_PATTERN, readLocal, storageMode } from "@/lib/storage";

/**
 * Serves uploaded files in local mode. Only checked files are served, always with the type we recorded,
 * never sniffed by the browser, and with byte ranges so videos can seek.
 */
export async function GET(req: Request, ctx: RouteContext<"/media/[...key]">) {
  if (storageMode() !== "local") return new Response("Niet gevonden", { status: 404 });
  const key = (await ctx.params).key.join("/");
  if (!KEY_PATTERN.test(key)) return new Response("Niet gevonden", { status: 404 });
  const m = await one<{ content_type: string }>(
    await getDb(),
    `select content_type from media where storage_key = $1 and status = 'ready'`,
    [key],
  );
  if (!m) return new Response("Niet gevonden", { status: 404 });
  let file;
  try {
    file = await readLocal(key);
  } catch {
    return new Response("Niet gevonden", { status: 404 });
  }
  try {
    const { size } = await file.stat();
    const headers: Record<string, string> = {
      "Content-Type": m.content_type,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    let start = 0;
    let end = size - 1;
    let status = 200;
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
    const length = end - start + 1;
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, start);
    headers["Content-Length"] = String(length);
    return new Response(buffer, { status, headers });
  } finally {
    await file.close();
  }
}
