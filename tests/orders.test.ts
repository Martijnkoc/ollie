import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import {
  acceptQuote,
  autoTransitions,
  complete,
  createFixedOrder,
  createRequest,
  declineQuote,
  deliver,
  getOrder,
  mayCancelWithRefund,
  openComplaint,
  quotesFor,
  requestChanges,
  sendQuote,
  stepOut,
} from "@/lib/orders";
import { saveService, getService } from "@/lib/services";
import { writeReview, replyToReview, reviewsFor } from "@/lib/reviews";
import { block } from "@/lib/blocks";
import { NOW, days, freshDb, makeUser, markPaid, service } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function fixedSetup() {
  const maker = await makeUser(db, "Mila", { maker: true });
  const buyer = await makeUser(db, "Bas");
  const id = await saveService(db, maker, service() as never, undefined, NOW);
  return { maker, buyer, service: (await getService(db, id))! };
}

describe("fixed-price orders", () => {
  it("snapshots price, extras and the fee split; nothing is paid until the webhook says so", async () => {
    const { buyer, service: s } = await fixedSetup();
    const id = await createFixedOrder(
      db,
      buyer,
      { serviceId: s.id, extraIds: [s.extras[0].id], brief: "Graag buiten", location: "Utrecht", acceptTerms: true },
      NOW,
    );
    const o = (await getOrder(db, buyer, id))!;
    expect(o.status).toBe("awaiting_payment");
    expect(o.payment_status).toBe("none");
    expect(o.price_cents).toBe(22_500);
    expect(o.delivery_days).toBe(9);
    expect(o.fee_cents! + o.seller_amount_cents!).toBe(22_500);
    expect(o.fee_cents).toBe(2_250);
    expect(o.extras).toEqual([{ title: "Extra uur", price_cents: 7_500, extra_days: 2 }]);
  });

  it("needs the explicit confirmation, refuses own services and unknown extras", async () => {
    const { maker, buyer, service: s } = await fixedSetup();
    await expect(
      createFixedOrder(db, buyer, { serviceId: s.id, extraIds: [], brief: "", location: "", acceptTerms: false }, NOW),
    ).rejects.toThrow("akkoord");
    await expect(
      createFixedOrder(db, maker, { serviceId: s.id, extraIds: [], brief: "", location: "", acceptTerms: true }, NOW),
    ).rejects.toThrow("eigen dienst");
    await expect(
      createFixedOrder(
        db,
        buyer,
        { serviceId: s.id, extraIds: ["00000000-0000-0000-0000-000000000000"], brief: "", location: "", acceptTerms: true },
        NOW,
      ),
    ).rejects.toThrow("uitbreiding");
  });

  it("runs paid → delivered → changes → delivered → completed, then allows exactly one review", async () => {
    const { maker, buyer, service: s } = await fixedSetup();
    const id = await createFixedOrder(db, buyer, { serviceId: s.id, extraIds: [], brief: "", location: "Utrecht", acceptTerms: true }, NOW);
    await expect(deliver(db, maker, id, "Hier is het resultaat", NOW)).rejects.toThrow("niet opleveren");
    await markPaid(db, id);
    await expect(deliver(db, buyer, id, "Hier is het resultaat", NOW)).rejects.toThrow("bestaat niet");
    await deliver(db, maker, id, "Hier is het resultaat", NOW);
    await expect(writeReview(db, buyer, id, { rating: 5, body: "Heel fijn gewerkt!" }, NOW)).rejects.toThrow("afgerond");
    await requestChanges(db, buyer, id, "Kun je de tweede foto lichter maken?", NOW);
    await deliver(db, maker, id, "Aangepast, zie de map", NOW);
    await expect(complete(db, maker, id, NOW)).rejects.toThrow("bestaat niet");
    await complete(db, buyer, id, NOW);
    const o = (await getOrder(db, buyer, id))!;
    expect(o.status).toBe("completed");
    expect(o.transfer_status).toBe("pending");
    await writeReview(db, buyer, id, { rating: 5, body: "Heel fijn gewerkt!" }, NOW);
    await expect(writeReview(db, buyer, id, { rating: 1, body: "Toch niet zo fijn." }, NOW)).rejects.toThrow("al een review");
    const [review] = await reviewsFor(db, maker.user.id);
    await expect(replyToReview(db, buyer, review.id, "Bedankt!")).rejects.toThrow();
    await replyToReview(db, maker, review.id, "Dank je, Bas!");
    expect((await reviewsFor(db, maker.user.id))[0].reply).toBe("Dank je, Bas!");
  });

  it("completes by itself after the acceptance window", async () => {
    const { maker, buyer, service: s } = await fixedSetup();
    const id = await createFixedOrder(db, buyer, { serviceId: s.id, extraIds: [], brief: "", location: "x", acceptTerms: true }, NOW);
    await markPaid(db, id);
    await deliver(db, maker, id, "Klaar!", NOW);
    expect((await autoTransitions(db, days(6))).autoCompleted).toBe(0);
    expect((await autoTransitions(db, days(8))).autoCompleted).toBe(1);
    expect((await getOrder(db, buyer, id))!.status).toBe("completed");
  });

  it("lets the seller always, and the buyer only when overdue, cancel with a refund", async () => {
    const { maker, buyer, service: s } = await fixedSetup();
    const id = await createFixedOrder(db, buyer, { serviceId: s.id, extraIds: [], brief: "", location: "x", acceptTerms: true }, NOW);
    await markPaid(db, id);
    const o = (await getOrder(db, buyer, id))!;
    expect(mayCancelWithRefund(o, maker.user.id, NOW)).toBe(true);
    expect(mayCancelWithRefund(o, buyer.user.id, days(8))).toBe(false);
    expect(mayCancelWithRefund(o, buyer.user.id, days(10))).toBe(true);
  });

  it("is invisible to a third person and stops at a complaint", async () => {
    const { buyer, service: s } = await fixedSetup();
    const other = await makeUser(db, "Cas");
    const id = await createFixedOrder(db, buyer, { serviceId: s.id, extraIds: [], brief: "", location: "x", acceptTerms: true }, NOW);
    expect(await getOrder(db, other, id)).toBeUndefined();
    await expect(openComplaint(db, other, id, "Ik wil hier een klacht over indienen.", NOW)).rejects.toThrow("bestaat niet");
    await markPaid(db, id);
    await openComplaint(db, buyer, id, "Er is na twee weken nog niets gebeurd.", NOW);
    expect((await getOrder(db, buyer, id))!.status).toBe("disputed");
    expect((await autoTransitions(db, days(30))).autoCompleted).toBe(0);
  });
});

