import { headers } from "next/headers";

/** Absolute base URL for links in e-mails and share texts. */
export async function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const paths = {
  invite: (code: string) => `/u/${code}`,
  manage: (hostToken: string) => `/beheer/${hostToken}`,
  date: (participantToken: string) => `/d/${participantToken}`,
  room: (participantToken: string) => `/d/${participantToken}/kamer`,
  profile: (memberToken: string) => `/profiel/${memberToken}`,
};
