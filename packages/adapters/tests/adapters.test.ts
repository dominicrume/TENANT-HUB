import { describe, it, expect } from "vitest";
import {
  parseAtom, LegislationGovUkAdapter, SimInsuranceQuote, HttpInsuranceQuote, SimBankFeed, SimStt, SimNotify, ResendNotify,
  SimIdCheck, CredasIdCheck, SimAddressLookup, NominatimAddressLookup, GooglePlacesAddressLookup,
  insuranceQuotes, bankFeed, notifier, stt, idCheck, addressLookup, regulationFeed, adapterStatus, practiceMode, AdapterError,
} from "../src";

const baseEnv = {
  ADAPTER_MODE_REGULATION: "live", ADAPTER_MODE_NOTIFY: "simulated", ADAPTER_MODE_BANK: "simulated", ADAPTER_MODE_INSURANCE: "simulated", ADAPTER_MODE_IDCHECK: "simulated", ADAPTER_MODE_ADDRESS: "live", ADAPTER_MODE_STT: "simulated",
} as unknown as Parameters<typeof notifier>[0];

const fakeFetch = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("simulated adapters never pretend", () => {
  it("SimNotify records the message and reports delivered=false", async () => {
    const n = new SimNotify();
    const r = await n.send({ to: "a@b.c", channel: "email", subject: "s", body: "b" });
    expect(r.mode).toBe("simulated"); expect(r.data.delivered).toBe(false); expect(n.sent).toHaveLength(1);
  });
  it("SimInsuranceQuote is deterministic and badges every provider", async () => {
    const q = new SimInsuranceQuote();
    const risk = { rebuildValue: 450000, assetClass: "supported", floors: 3, missingCertificates: 1, openIssues: 2, priorPremium: 1200 };
    const a = await q.getQuotes(risk), b = await q.getQuotes(risk);
    expect(a.data).toEqual(b.data);
    expect(a.data.every((x) => x.providerName.endsWith("(simulated)") && x.premium > 0)).toBe(true);
    expect(a.mode).toBe("simulated");
  });
  it("SimBankFeed pays fresh charges and makes every second one a weak match", async () => {
    const today = new Date("2026-09-26T09:00:00Z");
    const feed = new SimBankFeed(() => today);
    const r = await feed.transactions([
      { tenancyId: "11111111-aaaa", reference: "ROOM4 KHAN", amount: 150, dueDate: "2026-09-25" },
      { tenancyId: "22222222-bbbb", reference: "ROOM2 OSEI", amount: 150, dueDate: "2026-09-26" },
      { tenancyId: "33333333-cccc", reference: "OLD", amount: 150, dueDate: "2026-08-01" }, // stale → stays unpaid
    ], "2026-09-01");
    expect(r.data).toHaveLength(2);
    expect(r.data[0]).toMatchObject({ amount: 150, reference: "RENT ROOM4 KHAN" });
    expect(r.data[1]).toMatchObject({ amount: 75, reference: "ROOM2 PART" });
  });
  it("SimStt echoes the hint", async () => {
    expect((await new SimStt().transcribe({ hint: " water under the sink " })).data.transcript).toBe("water under the sink");
    expect((await new SimStt().transcribe({})).data.transcript).toBe("(no speech detected)");
  });
  it("SimIdCheck starts pending and never resolves to a conclusive pass/fail on its own", async () => {
    const c = new SimIdCheck();
    const applicant = { fullName: "Amina Khan", dateOfBirth: "1990-01-01", documentType: "Passport" };
    const submitted = await c.submitCheck(applicant);
    expect(submitted.mode).toBe("simulated");
    expect(submitted.data.outcome).toBe("pending");
    const status = await c.getCheckStatus(submitted.data.providerRef);
    expect(status.data.outcome).toBe("refer");
    expect(status.mode).toBe("simulated");
  });
});

