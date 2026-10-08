/**
 * Shell — the operations console: navy rail, quiet topbar, cream canvas, phone tab bar.
 * Ported from the Estate Ops console (design/estate-ops-ui.html) and governed by
 * docs/ESTATE_OPS_INTEGRATION_PROMPT.md §4. Presentational + navigation only: it
 * receives the brand, the user and the "Needs you today" count from its layout.
 *
 * Nav entries appear only when their page exists — no dead links, ever.
 */
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/* ── Icons: 17px line icons, one path set each, no emoji ─────────────────── */
const I = {
  today:     <path d="M3 12l9-9 9 9M5 10v10h14V10" />,
  people:    <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-5-6.3" /></>,
  properties: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 20V9" /></>,
  rent:      <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  repairs:   <path d="M14 6a4 4 0 00-5 5l-6 6 3 3 6-6a4 4 0 005-5l-2 2-2-2 2-2z" />,
  sessions:  <><path d="M4 5h16v11H8l-4 4z" /></>,
  handovers: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  messages:  <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  risk:      <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>,
  reports:   <><path d="M4 4h13l3 3v13H4z" /><path d="M8 11h8M8 15h5" /></>,
  analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  ai:        <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  paperwork: <><path d="M9 12l2 2 4-4" /><rect x="4" y="3" width="16" height="18" rx="2" /></>,
  laws:      <><path d="M4 4h13l3 3v13H4z" /><path d="M8 11h8M8 15h5" /></>,
  audit:     <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>,
  settings:  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  more:      <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  signout:   <path d="M10 17l5-5-5-5M15 12H3M21 4v16" />,
};
type IconKey = keyof typeof I;

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  /** Shown in the phone tab bar (max five). */
  mobile?: boolean;
  /** Short label for the tab bar. */
  short?: string;
}

/**
 * The staff console nav. New laws joins as its screen ships (docs/
 * BUILD_PLAN.md C35) — Paperwork (C32) has landed. Target: eight items.
 * Sessions, Handovers, Messages, Risk flags and AI live inside the tenant
 * record and People page; Reports and Analytics are reached from Today (C05).
 */
export const STAFF_NAV: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",           icon: "today",     mobile: true },
  { href: "/tenants",     label: "People",              icon: "people",    mobile: true },
  { href: "/properties",  label: "Properties",          icon: "properties", mobile: true },
  { href: "/ledger",      label: "Rent",                icon: "rent",      mobile: true },
  { href: "/paperwork",   label: "Paperwork",           icon: "paperwork" },
  { href: "/maintenance", label: "Repairs",             icon: "repairs",   mobile: true, short: "Fix" },
  { href: "/audit",       label: "What the system did", icon: "audit",     short: "Log" },
];

export const CONTRACTOR_NAV: NavItem[] = [
  { href: "/jobs", label: "My jobs", icon: "repairs", mobile: true },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin access",
  manager: "Manager access",
  support_worker: "Support worker",
  contractor: "Contractor access",
  tenant: "Tenant",
};

const Icon = ({ k }: { k: IconKey }) => (
  <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {I[k]}
  </svg>
);

export interface ShellProps {
  children: ReactNode;
  nav: NavItem[];
  /** The organisation / letterhead shown at the top of the rail. */
  brand: string;
  brandSub?: string;
  logoUrl?: string | null;
  user: string;
  role: string;
  /** Count of decisions waiting on Today. Hidden when 0. */
  needsYou?: number;
  /**
   * Agent runtime health for the topbar pill. `null` hides the pill (no runtime
   * yet); `true` = System live; `false` = Agents paused.
   */
  live?: boolean | null;
  /** Simulated connections to name in the practice-mode pill. */
  practice?: string[];
  /** Primary action in the topbar (one, amber). */
  primaryAction?: { href: string; label: string };
  /** Secondary action in the topbar (one, outlined, sits left of the primary). */
  secondaryAction?: { href: string; label: string };
  settingsHref?: string | null;
  onSignOut: () => void;
}

export function Shell({
  children, nav, brand, brandSub = "Tenant Hub", logoUrl, user, role,
  needsYou = 0, live = null, practice = [], primaryAction, secondaryAction, settingsHref = "/settings", onSignOut,
}: ShellProps) {
  const path = usePathname() ?? "";
  const on = (h: string) => path === h || path.startsWith(h + "/");
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [path]);

  const home = nav[0]?.href ?? "/dashboard";
  const tabs = nav.filter((n) => n.mobile).slice(0, 5);
  const overflow = nav.filter((n) => !tabs.includes(n));
  const crumb = nav.find((n) => on(n.href))?.label ?? (settingsHref && on(settingsHref) ? "Settings" : brand);
  const initials = user.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>

      <aside className="rail">
        <Link href={home} className="brand">
          {logoUrl ? <Image className="mark" src={logoUrl} alt="" width={34} height={34} /> : <div className="mark" aria-hidden="true">{brand[0]}</div>}
          <div><b>{brand}</b><span>{brandSub}</span></div>
        </Link>

        <nav className="nav" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}>
              <Icon k={n.icon} />{n.label}
              {n.href === "/dashboard" && needsYou > 0 && (
                <span className="badge" aria-label={`${needsYou} decisions waiting`}>{needsYou}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="foot">
          <div className="avatar" aria-hidden="true">{initials}</div>
          <div className="who"><b>{user}</b><small>{ROLE_LABEL[role] ?? role}</small></div>
          {settingsHref && (
            <Link href={settingsHref} className="iconbtn" aria-label="Settings" title="Settings"><Icon k="settings" /></Link>
          )}
          <button type="button" className="iconbtn" aria-label="Sign out" title="Sign out" onClick={onSignOut}><Icon k="signout" /></button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="crumb">{crumb}</div>
          {practice.length > 0 && (
            <Link href={`${settingsHref ?? "/settings"}#connections`} className="pill practice" title="These connections are simulated until you add their credentials">
              Practice mode · {practice.join(", ")}
            </Link>
          )}
          {live === true && <span className="pill live"><span className="dot" /> System live</span>}
          {live === false && (
            <Link href="/audit" className="pill paused" title="No agent has checked in for over two minutes"><span className="dot" /> Agents paused</Link>
          )}
          {secondaryAction && <Link href={secondaryAction.href} className="act ghost topact">{secondaryAction.label}</Link>}
          {primaryAction && <Link href={primaryAction.href} className="act topact">{primaryAction.label}</Link>}
        </div>
        <main id="main" className="canvas">{children}</main>
      </div>

      <nav className="tabbar" aria-label="Main">
        {tabs.map((n) => (
          <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}>
            <Icon k={n.icon} /><span>{n.short ?? n.label.split(" ")[0]}</span>
            {n.href === "/dashboard" && needsYou > 0 && <i className="badge">{needsYou}</i>}
          </Link>
        ))}
        {(overflow.length > 0 || settingsHref) && (
          <button type="button" className={moreOpen ? "on" : ""} aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen((v) => !v)}>
            <Icon k="more" /><span>More</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div id="more-sheet" className="sheet" role="dialog" aria-label="More" onClick={(e) => e.stopPropagation()}>
            {overflow.map((n) => (
              <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""}><Icon k={n.icon} />{n.label}</Link>
            ))}
            {settingsHref && <Link href={settingsHref}><Icon k="settings" />Settings</Link>}
            <button type="button" onClick={onSignOut}><Icon k="signout" />Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
