import { describe, expect, it } from "vitest";
import { imageDimensions, sniffKind } from "@/lib/documents/sniff";
import { checkUpload } from "@/lib/documents/validate";
import { fixture, openFixturePdf } from "./support/pdf";

const limits = { maxUploadBytes: 20 * 1024 * 1024, maxImagePixels: 50_000_000, minImageWidthPx: 800 };

describe("bestandssignatuur", () => {
  it("herkent PDF, PNG, JPG en WEBP aan de inhoud", () => {
    expect(sniffKind(fixture("appartement.pdf"))).toBe("pdf");
    expect(sniffKind(fixture("scan-helder.png"))).toBe("png");
    expect(sniffKind(fixture("scan-helder.jpg"))).toBe("jpeg");
    expect(sniffKind(fixture("klein.webp"))).toBe("webp");
    expect(sniffKind(fixture("nep-afbeelding.png"))).toBeNull();
  });

  it("leest afmetingen uit de header zonder te decoderen", () => {
    expect(imageDimensions(fixture("scan-helder.png"), "png")).toEqual({ width: 1600, height: 1100 });
    expect(imageDimensions(fixture("scan-helder.jpg"), "jpeg")).toEqual({ width: 1600, height: 1100 });
    expect(imageDimensions(fixture("klein.webp"), "webp")).toEqual({ width: 400, height: 300 });
  });
});

describe("uploadvalidatie", () => {
  it("accepteert geldige bestanden", () => {
    expect(checkUpload({ type: "application/pdf", size: 3000 }, fixture("appartement.pdf"), limits)).toMatchObject({
      ok: true,
      kind: "pdf",
    });
    expect(checkUpload({ type: "image/png", size: 30000 }, fixture("scan-helder.png"), limits)).toMatchObject({
      ok: true,
      kind: "png",
      width: 1600,
    });
    // Mobile pickers without a type: content decides.
    expect(checkUpload({ type: "", size: 30000 }, fixture("scan-helder.jpg"), limits)).toMatchObject({ ok: true, kind: "jpeg" });
  });

  it("vertrouwt de extensie niet: tekst met .png wordt geweigerd", () => {
    const r = checkUpload({ type: "image/png", size: 48 }, fixture("nep-afbeelding.png"), limits);
    expect(r.ok).toBe(false);
  });

  it("weigert een MIME-type dat niet bij de inhoud past", () => {
    const r = checkUpload({ type: "application/pdf", size: 30000 }, fixture("scan-helder.png"), limits);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/inhoud is PNG/);
    expect(checkUpload({ type: "text/html", size: 30000 }, fixture("scan-helder.png"), limits).ok).toBe(false);
  });

  it("weigert te grote en lege bestanden", () => {
    const big = checkUpload({ type: "application/pdf", size: 25 * 1024 * 1024 }, fixture("appartement.pdf"), limits);
    expect(big).toMatchObject({ ok: false });
    if (!big.ok) expect(big.error).toMatch(/groter dan 20 MB/);
    expect(checkUpload({ type: "application/pdf", size: 0 }, new Uint8Array(), limits).ok).toBe(false);
  });

  it("weigert een afbeelding met absurde afmetingen (decompressiebom) vóór decoderen", () => {
    const png = fixture("scan-helder.png").slice();
    const view = new DataView(png.buffer);
    view.setUint32(16, 60_000);
    view.setUint32(20, 60_000);
    const r = checkUpload({ type: "image/png", size: png.length }, png, limits);
    expect(r).toMatchObject({ ok: false });
  });

  it("waarschuwt bij een smalle afbeelding", () => {
    const r = checkUpload({ type: "image/webp", size: 1084 }, fixture("klein.webp"), limits);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.notes.join(" ")).toMatch(/smal/);
  });

  it("een kapotte PDF met geldige header slaagt voor de signatuur maar faalt netjes bij openen", async () => {
    const check = checkUpload({ type: "application/pdf", size: 234 }, fixture("kapot.pdf"), limits);
    expect(check).toMatchObject({ ok: true });
    if (check.ok) expect(check.notes.join(" ")).toMatch(/niet volledig/);
    await expect(openFixturePdf("kapot.pdf")).rejects.toThrow();
  });

  it("leest een PDF met meerdere pagina's", async () => {
    const doc = await openFixturePdf("appartement.pdf");
    expect(doc.numPages).toBe(2);
  });
});
