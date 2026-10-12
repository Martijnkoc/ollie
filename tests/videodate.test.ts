import { beforeEach, describe, expect, it } from "vitest";
import type { Rights } from "@/lib/access";
import { creditSummary } from "@/lib/billing/credits";
import { cancelDate, settleAndClose, viewFor } from "@/lib/dates/core";
import { endNow, heartbeat, joinInfo, markFailed } from "@/lib/dates/session";
import type { Db } from "@/lib/db";
import { acceptInvite, confirmGuest, createInvite, declineInvite, inviteByToken, rejectGuest, revokeInvite } from "@/lib/invites";
import { createFakeProvider } from "@/lib/video/provider";
import { NOW, at, freshDb, makeUser, refresh } from "./helpers";

let db: Db;
let organizer: Rights;
let guest: Rights;
let stranger: Rights;
let provider: ReturnType<typeof createFakeProvider>;

beforeEach(async () => {
  db = await freshDb();
  organizer = await makeUser(db, "bram@x.nl", { member: true, alias: "Bram" });
  guest = await makeUser(db, "sanne@x.nl"); // no profile, no membership
  stranger = await makeUser(db, "derde@x.nl", { member: true });
  provider = createFakeProvider();
});

const START = at(24 * 60);

async function scheduled() {
  const { id, token } = await createInvite(db, organizer, { matchName: "Sanne", origin: "Hinge", message: "Hoi!", moments: [START] }, NOW);
  await acceptInvite(db, guest.user.id, token, { moment: START, name: "Sanne", note: "Ik ben het, van Hinge" }, NOW);
  const { dateId } = await confirmGuest(db, organizer, id, NOW);
  return { inviteId: id, token, dateId };
}

