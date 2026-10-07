import Link from "next/link";
import { db, hasDatabaseUrl, findSessionByTokenHash } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";
import { readSessionToken } from "../lib/session-cookie";

/**
 * Landing page. Rebuilt on the real design tokens (navy/amber/cream, Sora) —
 * it previously used a generic dark-blue SaaS template (Inter font, Tailwind
 * sky-blue #38bdf8 throughout), which directly violated this project's own
 * "never use generic Tailwind colour names in branded components" rule and
 * looked like a different product from the rest of the app. Client feedback,
 * 2026-09-27. Copy also dropped generic SaaS language ("Enterprise DBMS",
 * "Deploy Premium") for plain words about what the product actually does.
 *
 * Rebuilt again 2026-10 off giant inline-style objects onto Tailwind
 * utilities — client feedback that the mobile view read as "dry": the ghost
 * "Log in" nav link had no border/background at all (unlike every other
 * button on the page), so next to a real filled button it looked like
 * unstyled, broken text rather than an intentional second action. Every
 * interactive element on this page now has a real hover/active state —
 * none did before, which was a quieter version of the same problem.
 *
 * "Already signed in?" check moved off Supabase Auth onto the app's own
 * sessions (DECISIONS D27) — found crashing a deployment with no Supabase
 * configured at all: this ran at request time (this page is force-dynamic,
 * same as everywhere else — see the root layout) and threw before ever
 * reaching the JSX below. A page with no session system configured
 * (!hasDatabaseUrl()) just shows the signed-out state, same as a genuine
 * signed-out visitor — never a crash.
 */
export default async function LandingPage() {
  let session: { id: string } | null = null;
  if (hasDatabaseUrl()) {
    const token = readSessionToken();
    if (token) {
      const found = await findSessionByTokenHash(db(), hashToken(token)).catch(() => null);
      if (found) session = { id: found.profileId };
    }
  }

  return (
    <main className="min-h-[100dvh] bg-cream text-ink">
      <nav className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-navy text-lg font-extrabold text-amber">M</span>
          <span className="text-lg font-bold text-navy">Matty&apos;s Place</span>
        </Link>
        {session ? (
          <Link href="/dashboard" className={PRIMARY_BTN}>Open the console</Link>
        ) : (
          <div className="flex items-center gap-2.5">
            <Link href="/login" className={GHOST_BTN}>Log in</Link>
            <Link href="/onboarding/subscription" className={PRIMARY_BTN}>Start free trial</Link>
          </div>
        )}
      </nav>

      <section className="relative overflow-hidden px-5 pb-14 pt-14 text-center sm:pt-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[520px] w-[820px] -translate-x-1/2 -translate-y-[30%] rounded-full bg-amber/[0.18] blur-[120px]"
        />
        <div className="mx-auto max-w-[680px]">
          <span className="inline-block rounded-full bg-amber/[0.15] px-3.5 py-1.5 text-[13px] font-bold text-amber-deep">
            Supported housing, run by an operations console
          </span>
          <h1 className="mx-auto mt-6 max-w-[15ch] text-[clamp(2.1rem,7vw,3.6rem)] font-bold leading-[1.1] tracking-[-0.02em] text-navy [text-wrap:balance]">
            Every morning, it tells you exactly what needs you today.
          </h1>
          <p className="mx-auto mt-5 max-w-[500px] text-[1.05rem] leading-relaxed text-slate [text-wrap:pretty]">
            Housing benefit chased, rent reconciled, certificates watched, repairs triaged. All
            checked every day. You see only the decisions that need a person, and nothing else.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={session ? "/dashboard" : "/login"} className={`${PRIMARY_BTN} px-7 py-3.5 text-[15px]`}>
              Get started
            </Link>
            <Link href="#pricing" className={`${GHOST_BTN} px-7 py-3.5 text-[15px]`}>
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section id="pricing" className="px-5 pb-24 pt-4 sm:pb-28">
        <div className="mx-auto max-w-[1000px]">
          <div className="mb-12 text-center">
            <h2 className="text-[1.75rem] font-bold text-navy sm:text-[2rem]">Simple, transparent pricing</h2>
            <p className="mt-2 text-[15px] text-slate">One price per organisation size, no hidden tiers.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:items-center">
            <PlanCard
              name="Starter" price={49} tagline="For a small home just getting started."
              features={["Up to 10 active tenants", "Basic AI intake extraction", "Standard reporting", "Email support"]}
              href="/signup?plan=starter" cta="Choose starter"
            />
            <PlanCard
              name="Professional" price={99} tagline="For a growing service with real compliance needs."
              features={["Up to 50 tenants", "Advanced form generation", "API access", "Standard support"]}
              href="/onboarding/subscription?plan=professional" cta="Choose professional" featured
            />
            <PlanCard
              name="Enterprise" price={300} tagline="For an association running several HMOs at scale."
              features={["Unlimited tenants and properties", "Full agent automation", "White-label tenant portal", "Priority support"]}
              href="/onboarding/subscription?plan=premium" cta="Talk to us"
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-line px-5 py-10 text-center text-[13px] text-slate-2">
        <p>© {new Date().getFullYear()} Matty&apos;s Place.</p>
        <p className="mt-2">
          <Link href="/privacy" className="underline-offset-2 hover:text-slate hover:underline">Privacy</Link>
          <span className="mx-2.5" aria-hidden>·</span>
          <Link href="/terms" className="underline-offset-2 hover:text-slate hover:underline">Terms</Link>
        </p>
      </footer>
    </main>
  );
}

function PlanCard({ name, price, tagline, features, href, cta, featured }: { name: string; price: number; tagline: string; features: string[]; href: string; cta: string; featured?: boolean }) {
  return (
    <div
      className={`flex h-full flex-col rounded-2xl bg-surface p-7 transition-shadow duration-200 ${
        featured
          ? "border-2 border-amber shadow-[0_18px_40px_-20px_rgba(16,28,46,.45)] lg:scale-[1.05]"
          : "border border-line shadow-[0_1px_0_rgba(16,28,46,.04)] hover:shadow-[0_10px_24px_-18px_rgba(16,28,46,.25)]"
      }`}
    >
      <div className="mb-2.5 h-4 text-[11px] font-bold uppercase tracking-[0.05em] text-amber-deep">
        {featured && "Most popular"}
      </div>
      <h3 className="text-[15px] font-bold text-slate">{name}</h3>
      <div className="mb-2.5 mt-1 text-[2.2rem] font-bold text-navy">
        £{price}
        <span className="text-sm font-medium text-slate-2">/mo</span>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-slate">{tagline}</p>
      <ul className="mb-8 flex flex-col gap-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm text-ink">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2E9E6B" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
              <path d="M5 13l4 4L19 7" />
            </svg>
            {f}
          </li>
        ))}
      </ul>
      <Link href={href} className={`mt-auto justify-center text-center ${featured ? PRIMARY_BTN : GHOST_BTN}`}>
        {cta}
      </Link>
    </div>
  );
}

const PRIMARY_BTN =
  "inline-flex items-center justify-center rounded-[9px] bg-amber px-[18px] py-2.5 text-sm font-bold text-navy transition-all duration-200 hover:bg-amber-deep hover:text-cream active:scale-[0.97]";

const GHOST_BTN =
  "inline-flex items-center justify-center rounded-[9px] border-[1.5px] border-line px-[18px] py-2.5 text-sm font-semibold text-navy transition-all duration-200 hover:border-navy/25 hover:bg-navy/[0.03] active:scale-[0.97]";
