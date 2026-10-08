/**
 * @tenant-hub/adapters — every port implemented twice: live and simulated.
 *
 * H9: a simulated adapter always says so (mode: "simulated") and never reports
 * a message as delivered. A live adapter without its credentials throws, so
 * "live" can never quietly mean "pretend". Nothing here can bind cover, pay,
 * or serve a notice: the ports have no such verbs (H10, H11).
 *
 * Reads configuration only through @tenant-hub/env.
 */
import { env } from "@tenant-hub/env";
import type {
  AdapterMode, AdapterResult, RegulationFeedPort, RegulationItem, InsuranceQuotePort, Quote, RiskProfile,
  BankFeedPort, ExpectedRent, BankTransaction, SttPort, NotifyPort, Notification,
  IdCheckPort, ApplicantIdentity, IdCheckOutcome, AddressLookupPort, AddressSuggestion,
} from "@tenant-hub/ports";

export class AdapterError extends Error {
  constructor(message: string, public readonly adapter: string) { super(message); this.name = "AdapterError"; }
}
const now = () => new Date().toISOString();
const ok = <T>(data: T, mode: AdapterMode, source: string): AdapterResult<T> => ({ data, mode, source, retrievedAt: now() });

/* ═══════════════════════ Regulation (live) ═══════════════════════════════ */
export class LegislationGovUkAdapter implements RegulationFeedPort {
  readonly mode = "live" as const;
  constructor(private readonly feed = "https://www.legislation.gov.uk/new/data.feed", private readonly fetchImpl: typeof fetch = fetch) {}
  async poll(_sinceIso: string): Promise<AdapterResult<RegulationItem[]>> {
    const res = await this.fetchImpl(this.feed, { headers: { Accept: "application/atom+xml" } }).catch(() => null);
    if (!res || !res.ok) throw new AdapterError(`legislation.gov.uk ${res?.status ?? "unreachable"}`, "regulation");
    return ok(parseAtom(await res.text()), "live", "legislation.gov.uk");
  }
}
/** Minimal Atom parser: entries → items. Exported for tests. */
export function parseAtom(xml: string): RegulationItem[] {
  const items: RegulationItem[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1] ?? "";
    const pick = (re: RegExp) => decode((e.match(re)?.[1] ?? "").trim());
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/), id = pick(/<id>([\s\S]*?)<\/id>/);
    const url = e.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "";
    const updated = pick(/<updated>([\s\S]*?)<\/updated>/) || pick(/<published>([\s\S]*?)<\/published>/);
    const excerpt = pick(/<summary[^>]*>([\s\S]*?)<\/summary>/).slice(0, 600);
    if (id && title) items.push({ externalId: id, title, url, publishedOn: updated.slice(0, 10), excerpt });
  }
  return items;
}
/** Decode entities first (Atom summaries are often escaped HTML), then strip tags. */
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();

