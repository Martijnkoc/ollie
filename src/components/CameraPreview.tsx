"use client";

import { useEffect, useRef, useState } from "react";

/** Lets people check camera and microphone before the date. Nothing is recorded or sent. */
export function CameraPreview({ autoStart = false, label = "Jij" }: { autoStart?: boolean; label?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "on" | "denied">("idle");
  const stream = useRef<MediaStream | null>(null);

  async function start() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (video.current) video.current.srcObject = stream.current;
      setState("on");
    } catch {
      setState("denied");
    }
  }

  useEffect(() => {
    if (autoStart) void start();
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, [autoStart]);

  return (
    <div className="camera-preview">
      <video ref={video} autoPlay muted playsInline hidden={state !== "on"} />
      {state === "on" && <span className="name">{label}</span>}
      {state === "idle" && (
        <button type="button" className="btn secondary" onClick={start}>
          Test je camera
        </button>
      )}
      {state === "denied" && (
        <p className="small" style={{ padding: 16, textAlign: "center" }}>
          Geen toegang tot je camera. Sta camera en microfoon toe in je browser en probeer opnieuw.
        </p>
      )}
    </div>
  );
}
