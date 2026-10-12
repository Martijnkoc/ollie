"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaError = "denied" | "notfound" | "inuse" | "unsupported" | "other";

const messages: Record<MediaError, string> = {
  denied: "Je browser geeft geen toegang tot camera of microfoon. Sta dit toe via het slotje in de adresbalk en probeer opnieuw.",
  notfound: "We vinden geen camera of microfoon. Sluit er een aan of probeer een ander apparaat.",
  inuse: "Je camera of microfoon is in gebruik door een andere app. Sluit die app en probeer opnieuw.",
  unsupported: "Deze browser ondersteunt geen videobellen. Probeer een recente versie van Chrome, Edge, Firefox of Safari.",
  other: "Camera of microfoon starten lukte niet. Probeer het opnieuw.",
};

export function mediaErrorText(e: MediaError) {
  return messages[e];
}

/**
 * Camera and microphone for previews. Tracks are always stopped: on stop(), on unmount, and also
 * when the permission prompt resolves after the component is already gone.
 */
export function useLocalMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<MediaError | null>(null);
  const [level, setLevel] = useState(0);
  const alive = useRef(true);
  const current = useRef<MediaStream | null>(null);
  const audio = useRef<{ ctx: AudioContext; raf: number } | null>(null);

  const stop = useCallback(() => {
    current.current?.getTracks().forEach((t) => t.stop());
    current.current = null;
    if (audio.current) {
      cancelAnimationFrame(audio.current.raf);
      audio.current.ctx.close().catch(() => {});
      audio.current = null;
    }
    if (alive.current) {
      setStream(null);
      setLevel(0);
    }
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setError("unsupported");
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!alive.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      current.current?.getTracks().forEach((t) => t.stop());
      current.current = s;
      setStream(s);
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
          if (audio.current) audio.current.raf = requestAnimationFrame(tick);
        };
        audio.current = { ctx, raf: requestAnimationFrame(tick) };
      } catch {
        // The level meter is a nicety; video still works without it.
      }
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError"
            ? "notfound"
            : name === "NotReadableError"
              ? "inuse"
              : "other",
      );
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);

  return { stream, error, level, start, stop };
}
