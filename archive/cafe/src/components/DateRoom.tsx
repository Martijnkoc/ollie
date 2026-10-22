"use client";

import type { DailyCall } from "@daily-co/daily-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { mediaErrorText, useLocalMedia } from "@/hooks/useLocalMedia";
import { formatLeft } from "./Countdown";
import { Dialog } from "./Dialog";
import { ReportForm } from "./forms/ReportForm";

type ServerState = {
  phase: "proposed" | "upcoming" | "lobby" | "live" | "ended" | "cancelled" | "declined" | "no_show" | "failed";
  serverNow: string;
  startedAt: string | null;
  endsAt: string | null;
  joinDeadline: string;
  otherPresent: boolean;
};

type Stage = "prejoin" | "joining" | "incall" | "unconfigured" | "error";

const HEARTBEAT_MS = 5000;
const WARNING_MS = 2 * 60_000;

async function post<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: body as T } : { ok: false, error: body.error ?? "Er ging iets mis.", status: res.status };
  } catch {
    return { ok: false, error: "Geen verbinding met Cafe.", status: 0 };
  }
}

function VideoTile({ track, mirror, muted, label }: { track: MediaStreamTrack | null; mirror?: boolean; muted?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = track ? new MediaStream([track]) : null;
  }, [track]);
  return (
    <div className="tile">
      {track ? <video ref={ref} autoPlay playsInline muted={muted} className={mirror ? "mirror" : undefined} aria-label={label} /> : null}
      <span className="name">{label}</span>
    </div>
  );
}

