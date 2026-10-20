"use client";

import type { DeviceInfo } from "./scan";

/**
 * What this browser can do for measuring, detected at runtime without asking for any permission. The camera is
 * only requested when the user starts a scan. A metric scan needs a WebXR "immersive-ar" session with hit-test:
 * the device's motion tracking then gives real distances. Nothing here assumes LiDAR, depth or WebXR.
 */
export type Capabilities = {
  /** HTTPS (or localhost): browsers only allow camera and AR there. */
  secure: boolean;
  /** WebXR augmented reality session supported. */
  xrAr: "ja" | "nee" | "onbekend";
  platform: DeviceInfo["platform"];
  browser: string;
};

type XrSystem = { isSessionSupported?: (mode: string) => Promise<boolean> };

export function platformOf(ua: string, touch: number): DeviceInfo["platform"] {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "desktop";
  return "onbekend";
}

/** Browser name and major version, for validation per device type; never a full user agent. */
export function browserOf(ua: string) {
  const m =
    ua.match(/(SamsungBrowser)\/(\d+)/) ??
    ua.match(/(EdgA?|Edg)\/(\d+)/) ??
    ua.match(/(Firefox|FxiOS)\/(\d+)/) ??
    ua.match(/(CriOS|Chrome)\/(\d+)/) ??
    ua.match(/Version\/(\d+).*(Safari)/);
  if (!m) return "onbekend";
  return m[2] === "Safari" ? `Safari ${m[1]}` : `${m[1]} ${m[2]}`;
}

export async function detectCapabilities(): Promise<Capabilities> {
  const secure = typeof window !== "undefined" && window.isSecureContext;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const platform = platformOf(ua, typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  let xrAr: Capabilities["xrAr"] = "nee";
  try {
    const xr = (navigator as Navigator & { xr?: XrSystem }).xr;
    if (secure && xr?.isSessionSupported) xrAr = (await xr.isSessionSupported("immersive-ar")) ? "ja" : "nee";
  } catch {
    xrAr = "onbekend";
  }
  return { secure, xrAr, platform, browser: browserOf(ua) };
}

/** Why this device cannot scan, in plain language, and what the smallest alternative is. Null when it can. */
export function unsupportedReason(c: Capabilities): string | null {
  if (c.xrAr === "ja") return null;
  if (!c.secure) return "De camera werkt alleen via een beveiligde verbinding (https).";
  if (c.platform === "ios")
    return "Safari op iPhone en iPad geeft websites (nog) geen AR-tracking (WebXR). Zonder die tracking kunnen we niet betrouwbaar in millimeters meten.";
  if (c.platform === "desktop")
    return "Een computer heeft geen AR-tracking. Scan met een Android-telefoon met Chrome; dit project gaat via een QR-code mee.";
  return "Deze browser geeft geen AR-tracking (WebXR met hit-test). Probeer Chrome op een Android-telefoon die Google Play-services voor AR heeft.";
}

/** A plain-language reason for a failed AR session request. */
export function arError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Je hebt geen toestemming gegeven voor de camera. Dat is prima: zonder camera scannen we niet; je kunt de maten ook zelf invullen.";
  if (name === "NotSupportedError")
    return "Dit toestel ondersteunt de AR-functies niet die we nodig hebben (hit-test). Scan met een ander toestel via de QR-code.";
  return "De AR-scan kon niet starten. Sluit andere apps die de camera gebruiken en probeer het opnieuw.";
}