describe("live adapters fail loudly without credentials", () => {
  it("factories throw a clear error naming the variable", () => {
    expect(() => notifier({ ...baseEnv, ADAPTER_MODE_NOTIFY: "live" } as never)).toThrow(/RESEND_API_KEY and NOTIFY_FROM/);
    expect(() => bankFeed({ ...baseEnv, ADAPTER_MODE_BANK: "live" } as never)).toThrow(/TRUELAYER_ACCESS_TOKEN/);
    expect(() => insuranceQuotes({ ...baseEnv, ADAPTER_MODE_INSURANCE: "live" } as never)).toThrow(/INSURANCE_QUOTE_URL/);
    expect(() => idCheck({ ...baseEnv, ADAPTER_MODE_IDCHECK: "live" } as never)).toThrow(/CREDAS_BASE_URL/);
    expect(() => stt({ ...baseEnv, ADAPTER_MODE_STT: "live" } as never)).toThrow(AdapterError);
  });
  it("factories return simulated adapters by default", () => {
    expect(notifier(baseEnv).mode).toBe("simulated");
    expect(bankFeed(baseEnv).mode).toBe("simulated");
    expect(insuranceQuotes(baseEnv).mode).toBe("simulated");
    expect(idCheck(baseEnv).mode).toBe("simulated");
    expect(regulationFeed(baseEnv).mode).toBe("live");
  });
  it("CredasIdCheck submits a check and maps provider status to an outcome", async () => {
    const c = new CredasIdCheck("https://api.credas.example", "k", fakeFetch(200, { id: "chk_1" }));
    const submitted = await c.submitCheck({ fullName: "Amina Khan", dateOfBirth: "1990-01-01", documentType: "Passport" });
    expect(submitted).toMatchObject({ mode: "live", source: "credas", data: { providerRef: "chk_1", outcome: "pending" } });

    const noRef = new CredasIdCheck("https://api.credas.example", "k", fakeFetch(200, {}));
    await expect(noRef.submitCheck({ fullName: "x", dateOfBirth: "1990-01-01", documentType: "Passport" })).rejects.toThrow(/no check reference/);

    const passing = new CredasIdCheck("https://api.credas.example", "k", fakeFetch(200, { status: "clear", summary: "All checks passed" }));
    expect((await passing.getCheckStatus("chk_1")).data).toEqual({ outcome: "pass", detail: "All checks passed" });

    const failing = new CredasIdCheck("https://api.credas.example", "k", fakeFetch(200, { status: "declined" }));
    expect((await failing.getCheckStatus("chk_1")).data.outcome).toBe("fail");

    const down = new CredasIdCheck("https://api.credas.example", "k", fakeFetch(503, ""));
    await expect(down.getCheckStatus("chk_1")).rejects.toThrow(/Credas 503/);
  });
  it("ResendNotify refuses SMS and reports the upstream status on failure", async () => {
    const r = new ResendNotify("k", "Ops <ops@example.org>", fakeFetch(500, {}));
    await expect(r.send({ to: "x", channel: "sms", subject: "s", body: "b" })).rejects.toThrow(/email only/);
    await expect(r.send({ to: "x", channel: "email", subject: "s", body: "b" })).rejects.toThrow(/Resend 500/);
    const okr = new ResendNotify("k", "Ops <ops@example.org>", fakeFetch(200, { id: "msg_1" }));
    expect((await okr.send({ to: "x", channel: "email", subject: "s", body: "b" })).data).toEqual({ delivered: true, reference: "msg_1" });
  });
  it("HttpInsuranceQuote drops unusable quotes and fails on none", async () => {
    const good = new HttpInsuranceQuote("https://broker.example/quotes", "k", fakeFetch(200, { quotes: [{ providerName: "Acme", premium: 900, excess: 250 }, { provider: "Bad", premium: "n/a" }] }));
    const r = await good.getQuotes({ rebuildValue: 1, assetClass: "residential", floors: 1, missingCertificates: 0, openIssues: 0, priorPremium: null });
    expect(r.data).toEqual([{ providerName: "Acme", premium: 900, excess: 250, coverSummary: {} }]);
    expect(r.source).toBe("broker.example");
    const empty = new HttpInsuranceQuote("https://broker.example/quotes", undefined, fakeFetch(200, { quotes: [] }));
    await expect(empty.getQuotes(r as never)).rejects.toThrow(/no usable quotes/);
  });
});

