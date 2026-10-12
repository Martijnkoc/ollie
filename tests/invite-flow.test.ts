import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { blockOther, cancelDate, decide, getView, markJoined, reportOther, setHelped, shareContact } from "@/lib/dates";
import {
  acceptAlternative,
  acceptMoment,
  cancelInvite,
  createInvite,
  getInviteByCode,
  getInviteByHostToken,
  hostParticipantToken,
  proposeAlternative,
} from "@/lib/invites";
import { freshDb, minutes } from "./helpers";

const now = new Date("2026-10-12T10:00:00Z");
const later = (m: number) => new Date(now.getTime() + minutes(m));

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function scheduled(startInMinutes = 60 * 24) {
  const moment = later(startInMinutes);
  const { code, hostToken } = await createInvite(
    db,
    { hostName: "Bram", hostEmail: "Bram@Example.nl", matchName: "Sanne", message: "Leuk!", moments: [moment, later(startInMinutes + 60)] },
    now,
  );
  const { guestToken } = await acceptMoment(db, { code, startsAt: moment, guestName: "Sanne" }, now);
  const invite = (await getInviteByHostToken(db, hostToken))!;
  const hostDateToken = (await hostParticipantToken(db, invite))!;
  return { code, hostToken, guestToken, hostDateToken, startsAt: moment };
}

describe("invite → moment → date", () => {
  it("schedules a private date for exactly the two of them", async () => {
    const { code, guestToken, hostDateToken, startsAt } = await scheduled();
    const invite = await getInviteByCode(db, code);
    expect(invite!.status).toBe("scheduled");
    expect(invite!.host_email).toBe("bram@example.nl");

    const guest = (await getView(db, guestToken, now))!;
    expect(guest.other.first_name).toBe("Bram");
    expect(guest.date.starts_at.getTime()).toBe(startsAt.getTime());
    expect(guest.date.duration_minutes).toBe(20);
    expect(guest.phase).toBe("upcoming");
    expect((await getView(db, hostDateToken, now))!.other.first_name).toBe("Sanne");
  });

  it("cannot be accepted twice or for a moment that was not offered", async () => {
    const { code } = await scheduled();
    await expect(acceptMoment(db, { code, startsAt: later(60 * 24), guestName: "X" }, now)).rejects.toThrow("al aangenomen");

    const other = await createInvite(db, { hostName: "A", hostEmail: "a@x.nl", matchName: "", message: "", moments: [later(90)] }, now);
    await expect(acceptMoment(db, { code: other.code, startsAt: later(120), guestName: "B" }, now)).rejects.toThrow("niet (meer) beschikbaar");
  });

  it("rejects moments in the past and caps invites per month", async () => {
    await expect(createInvite(db, { hostName: "A", hostEmail: "a@x.nl", matchName: "", message: "", moments: [later(5)] }, now)).rejects.toThrow(
      "minstens 15 minuten",
    );
    for (let i = 0; i < 5; i++) {
      await createInvite(db, { hostName: "A", hostEmail: "a@x.nl", matchName: "", message: "", moments: [later(60 + i)] }, now);
    }
    await expect(createInvite(db, { hostName: "A", hostEmail: "A@x.nl", matchName: "", message: "", moments: [later(90)] }, now)).rejects.toThrow(
      "maximum",
    );
  });

  it("lets the guest suggest another moment that the host confirms", async () => {
    const { code, hostToken } = await createInvite(db, { hostName: "A", hostEmail: "a@x.nl", matchName: "", message: "", moments: [later(90)] }, now);
    const { guestToken } = await proposeAlternative(db, { code, startsAt: later(60 * 30), guestName: "Noor", guestEmail: "noor@x.nl" }, now);
    expect((await getInviteByCode(db, code))!.status).toBe("alternative");
    await acceptAlternative(db, hostToken, now);
    const view = (await getView(db, guestToken, now))!;
    expect(view.me.first_name).toBe("Noor");
    expect(view.date.starts_at.getTime()).toBe(later(60 * 30).getTime());
  });

  it("can be withdrawn while open", async () => {
    const { code, hostToken } = await createInvite(db, { hostName: "A", hostEmail: "a@x.nl", matchName: "", message: "", moments: [later(90)] }, now);
    await cancelInvite(db, hostToken);
    await expect(acceptMoment(db, { code, startsAt: later(90), guestName: "B" }, now)).rejects.toThrow("ingetrokken");
  });
});

describe("after the date", () => {
  it("keeps a single 'no' private and reveals nothing until both chose", async () => {
    const { guestToken, hostDateToken, startsAt } = await scheduled(60);
    const during = new Date(startsAt.getTime() + minutes(5));
    const after = new Date(startsAt.getTime() + minutes(21));

    await expect(decide(db, guestToken, "yes", now)).rejects.toThrow("pas kiezen");
    await markJoined(db, guestToken, during);

    expect((await decide(db, guestToken, "yes", after)).outcome).toBe("waiting");
    await decide(db, hostDateToken, "no", after);
    const guest = (await getView(db, guestToken, after))!;
    expect(guest.outcome).toBe("no-match");
    expect(guest.otherContact).toBeNull();
  });

  it("hides contact details until the owner shares them after a mutual yes", async () => {
    const { guestToken, hostDateToken, startsAt } = await scheduled(60);
    const after = new Date(startsAt.getTime() + minutes(25));
    await decide(db, guestToken, "yes", after);
    await expect(shareContact(db, guestToken, "06 12345678", after)).rejects.toThrow("allebei");
    await decide(db, hostDateToken, "yes", after);

    expect((await getView(db, hostDateToken, after))!.outcome).toBe("mutual");
    expect((await getView(db, hostDateToken, after))!.otherContact).toBeNull();
    await shareContact(db, guestToken, "06 12345678", after);
    expect((await getView(db, hostDateToken, after))!.otherContact).toBe("06 12345678");
    expect((await getView(db, guestToken, after))!.otherContact).toBeNull();
  });

  it("stores the main question privately", async () => {
    const { guestToken, startsAt } = await scheduled(60);
    const after = new Date(startsAt.getTime() + minutes(25));
    await setHelped(db, guestToken, "yes", after);
    expect((await getView(db, guestToken, after))!.me.helped).toBe("yes");
  });

  it("turns a block into a quiet no-match and cancels an upcoming date", async () => {
    const a = await scheduled(60);
    await blockOther(db, a.guestToken, now);
    expect((await getView(db, a.hostDateToken, now))!.phase).toBe("cancelled");

    const b = await scheduled(60 * 2);
    const after = new Date(b.startsAt.getTime() + minutes(25));
    await decide(db, b.hostDateToken, "yes", after);
    await decide(db, b.guestToken, "yes", after);
    await reportOther(db, b.guestToken, { reason: "gedrag", details: "Niet ok", block: true }, after);
    const host = (await getView(db, b.hostDateToken, after))!;
    expect(host.outcome).toBe("no-match");
    expect(await shareContact(db, b.hostDateToken, "x@y.nl", after).catch((e) => e.message)).toContain("allebei");
    const reports = await db.query<{ reason: string }>(`select reason from reports`);
    expect(reports.map((r) => r.reason)).toEqual(["gedrag"]);
  });

  it("can be cancelled before it starts, not after", async () => {
    const { guestToken, hostDateToken, startsAt } = await scheduled(60);
    await expect(cancelDate(db, guestToken, new Date(startsAt.getTime() + minutes(1)))).rejects.toThrow("niet meer");
    await cancelDate(db, guestToken, now);
    expect((await getView(db, hostDateToken, now))!.phase).toBe("cancelled");
  });
});
