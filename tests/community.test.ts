import { beforeEach, describe, expect, it } from "vitest";
import type { Rights } from "@/lib/access";
import { block } from "@/lib/blocks";
import { channelMessages, getChannel, postMessage } from "@/lib/community/channels";
import { getThread, postThreadMessage, respondToRequest, sendRequest, threadMessages } from "@/lib/community/contacts";
import { memberProfile, searchMembers } from "@/lib/community/directory";
import { proposeDate, respondToProposal, viewFor } from "@/lib/dates/core";
import type { Db } from "@/lib/db";
import { NOW, at, freshDb, makeUser } from "./helpers";

let db: Db;
let anna: Rights;
let bram: Rights;
let guest: Rights;
let lapsed: Rights;
let loungeId: string;

beforeEach(async () => {
  db = await freshDb();
  anna = await makeUser(db, "anna@x.nl", { member: true, alias: "Anna" });
  bram = await makeUser(db, "bram@x.nl", { member: true, alias: "Bram" });
  guest = await makeUser(db, "gast@x.nl");
  lapsed = await makeUser(db, "oud@x.nl", { profile: true, alias: "Oud" });
  loungeId = (await getChannel(db, "lounge"))!.id;
});

describe("rights", () => {
  it("members read and write; guests and lapsed users get nothing", async () => {
    await postMessage(db, anna, loungeId, "Hoi allemaal", NOW);
    expect((await channelMessages(db, bram, loungeId)).messages.map((m) => m.body)).toEqual(["Hoi allemaal"]);
    for (const outsider of [guest, lapsed]) {
      await expect(channelMessages(db, outsider, loungeId)).rejects.toThrow("lidmaatschap");
      await expect(postMessage(db, outsider, loungeId, "x", NOW)).rejects.toThrow("lidmaatschap");
      await expect(searchMembers(db, outsider, "")).rejects.toThrow("lidmaatschap");
    }
    expect((await searchMembers(db, anna, "")).map((p) => p.alias)).toEqual(["Bram"]);
    expect(await memberProfile(db, anna, lapsed.user.id, NOW)).toBeUndefined();
  });

  it("pages back through history", async () => {
    for (let i = 0; i < 45; i++)
      await db.query(`insert into messages (channel_id, author_id, body) values ($1, $2, $3)`, [loungeId, anna.user.id, `m${i}`]);
    const first = await channelMessages(db, bram, loungeId);
    expect(first.messages).toHaveLength(40);
    expect(first.more).toBe(true);
    const older = await channelMessages(db, bram, loungeId, { before: first.messages[0].id });
    expect(older.messages.map((m) => m.body)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
  });

  it("limits how fast someone can post", async () => {
    for (let i = 0; i < 20; i++) await postMessage(db, anna, loungeId, `${i}`, NOW);
    await expect(postMessage(db, anna, loungeId, "te veel", NOW)).rejects.toThrow("rustig");
  });
});

describe("private contact", () => {
  it("starts with a request; only the two can read the conversation", async () => {
    await sendRequest(db, anna, bram.user.id, "Leuk wat je schreef!", NOW);
    const [req] = await db.query<{ id: string }>(`select id from contact_requests`);
    await expect(respondToRequest(db, anna, req.id, true, NOW)).rejects.toThrow("bestaat niet");
    const threadId = (await respondToRequest(db, bram, req.id, true, NOW))!;
    await postThreadMessage(db, bram, threadId, "Hoi Anna", NOW);
    expect((await threadMessages(db, anna, threadId)).messages[0].body).toBe("Hoi Anna");
    const third = await makeUser(db, "c@x.nl", { member: true });
    expect(await getThread(db, third, threadId)).toBeUndefined();
    await expect(threadMessages(db, third, threadId)).rejects.toThrow("bestaat niet");
    await expect(threadMessages(db, guest, threadId)).rejects.toThrow("lidmaatschap");
  });

  it("lets two members plan a videodate that only exists once both confirm", async () => {
    await sendRequest(db, anna, bram.user.id, "", NOW);
    const [req] = await db.query<{ id: string }>(`select id from contact_requests`);
    await respondToRequest(db, bram, req.id, true, NOW);
    const dateId = await proposeDate(db, anna, { otherId: bram.user.id, scheduledAt: at(24 * 60), source: "community" }, NOW);
    expect((await viewFor(db, bram.user.id, dateId, NOW))!.phase).toBe("proposed");
    await expect(respondToProposal(db, anna.user.id, dateId, true, NOW)).rejects.toThrow();
    await respondToProposal(db, bram.user.id, dateId, true, NOW);
    const rows = await db.query<{ organizer_id: string; credit_status: string }>(`select organizer_id, credit_status from dates`);
    expect(rows).toEqual([{ organizer_id: anna.user.id, credit_status: "reserved" }]);
  });

  it("cannot propose a videodate to someone without an accepted chat", async () => {
    await expect(proposeDate(db, anna, { otherId: bram.user.id, scheduledAt: at(24 * 60), source: "community" }, NOW)).rejects.toThrow(
      "privégesprek",
    );
  });

  it("blocking stops requests, messages and proposals, and hides people from each other", async () => {
    await sendRequest(db, anna, bram.user.id, "", NOW);
    const [req] = await db.query<{ id: string }>(`select id from contact_requests`);
    const threadId = (await respondToRequest(db, bram, req.id, true, NOW))!;
    const dateId = await proposeDate(db, anna, { otherId: bram.user.id, scheduledAt: at(24 * 60), source: "community" }, NOW);
    await block(db, bram.user.id, anna.user.id, NOW);

    await expect(postThreadMessage(db, anna, threadId, "hallo?", NOW)).rejects.toThrow("geen berichten");
    await expect(sendRequest(db, anna, bram.user.id, "", NOW)).rejects.toThrow("niet mogelijk");
    await expect(proposeDate(db, anna, { otherId: bram.user.id, scheduledAt: at(48 * 60), source: "community" }, NOW)).rejects.toThrow(
      "niet mogelijk",
    );
    expect((await viewFor(db, anna.user.id, dateId, NOW))!.phase).toBe("declined");
    expect(await searchMembers(db, anna, "")).toEqual([]);
    expect(await memberProfile(db, anna, bram.user.id, NOW)).toBeUndefined();
    await postMessage(db, anna, loungeId, "zie je dit?", NOW);
    expect((await channelMessages(db, bram, loungeId)).messages).toEqual([]);
  });
});
