import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, deleteSessionToken, userForSessionToken } from "@/lib/auth/session";
import type { Db } from "@/lib/db";
import { NOW, at, freshDb } from "./helpers";

const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("@/lib/mail", () => ({
  mailConfigured: () => true,
  sendMail: async (m: { to: string; subject: string; text: string }) => {
    sent.push(m);
    return true;
  },
}));
const { requestCode, verifyCode } = await import("@/lib/auth/otp");

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  sent.length = 0;
});

const codeFrom = () => /(\d{6})/.exec(sent.at(-1)!.subject)![1];

describe("login with an e-mail code", () => {
  it("creates the account on first login and reuses it afterwards", async () => {
    await requestCode(db, "Sanne@Example.nl", "1.1.1.1", NOW);
    expect(sent[0].to).toBe("sanne@example.nl");
    const id = await verifyCode(db, "sanne@example.nl", codeFrom(), NOW);
    await requestCode(db, "sanne@example.nl", "1.1.1.1", at(1));
    expect(await verifyCode(db, "SANNE@example.nl", codeFrom(), at(1))).toBe(id);
  });

  it("rejects wrong, reused and expired codes, and locks after five attempts", async () => {
    await requestCode(db, "a@x.nl", "ip", NOW);
    const code = codeFrom();
    await expect(verifyCode(db, "a@x.nl", "000000" === code ? "111111" : "000000", NOW)).rejects.toThrow("klopt niet");
    await verifyCode(db, "a@x.nl", code, NOW);
    await expect(verifyCode(db, "a@x.nl", code, NOW)).rejects.toThrow("verlopen");

    await requestCode(db, "b@x.nl", "ip", NOW);
    await expect(verifyCode(db, "b@x.nl", codeFrom(), at(11))).rejects.toThrow("verlopen");

    await requestCode(db, "c@x.nl", "ip", NOW);
    const good = codeFrom();
    const wrong = good === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await expect(verifyCode(db, "c@x.nl", wrong, NOW)).rejects.toThrow();
    await expect(verifyCode(db, "c@x.nl", good, NOW)).rejects.toThrow("verlopen");
  });

  it("limits how often codes can be requested", async () => {
    for (let i = 0; i < 5; i++) await requestCode(db, "d@x.nl", "ip", NOW);
    await expect(requestCode(db, "d@x.nl", "ip", NOW)).rejects.toThrow("rustig");
  });
});

describe("sessions", () => {
  it("are bound to a user, expire, and stop working after logout", async () => {
    const [{ id }] = await db.query<{ id: string }>(`insert into users (email) values ('e@x.nl') returning id`);
    const { token } = await createSession(db, id, NOW);
    expect((await userForSessionToken(db, token, NOW))!.id).toBe(id);
    expect(await userForSessionToken(db, token, at(31 * 24 * 60))).toBeUndefined();
    expect(await userForSessionToken(db, `${token.slice(0, -2)}xx`, NOW)).toBeUndefined();
    await deleteSessionToken(db, token);
    expect(await userForSessionToken(db, token, NOW)).toBeUndefined();
  });
});