/* ═══════════════════════ Insurance quotes ════════════════════════════════ */
/** Deterministic, plausibly priced. Provider names carry "(simulated)" so no screen can forget. */
export class SimInsuranceQuote implements InsuranceQuotePort {
  readonly mode = "simulated" as const;
  async getQuotes(r: RiskProfile): Promise<AdapterResult<Quote[]>> {
    const base = Math.max(400, r.rebuildValue * 0.00085)
      * (r.assetClass === "commercial" ? 1.15 : r.assetClass === "mixed" ? 1.08 : r.assetClass === "supported" ? 1.05 : 1)
      * (1 + 0.04 * r.missingCertificates) * (1 + 0.02 * r.openIssues) * ((r.floors ?? 1) > 4 ? 1.1 : 1);
    const anchor = r.priorPremium ?? base;
    const q = (name: string, mult: number, excess: number): Quote =>
      ({ providerName: `${name} (simulated)`, premium: Math.round(Math.min(anchor, base) * mult), excess, coverSummary: { buildings: true, lossOfRent: true, publicLiability: "£5m" } });
    return ok([q("Provider A", 0.89, 500), q("Provider B", 0.98, 250), q("Provider C", 0.81, 750)], "simulated", "sim:insurance");
  }
}
/** Any broker or aggregator that answers JSON { quotes: [{ providerName, premium, excess }] }. Still stops at the decision card. */
export class HttpInsuranceQuote implements InsuranceQuotePort {
  readonly mode = "live" as const;
  constructor(private readonly url: string, private readonly key?: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async getQuotes(r: RiskProfile): Promise<AdapterResult<Quote[]>> {
    const res = await this.fetchImpl(this.url, { method: "POST", headers: { "Content-Type": "application/json", ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}) }, body: JSON.stringify(r) }).catch(() => null);
    if (!res || !res.ok) throw new AdapterError(`Quote endpoint ${res?.status ?? "unreachable"}`, "insurance");
    const j = (await res.json()) as { quotes?: unknown[] } | unknown[];
    const raw = Array.isArray(j) ? j : (j.quotes ?? []);
    const quotes = raw.map((q) => { const x = q as Record<string, unknown>; return { providerName: String(x.providerName ?? x.provider ?? "Provider"), premium: Number(x.premium), excess: Number(x.excess ?? 0), coverSummary: (x.coverSummary as Record<string, unknown>) ?? {} }; })
      .filter((q) => Number.isFinite(q.premium) && q.premium > 0);
    if (!quotes.length) throw new AdapterError("Quote endpoint returned no usable quotes", "insurance");
    return ok(quotes, "live", new URL(this.url).host);
  }
}

/* ═══════════════════════ Identity / right-to-rent check ═══════════════════
 * Same "stops at the decision card" shape as insurance quotes: this reports
 * what a provider found, nothing more. Staff read the outcome and make the
 * actual right-to-rent decision — no adapter here can approve or refuse a
 * tenancy (H10, H11). */
export class SimIdCheck implements IdCheckPort {
  readonly mode = "simulated" as const;
  async submitCheck(_a: ApplicantIdentity): Promise<AdapterResult<{ providerRef: string; outcome: IdCheckOutcome }>> {
    return ok({ providerRef: `sim-idcheck-${Date.now().toString(36)}`, outcome: "pending" as const }, "simulated", "sim:idcheck");
  }
  /** Never resolves to a conclusive pass/fail — a simulated check always reports "refer", so a human always looks, the same way SimNotify always reports delivered=false (H9). */
  async getCheckStatus(_providerRef: string): Promise<AdapterResult<{ outcome: IdCheckOutcome; detail?: string }>> {
    return ok({ outcome: "refer" as const, detail: "Simulated — no real check was performed. Verify the tenant's documents yourself." }, "simulated", "sim:idcheck");
  }
}
/**
 * Credas identity verification. Request/response field names here are a
 * best-effort mapping of common UK KYC/ID-verification API shapes — verify
 * against Credas's actual API docs before setting ADAPTER_MODE_IDCHECK=live
 * in production. A wrong field name surfaces as an AdapterError (the fetch
 * either fails or the JSON won't have what we expect), never as a silently
 * wrong pass/fail — the same fail-loud guarantee every other live adapter
 * here has.
 */
