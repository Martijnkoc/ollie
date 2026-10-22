import { beforeEach, describe, expect, it } from "vitest";
import { rightsFor } from "@/lib/access";
import { deleteAccount } from "@/lib/account";
import type { Db } from "@/lib/db";
import { getThread, postMessage, startConversation, threadMessages, unreadCount } from "@/lib/messages";
import { createReport, hideContent, restrictUser, submitAppeal, decideAppeal } from "@/lib/moderation";
import { createFixedOrder, createRequest, getOrder } from "@/lib/orders";
import { getService, saveService } from "@/lib/services";
import { sweep } from "@/lib/sweep";
import { NOW, days, freshDb, makeMedia, makeUser, markPaid, service } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function staff() {
  const [{ id }] = await db.query<{ id: string }>(`insert into users (email) values ('ada@test.nl') returning id`);
  await db.query(`insert into roles (user_id, role) values ($1, 'moderator')`, [id]);
  return rightsFor(db, id);
}

describe("database lockdown", () => {
  it("has row level security on every table, so Supabase's public API exposes nothing", async () => {
    const open = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(open).toEqual([]);
  });
});

describe("messages", () => {
  it("are private to the two people, need a public maker to start, and stop after a block", async () => {
    const mila = await makeUser(db, "Mila", { maker: true });
    const bas = await makeUser(db, "Bas");
    const cas = await makeUser(db, "Cas");
    await expect(startConversation(db, mila, bas.user.id, "Hoi!", NOW)).rejects.toThrow("niet bereikbaar");
    const id = await startConversation(db, bas, mila.user.id, "Hoi Mila, ben je vrij in mei?", NOW);
    expect(await unreadCount(db, mila.user.id)).toBe(1);
    await postMessage(db, mila, id, "Ja hoor!", null, NOW);
    expect(await getThread(db, cas, id)).toBeUndefined();
    await expect(threadMessages(db, cas, id)).rejects.toThrow("bestaat niet");
    await expect(postMessage(db, cas, id, "Ik lees mee", null, NOW)).rejects.toThrow("bestaat niet");
    await db.query(`insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [mila.user.id, bas.user.id]);
    await expect(postMessage(db, bas, id, "Hallo?", null, NOW)).rejects.toThrow("geen berichten meer");
  });
});

describe("moderation", () => {
  it("only accepts reports about things the reporter can see, never about themselves", async () => {
    const mila = await makeUser(db, "Mila", { maker: true });
    const bas = await makeUser(db, "Bas");
    const sid = await saveService(db, mila, service() as never, undefined, NOW);
    await expect(createReport(db, mila, { context: "service", contextId: sid, reason: "spam", details: "" })).rejects.toThrow(
      "niet melden",
    );
    await expect(createReport(db, bas, { context: "service", contextId: sid, reason: "onzin", details: "" })).rejects.toThrow("reden");
    const orderId = await createRequest(
      db,
      bas,
      {
        sellerId: mila.user.id,
        title: "Logo maken",
        brief: "Ik zoek een logo voor mijn bakkerij.",
        budget: "",
        desiredBy: "",
        location: "",
      },
      NOW,
    );
    const cas = await makeUser(db, "Cas");
    await expect(createReport(db, cas, { context: "order", contextId: orderId, reason: "oplichting", details: "" })).rejects.toThrow(
      "niet melden",
    );
    expect(await createReport(db, bas, { context: "service", contextId: sid, reason: "misleidend", details: "Klopt niet" })).toBe(
      mila.user.id,
    );
  });

  it("hides content with a reason, restricts with a reason, stops unpaid orders, keeps paid ones, and supports appeals", async () => {
    const mila = await makeUser(db, "Mila", { maker: true });
    const bas = await makeUser(db, "Bas");
    const ada = await staff();
    const sid = await saveService(db, mila, service() as never, undefined, NOW);
    await expect(hideContent(db, bas, "service", sid, "Geen idee waarom")).rejects.toThrow("moderatoren");
    await expect(hideContent(db, ada, "service", sid, "kort")).rejects.toThrow("reden");
    await hideContent(db, ada, "service", sid, "Beelden zijn niet van de maker.");
    expect(await getService(db, sid)).toBeUndefined();
    expect((await getService(db, sid, mila.user.id))?.hidden_reason).toBe("Beelden zijn niet van de maker.");

    await db.query(`update services set hidden_at = null`);
    const unpaid = await createFixedOrder(db, bas, { serviceId: sid, extraIds: [], brief: "", location: "x", acceptTerms: true }, NOW);
    const paid = await createFixedOrder(db, bas, { serviceId: sid, extraIds: [], brief: "", location: "x", acceptTerms: true }, NOW);
    await markPaid(db, paid);
    await restrictUser(db, ada, mila.user.id, "Herhaaldelijk misleidend aanbod.", undefined, NOW);
    expect((await getOrder(db, bas, unpaid))!.status).toBe("cancelled");
    expect((await getOrder(db, bas, paid))!.status).toBe("in_progress");
    const restricted = await rightsFor(db, mila.user.id);
    expect(restricted.active).toBe(false);
    await expect(saveService(db, restricted, service() as never)).rejects.toThrow("beperkt");
    await submitAppeal(db, restricted, "Ik heb alle beelden zelf gemaakt, hier is bewijs.", NOW);
    const [appeal] = await db.query<{ id: string }>(`select id from appeals`);
    await decideAppeal(db, ada, appeal.id, true, "Bewijs ontvangen en akkoord.", NOW);
    expect((await rightsFor(db, mila.user.id)).active).toBe(true);
  });
});

describe("account deletion", () => {
  it("waits for paid orders, then removes the person and their files but keeps the other party's order", async () => {
    const mila = await makeUser(db, "Mila", { maker: true });
    const bas = await makeUser(db, "Bas");
    await makeMedia(db, mila, "avatar");
    const sid = await saveService(db, mila, service() as never, undefined, NOW);
    const orderId = await createFixedOrder(db, bas, { serviceId: sid, extraIds: [], brief: "", location: "x", acceptTerms: true }, NOW);
    await markPaid(db, orderId);
    await expect(deleteAccount(db, mila.user.id, NOW)).rejects.toThrow("lopende");
    await db.query(`update orders set status = 'completed' where id = $1`, [orderId]);
    await deleteAccount(db, mila.user.id, NOW);
    expect(await db.query(`select 1 from users where id = $1`, [mila.user.id])).toHaveLength(0);
    expect(await db.query(`select 1 from media`)).toHaveLength(0);
    const o = (await getOrder(db, bas, orderId))!;
    expect(o.seller_id).toBeNull();
    expect(o.seller_name).toBe("Voormalig lid");
  });
});

describe("daily sweep", () => {
  it("runs all its housekeeping queries", async () => {
    await makeUser(db, "Mila", { maker: true });
    const result = await sweep(db, days(30));
    expect(result).toMatchObject({ expiredQuotes: 0, autoCompleted: 0, payoutsSent: 0, mediaRemoved: 0 });
  });
});