describe("address lookup", () => {
  it("SimAddressLookup badges every row as simulated", async () => {
    const r = await new SimAddressLookup().search("B11 3AA");
    expect(r.mode).toBe("simulated");
    expect(r.data.every((a) => a.line1.includes("(simulated)") && a.postcode === "B11 3AA")).toBe(true);
  });
  it("Nominatim maps house number + road + postcode, drops rows without either, and fails loudly when down", async () => {
    const live = new NominatimAddressLookup(fakeFetch(200, [
      { lat: "52.44", lon: "-1.85", address: { house_number: "5A", road: "Formans Road", suburb: "Sparkhill", city: "Birmingham", postcode: "B11 3AA" } },
      { lat: "52.44", lon: "-1.85", address: { city: "Birmingham" } }, // no street, no postcode — dropped
    ]));
    const r = await live.search("B11 3AA");
    expect(r.source).toBe("nominatim");
    expect(r.data).toEqual([{ line1: "5A Formans Road", line2: "Sparkhill", city: "Birmingham", postcode: "B11 3AA", lat: 52.44, lng: -1.85 }]);
    await expect(new NominatimAddressLookup(fakeFetch(503, "")).search("x")).rejects.toThrow(/Nominatim 503/);
  });
  it("Google Places maps components and location", async () => {
    const g = new GooglePlacesAddressLookup("k", fakeFetch(200, { places: [{
      formattedAddress: "7 Formans Rd, Birmingham B11 3AA, UK", location: { latitude: 52.4, longitude: -1.8 },
      addressComponents: [{ longText: "7", types: ["street_number"] }, { longText: "Formans Road", types: ["route"] }, { longText: "Birmingham", types: ["postal_town"] }, { longText: "B11 3AA", types: ["postal_code"] }],
    }] }));
    const r = await g.search("7 Formans Road");
    expect(r.source).toBe("google-places");
    expect(r.data).toEqual([{ line1: "7 Formans Road", city: "Birmingham", postcode: "B11 3AA", lat: 52.4, lng: -1.8 }]);
  });
  it("factory: Google when its key exists, OpenStreetMap by default, simulated only when asked", () => {
    expect(addressLookup(baseEnv).mode).toBe("live");
    expect(addressLookup(baseEnv)).toBeInstanceOf(NominatimAddressLookup);
    expect(addressLookup({ ...baseEnv, GOOGLE_PLACES_API_KEY: "k" } as never)).toBeInstanceOf(GooglePlacesAddressLookup);
    expect(addressLookup({ ...baseEnv, ADAPTER_MODE_ADDRESS: "simulated" } as never)).toBeInstanceOf(SimAddressLookup);
    expect(adapterStatus({ ...baseEnv, GOOGLE_PLACES_API_KEY: "k" } as never).address.source).toBe("google-places");
  });
});

describe("legislation.gov.uk", () => {
  const atom = `<?xml version="1.0"?><feed><entry><id>http://www.legislation.gov.uk/id/uksi/2026/900</id><title type="text">The Renters (Deposit &amp; Fees) Regulations 2026</title><link rel="alternate" href="http://www.legislation.gov.uk/uksi/2026/900"/><updated>2026-09-25T10:00:00Z</updated><summary type="html">&lt;p&gt;Applies to assured shorthold tenancies.&lt;/p&gt;</summary></entry><entry><id></id><title>no id — skipped</title></entry></feed>`;
  it("parses entries into items and skips those without an id", () => {
    const items = parseAtom(atom);
    expect(items).toEqual([{ externalId: "http://www.legislation.gov.uk/id/uksi/2026/900", title: "The Renters (Deposit & Fees) Regulations 2026", url: "http://www.legislation.gov.uk/uksi/2026/900", publishedOn: "2026-09-25", excerpt: "Applies to assured shorthold tenancies." }]);
  });
  it("the adapter reports the feed as live and throws on an unreachable feed", async () => {
    const a = new LegislationGovUkAdapter("https://x", fakeFetch(200, atom));
    const r = await a.poll("2026-09-01");
    expect(r.mode).toBe("live"); expect(r.source).toBe("legislation.gov.uk"); expect(r.data).toHaveLength(1);
    await expect(new LegislationGovUkAdapter("https://x", fakeFetch(503, "")).poll("2026-09-01")).rejects.toThrow(/503/);
  });
});

describe("status for the Settings screen", () => {
  it("names what is simulated and the switch for each", () => {
    const s = adapterStatus(baseEnv);
    expect(s.notify.mode).toBe("simulated"); expect(s.notify.switch).toMatch(/RESEND_API_KEY/);
    expect(s.idcheck.mode).toBe("simulated"); expect(s.idcheck.switch).toMatch(/CREDAS_BASE_URL/);
    expect(practiceMode(baseEnv)).toEqual(["email"]); // ID checks, bank feed and quotes are deliberately excluded from the pill (see practiceMode's own comment)
  });
});