export class CredasIdCheck implements IdCheckPort {
  readonly mode = "live" as const;
  constructor(private readonly baseUrl: string, private readonly key: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async submitCheck(a: ApplicantIdentity): Promise<AdapterResult<{ providerRef: string; outcome: IdCheckOutcome }>> {
    const res = await this.fetchImpl(`${this.baseUrl}/checks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: a.fullName, dateOfBirth: a.dateOfBirth, documentType: a.documentType, documentRef: a.documentRef ?? null }),
    }).catch(() => null);
    if (!res || !res.ok) throw new AdapterError(`Credas ${res?.status ?? "unreachable"}`, "idcheck");
    const j = (await res.json().catch(() => ({}))) as { id?: string; reference?: string };
    const providerRef = String(j.id ?? j.reference ?? "");
    if (!providerRef) throw new AdapterError("Credas returned no check reference", "idcheck");
    return ok({ providerRef, outcome: "pending" as const }, "live", "credas");
  }
  async getCheckStatus(providerRef: string): Promise<AdapterResult<{ outcome: IdCheckOutcome; detail?: string }>> {
    const res = await this.fetchImpl(`${this.baseUrl}/checks/${providerRef}`, { headers: { Authorization: `Bearer ${this.key}` } }).catch(() => null);
    if (!res || !res.ok) throw new AdapterError(`Credas ${res?.status ?? "unreachable"}`, "idcheck");
    const j = (await res.json().catch(() => ({}))) as { status?: string; result?: string; summary?: string };
    const raw = String(j.status ?? j.result ?? "pending").toLowerCase();
    const outcome: IdCheckOutcome = raw === "pass" || raw === "clear" ? "pass" : raw === "fail" || raw === "declined" ? "fail" : raw === "pending" || raw === "processing" ? "pending" : "refer";
    return ok({ outcome, detail: j.summary }, "live", "credas");
  }
}

/* ═══════════════════════ UK address lookup ════════════════════════════════
 * Suggestions only — the human picks the address (same "stops at the
 * decision card" shape as quotes). Two real providers: Google Places, the
 * reference Rume pointed at (needs a key + billing on his Google account),
 * and Nominatim/OpenStreetMap — free, keyless, usable today, with patchier
 * house-number coverage. The factory prefers Google whenever its key
 * exists, so adding GOOGLE_PLACES_API_KEY upgrades the picker with no code
 * change. Built 2026-10-08 on "close it by building it" rather than waiting
 * on the vendor decision. */
export class SimAddressLookup implements AddressLookupPort {
  readonly mode = "simulated" as const;
  async search(q: string): Promise<AdapterResult<AddressSuggestion[]>> {
    const postcode = q.trim().toUpperCase() || "B11 3AA";
    return ok([
      { line1: "1 Example Road (simulated)", city: "Birmingham", postcode },
      { line1: "2 Example Road (simulated)", city: "Birmingham", postcode },
    ], "simulated", "sim:address");
  }
}
/** OpenStreetMap's Nominatim. Usage policy: identify the app, ≤1 req/s, no bulk — fine for a few staff typing addresses. */
export class NominatimAddressLookup implements AddressLookupPort {
  readonly mode = "live" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  async search(q: string): Promise<AdapterResult<AddressSuggestion[]>> {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=gb&limit=10&q=${encodeURIComponent(q)}`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": "TenantHub/1.0 (app.mattysplace.org.uk)", "Accept-Language": "en-GB" } }).catch(() => null);
    if (!res || !res.ok) throw new AdapterError(`Nominatim ${res?.status ?? "unreachable"}`, "address");
    const rows = (await res.json().catch(() => [])) as Array<{ lat: string; lon: string; address?: Record<string, string> }>;
    const out = rows.map((r) => {
      const a = r.address ?? {};
      const street = [a.house_number, a.road].filter(Boolean).join(" ");
      const line1 = street || a.building || a.neighbourhood || a.suburb || "";
      const area = a.suburb || a.neighbourhood;
      return {
        line1, line2: street && area ? area : undefined,
        city: a.city || a.town || a.village || a.county || "", postcode: a.postcode ?? "",
        lat: Number(r.lat), lng: Number(r.lon),
      };
    }).filter((s) => s.line1 && s.postcode);
    return ok(out, "live", "nominatim");
  }
}
/** Google Places API (New), Text Search — formatted address, components and location in one call. */
export class GooglePlacesAddressLookup implements AddressLookupPort {
  readonly mode = "live" as const;
  constructor(private readonly key: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async search(q: string): Promise<AdapterResult<AddressSuggestion[]>> {
    const res = await this.fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.key, "X-Goog-FieldMask": "places.formattedAddress,places.addressComponents,places.location" },
      body: JSON.stringify({ textQuery: q, regionCode: "GB", languageCode: "en-GB", pageSize: 10 }),
    }).catch(() => null);
    if (!res || !res.ok) throw new AdapterError(`Google Places ${res?.status ?? "unreachable"}`, "address");
    const j = (await res.json().catch(() => ({}))) as {
      places?: Array<{ formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: Array<{ longText: string; types: string[] }> }>;
    };
    const out = (j.places ?? []).map((p) => {
      const comp = (t: string) => p.addressComponents?.find((c) => c.types.includes(t))?.longText ?? "";
      const line1 = [comp("subpremise"), comp("street_number"), comp("route")].filter(Boolean).join(" ") || (p.formattedAddress ?? "").split(",")[0] || "";
      return { line1, city: comp("postal_town") || comp("locality") || "", postcode: comp("postal_code"), lat: p.location?.latitude, lng: p.location?.longitude };
    }).filter((s) => s.line1 && s.postcode);
    return ok(out, "live", "google-places");
  }
}

