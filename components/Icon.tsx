import Link from "next/link";

/** One line-icon set for the whole app (24px grid, 1.8 stroke, follows text colour). */
const P = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  calendarPlus: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></>,
  calendarOff: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M9.5 13.5l5 5M14.5 13.5l-5 5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 3.9-6.5 8-6.5s7.2 2.5 8 6.5" /></>,
  userPlus: <><circle cx="10" cy="8" r="4" /><path d="M2.5 21c.8-4 3.7-6.5 7.5-6.5 1.5 0 2.8.4 3.9 1M19 14v6M16 17h6" /></>,
  money: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6 15h4" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M9 6l6 6-6 6" />,
  chev: <path d="M15 6l-6 6 6 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  undo: <><path d="M4 8h11a5 5 0 0 1 0 10H8" /><path d="M8 4L4 8l4 4" /></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  zap: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></>,
  logout: <><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 13h5l1 2h6l1-2h5" /></>,
  chat: <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.2z" />,
  phone: <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  pin: <><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />,
  repeat: <><path d="M4 11V9a4 4 0 0 1 4-4h12M17 2l3 3-3 3" /><path d="M20 13v2a4 4 0 0 1-4 4H4M7 22l-3-3 3-3" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  store: <><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 11v9h14v-9M10 20v-5h4v5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.5" /></>,
  sparkles: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  heart: <path d="M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
} as const;

export type IconName = keyof typeof P;

export function Icon({ n, size = 18, className, style }: { n: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{P[n]}</svg>
  );
}

/** An icon in a soft rounded square, for list rows and empty states. */
export function IconTile({ n, tone = "accent", size = 36 }: { n: IconName; tone?: "accent" | "good" | "warn" | "bad" | "plain"; size?: number }) {
  return <span className={`icon-tile tone-${tone}`} style={{ width: size, height: size }}><Icon n={n} size={Math.round(size * 0.52)} /></span>;
}

/** Card heading with its icon; extra goes to the far side. */
export function Title({ n, children, extra, style }: { n: IconName; children: React.ReactNode; extra?: React.ReactNode; style?: React.CSSProperties }) {
  return <h2 className="card-title" style={style}><span className="title-in"><Icon n={n} className="title-icon" />{children}</span>{extra}</h2>;
}

/** Back link at the top of a sub-screen. In RTL "back" points right. */
export function Back({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="back"><Icon n="back" size={16} />{label}</Link>;
}

/** A friendly empty state. */
export function Empty({ n, text }: { n: IconName; text: React.ReactNode }) {
  return <div className="empty"><IconTile n={n} tone="plain" size={44} /><span className="muted">{text}</span></div>;
}

/** Initials in a circle, for people lists. */
export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>{initials}</span>;
}