function RemoteAudio({ track }: { track: MediaStreamTrack | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = track ? new MediaStream([track]) : null;
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

export function DateRoom({
  dateId,
  myName,
  otherName,
  testMode,
}: {
  dateId: string;
  myName: string;
  otherName: string;
  testMode: boolean;
}) {
  const router = useRouter();
  const preview = useLocalMedia();
  const [stage, setStage] = useState<Stage>("prejoin");
  const [error, setError] = useState<string>();
  const [state, setState] = useState<ServerState | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [tracks, setTracks] = useState<{
    localVideo: MediaStreamTrack | null;
    remoteVideo: MediaStreamTrack | null;
    remoteAudio: MediaStreamTrack | null;
  }>({
    localVideo: null,
    remoteVideo: null,
    remoteAudio: null,
  });
  const [announcement, setAnnouncement] = useState("");
  const call = useRef<DailyCall | null>(null);
  const warned = useRef(false);
  const leaving = useRef(false);
  const previewVideo = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (previewVideo.current) previewVideo.current.srcObject = preview.stream;
  }, [preview.stream, stage]);

  // Ask for camera and microphone as soon as the lobby opens.
  useEffect(() => {
    void preview.start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const teardown = useCallback(async () => {
    const c = call.current;
    call.current = null;
    if (c) {
      await c.leave().catch(() => {});
      await c.destroy().catch(() => {});
    }
    preview.stop();
  }, [preview]);

  // Always release camera and microphone when leaving this page, whatever the reason.
  useEffect(() => () => void teardown(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    await teardown();
    router.replace(`/afspraken/${dateId}`);
    router.refresh();
  }, [teardown, router, dateId]);

  const beat = useCallback(async () => {
    const res = await post<ServerState>(`/api/afspraken/${dateId}/hartslag`);
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        setError(res.error);
        await finish();
      } else setError("De verbinding met Cafe hapert. We blijven het proberen.");
      return;
    }
    setError(undefined);
    setState(res.data);
    setOffset(new Date(res.data.serverNow).getTime() - Date.now());
    if (!["lobby", "live"].includes(res.data.phase)) await finish();
  }, [dateId, finish]);

  // Heartbeat while in the call; the server decides start and end.
  useEffect(() => {
    if (stage !== "incall") return;
    void beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [stage, beat]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const serverNow = now + offset;
  const endsAt = state?.endsAt ? new Date(state.endsAt).getTime() : null;
  const left = endsAt ? endsAt - serverNow : null;
  const waitLeft = state ? new Date(state.joinDeadline).getTime() - serverNow : null;

  useEffect(() => {
    if (state?.phase === "live" && state.startedAt && !announcement)
      setAnnouncement(`Jullie zijn er allebei. De twintig minuten zijn begonnen.`);
  }, [state, announcement]);

  useEffect(() => {
    if (left !== null && left <= WARNING_MS && left > 0 && !warned.current) {
      warned.current = true;
      setAnnouncement("Nog twee minuten.");
    }
    // At the end, ask the server right away; it closes the room.
    if (left !== null && left <= 0) void beat();
  }, [left, beat]);

  function syncTracks() {
    const c = call.current;
    if (!c) return;
    const ps = c.participants();
    const remote = Object.values(ps).find((p) => !p.local);
    setTracks({
      localVideo: ps.local?.tracks.video.persistentTrack ?? null,
      remoteVideo: remote?.tracks.video.state === "playable" ? (remote.tracks.video.persistentTrack ?? null) : null,
      remoteAudio: remote?.tracks.audio.state === "playable" ? (remote.tracks.audio.persistentTrack ?? null) : null,
    });
  }

  async function join() {
    setStage("joining");
    setError(undefined);
    const res = await post<{ mode: "daily" | "fake" | "unconfigured"; url?: string; token?: string }>(`/api/afspraken/${dateId}/deelnemen`);
    if (!res.ok) {
      setError(res.error);
      setStage("error");
      return;
    }
    if (res.data.mode === "unconfigured") return setStage("unconfigured");
    if (res.data.mode === "fake") {
      setTracks({ localVideo: preview.stream?.getVideoTracks()[0] ?? null, remoteVideo: null, remoteAudio: null });
      return setStage("incall");
    }
    try {
      const { default: Daily } = await import("@daily-co/daily-js");
      preview.stop();
      const c = Daily.createCallObject({ audioSource: true, videoSource: true });
      call.current = c;
      c.on("participant-joined", syncTracks)
        .on("participant-updated", syncTracks)
        .on("participant-left", syncTracks)
        .on("joined-meeting", syncTracks)
        .on("left-meeting", () => void finish())
        .on("error", () => {
          setError("De videoverbinding is verbroken.");
          void finish();
        })
        .on("camera-error", () => setError("Je camera of microfoon werkt niet. Controleer de toestemming in je browser."));
      await c.join({ url: res.data.url, token: res.data.token });
      setStage("incall");
      syncTracks();
    } catch {
      await teardown();
      setError("Verbinden met de videodienst lukte niet. Probeer het opnieuw.");
      setStage("error");
    }
  }

  async function endEarly() {
    await post(`/api/afspraken/${dateId}/einde`);
    await finish();
  }

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    call.current?.setLocalAudio(next);
    preview.stream?.getAudioTracks().forEach((t) => (t.enabled = next));
  }

  function toggleCam() {
    const next = !camOn;
    setCamOn(next);
    call.current?.setLocalVideo(next);
    preview.stream?.getVideoTracks().forEach((t) => (t.enabled = next));
  }

  const live = state?.phase === "live";
  const clock =
    stage !== "incall"
      ? "Lobby"
      : live && left !== null
        ? `Nog ${formatLeft(left)}`
        : waitLeft !== null
          ? `Wachten op ${otherName} · nog ${formatLeft(waitLeft)}`
          : "Verbinden…";

  return (
    <div className="room">
      <div className="room-bar">
        <strong>Videodate met {otherName}</strong>
        {testMode && <span className="badge demo">Testmodus: geen echte videoverbinding</span>}
        <span className={`time${left !== null && left <= WARNING_MS ? " soon" : ""}`}>{clock}</span>
        <Link className="btn secondary small" href={`/afspraken/${dateId}`} onClick={() => void teardown()}>
          Terug
        </Link>
      </div>
      <p className="visually-hidden" role="status" aria-live="assertive">
        {announcement}
      </p>

      <div className="room-stage">
        {left !== null && left <= WARNING_MS && left > 0 && <div className="toast">Nog twee minuten</div>}

        {stage === "prejoin" || stage === "joining" || stage === "error" || stage === "unconfigured" ? (
          <>
            <div className="tile">
              {preview.stream ? (
                <video ref={previewVideo} autoPlay muted playsInline className="mirror" aria-label="Je eigen camerabeeld" />
              ) : null}
              <span className="name">{myName}</span>
              {!preview.stream && !preview.error && <p>Camera starten…</p>}
            </div>
            <div className="stack" style={{ alignSelf: "center", maxWidth: 420 }}>
              <h1 style={{ fontSize: "1.6rem" }}>Klaar voor {otherName}?</h1>
              <p>
                Je verschijnt als <strong>{myName}</strong>. De twintig minuten beginnen pas als jullie er allebei zijn. Je kunt altijd
                eerder stoppen.
              </p>
              {preview.stream && (
                <div>
                  <span className="small" id="lobby-mic">
                    Microfoon
                  </span>
                  <div
                    className="meter"
                    role="meter"
                    aria-labelledby="lobby-mic"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(preview.level * 100)}
                  >
                    <span style={{ width: `${Math.round(preview.level * 100)}%` }} />
                  </div>
                </div>
              )}
              {preview.error && (
                <div className="stack">
                  <p className="notice error" role="alert" style={{ color: "var(--ink)" }}>
                    {mediaErrorText(preview.error)}
                  </p>
                  <button type="button" className="btn secondary" onClick={preview.start}>
                    Opnieuw proberen
                  </button>
                </div>
              )}
              {stage === "unconfigured" ? (
                <p className="notice warn" role="status" style={{ color: "var(--ink)" }}>
                  Video is nog niet geconfigureerd op deze omgeving, dus er kan nu geen verbinding worden gemaakt.
                </p>
              ) : (
                <button type="button" className="btn lime large" onClick={join} disabled={stage === "joining" || !preview.stream}>
                  {stage === "joining" ? "Verbinden…" : "Deelnemen"}
                </button>
              )}
              {error && (
                <p className="notice error" role="alert" style={{ color: "var(--ink)" }}>
                  {error}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <VideoTile track={tracks.remoteVideo} label={otherName} />
            <VideoTile track={tracks.localVideo} label={`${myName} (jij)`} mirror muted />
            <RemoteAudio track={tracks.remoteAudio} />
            {!live && (
              <p className="notice" role="status" style={{ gridColumn: "1 / -1", color: "var(--ink)" }}>
                {state?.otherPresent
                  ? "Jullie zijn er allebei. Even geduld, het gesprek start."
                  : `Wachten op ${otherName}. De twintig minuten beginnen als jullie er allebei zijn.`}
              </p>
            )}
            {error && (
              <p className="notice error" role="alert" style={{ gridColumn: "1 / -1", color: "var(--ink)" }}>
                {error}
              </p>
            )}
          </>
        )}
      </div>

      {stage === "incall" && (
        <div className="room-controls">
          <button type="button" className="btn secondary" aria-pressed={!micOn} onClick={toggleMic}>
            {micOn ? "Microfoon uit" : "Microfoon aan"}
          </button>
          <button type="button" className="btn secondary" aria-pressed={!camOn} onClick={toggleCam}>
            {camOn ? "Camera uit" : "Camera aan"}
          </button>
          <Dialog trigger="Gesprek beëindigen" triggerClassName="btn lime" title="Gesprek beëindigen?">
            <p>Het gesprek stopt dan voor jullie allebei. Daarna kies je privé of je verder wilt.</p>
            <div className="row">
              <button type="button" className="btn" onClick={endEarly}>
                Ja, beëindigen
              </button>
              <form method="dialog">
                <button type="submit" className="btn secondary">
                  Doorgaan met praten
                </button>
              </form>
            </div>
          </Dialog>
          <Dialog trigger="Melden" triggerClassName="btn secondary" title={`${otherName} melden`}>
            <ReportForm context="date" contextId={dateId} name={otherName} />
          </Dialog>
        </div>
      )}
    </div>
  );
}
