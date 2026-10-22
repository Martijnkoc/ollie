import { currentUser } from "@/lib/auth/session";
import { DATE_MINUTES } from "@/lib/config";
import { viewFor } from "@/lib/dates/core";
import { getDb } from "@/lib/db";
import { baseUrl } from "@/lib/url";

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Calendar file for a participant; times in UTC so every calendar shows them in its own zone. */
export async function GET(_: Request, ctx: RouteContext<"/afspraken/[id]/agenda">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Log eerst in", { status: 401 });
  const view = await viewFor(await getDb(), user.id, id);
  if (!view) return new Response("Niet gevonden", { status: 404 });
  const url = `${await baseUrl()}/afspraken/${id}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cafe//Videodate//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${view.date.id}-${view.me.id}@cafe`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(view.date.scheduled_at)}`,
    `DURATION:PT${DATE_MINUTES + 5}M`,
    `SUMMARY:${escape(`Videodate met ${view.other.display_name} (Cafe)`)}`,
    `DESCRIPTION:${escape(`De twintig minuten beginnen zodra jullie er allebei zijn. Log in via ${url}`)}`,
    `URL:${url}`,
    ["cancelled", "declined", "no_show", "failed"].includes(view.phase) ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(`Over 10 minuten: videodate met ${view.other.display_name}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="videodate.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
