"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CameraPreview } from "./CameraPreview";

function mmss(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function Room({
  join,
  otherName,
  myName,
  startsAt,
  endsAt,
  leaveHref,
  doneHref,
}: {
  join: { mode: "daily"; url: string } | { mode: "demo" };
  otherName: string;
  myName: string;
  startsAt: string;
  endsAt: string;
  leaveHref: string;
  doneHref: string;
}) {
  const router = useRouter();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const over = now !== null && now >= end;
  useEffect(() => {
    if (over) router.push(doneHref);
  }, [over, doneHref, router]);

  const beforeStart = now !== null && now < start;
  const left = now === null ? null : end - now;
  const soon = left !== null && left <= 2 * 60_000 && left > 0;

  return (
    <div className="room">
      <div className="room-bar">
        <strong>Videodate met {otherName}</strong>
        <span className={`time${soon ? " soon" : ""}`} aria-live="polite" suppressHydrationWarning>
          {now === null ? "" : beforeStart ? `Begint over ${mmss(start - now)}` : `Nog ${mmss(left!)}`}
        </span>
        <Link className="btn secondary" href={beforeStart ? leaveHref : doneHref} style={{ minHeight: 40 }}>
          {beforeStart ? "Terug" : "Afronden"}
        </Link>
      </div>
      <div className="room-stage">
        {soon && <div className="toast">Nog twee minuten</div>}
        {join.mode === "daily" ? (
          <iframe src={join.url} title={`Videodate met ${otherName}`} allow="camera; microphone; fullscreen; speaker; display-capture; autoplay" />
        ) : (
          <div className="demo-stage">
            <div className="tile">
              <CameraPreview autoStart label={myName} />
            </div>
            <div className="tile">
              <div>
                <p style={{ fontWeight: 600 }}>{otherName}</p>
                <p className="small" style={{ opacity: 0.8 }}>
                  Demomodus: er is nog geen videodienst gekoppeld, dus je ziet alleen je eigen beeld. Stel DAILY_API_KEY in
                  voor echte gesprekken.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
