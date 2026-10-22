import { beforeEach, describe, expect, it } from "vitest";
import type { Rights } from "@/lib/access";
import { creditSummary } from "@/lib/billing/credits";
import { getChannel, postMessage } from "@/lib/community/channels";
import { heartbeat } from "@/lib/dates/session";
import type { Db } from "@/lib/db";
import { submitFeedback } from "@/lib/feedback";
import { acceptInvite, confirmGuest, createInvite } from "@/lib/invites";
import { createReport, decideAppeal, grantRole, restrictUser, submitAppeal } from "@/lib/moderation";
import { createFakeProvider } from "@/lib/video/provider";
import { NOW, at, freshDb, makeUser, refresh } from "./helpers";

let db: Db;
let anna: Rights;
let bram: Rights;
let mod: Rights;

beforeEach(async () => {
  db = await freshDb();
  anna = await makeUser(db, "anna@x.nl", { member: true, alias: "Anna" });
  bram = await makeUser(db, "bram@x.nl", { member: true, alias: "Bram" });
  mod = await makeUser(db, "mod@x.nl");
  await db.query(`insert into roles (user_id, role) values ($1, 'moderator')`, [mod.user.id]);
  mod = await refresh(db, mod);
});

describe("reports", () => {
  it("take the target and excerpt from our data, and only for things the reporter can see", async () => {
    const lounge = (await getChannel(db, "lounge"))!;
    const id = await postMessage(db, bram, lounge.id, "ongepast bericht", NOW);
    const target = await createReport(db, anna, { context: "message", contextId: String(id), reason: "gedrag", details: "" }, NOW);
    expect(target).toBe(bram.user.id);
    const [r] = await db.query<{ excerpt: string }>(`select excerpt from reports`);
    expect(r.excerpt).toBe("ongepast bericht");
    const outsider = await makeUser(db, "x@x.nl");
    await expect(
      createReport(db, outsider, { context: "message", contextId: String(id), reason: "gedrag", details: "" }, NOW),
    ).rejects.toThrow();
    await expect(
      createReport(db, anna, { context: "date", contextId: "00000000-0000-0000-0000-000000000000", reason: "gedrag", details: "" }, NOW),
    ).rejects.toThrow("niet melden");
  });
});

describe("restrictions", () => {
  it("need a moderator and a reason, stop access and appointments, and are logged", async () => {
    await expect(restrictUser(db, anna, bram.user.id, "spam spam", undefined, NOW)).rejects.toThrow("moderatoren");
    await expect(restrictUser(db, mod, bram.user.id, "kort", undefined, NOW)).rejects.toThrow("reden");

    const START = at(24 * 60);
    const guest = await makeUser(db, "g@x.nl");
    const { id, token } = await createInvite(db, bram, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
    await acceptInvite(db, guest.user.id, token, { moment: START, name: "G", note: "" }, NOW);
    await confirmGuest(db, bram, id, NOW);
    expect((await creditSummary(db, bram.user.id, NOW)).used).toBe(1);

    await restrictUser(db, mod, bram.user.id, "Herhaaldelijk intimiderende berichten", undefined, NOW);
    bram = await refresh(db, bram);
    expect(bram.community).toBe(false);
    expect((await creditSummary(db, bram.user.id, NOW)).used).toBe(0);
    const log = await db.query<{ action: string; reason: string }>(`select action, reason from moderation_actions`);
    expect(log).toEqual([{ action: "restrict", reason: "Herhaaldelijk intimiderende berichten" }]);
  });

  it("can be appealed, and only staff decide", async () => {
    await restrictUser(db, mod, bram.user.id, "Herhaaldelijk intimiderende berichten", undefined, NOW);
    bram = await refresh(db, bram);
    await expect(submitAppeal(db, anna, "Ik ben niet beperkt maar probeer het toch", NOW)).rejects.toThrow("niets");
    await submitAppeal(db, bram, "Dit was een misverstand, ik heb sorry gezegd.", NOW);
    await expect(submitAppeal(db, bram, "Nog een keer hetzelfde bezwaar indienen", NOW)).rejects.toThrow("al beoordeeld");
    const [appeal] = await db.query<{ id: string }>(`select id from appeals`);
    await expect(decideAppeal(db, anna, appeal.id, true, "ik ben geen moderator", NOW)).rejects.toThrow("moderatoren");
    await decideAppeal(db, mod, appeal.id, true, "Redelijke uitleg, eerste keer.", NOW);
    expect((await refresh(db, bram)).community).toBe(true);
  });

  it("are never created automatically by a 'no' after a date", async () => {
    const START = at(24 * 60);
    const { id, token } = await createInvite(db, anna, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
    await acceptInvite(db, bram.user.id, token, { moment: START, name: "Bram", note: "" }, NOW);
    const { dateId } = await confirmGuest(db, anna, id, NOW);
    const provider = createFakeProvider();
    await heartbeat(db, bram.user.id, dateId, provider, START);
    await heartbeat(db, anna.user.id, dateId, provider, START);
    await submitFeedback(db, anna.user.id, dateId, { comfort: "no", helped: "yes", next: "no" }, at(30, START));
    expect(await db.query(`select 1 from reports`)).toHaveLength(0);
    expect(await db.query(`select 1 from moderation_actions`)).toHaveLength(0);
    expect((await refresh(db, bram)).restricted).toBe(false);
  });

  it("roles are granted by admins only", async () => {
    await expect(grantRole(db, mod, "anna@x.nl", "moderator")).rejects.toThrow("beheerders");
    await db.query(`insert into roles (user_id, role) values ($1, 'admin')`, [anna.user.id]);
    await grantRole(db, await refresh(db, anna), "bram@x.nl", "moderator");
    expect((await refresh(db, bram)).staff).toBe(true);
  });
});
