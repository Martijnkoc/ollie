import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DayView } from "@/components/DayView";
import { readContext } from "@/lib/data";
import { addDays, formatDayLong, isValidDay, localDay } from "@/lib/time";

/** Days outside this window have no useful content and are not served. */
const WINDOW_DAYS = 400;

function inWindow(day: string) {
  const today = localDay(new Date());
  return isValidDay(day) && day >= addDays(today, -WINDOW_DAYS) && day <= addDays(today, WINDOW_DAYS);
}

export async function generateMetadata(props: PageProps<"/wedstrijden/[datum]">): Promise<Metadata> {
  const { datum } = await props.params;
  if (!inWindow(datum)) return {};
  return {
    title: `Wedstrijden ${formatDayLong(datum, true)}`,
    description: `Uitslagen en programma van ${formatDayLong(datum, true)} in de competities die Voetbalradar volgt.`,
    alternates: { canonical: `/wedstrijden/${datum}` },
    // Day pages are navigation: followed, not indexed, so they never compete with match pages.
    robots: { index: false, follow: true },
  };
}

export default async function DayPage(props: PageProps<"/wedstrijden/[datum]">) {
  const { datum } = await props.params;
  if (!inWindow(datum)) notFound();
  const read = await readContext();
  return <DayView read={read} day={datum} today={localDay(new Date())} />;
}
