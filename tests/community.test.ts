import { beforeEach, describe, expect, it } from "vitest";
import {
  createEvening,
  createProposal,
  eveningPool,
  type MemberInput,
  memberDates,
  memberProposals,
  proposalState,
  respondToProposal,
  signUp,
  getMemberByToken,
  deleteMember,
} from "@/lib/community";
import { blockOther, getView } from "@/lib/dates";
import type { Db } from "@/lib/db";
import { freshDb } from "./helpers";

const now = new Date("2026-10-12T10:00:00Z"); // a Monday
let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const base: MemberInput = {
  firstName: "Anna",
  email: "anna@x.nl",
  birthDate: "1993-05-01",
  gender: "vrouw",
  lookingFor: ["man"],
  ageMin: 28,
  ageMax: 40,
  region: "utrecht",
  intent: "open",
  about: "Wandelen en koffie",
  slots: ["do-avond"],
  visible: true,
};

async function member(over: Partial<MemberInput>) {
  const { token } = await signUp(db, { ...base, ...over }, now);
  return { token, member: (await getMemberByToken(db, token))! };
}

describe("community", () => {
  it("only lets adults join and hands out a new link for a known e-mail", async () => {
    await expect(signUp(db, { ...base, birthDate: "2010-01-01" }, now)).rejects.toThrow("18");
    const first = await signUp(db, base, now);
    const again = await signUp(db, { ...base, email: "ANNA@x.nl" }, now);
    expect(again.status).toBe("exists");
    expect((await getMemberByToken(db, first.token))!.first_name).toBe("Anna");
    expect((await getMemberByToken(db, again.token))!.id).toBe((await getMemberByToken(db, first.token))!.id);
    expect(await db.query(`select id from members`)).toHaveLength(1);
  });

  it("creates a date once both accept the proposal for a kennismakingsavond", async () => {
    const anna = await member({});
    const bram = await member({ firstName: "Bram", email: "bram@x.nl", gender: "man", lookingFor: ["vrouw"], birthDate: "1991-02-02" });
    await member({ firstName: "Paul", email: "paul@x.nl", gender: "man", lookingFor: ["vrouw"], slots: ["di-avond"] });

    await expect(createEvening(db, { region: "utrecht", slot: "do-avond", day: "2026-10-14" }, now)).rejects.toThrow("valt niet");
    const evening = (await createEvening(db, { region: "utrecht", slot: "do-avond", day: "2026-10-15" }, now))!;
    expect(evening.starts_at.toISOString()).toBe("2026-10-15T18:00:00.000Z");

    const pool = await eveningPool(db, evening);
    expect(pool.members.map((m) => m.first_name).sort()).toEqual(["Anna", "Bram"]);

    const proposal = (await createProposal(db, evening.id, anna.member.id, bram.member.id, now))!;
    await expect(createProposal(db, evening.id, anna.member.id, bram.member.id, now)).rejects.toThrow();

    const [p] = await memberProposals(db, anna.member.id);
    expect(p.other_first_name).toBe("Bram");
    expect(proposalState(p, now)).toBe("open");

    expect((await respondToProposal(db, anna.member.id, proposal.id, "accepted", now)).scheduled).toBe(false);
    expect(proposalState((await memberProposals(db, anna.member.id))[0], now)).toBe("waiting");
    const done = await respondToProposal(db, bram.member.id, proposal.id, "accepted", now);
    expect(done.scheduled).toBe(true);

    const [annaDate] = await memberDates(db, anna.member.id);
    expect(annaDate.other_first_name).toBe("Bram");
    const view = (await getView(db, annaDate.token, now))!;
    expect(view.date.source).toBe("community");
    expect(view.date.starts_at.toISOString()).toBe("2026-10-15T18:00:00.000Z");
  });

  it("never proposes a pair again after a block", async () => {
    const anna = await member({});
    const bram = await member({ firstName: "Bram", email: "bram@x.nl", gender: "man", lookingFor: ["vrouw"], birthDate: "1991-02-02" });
    const e1 = (await createEvening(db, { region: "utrecht", slot: "do-avond", day: "2026-10-15" }, now))!;
    const p = (await createProposal(db, e1.id, anna.member.id, bram.member.id, now))!;
    await respondToProposal(db, anna.member.id, p.id, "accepted", now);
    await respondToProposal(db, bram.member.id, p.id, "accepted", now);
    const [d] = await memberDates(db, anna.member.id);
    await blockOther(db, d.token, now);

    const e2 = (await createEvening(db, { region: "utrecht", slot: "do-avond", day: "2026-10-22" }, now))!;
    const pool = await eveningPool(db, e2);
    expect(pool.excluded.size).toBeGreaterThan(0);
    await expect(createProposal(db, e2.id, anna.member.id, bram.member.id, now)).rejects.toThrow("eerder");
  });

  it("deletes a member and their contact data", async () => {
    const anna = await member({});
    await deleteMember(db, anna.member.id);
    expect(await getMemberByToken(db, anna.token)).toBeUndefined();
  });
});
