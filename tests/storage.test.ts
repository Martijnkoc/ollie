import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { assertOwnMedia, deleteOrphans, finishUpload, receiveLocal, sniff, startUpload } from "@/lib/storage";
import { NOW, days, freshDb, makeUser } from "./helpers";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const MP4 = Uint8Array.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 2, 0]);
const stream = (bytes: Uint8Array) => new Blob([Uint8Array.from(bytes)]).stream();

let db: Db;
beforeAll(() => {
  process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "sy-uploads-"));
});
beforeEach(async () => {
  db = await freshDb();
});

describe("file type checks", () => {
  it("recognises files by their bytes", () => {
    expect(sniff(JPEG)).toBe("image/jpeg");
    expect(sniff(PNG)).toBe("image/png");
    expect(sniff(MP4)).toBe("video/mp4");
    expect(sniff(Buffer.from("<svg onload=alert(1)>"))).toBeUndefined();
    expect(sniff(Buffer.from("dit is tekst"))).toBeUndefined();
  });
});

describe("uploads", () => {
  it("refuses unknown purposes, wrong types for a purpose, SVG and oversized files", async () => {
    const r = await makeUser(db, "Mila", { maker: true });
    await expect(startUpload(db, r.user.id, { purpose: "x", contentType: "image/png", size: 10 }, NOW)).rejects.toThrow("Onbekend");
    await expect(startUpload(db, r.user.id, { purpose: "avatar", contentType: "video/mp4", size: 10 }, NOW)).rejects.toThrow(
      "JPG, PNG of WebP",
    );
    await expect(startUpload(db, r.user.id, { purpose: "portfolio", contentType: "image/svg+xml", size: 10 }, NOW)).rejects.toThrow();
    await expect(startUpload(db, r.user.id, { purpose: "avatar", contentType: "image/png", size: 6 * 1024 * 1024 }, NOW)).rejects.toThrow(
      "te groot",
    );
  });

  it("accepts a real image, rejects a disguised one, and only for its owner", async () => {
    const mila = await makeUser(db, "Mila", { maker: true });
    const bas = await makeUser(db, "Bas");
    const good = await startUpload(db, mila.user.id, { purpose: "portfolio", contentType: "image/jpeg", size: JPEG.length }, NOW);
    expect(good.uploadUrl).toBe(`/api/uploads/${good.id}`);
    await expect(receiveLocal(db, bas.user.id, good.id, stream(JPEG))).rejects.toThrow("bestaat niet");
    await receiveLocal(db, mila.user.id, good.id, stream(JPEG));
    await expect(finishUpload(db, bas.user.id, good.id)).rejects.toThrow("bestaat niet");
    const done = await finishUpload(db, mila.user.id, good.id);
    expect(done.url).toMatch(/^\/media\/.+\.jpg$/);
    expect(await assertOwnMedia(db, mila.user.id, good.id, ["portfolio"])).toBe(good.id);
    await expect(assertOwnMedia(db, bas.user.id, good.id, ["portfolio"])).rejects.toThrow();
    await expect(assertOwnMedia(db, mila.user.id, good.id, ["avatar"])).rejects.toThrow();

    const fake = await startUpload(db, mila.user.id, { purpose: "portfolio", contentType: "image/jpeg", size: 12 }, NOW);
    await receiveLocal(db, mila.user.id, fake.id, stream(Buffer.from("geen foto!!!")));
    await expect(finishUpload(db, mila.user.id, fake.id)).rejects.toThrow("niet wat het lijkt");
    expect(await db.query(`select 1 from media where id = $1`, [fake.id])).toHaveLength(0);
  });

  it("never accepts more bytes than announced", async () => {
    const mila = await makeUser(db, "Mila", { maker: true });
    const t = await startUpload(db, mila.user.id, { purpose: "avatar", contentType: "image/png", size: 4 }, NOW);
    await expect(receiveLocal(db, mila.user.id, t.id, stream(PNG))).rejects.toThrow("groter dan aangekondigd");
  });

  it("cleans up files nobody uses after a day", async () => {
    const mila = await makeUser(db, "Mila", { maker: true });
    const t = await startUpload(db, mila.user.id, { purpose: "avatar", contentType: "image/png", size: PNG.length }, NOW);
    await receiveLocal(db, mila.user.id, t.id, stream(PNG));
    await finishUpload(db, mila.user.id, t.id);
    expect(await deleteOrphans(db, NOW)).toBe(0);
    expect(await deleteOrphans(db, days(2))).toBe(1);
  });
});
