import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Everything runs from our own origin: the PDF and OCR engines are self-hosted in /vendor, PDOK and the
// payment provider are only called from the server. 'wasm-unsafe-eval' is needed for the WebAssembly
// builds of PDF.js and Tesseract; neither needs plain eval.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // This app lives in a subfolder of a repository with its own lockfile; pin the workspace root here.
  turbopack: { root: import.meta.dirname },
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // Self-hosted engine files never change for a given build.
        source: "/vendor/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
