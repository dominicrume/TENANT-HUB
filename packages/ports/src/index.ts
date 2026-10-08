/**
 * @tenant-hub/ports — the interfaces every external connection satisfies. Types only.
 *
 * Every port declares its mode so the screen can badge LIVE or SIMULATED (H9).
 * The verbs bind, pay and serve-a-notice do not exist here on purpose (H10, H11):
 * no adapter can be written that performs them.
 */

export type AdapterMode = "live" | "simulated";

export interface AdapterResult<T> {
  data: T;
  mode: AdapterMode;
  /** Where it came from, for the receipt: "legislation.gov.uk", "sim:bank", "resend". */
  source: string;
  retrievedAt: string;
}

/* ── Regulation ─────────────────────────────────────────────────────────── */
export interface RegulationItem { externalId: string; title: string; publishedOn: string; url: string; excerpt: string }
export interface RegulationFeedPort { readonly mode: AdapterMode; poll(sinceIso: string): Promise<AdapterResult<RegulationItem[]>> }

/* ── Insurance (quotes only; the human decides on the card) ─────────────── */
export interface RiskProfile { rebuildValue: number; assetClass: string; floors: number | null; missingCertificates: number; openIssues: number; priorPremium: number | null }
export interface Quote { providerName: string; premium: number; excess: number; coverSummary: Record<string, unknown> }
export interface InsuranceQuotePort { readonly mode: AdapterMode; getQuotes(risk: RiskProfile): Promise<AdapterResult<Quote[]>> }

/* ── Money in (read-only view of what arrived; never moves money) ───────── */
export interface ExpectedRent { tenancyId: string; reference: string; amount: number; dueDate: string }
export interface BankTransaction { externalId: string; amount: number; postedOn: string; reference: string }
export interface BankFeedPort { readonly mode: AdapterMode; transactions(expected: ExpectedRent[], sinceIso: string): Promise<AdapterResult<BankTransaction[]>> }

/* ── Speech to text for voice reports and voice notes ───────────────────── */
export interface SttPort { readonly mode: AdapterMode; transcribe(input: { audioRef?: string | null; hint?: string | null }): Promise<AdapterResult<{ transcript: string }>> }

/* ── Outbound notifications. Simulated records the message; it is never presented as sent ── */
export interface Notification { to: string; channel: "email" | "sms"; subject: string; body: string }
export interface NotifyPort { readonly mode: AdapterMode; send(n: Notification): Promise<AdapterResult<{ delivered: boolean; reference: string }>> }

/* ── Language model: classify only, JSON back ───────────────────────────── */
export interface LLMPort { readonly mode: AdapterMode; classify(prompt: string): Promise<AdapterResult<{ json: unknown }>> }

/* ── Files (CON step 4) ─────────────────────────────────────────────────── */
export interface StoredObject { key: string; contentType: string; size: number }
export interface StoragePort {
  readonly mode: AdapterMode;
  put(key: string, body: Uint8Array, contentType: string): Promise<AdapterResult<StoredObject>>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<AdapterResult<{ url: string }>>;
  delete(key: string): Promise<AdapterResult<{ deleted: boolean }>>;
}

/* ── Identity / right-to-rent check — reports only ───────────────────────
 * Like insurance quotes, this "stops at the decision card": it can only
 * report what a provider found, never approve or refuse a tenancy itself
 * (H10, H11 — no bind/pay/serve-a-notice verb exists here either). Staff
 * read the outcome and make the actual right-to-rent decision. */
export interface ApplicantIdentity { fullName: string; dateOfBirth: string; documentType: string; documentRef?: string }
export type IdCheckOutcome = "pending" | "pass" | "refer" | "fail";
export interface IdCheckPort {
  readonly mode: AdapterMode;
  submitCheck(applicant: ApplicantIdentity): Promise<AdapterResult<{ providerRef: string; outcome: IdCheckOutcome }>>;
  getCheckStatus(providerRef: string): Promise<AdapterResult<{ outcome: IdCheckOutcome; detail?: string }>>;
}

/* ── UK address lookup — suggestions only; the human picks ───────────────── */
export interface AddressSuggestion { line1: string; line2?: string; city: string; postcode: string; lat?: number; lng?: number }
export interface AddressLookupPort { readonly mode: AdapterMode; search(query: string): Promise<AdapterResult<AddressSuggestion[]>> }
