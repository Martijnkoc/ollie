import { BRAND, TAGLINE } from "./config";
import { getDb } from "./db";

type Mail = { to: string; subject: string; text: string };

/**
 * resend  – real delivery (production)
 * outbox  – stored in the database for automated tests and closed previews; needs ALLOW_TEST_TRANSPORTS=true
 * log     – printed to the console, local development only
 * none    – not configured: nothing is sent and features that need mail say so
 */
export function mailTransport(): "resend" | "outbox" | "log" | "none" {
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return "resend";
  if (process.env.MAIL_TRANSPORT === "outbox" && process.env.ALLOW_TEST_TRANSPORTS === "true") return "outbox";
  if (process.env.NODE_ENV !== "production") return "log";
  return "none";
}

export function mailConfigured() {
  return mailTransport() !== "none";
}

export async function sendMail(mail: Mail) {
  const body = `${mail.text}\n\n—\n${BRAND} · ${TAGLINE}`;
  const transport = mailTransport();
  if (transport === "none") {
    console.warn("[mail] not configured; message not sent");
    return false;
  }
  if (transport === "log") {
    console.info(`[mail] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${body}`);
    return true;
  }
  if (transport === "outbox") {
    const db = await getDb();
    await db.query(`insert into mail_outbox (recipient, subject, body) values ($1, $2, $3)`, [mail.to, mail.subject, body]);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: mail.to, subject: mail.subject, text: body }),
    });
    // Never log the body: it can contain login codes or personal links.
    if (!res.ok) console.error(`[mail] resend failed with status ${res.status}`);
    return res.ok;
  } catch {
    console.error("[mail] resend request failed");
    return false;
  }
}
