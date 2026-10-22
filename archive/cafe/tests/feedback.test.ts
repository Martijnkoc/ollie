import { beforeEach, describe, expect, it } from "vitest";
import type { Rights } from "@/lib/access";
import { block } from "@/lib/blocks";
import { heartbeat } from "@/lib/dates/session";
import type { Db } from "@/lib/db";
import { contactShares, outcomeFor, shareContact, submitFeedback } from "@/lib/feedback";
import { acceptInvite, confirmGuest, createInvite } from "@/lib/invites";
import { createFakeProvider } from "@/lib/video/provider";
import { NOW, at, freshDb, makeUser } from "./helpers";

let db: Db;
let host: Rights;
let guest: Rights;
let dateId: string;
const START = at(24 * 60);
const AFTER = at(30, START);

beforeEach(async () => {
  db = await freshDb();
  host = await makeUser(db, "host@x.nl", { member: true, alias: "Bram" });
  guest = await makeUser(db, "guest@x.nl");
  const { id, token } = await createInvite(db, host, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
  await acceptInvite(db, guest.user.id, token, { moment: START, name: "Sanne", note: "" }, NOW);
  dateId = (await confirmGuest(db, host, id, NOW)).dateId;
  const provider = createFakeProvider();
  await heartbeat(db, guest.user.id, dateId, provider, START);
  await heartbeat(db, host.user.id, dateId, provider, START);
});

const yes = { comfort: "yes", helped: "yes" } as const;

describe("confidential feedback", () => {
  it("is only given after the conversation, once", async () => {
    await expect(submitFeedback(db, guest.user.id, dateId, { ...yes, next: "meet" }, at(5, START))).rejects.toThrow("na afloop");
    await submitFeedback(db, guest.user.id, dateId, { ...yes, next: "meet" }, AFTER);
    await expect(submitFeedback(db, guest.user.id, dateId, { ...yes, next: "no" }, AFTER)).rejects.toThrow("al gegeven");
  });

  it("reveals nothing about one-sided interest or missing answers", async () => {
    await submitFeedback(db, guest.user.id, dateId, { comfort: "somewhat", helped: "yes", next: "meet" }, AFTER);
    const forHost = await outcomeFor(db, host.user.id, dateId, AFTER);
    expect(forHost).toEqual({ state: "form" });
    await submitFeedback(db, host.user.id, dateId, { comfort: "yes", helped: "no", next: "no" }, AFTER);
    const forGuest = await outcomeFor(db, guest.user.id, dateId, AFTER);
    expect(forGuest.state).toBe("none");
    // Only the reader's own answers are ever returned.
    expect(JSON.stringify(forGuest)).not.toContain('"no"},');
    expect(forGuest).toEqual({ state: "none", mine: { comfort: "somewhat", helped: "yes", next: "meet" } });
  });

  it("treats a missing answer as no follow-up after the deadline", async () => {
    await submitFeedback(db, guest.user.id, dateId, { ...yes, next: "meet" }, AFTER);
    expect((await outcomeFor(db, guest.user.id, dateId, AFTER)).state).toBe("waiting");
    expect((await outcomeFor(db, guest.user.id, dateId, at(8 * 24 * 60, AFTER))).state).toBe("none");
  });

  it("combines wishes cautiously: meet + call becomes another call", async () => {
    await submitFeedback(db, guest.user.id, dateId, { ...yes, next: "meet" }, AFTER);
    await submitFeedback(db, host.user.id, dateId, { ...yes, next: "call" }, AFTER);
    expect(await outcomeFor(db, guest.user.id, dateId, AFTER)).toMatchObject({ state: "mutual", kind: "call" });
  });
});

describe("contact details", () => {
  it("are never shared automatically, need consent per detail, and close on a block", async () => {
    await expect(shareContact(db, guest.user.id, dateId, "phone", "0612345678", true, AFTER)).rejects.toThrow("allebei");
    await submitFeedback(db, guest.user.id, dateId, { ...yes, next: "meet" }, AFTER);
    await submitFeedback(db, host.user.id, dateId, { ...yes, next: "meet" }, AFTER);
    expect((await contactShares(db, host.user.id, dateId, AFTER)).theirs).toEqual([]);
    await expect(shareContact(db, guest.user.id, dateId, "phone", "0612345678", false, AFTER)).rejects.toThrow("Bevestig");
    await shareContact(db, guest.user.id, dateId, "phone", "06 12345678", true, AFTER);
    const forHost = await contactShares(db, host.user.id, dateId, AFTER);
    expect(forHost.theirs.map((s) => [s.field, s.value])).toEqual([["phone", "06 12345678"]]);
    expect((await contactShares(db, guest.user.id, dateId, AFTER)).theirs).toEqual([]);
    const [consent] = await db.query<{ consent_text: string; to_id: string }>(`select consent_text, to_id from contact_shares`);
    expect(consent.to_id).toBe(host.user.id);
    expect(consent.consent_text).toContain("intrekken");
    await block(db, guest.user.id, host.user.id, AFTER);
    expect((await contactShares(db, host.user.id, dateId, AFTER)).theirs).toEqual([]);
  });
});