describe("invitation", () => {
  it("uses a long random token, stores only its hash, and binds acceptance to the guest's account", async () => {
    const { id, token } = await createInvite(db, organizer, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
    expect(Buffer.from(token, "base64url").length * 8).toBeGreaterThanOrEqual(128);
    const [row] = await db.query<{ token_hash: string }>(`select token_hash from invites where id = $1`, [id]);
    expect(row.token_hash).not.toContain(token);
    await acceptInvite(db, guest.user.id, token, { moment: START, name: "Sanne", note: "" }, NOW);
    expect((await inviteByToken(db, token))!.guest_id).toBe(guest.user.id);
    await expect(acceptInvite(db, stranger.user.id, token, { moment: START, name: "X", note: "" }, NOW)).rejects.toThrow("al beantwoord");
  });

  it("needs a membership to invite, but not to be invited", async () => {
    await expect(createInvite(db, guest, { matchName: "", origin: "", message: "", moments: [START] }, NOW)).rejects.toThrow(
      "lidmaatschap",
    );
  });

  it("expires, can be revoked, declined, or rejected by the organiser", async () => {
    const a = await createInvite(db, organizer, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
    await expect(acceptInvite(db, guest.user.id, a.token, { moment: START, name: "S", note: "" }, at(25 * 60))).rejects.toThrow("verlopen");
    const b = await createInvite(db, organizer, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
    await revokeInvite(db, organizer, b.id);
    await expect(acceptInvite(db, guest.user.id, b.token, { moment: START, name: "S", note: "" }, NOW)).rejects.toThrow("ingetrokken");
    const c = await createInvite(db, organizer, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
    await declineInvite(db, c.token);
    const d = await createInvite(db, organizer, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
    await acceptInvite(db, stranger.user.id, d.token, { moment: START, name: "Niet Sanne", note: "" }, NOW);
    await rejectGuest(db, organizer, d.id);
    await expect(confirmGuest(db, organizer, d.id, NOW)).rejects.toThrow();
    expect((await creditSummary(db, organizer.user.id, NOW)).used).toBe(0);
  });

  it("only the organiser can confirm", async () => {
    const { id, token } = await createInvite(db, organizer, { matchName: "", origin: "", message: "", moments: [START] }, NOW);
    await acceptInvite(db, guest.user.id, token, { moment: START, name: "Sanne", note: "" }, NOW);
    await expect(confirmGuest(db, stranger, id, NOW)).rejects.toThrow("bestaat niet");
  });
});

describe("credits", () => {
  it("are reserved on confirmation, consumed at the start, and the guest never pays", async () => {
    const { dateId } = await scheduled();
    expect((await creditSummary(db, organizer.user.id, NOW)).used).toBe(1);
    expect((await creditSummary(db, guest.user.id, NOW)).active).toBe(false);
    const start = START;
    await joinInfo(db, organizer.user.id, dateId, provider, start);
    await heartbeat(db, organizer.user.id, dateId, provider, start);
    await heartbeat(db, guest.user.id, dateId, provider, new Date(start.getTime() + 5000));
    await heartbeat(db, guest.user.id, dateId, provider, new Date(start.getTime() + 10_000));
    const [d] = await db.query<{ credit_status: string }>(`select credit_status from dates where id = $1`, [dateId]);
    expect(d.credit_status).toBe("consumed");
    expect((await creditSummary(db, organizer.user.id, NOW)).used).toBe(1);
  });

  it("are released on cancellation, no-show and provider failure, never twice", async () => {
    const a = await scheduled();
    await cancelDate(db, guest.user.id, a.dateId, provider, NOW);
    await expect(cancelDate(db, organizer.user.id, a.dateId, provider, NOW)).rejects.toThrow();

    const b = await scheduled();
    await settleAndClose(db, b.dateId, provider, at(16, START));
    await settleAndClose(db, b.dateId, provider, at(30, START));
    expect((await viewFor(db, organizer.user.id, b.dateId, at(16, START)))!.phase).toBe("no_show");

    const c = await scheduled();
    await markFailed(db, c.dateId);
    await markFailed(db, c.dateId);
    const rows = await db.query<{ credit_status: string }>(`select credit_status from dates order by created_at`);
    expect(rows.map((r) => r.credit_status)).toEqual(["released", "released", "released"]);
    expect((await creditSummary(db, organizer.user.id, NOW)).used).toBe(0);
  });

  it("stop at the quota for the period", async () => {
    for (let i = 0; i < 5; i++) {
      const { id, token } = await createInvite(
        db,
        organizer,
        { matchName: "", origin: "", message: "", moments: [at(60 * (30 + i))] },
        NOW,
      );
      await acceptInvite(db, guest.user.id, token, { moment: at(60 * (30 + i)), name: "S", note: "" }, NOW);
      await confirmGuest(db, organizer, id, NOW);
    }
    await expect(createInvite(db, organizer, { matchName: "", origin: "", message: "", moments: [START] }, NOW)).rejects.toThrow("op");
  });
});

describe("the twenty minutes", () => {
  it("start once, when both are present, and refresh or reconnect never extends them", async () => {
    const { dateId } = await scheduled();
    await expect(joinInfo(db, guest.user.id, dateId, provider, at(-10, START))).rejects.toThrow("niet open");
    await joinInfo(db, guest.user.id, dateId, provider, at(-4, START));

    const alone = await heartbeat(db, guest.user.id, dateId, provider, at(-4, START));
    expect(alone.phase).toBe("lobby");
    expect(alone.startedAt).toBeNull();

    const t0 = at(3, START);
    await heartbeat(db, guest.user.id, dateId, provider, t0);
    const live = await heartbeat(db, organizer.user.id, dateId, provider, t0);
    expect(live.phase).toBe("live");
    expect(new Date(live.endsAt!).getTime() - new Date(live.startedAt!).getTime()).toBe(20 * 60_000);
    expect(provider.calls.filter((c) => c.op === "expiry").map((c) => c.at!.toISOString())).toEqual([live.endsAt]);

    // A refresh, a second tab, or a reconnect much later: same end time.
    const again = await heartbeat(db, guest.user.id, dateId, provider, at(10, t0));
    await joinInfo(db, guest.user.id, dateId, provider, at(12, t0));
    expect(again.endsAt).toBe(live.endsAt);
    expect(provider.calls.filter((c) => c.op === "expiry")).toHaveLength(1);

    // Exactly twenty minutes after the start, the room is closed and no token is issued any more.
    const end = await heartbeat(db, guest.user.id, dateId, provider, at(20, t0));
    expect(end.phase).toBe("ended");
    expect(provider.calls.some((c) => c.op === "close")).toBe(true);
    await expect(joinInfo(db, guest.user.id, dateId, provider, at(20, t0))).rejects.toThrow("niet open");
  });

  it("can be ended early by either participant", async () => {
    const { dateId } = await scheduled();
    await joinInfo(db, guest.user.id, dateId, provider, START);
    await heartbeat(db, guest.user.id, dateId, provider, START);
    await heartbeat(db, organizer.user.id, dateId, provider, START);
    await endNow(db, organizer.user.id, dateId, provider, at(7, START));
    expect((await viewFor(db, guest.user.id, dateId, at(7, START)))!.phase).toBe("ended");
    expect(provider.calls.some((c) => c.op === "close")).toBe(true);
  });

  it("does not start when only one person is there, and becomes a no-show after the waiting time", async () => {
    const { dateId } = await scheduled();
    for (let m = 0; m < 15; m += 1) await heartbeat(db, guest.user.id, dateId, provider, at(m, START));
    const late = await heartbeat(db, guest.user.id, dateId, provider, at(15, START)).catch((e) => e);
    expect((await viewFor(db, guest.user.id, dateId, at(15, START)))!.phase).toBe("no_show");
    expect(late).toBeDefined();
  });

  it("gives a third person, or anyone after cancellation, no access at all", async () => {
    const { dateId } = await scheduled();
    expect(await viewFor(db, stranger.user.id, dateId, START)).toBeUndefined();
    await expect(joinInfo(db, stranger.user.id, dateId, provider, START)).rejects.toThrow("geen toegang");
    await expect(heartbeat(db, stranger.user.id, dateId, provider, START)).rejects.toThrow("geen toegang");
    await cancelDate(db, organizer.user.id, dateId, provider, NOW);
    await expect(joinInfo(db, guest.user.id, dateId, provider, START)).rejects.toThrow("niet open");
  });

  it("refuses restricted participants", async () => {
    const { dateId } = await scheduled();
    await db.query(`update users set restricted_at = now(), restricted_reason = 'test' where id = $1`, [guest.user.id]);
    guest = await refresh(db, guest);
    await expect(joinInfo(db, guest.user.id, dateId, provider, START)).rejects.toThrow("beperkt");
  });
});
