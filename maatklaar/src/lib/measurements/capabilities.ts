"use client";

/**
 * What this browser can do for measuring, detected without asking for any permission. Camera access is
 * only requested when the user starts a scan.
 */
export type Capabilities = {
  /** HTTPS (or localhost): browsers only allow the camera there. */
  secure: boolean;
  /** Live camera via getUserMedia. */
  camera: boolean;
  /** WebXR augmented reality session (depth/hit-test capable devices). */
  xrAr: "ja" | "nee" | "onbekend";
};

export async function detectCapabilities(): Promise<Capabilities> {
  const secure = typeof window !== "undefined" && window.isSecureContext;
  const camera = secure && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  let xrAr: Capabilities["xrAr"] = "nee";
  try {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported?: (mode: string) => Promise<boolean> } }).xr;
    if (xr?.isSessionSupported) xrAr = (await xr.isSessionSupported("immersive-ar")) ? "ja" : "nee";
  } catch {
    xrAr = "onbekend";
  }
  return { secure, camera, xrAr };
}

/** A plain-language reason for a failed camera request. */
export function cameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Je hebt geen toestemming gegeven voor de camera. Dat is prima: kies een foto uit je galerij of vul de maten met de hand in.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "We vinden geen camera op dit apparaat. Kies een bestaande foto.";
  if (name === "NotReadableError") return "De camera is in gebruik door een andere app. Sluit die en probeer het opnieuw.";
  return "De camera kon niet starten. Kies een bestaande foto of vul de maten met de hand in.";
}
