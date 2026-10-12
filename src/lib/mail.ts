import { BRAND } from "./config";

type Mail = { to: string; subject: string; text: string };

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/**
 * Sends via Resend when configured. Without it the message is logged, so
 * every flow still works locally. Mail never blocks or breaks a user action.
 */
export async function sendMail(mail: Mail) {
  const body = `${mail.text}\n\n—\n${BRAND} · Eerst een klik. Dan een date.`;
  if (!mailConfigured()) {
    console.info(`[mail] to=${mail.to} subject=${JSON.stringify(mail.subject)}\n${body}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: mail.to, subject: mail.subject, text: body }),
    });
    if (!res.ok) console.error(`[mail] resend failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error("[mail] resend error", err);
  }
}