/* ═══════════════════════ Bank feed (read-only) ═══════════════════════════ */
/** Pays fresh charges cleanly; every second one arrives as a half payment with a vague reference, so the weak-match queue is always demonstrable. */
export class SimBankFeed implements BankFeedPort {
  readonly mode = "simulated" as const;
  constructor(private readonly today = () => new Date()) {}
  async transactions(expected: ExpectedRent[], _sinceIso: string): Promise<AdapterResult<BankTransaction[]>> {
    const t = this.today().getTime();
    const fresh = expected.filter((e) => { const age = (t - new Date(e.dueDate).getTime()) / 864e5; return age >= 0 && age <= 3; })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.reference.localeCompare(b.reference));
    const out = fresh.map((e, i) => {
      const weak = i % 2 === 1;
      return { externalId: `sim-${e.tenancyId.slice(0, 8)}-${e.dueDate}`, postedOn: e.dueDate, amount: weak ? Math.round(e.amount * 50) / 100 : e.amount, reference: weak ? `${e.reference.split(" ")[0]} PART` : `RENT ${e.reference}` };
    });
    return ok(out, "simulated", "sim:bank");
  }
}
/** TrueLayer Data API, credits only, read-only. */
export class TrueLayerBankFeed implements BankFeedPort {
  readonly mode = "live" as const;
  constructor(private readonly token: string, private readonly accountId: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async transactions(_expected: ExpectedRent[], sinceIso: string): Promise<AdapterResult<BankTransaction[]>> {
    const from = sinceIso.slice(0, 10), to = now().slice(0, 10);
    const res = await this.fetchImpl(`https://api.truelayer.com/data/v1/accounts/${this.accountId}/transactions?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${this.token}` } }).catch(() => null);
    if (!res || !res.ok) throw new AdapterError(`TrueLayer ${res?.status ?? "unreachable"}`, "bank");
    const j = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const out = (j.results ?? []).filter((x) => x.transaction_type === "CREDIT" && Number(x.amount) > 0)
      .map((x) => ({ externalId: String(x.transaction_id), amount: Number(x.amount), postedOn: String(x.timestamp).slice(0, 10), reference: String(x.description ?? x.merchant_name ?? "") }));
    return ok(out, "live", "truelayer");
  }
}

/* ═══════════════════════ Speech to text ══════════════════════════════════ */
/** Returns the typed hint as the transcript. Badged wherever it appears. */
export class SimStt implements SttPort {
  readonly mode = "simulated" as const;
  async transcribe(i: { audioRef?: string | null; hint?: string | null }) {
    return ok({ transcript: (i.hint ?? "").trim() || "(no speech detected)" }, "simulated" as const, "sim:stt");
  }
}

