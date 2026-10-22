import { beforeEach, describe, expect, it } from "vitest";
import { rightsFor } from "@/lib/access";
import { block } from "@/lib/blocks";
import type { Db } from "@/lib/db";
import { feed } from "@/lib/feed";
import { addPortfolioItem } from "@/lib/portfolio";
import { createProfile, profileByUsername, updateProfile, validateUsername } from "@/lib/profiles";
import { getService, saveService, setServiceStatus } from "@/lib/services";
import { favorite, follow } from "@/lib/social";
import { NOW, at, freshDb, makeMedia, makeUser, service } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const profileInput = (over: Record<string, unknown> = {}) => ({
  displayName: "Mila",
  username: "mila",
  headline: "Fotograaf",
  bio: "",
  categories: ["creatief"],
  skills: "portret, product",
  city: "Utrecht",
  region: "utrecht",
  worksRemote: false,
  travelKm: "",
  availability: "available",
  availabilityNote: "",
  sellerType: "private",
  kvkNumber: "",
  website: "",
  avatarId: null,
  coverId: null,
  published: true,
  ...over,
});

describe("profiles", () => {
  it("validates usernames and keeps them unique", async () => {
    expect(validateUsername("@Mila.de-Vries")).toBe("mila.de-vries");
    expect(() => validateUsername("ab")).toThrow("3 tot 30");
    expect(() => validateUsername("-mila")).toThrow();
    expect(() => validateUsername("admin")).toThrow("niet beschikbaar");
    const a = await makeUser(db, "Mila");
    const [{ id }] = await db.query<{ id: string }>(`insert into users (email) values ('b@test.nl') returning id`);
    const b = await rightsFor(db, id);
    await expect(createProfile(db, b, { displayName: "Mila 2", username: a.profile!.username, sell: false })).rejects.toThrow("bezet");
  });

  it("asks for a headline and category before going public, and a KvK number for businesses", async () => {
    const r = await makeUser(db, "Mila");
    await expect(updateProfile(db, r, profileInput({ headline: "" }) as never)).rejects.toThrow("kopregel");
    await expect(updateProfile(db, r, profileInput({ categories: [] }) as never)).rejects.toThrow("categorie");
    await expect(updateProfile(db, r, profileInput({ sellerType: "business", kvkNumber: "123" }) as never)).rejects.toThrow("KvK");
    await updateProfile(db, r, profileInput({ sellerType: "business", kvkNumber: "12345678", website: "mila.nl" }) as never);
    const p = await profileByUsername(db, "mila");
    expect(p).toMatchObject({ seller_type: "business", kvk_number: "12345678", website: "https://mila.nl/", published: true });
  });

  it("refuses someone else's photo", async () => {
    const mila = await makeUser(db, "Mila");
    const bas = await makeUser(db, "Bas");
    const basPhoto = await makeMedia(db, bas, "avatar");
    await expect(updateProfile(db, mila, profileInput({ avatarId: basPhoto }) as never)).rejects.toThrow("kunnen we niet gebruiken");
  });
});

