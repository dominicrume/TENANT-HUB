/**
 * The sign-up forms, filled from the record and signed (Matloob,
 * 2026-10-15: "the AI autofills from the initial form, I just give him to
 * sign; once he signs I click signed and it turns green").
 *
 * Each slot in docs/SIGNUP (lib/signup.ts) gets a document: a heading, the
 * parties, the clauses, and the fields taken from the tenant record, the
 * room, the rent and the landlord. These are our standard layouts under
 * the landlord's name — the landlord-letterhead templates Osama is sending
 * replace the body text per form without touching the fill or the signing.
 */
export interface SignupContext {
  tenant: Record<string, unknown>;
  tenancy: { rent: number; frequency: string; startDate: string | null; unit: string; property: string; propertyAddress: string } | null;
  landlord: { name: string; email: string | null; phone: string | null } | null;
  organisation: string;
  staff: string;
  today: string;
}

export interface FilledForm { title: string; intro: string; fields: Array<[string, string]>; clauses: string[]; signatures: Array<"tenant" | "staff">; }

const s = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const money = (n: number | undefined | null) => (n === null || n === undefined ? "—" : `£${Number(n).toFixed(2)}`);
const dateGB = (v: unknown) => { if (!v) return "—"; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-GB"); };

function common(c: SignupContext): Array<[string, string]> {
  const t = c.tenant;
  return [
    ["Full name", `${s(t["title"]) === "—" ? "" : `${s(t["title"])} `}${s(t["full_name"])}`],
    ["Date of birth", dateGB(t["dob"])],
    ["National Insurance number", s(t["nino"])],
    ["Nationality", s(t["nationality"])],
    ["Mobile", s(t["mobile"])],
    ["Email", s(t["email"])],
    ["Property", c.tenancy ? `${c.tenancy.property} — ${c.tenancy.propertyAddress}` : s(t["address"])],
    ["Room", c.tenancy?.unit ?? s(t["room_number"])],
    ["Landlord", c.landlord?.name ?? "—"],
    ["Managing agent", c.organisation],
  ];
}
const rentFields = (c: SignupContext): Array<[string, string]> => [
  ["Rent / service charge", c.tenancy ? `${money(c.tenancy.rent)} ${c.tenancy.frequency}` : "—"],
  ["Start date", dateGB(c.tenancy?.startDate ?? c.tenant["moved_in"])],
];
const benefitFields = (c: SignupContext): Array<[string, string]> => [
  ["Benefit", s(c.tenant["benefit_type"])],
  ["Paid", `${money(Number(c.tenant["benefit_amount"]) || null)} ${s(c.tenant["benefit_frequency"])}`],
  ["Housing Benefit reference", s(c.tenant["hb_reference_number"])],
];
const nokFields = (c: SignupContext): Array<[string, string]> => [
  ["Next of kin", `${s(c.tenant["nok_name"])} (${s(c.tenant["nok_relationship"])})`],
  ["Next of kin phone", s(c.tenant["nok_phone"])],
];

export function fillForm(slot: string, c: SignupContext): FilledForm {
  const name = s(c.tenant["full_name"]);
  const ll = c.landlord?.name ?? c.organisation;
  const base = { title: slot, intro: "", fields: common(c), clauses: [] as string[], signatures: ["tenant", "staff"] as Array<"tenant" | "staff"> };
  switch (slot.toLowerCase()) {
    case "personal details form":
      return { ...base, intro: `Personal details recorded for ${name} at sign-up with ${c.organisation}.`, fields: [...common(c), ...benefitFields(c), ...nokFields(c), ["Languages", s(c.tenant["languages"])], ["GP", s(c.tenant["doctor"])]], signatures: ["tenant"] };
    case "excluded licence agreement":
    case "new extended licence agreement":
      return { ...base, intro: `This licence agreement is between ${ll} (the licensor), acting through ${c.organisation}, and ${name} (the licensee) for the occupation of ${c.tenancy?.unit ?? s(c.tenant["room_number"])} at ${c.tenancy?.propertyAddress ?? s(c.tenant["address"])}.`,
        fields: [...common(c), ...rentFields(c)],
        clauses: [
          "The licensee is granted a licence to occupy the room as supported accommodation. This is an excluded licence; it does not create a tenancy and the licensee does not have exclusive possession.",
          "The licensee will pay the rent / service charge stated above, in advance, on the day it falls due.",
          "The licensee will keep the room and shared areas clean and safe, respect other residents and staff, and follow the house rules provided at sign-up.",
          "Either party may end this licence on the notice stated in the house rules. The licensor may end it sooner where the licensee's behaviour puts others at risk.",
          "The licensee agrees to take part in the support plan agreed with their support worker.",
        ] };
    case "authorisation form":
      return { ...base, intro: `I, ${name}, authorise ${c.organisation} and ${ll} to make a claim for Housing Benefit / Universal Credit housing costs on my behalf, to receive payment of that benefit directly, and to discuss my claim with the council and the DWP.`, fields: [...common(c), ...benefitFields(c)], clauses: ["This authority stays in force while I live at the property above or until I withdraw it in writing."] };
    case "licence key facts":
      return { ...base, intro: `The key facts of ${name}'s licence at ${c.tenancy?.propertyAddress ?? s(c.tenant["address"])}, explained at sign-up.`, fields: [...common(c), ...rentFields(c)], clauses: ["What you pay and when.", "What is included (room, shared facilities, support).", "What the house rules are and what happens if they are broken.", "How to end the licence, and how it can be ended.", "Who to speak to: your support worker, the office, and the landlord."] };
    case "weekly service charge agreement":
      return { ...base, intro: `${name} agrees to pay the weekly service charge for ${c.tenancy?.unit ?? s(c.tenant["room_number"])} at ${c.tenancy?.property ?? ""}, which covers the services listed below and is not covered by Housing Benefit.`, fields: [...common(c), ...rentFields(c)], clauses: ["Utilities, council tax where applicable, TV licence for shared areas, cleaning of shared areas, and the support service.", "The charge is payable weekly in advance; a statement is available at any time from the office."] };
    case "confidentiality form":
      return { ...base, intro: `${c.organisation} explains to ${name} how their personal information is kept, who sees it, and when it may be shared.`, clauses: ["Information is kept securely and only seen by staff who need it to provide housing and support.", "Information may be shared with the council, the DWP, health services or the police where the law requires it or where someone is at risk.", "You may ask to see the information held about you at any time."], signatures: ["tenant", "staff"] };
    case "missing persons form":
      return { ...base, intro: `Information to help find ${name} if they go missing from ${c.tenancy?.property ?? "the property"}.`, fields: [...common(c), ...nokFields(c), ["GP", s(c.tenant["doctor"])], ["Probation officer", s(c.tenant["probation_officer"])]], clauses: ["Places they may go; people they may be with; medication; what to do if they are not back by the agreed time."], signatures: ["tenant"] };
    case "fire evacuation form":
      return { ...base, intro: `${name} has been shown the fire exits, the assembly point and the alarm at ${c.tenancy?.propertyAddress ?? s(c.tenant["address"])}.`, clauses: ["Leave by the nearest exit when the alarm sounds; do not stop for belongings.", "Go to the assembly point and wait to be counted.", "Never prop fire doors open or tamper with alarms."], signatures: ["tenant", "staff"] };
    case "support checklist":
      return { ...base, intro: `Sign-up support checklist for ${name}: what has been explained, what has been given, what is still to do.`, clauses: ["House rules explained", "Keys and fob given", "Benefit claim started", "GP registration", "Support plan date agreed", "Emergency contacts recorded"], signatures: ["staff"] };
    case "file contents":
      return { ...base, intro: `Contents of ${name}'s file at ${c.organisation}: the forms in sections 1 to 7 of the sign-up pack, with dates.`, signatures: ["staff"] };
    case "nil income form":
      return { ...base, intro: `${name} declares that they currently have no income other than the benefit stated below.`, fields: [...common(c), ...benefitFields(c)], clauses: ["I will tell the office within 7 days if my income changes."], signatures: ["tenant"] };
    case "referral initial assessment":
      return { ...base, intro: `Initial assessment of ${name} at referral: housing history, support needs, risks and the plan.`, fields: [...common(c), ["How they came to us", s(c.tenant["referral_source"]).replace(/_/g, " ")]], clauses: ["Housing history", "Support needs", "Health and medication", "Risks to self or others", "Agreed next steps"], signatures: ["tenant", "staff"] };
    case "risk assessment":
      return { ...base, intro: `Risk assessment for ${name}, completed with their support worker.`, clauses: ["Risk to self", "Risk to others", "Risk from others", "Substances and alcohol", "Health", "Actions agreed to reduce each risk"], signatures: ["tenant", "staff"] };
    default:
      return { ...base, intro: `${slot} for ${name}.` };
  }
}
