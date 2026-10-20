/**
 * One icon set for the whole site and app: 24 px grid, 1,75 px strokes, round ends. Our own drawings, no emoji.
 * Decorative by default (aria-hidden); pass `label` when the icon carries meaning on its own.
 */
const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  "check-circle": "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM7.8 12.3l2.8 2.8 5.6-5.8",
  alert: "M12 3.5L2.8 19.5h18.4zM12 10v4.5M12 17.2v.1",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v5.5M12 7.8v.1",
  question: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8v.6M12 16.8v.1",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  "arrow-left": "M19 12H5M11 6l-6 6 6 6",
  ruler: "M3 16.5L16.5 3 21 7.5 7.5 21zM7 12.5l2 2M10 9.5l1.5 1.5M13 6.5l2 2",
  scan: "M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4M12 9.5v5M9.5 12h5",
  window: "M4 4h16v16H4zM12 4v16M4 12h16",
  floor: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4",
  paint: "M5 4h11a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM17 6.5h2.5v5.5H11v2.5M10 14.5h2v6.5h-2z",
  plinth: "M4 4v13h16M4 17v3h16v-3M8 17v3M12 17v3M16 17v3",
  phone: "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2",
  lock: "M6.5 11h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  download: "M12 3.5v11M7 10l5 5 5-5M4.5 19.5h15",
  file: "M6 2.5h8l4.5 4.5V20a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5zM13.5 2.5V7.5h5M8 12.5h8M8 16h8",
  upload: "M12 15V4M7 9l5-5 5 5M4.5 19.5h15",
  home: "M3.5 11L12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5",
  pin: "M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z",
  measured: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4",
  derived: "M4.5 4.5h15v15h-15zM8.5 10h7M8.5 14h7",
  auto: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11.9v.2",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.1M4.5 12h.1M4.5 18h.1",
  euro: "M17.5 6.5A7 7 0 1 0 17.5 17.5M4 10h9M4 14h9",
  shield: "M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19h1M19 14h1",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, label, size = 20, className }: { name: IconName; label?: string; size?: number; className?: string }) {
  // The dashed ring of "auto" (recognised, not yet checked) is drawn dashed on purpose.
  const dashed = name === "auto" ? "2.5 2.5" : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} strokeDasharray={dashed} />
    </svg>
  );
}
