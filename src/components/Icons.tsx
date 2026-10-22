/**
 * A small, own icon set: square line ends, 1.75 stroke, drawn for this brand. Used sparingly and always
 * next to a text label (or with an accessible name on the button).
 */
type P = { className?: string };
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
};

export const Mark = ({ className }: P) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" fill="#C5FF38" />
    <path
      d="M9 21.5c1.6 1.6 3.9 2.5 6.6 2.5 4 0 6.6-2 6.6-5 0-6-12.4-3.6-12.4-9 0-2.4 2.3-4 5.6-4 2.3 0 4.3.7 5.7 2"
      fill="none"
      stroke="#101112"
      strokeWidth="3.2"
    />
  </svg>
);

export const Arrow = ({ className = "arrow" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);

export const ArrowUpRight = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

export const Bookmark = ({ className, filled }: P & { filled?: boolean }) => (
  <svg {...base} className={className}>
    <path d="M6 3h12v18l-6-4.5L6 21z" fill={filled ? "currentColor" : "none"} />
  </svg>
);

export const Search = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </svg>
);

export const Home = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z" />
  </svg>
);

export const Discover = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="4" y="4" width="7" height="9" />
    <rect x="13" y="4" width="7" height="5" />
    <rect x="4" y="15" width="7" height="5" />
    <rect x="13" y="11" width="7" height="9" />
  </svg>
);

export const Chat = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);

export const Briefcase = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="7" width="17" height="12" />
    <path d="M9 7V4h6v3M3.5 12h17" />
  </svg>
);

export const User = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </svg>
);

export const Plus = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Pin = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

export const Clock = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const Play = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </svg>
);

export const Upload = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 16V4M7 9l5-5 5 5M4 15v5h16v-5" />
  </svg>
);