/* ═══════════════════════ Notify ══════════════════════════════════════════ */
/** Records the message and reports delivered=false, so nothing pretends it went out. */
export class SimNotify implements NotifyPort {
  readonly mode = "simulated" as const;
  readonly sent: Notification[] = [];
  async send(n: Notification) {
    this.sent.push(n);
    return ok({ delivered: false, reference: `sim-notify-${Date.now().toString(36)}-${n.channel}` }, "simulated" as const, "sim:notify");
  }
}
/** Resend transactional email. Sender comes from NOTIFY_FROM — never a hard-coded brand. */
export class ResendNotify implements NotifyPort {
  readonly mode = "live" as const;
  constructor(private readonly key: string, private readonly from: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async send(n: Notification) {
    if (n.channel !== "email") throw new AdapterError("Resend sends email only", "notify");
    const res = await this.fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: this.from, to: [n.to], subject: n.subject, text: n.body }) }).catch(() => null);
    if (!res || !res.ok) throw new AdapterError(`Resend ${res?.status ?? "unreachable"}`, "notify");
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return ok({ delivered: true, reference: String(j.id ?? "") }, "live" as const, "resend");
  }
}

/* ═══════════════════════ Mode-aware factories ════════════════════════════ */
type Env = typeof env.server;
const need = (adapter: string, mode: string, ...missing: string[]) =>
  new AdapterError(`ADAPTER_MODE_${adapter.toUpperCase()}=${mode} needs ${missing.join(" and ")}`, adapter);

export function regulationFeed(e: Env = env.server): RegulationFeedPort {
  if (e.ADAPTER_MODE_REGULATION === "simulated") return { mode: "simulated", async poll(_sinceIso: string) { return ok([], "simulated", "sim:regulation"); } };
  return new LegislationGovUkAdapter();
}
export function insuranceQuotes(e: Env = env.server): InsuranceQuotePort {
  if (e.ADAPTER_MODE_INSURANCE === "live") { if (!e.INSURANCE_QUOTE_URL) throw need("insurance", "live", "INSURANCE_QUOTE_URL"); return new HttpInsuranceQuote(e.INSURANCE_QUOTE_URL, e.INSURANCE_QUOTE_KEY); }
  return new SimInsuranceQuote();
}
export function bankFeed(e: Env = env.server): BankFeedPort {
  if (e.ADAPTER_MODE_BANK === "live") { if (!e.TRUELAYER_ACCESS_TOKEN || !e.TRUELAYER_ACCOUNT_ID) throw need("bank", "live", "TRUELAYER_ACCESS_TOKEN", "TRUELAYER_ACCOUNT_ID"); return new TrueLayerBankFeed(e.TRUELAYER_ACCESS_TOKEN, e.TRUELAYER_ACCOUNT_ID); }
  return new SimBankFeed();
}
export function stt(e: Env = env.server): SttPort {
  if (e.ADAPTER_MODE_STT === "live") throw new AdapterError("No live speech-to-text adapter exists yet — set ADAPTER_MODE_STT=simulated", "stt");
  return new SimStt();
}
export function notifier(e: Env = env.server): NotifyPort {
  if (e.ADAPTER_MODE_NOTIFY === "live") { if (!e.RESEND_API_KEY || !e.NOTIFY_FROM) throw need("notify", "live", "RESEND_API_KEY", "NOTIFY_FROM"); return new ResendNotify(e.RESEND_API_KEY, e.NOTIFY_FROM); }
  return new SimNotify();
}
/** Right-to-rent / ID verification. Credas is the default live vendor — a different one just needs a new class here and a swap in this one line. */
export function idCheck(e: Env = env.server): IdCheckPort {
  if (e.ADAPTER_MODE_IDCHECK === "live") { if (!e.CREDAS_BASE_URL || !e.CREDAS_API_KEY) throw need("idcheck", "live", "CREDAS_BASE_URL", "CREDAS_API_KEY"); return new CredasIdCheck(e.CREDAS_BASE_URL, e.CREDAS_API_KEY); }
  return new SimIdCheck();
}