describe("custom work", () => {
  it("goes request → quote → decline → new quote → accept, with the agreed price as the snapshot", async () => {
    const maker = await makeUser(db, "Mila", { maker: true });
    const buyer = await makeUser(db, "Bas");
    const id = await createRequest(
      db,
      buyer,
      {
        sellerId: maker.user.id,
        title: "Logo voor mijn bakkerij",
        brief: "Ik zoek een warm, ambachtelijk logo voor mijn bakkerij.",
        budget: "300",
        desiredBy: "2026-11-30",
        location: "",
      },
      NOW,
    );
    await expect(sendQuote(db, buyer, id, { price: "250", deliveryDays: "10", message: "" }, NOW)).rejects.toThrow("bestaat niet");
    await sendQuote(db, maker, id, { price: "350", deliveryDays: "10", message: "Inclusief drie schetsen" }, NOW);
    let [q] = await quotesFor(db, id);
    await declineQuote(db, buyer, id, q.id, NOW);
    expect((await getOrder(db, buyer, id))!.status).toBe("requested");
    await sendQuote(db, maker, id, { price: "290", deliveryDays: "12", message: "Twee schetsen" }, NOW);
    [q] = await quotesFor(db, id);
    await expect(acceptQuote(db, buyer, id, q.id, false, NOW)).rejects.toThrow("akkoord");
    await acceptQuote(db, buyer, id, q.id, true, NOW);
    const o = (await getOrder(db, buyer, id))!;
    expect(o.status).toBe("awaiting_payment");
    expect(o.price_cents).toBe(29_000);
    expect(o.delivery_days).toBe(12);
    expect(o.terms_accepted_at).toEqual(NOW);
  });

  it("expires quotes, and lets either side step out before payment", async () => {
    const maker = await makeUser(db, "Mila", { maker: true });
    const buyer = await makeUser(db, "Bas");
    const input = {
      sellerId: maker.user.id,
      title: "Muur schilderen",
      brief: "Een muur van vier meter breed in de woonkamer.",
      budget: "",
      desiredBy: "",
      location: "Utrecht",
    };
    const id = await createRequest(db, buyer, input, NOW);
    await sendQuote(db, maker, id, { price: "200", deliveryDays: "3", message: "" }, NOW);
    const [q] = await quotesFor(db, id);
    await autoTransitions(db, days(15));
    await expect(acceptQuote(db, buyer, id, q.id, true, days(15))).rejects.toThrow();
    expect((await getOrder(db, buyer, id))!.status).toBe("requested");
    expect((await stepOut(db, maker, id, "Te druk", NOW)).status).toBe("declined");
    const id2 = await createRequest(db, buyer, input, NOW);
    expect((await stepOut(db, buyer, id2, "", NOW)).status).toBe("withdrawn");
  });

  it("is impossible to an unpublished profile or after a block, and blocking ends unpaid orders", async () => {
    const maker = await makeUser(db, "Mila", { maker: true });
    const hidden = await makeUser(db, "Nora");
    const buyer = await makeUser(db, "Bas");
    const input = (sellerId: string) => ({
      sellerId,
      title: "Bijles wiskunde",
      brief: "Twee keer per week bijles voor havo 4.",
      budget: "",
      desiredBy: "",
      location: "",
    });
    await expect(createRequest(db, buyer, input(hidden.user.id), NOW)).rejects.toThrow("niet beschikbaar");
    const id = await createRequest(db, buyer, input(maker.user.id), NOW);
    await block(db, maker.user.id, buyer.user.id, NOW);
    expect((await getOrder(db, buyer, id))!.status).toBe("cancelled");
    await expect(createRequest(db, buyer, input(maker.user.id), NOW)).rejects.toThrow("niet mogelijk");
  });
});
