"use client";

import { useEffect, useRef } from "react";
import { mediaErrorText, useLocalMedia } from "@/hooks/useLocalMedia";

/** Camera and microphone check. Nothing is recorded or sent anywhere. */
export function CameraPreview({ name }: { name: string }) {
  const { stream, error, level, start, stop } = useLocalMedia();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="stack">
      <div className="camera-preview">
        {stream ? (
          <>
            <video ref={video} autoPlay muted playsInline aria-label="Voorbeeld van je eigen camerabeeld" />
            <span
              className="name"
              style={{
                position: "absolute",
                left: 12,
                bottom: 10,
                background: "rgb(0 0 0 / 60%)",
                color: "#fff",
                padding: "2px 10px",
                borderRadius: 999,
              }}
            >
              {name}
            </span>
          </>
        ) : (
          <button type="button" className="btn secondary" onClick={start}>
            Test camera en microfoon
          </button>
        )}
      </div>
      {stream && (
        <>
          <div>
            <span className="small muted" id="mic-label">
              Microfoon: praat even, dan beweegt de balk
            </span>
            <div
              className="meter"
              role="meter"
              aria-labelledby="mic-label"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
            >
              <span style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          </div>
          <button type="button" className="btn ghost small" onClick={stop}>
            Test stoppen
          </button>
        </>
      )}
      {error && (
        <p className="notice error" role="alert">
          {mediaErrorText(error)}
        </p>
      )}
    </div>
  );
}
