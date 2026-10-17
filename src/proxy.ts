import { NextResponse, type NextRequest } from "next/server";

/** Comparison that takes the same time wherever the strings differ. */
function sameString(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * HTTP Basic authentication in front of /beheer. The credentials come from ADMIN_USER and
 * ADMIN_PASSWORD; without both, the admin area is closed for everyone. The page and its server
 * actions check the same header again, so this is a first line, not the only one.
 */
export function proxy(request: NextRequest) {
  const user = process.env.ADMIN_USER ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  const header = request.headers.get("authorization") ?? "";
  let ok = false;
  if (user && password.length >= 16 && header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      ok = sameString(decoded, `${user}:${password}`);
    } catch {
      ok = false;
    }
  }
  if (ok) return NextResponse.next();
  return new NextResponse("Geen toegang", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Voetbalradar beheer", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export const config = {
  matcher: ["/beheer", "/beheer/:path*"],
};
