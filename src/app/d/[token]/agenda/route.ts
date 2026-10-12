import { BRAND, DATE_MINUTES } from "@/lib/config";
import { getView } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { baseUrl, paths } from "@/lib/url";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export async function GET(_: Request, ctx: RouteContext<"/d/[token]/agenda">) {
  const { token } = await ctx.params;
  const view = await getView(await getDb(), token);
  if (!view) return new Response("Niet gevonden", { status: 404 });
  const url = `${await baseUrl()}${paths.date(token)}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${BRAND}//Videodate//NL`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${view.date.id}-${view.me.id}@${BRAND.toLowerCase()}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(view.date.starts_at)}`,
    `DURATION:PT${DATE_MINUTES}M`,
    `SUMMARY:${escape(`Videodate met ${view.other.first_name} (${DATE_MINUTES} min)`)}`,
    `DESCRIPTION:${escape(`Jouw persoonlijke link: ${url}`)}`,
    `URL:${url}`,
    view.date.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(`Over 10 minuten: videodate met ${view.other.first_name}`)}`,
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