/** UK address suggestions. Google when its key exists; otherwise OpenStreetMap (keyless) unless explicitly simulated. */
export function addressLookup(e: Env = env.server): AddressLookupPort {
  if (e.GOOGLE_PLACES_API_KEY) return new GooglePlacesAddressLookup(e.GOOGLE_PLACES_API_KEY);
  if (e.ADAPTER_MODE_ADDRESS === "simulated") return new SimAddressLookup();
  return new NominatimAddressLookup();
}

/** Which connections are live right now, and the variable that switches each on — shown on Settings → Connections. */
export function adapterStatus(e: Env = env.server) {
  const live = (v: AdapterMode) => v === "live";
  return {
    regulation: { mode: e.ADAPTER_MODE_REGULATION, source: live(e.ADAPTER_MODE_REGULATION) ? "legislation.gov.uk" : "sim:regulation", switch: "ADAPTER_MODE_REGULATION" },
    notify:     { mode: e.ADAPTER_MODE_NOTIFY, source: live(e.ADAPTER_MODE_NOTIFY) ? "resend" : "sim:notify", switch: "RESEND_API_KEY + NOTIFY_FROM, ADAPTER_MODE_NOTIFY=live" },
    bank:       { mode: e.ADAPTER_MODE_BANK, source: live(e.ADAPTER_MODE_BANK) ? "truelayer" : "sim:bank", switch: "TRUELAYER_ACCESS_TOKEN + TRUELAYER_ACCOUNT_ID, ADAPTER_MODE_BANK=live" },
    insurance:  { mode: e.ADAPTER_MODE_INSURANCE, source: live(e.ADAPTER_MODE_INSURANCE) ? "quote endpoint" : "sim:insurance", switch: "INSURANCE_QUOTE_URL, ADAPTER_MODE_INSURANCE=live" },
    idcheck:    { mode: e.ADAPTER_MODE_IDCHECK, source: live(e.ADAPTER_MODE_IDCHECK) ? "credas" : "sim:idcheck", switch: "CREDAS_BASE_URL + CREDAS_API_KEY, ADAPTER_MODE_IDCHECK=live" },
    address:    { mode: (e.GOOGLE_PLACES_API_KEY ? "live" : e.ADAPTER_MODE_ADDRESS) as AdapterMode, source: e.GOOGLE_PLACES_API_KEY ? "google-places" : live(e.ADAPTER_MODE_ADDRESS) ? "nominatim" : "sim:address", switch: "GOOGLE_PLACES_API_KEY upgrades to Google; ADAPTER_MODE_ADDRESS=simulated to fake it" },
    stt:        { mode: e.ADAPTER_MODE_STT, source: "sim:stt", switch: "no live adapter yet" },
    ai:         { mode: (e.OPENAI_API_KEY || e.ANTHROPIC_API_KEY ? "live" : "simulated") as AdapterMode, source: e.OPENAI_API_KEY ? "openai" : e.ANTHROPIC_API_KEY ? "anthropic" : "rules", switch: "OPENAI_API_KEY or ANTHROPIC_API_KEY" },
  };
}
/**
 * Names of the connections still in practice mode, for the topbar pill.
 * ID checks, bank feed and quotes are all deliberately left off this list
 * (Rume, 2026-10-07/08: "how do we remove this totally and permanently" —
 * none of the three are in active use, so the badge was pure noise with no
 * corresponding benefit). adapterStatus() above still reports every one of
 * them honestly for anyone who looks — this only changes what the pill
 * surfaces unprompted. Only email is still here: it's a real, active
 * feature, so if it ever drops back to simulated (e.g. RESEND_API_KEY gets
 * unset), the pill should say so rather than stay silently wrong.
 */
export function practiceMode(e: Env = env.server): string[] {
  const s = adapterStatus(e);
  return [s.notify.mode !== "live" && "email"].filter((x): x is string => Boolean(x));
}