describe("visibility and discovery", () => {
  async function world() {
    const mila = await makeUser(db, "Mila", { maker: true, region: "utrecht" });
    const remote = await makeUser(db, "Rob", { maker: true, region: "zeeland", remote: true });
    const draftMaker = await makeUser(db, "Dora");
    const bas = await makeUser(db, "Bas");
    const s1 = await saveService(db, mila, service() as never, undefined, at(1));
    const s2 = await saveService(
      db,
      remote,
      service({ title: "Webshop bouwen in Shopify", category: "digitaal", kind: "custom", price: "", locationMode: "remote" }) as never,
      undefined,
      at(2),
    );
    const s3 = await saveService(db, draftMaker, service({ title: "Verborgen dienst van Dora" }) as never, undefined, at(3));
    const draft = await saveService(db, mila, service({ title: "Nog een concept", status: "draft" }) as never, undefined, at(4));
    const media = await makeMedia(db, mila, "portfolio");
    await addPortfolioItem(db, mila, { title: "Bakkerij", description: "", category: "creatief", mediaId: media }, at(5));
    return { mila, remote, draftMaker, bas, s1, s2, s3, draft };
  }
  const titles = (items: { type: string; title?: string; display_name?: string }[]) => items.map((i) => i.title ?? i.display_name);

  it("shows only published content of public, unrestricted makers", async () => {
    const w = await world();
    const all = titles((await feed(db, { kind: "all" })).items);
    expect(all).toEqual(expect.arrayContaining(["Portretshoot op locatie", "Webshop bouwen in Shopify", "Bakkerij", "Mila", "Rob"]));
    expect(all).not.toContain("Verborgen dienst van Dora");
    expect(all).not.toContain("Nog een concept");
    expect(await getService(db, w.s3)).toBeUndefined();
    expect(await getService(db, w.draft)).toBeUndefined();
    expect((await getService(db, w.draft, w.mila.user.id))?.visible).toBe(false);

    await db.query(`update users set restricted_at = now(), restricted_reason = 'test' where id = $1`, [w.remote.user.id]);
    expect(titles((await feed(db, { kind: "all" })).items)).not.toContain("Webshop bouwen in Shopify");
  });

  it("filters by text, category, province, remote, booking type and price", async () => {
    await world();
    const t = async (q: Parameters<typeof feed>[1]) => titles((await feed(db, q)).items);
    expect(await t({ kind: "services", q: "shopify" })).toEqual(["Webshop bouwen in Shopify"]);
    expect(await t({ kind: "services", q: "100%_" })).toEqual([]);
    expect(await t({ kind: "all", category: "digitaal" })).toEqual(["Webshop bouwen in Shopify"]);
    expect(await t({ kind: "makers", region: "utrecht" })).toEqual(["Mila"]);
    expect(await t({ kind: "makers", region: "utrecht", remote: true })).toEqual(expect.arrayContaining(["Mila", "Rob"]));
    expect(await t({ kind: "services", booking: "direct" })).toEqual(["Portretshoot op locatie"]);
    expect(await t({ kind: "services", booking: "overleg" })).toEqual(["Webshop bouwen in Shopify"]);
    expect(await t({ kind: "services", booking: "direct", maxPriceCents: 10_000 })).toEqual([]);
  });

  it("paginates newest first without repeating items", async () => {
    await world();
    const first = await feed(db, { kind: "all", limit: 3 });
    expect(first.items).toHaveLength(3);
    const second = await feed(db, { kind: "all", limit: 3, before: first.next });
    const ids = [...first.items, ...second.items].map((i) => `${i.type}${i.id}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hides blocked people both ways, limits 'following' to followed makers, and refuses saving what you cannot see", async () => {
    const w = await world();
    await follow(db, w.bas, w.remote.user.id, true, NOW);
    expect(titles((await feed(db, { kind: "services", following: true }, w.bas.user.id)).items)).toEqual(["Webshop bouwen in Shopify"]);
    expect((await feed(db, { kind: "services", following: true })).items).toEqual([]);
    await block(db, w.mila.user.id, w.bas.user.id, NOW);
    expect(titles((await feed(db, { kind: "all" }, w.bas.user.id)).items)).not.toContain("Portretshoot op locatie");
    expect(await getService(db, w.s1, w.bas.user.id)).toBeUndefined();
    expect(await profileByUsername(db, "mila", w.bas.user.id)).toBeUndefined();
    await expect(favorite(db, w.bas, { type: "service", id: w.s1 }, true, NOW)).rejects.toThrow("niet bewaren");
    await expect(follow(db, w.bas, w.mila.user.id, true, NOW)).rejects.toThrow();
    await expect(follow(db, w.bas, w.draftMaker.user.id, true, NOW)).rejects.toThrow("bestaat niet");
  });

  it("only lets owners change their services", async () => {
    const w = await world();
    await expect(setServiceStatus(db, w.bas, w.s1, "paused")).rejects.toThrow("bestaat niet");
    await expect(saveService(db, w.bas, service() as never, w.s1)).rejects.toThrow("bestaat niet");
    await expect(saveService(db, w.mila, service({ price: "2" }) as never)).rejects.toThrow("minimaal");
    await expect(saveService(db, w.mila, service({ description: "Te kort" }) as never)).rejects.toThrow("30 tekens");
  });
});
