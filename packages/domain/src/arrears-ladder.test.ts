import { describe, it, expect } from "vitest";
import {
  ARREARS_LADDER, rungForDays, stageIndex, REQUIRED_CERTIFICATES, requiredCertificatesFor, certBase,
  certificateStatus, draftArrearsDocument, NOT_ADVICE, type LadderRung,
} from "./arrears-ladder";
import type { UnitClass } from "@tenant-hub/validation";

const CLASSES: UnitClass[] = ["supported", "residential", "commercial"];

describe("ARREARS_LADDER: rungs are monotonic per class", () => {
  for (const cls of CLASSES) {
    it(`${cls} ladder's days strictly increase`, () => {
      const days = ARREARS_LADDER[cls].map((r) => r.day);
      for (let i = 1; i < days.length; i++) expect(days[i]!).toBeGreaterThan(days[i - 1]!);
    });
  }
});

describe("H11: every rung after the first requires a recorded human approval", () => {
  for (const cls of CLASSES) {
    it(`${cls}: only the first rung auto-releases`, () => {
      const [first, ...rest] = ARREARS_LADDER[cls];
      expect((first as LadderRung).requiresApproval).toBe(false);
      for (const r of rest) expect(r.requiresApproval, r.stage).toBe(true);
    });
  }
});

describe("the supported ladder never drafts a notice, and stops at check-in and a council query before any letter", () => {
  it("has no stage that serves or drafts a notice, forfeiture or bailiff action", () => {
    const stages = ARREARS_LADDER.supported.map((r) => r.stage);
    const actions = ARREARS_LADDER.supported.map((r) => r.action);
    expect(stages).not.toContain("notice");
    expect(actions.join(" ")).not.toMatch(/notice|forfeit|bailiff/i);
  });

  it("the first three rungs are a check-in and a council query, never a letter to the tenant", () => {
    const [checkIn, hbChase, supportPlan] = ARREARS_LADDER.supported;
    expect(checkIn!.stage).toBe("check_in");
    expect(hbChase!.stage).toBe("hb_chase");
    expect(supportPlan!.stage).toBe("support_plan");
    for (const stage of [checkIn, hbChase, supportPlan]) {
      const doc = draftArrearsDocument({ stage: stage!.stage, cls: "supported", brand: "Matty's Place", tenantName: "Amina Khan", propertyName: "14 Ravenhurst St", unitRef: "Room 4", balance: 150, daysOverdue: stage!.day, rentAmount: 25 });
      expect(doc.body).not.toMatch(/^Dear Amina Khan,/m); // not addressed to the tenant as a letter
    }
  });

  it("draftArrearsDocument produces a document for every supported stage, and none of them are a notice", () => {
    for (const rung of ARREARS_LADDER.supported) {
      const doc = draftArrearsDocument({ stage: rung.stage, cls: "supported", brand: "Matty's Place", tenantName: "Ben Osei", propertyName: "Sparkhill HMO", unitRef: "Room 2", balance: 300, daysOverdue: rung.day, rentAmount: 25 });
      expect(doc.title.length).toBeGreaterThan(0);
      // "does not... serve any notice" is the safe negation the manager_review draft uses on purpose;
      // what must never appear is an instruction TO serve one, or a forfeiture/bailiff step.
      expect(doc.body).not.toMatch(/notice to quit|please (prepare|serve).{0,30}notice|forfeiture|bailiff/i);
    }
  });
});

describe("H14: no supported-ladder draft uses instructing or threatening language, and every draft carries the not-advice line", () => {
  // Phrases appropriate to a solicitor's brief or a commercial enforcement letter, never to a vulnerable tenant.
  const INSTRUCTING = /\byou must\b|\bfurther steps\b|\bwe may have to\b|\beviction\b|\bnotice to quit\b|\bforfeiture\b|\bbailiff\b|\benforcement\b|\bcourt\b|\blegal action\b|\bwithin 7 days\b/i;

  for (const rung of ARREARS_LADDER.supported) {
    it(`stage '${rung.stage}' carries no instructing language`, () => {
      const doc = draftArrearsDocument({ stage: rung.stage, cls: "supported", brand: "Matty's Place", tenantName: "Cara Lee", propertyName: "14 Ravenhurst St", unitRef: "Room 7", balance: 75, daysOverdue: rung.day, rentAmount: 25 });
      expect(doc.body).not.toMatch(INSTRUCTING);
      expect(doc.body).toContain(NOT_ADVICE);
    });
  }

  it("residential and commercial letters MAY use firmer language past the reminder — the rule is scoped to supported", () => {
    const residentialFormal = draftArrearsDocument({ stage: "formal_letter", cls: "residential", brand: "X", tenantName: "T", propertyName: "P", unitRef: "U", balance: 100, daysOverdue: 14, rentAmount: 500 });
    expect(residentialFormal.body).toMatch(/further steps|within 7 days/i);
  });
});

describe("rungForDays / stageIndex", () => {
  it("returns null under the first rung's day, and the furthest reached rung otherwise", () => {
    expect(rungForDays("residential", 4)).toBeNull();
    expect(rungForDays("residential", 5)!.stage).toBe("reminder");
    expect(rungForDays("residential", 13)!.stage).toBe("reminder");
    expect(rungForDays("residential", 14)!.stage).toBe("formal_letter");
    expect(rungForDays("residential", 200)!.stage).toBe("notice");
  });
  it("commercial diverges from residential from day 21 (solicitor vs day 30) and has two more rungs", () => {
    expect(rungForDays("commercial", 21)!.stage).toBe("solicitor");
    expect(rungForDays("residential", 21)!.stage).toBe("formal_letter"); // residential's solicitor rung is day 30
    expect(rungForDays("commercial", 45)!.stage).toBe("forfeiture");
    expect(rungForDays("commercial", 60)!.stage).toBe("bailiff");
  });
  it("supported reaches day 90 (manager review) and day 91+ stays there", () => {
    expect(rungForDays("supported", 90)!.stage).toBe("manager_review");
    expect(rungForDays("supported", 365)!.stage).toBe("manager_review");
  });
  it("stageIndex finds a rung's position, or -1 for an unknown stage", () => {
    expect(stageIndex("residential", "formal_letter")).toBe(1);
    expect(stageIndex("supported", "manager_review")).toBe(4);
    expect(stageIndex("commercial", "no-such-stage")).toBe(-1);
  });
});

describe("required certificates", () => {
  it("each unit class has its statutory set, matching the seed counts in 035_compliance_insurance.sql", () => {
    expect(REQUIRED_CERTIFICATES.supported).toHaveLength(9);
    expect(REQUIRED_CERTIFICATES.residential).toHaveLength(5);
    expect(REQUIRED_CERTIFICATES.commercial).toHaveLength(6);
  });
  it("a mixed property with supported and commercial units needs the union of both sets", () => {
    const req = requiredCertificatesFor("mixed", ["supported", "commercial"]);
    expect(req).toEqual(expect.arrayContaining([...REQUIRED_CERTIFICATES.supported, ...REQUIRED_CERTIFICATES.commercial]));
    expect(req).toHaveLength(REQUIRED_CERTIFICATES.supported.length + REQUIRED_CERTIFICATES.commercial.length);
  });
  it("a plain residential property needs only the residential set, driven by asset class alone", () => {
    expect(requiredCertificatesFor("residential", [])).toEqual([...REQUIRED_CERTIFICATES.residential]);
  });
  it("certBase matches a held certificate across the (residential)/(commercial) suffix", () => {
    expect(certBase("EICR (commercial)")).toBe(certBase("EICR"));
    expect(certBase("Gas Safety (CP12) (residential)")).toBe("gas safety (cp12)");
    expect(certBase("HMO licence")).toBe("hmo licence"); // no suffix on the supported set — passes through unchanged
  });
});

describe("certificateStatus thresholds", () => {
  const today = new Date("2026-09-26T00:00:00Z");
  const at = (daysFromToday: number) => { const d = new Date(today); d.setDate(d.getDate() + daysFromToday); return d.toISOString().slice(0, 10); };

  it("missing when there is no date", () => {
    expect(certificateStatus(null, today)).toEqual({ status: "missing", days: null, alert: "missing" });
    expect(certificateStatus(undefined, today).alert).toBe("missing");
  });
  it("expired when the date has passed", () => {
    expect(certificateStatus(at(-1), today)).toMatchObject({ status: "expired", alert: "expired" });
  });
  it("buckets expiring dates at the 7/30/60/90-day boundaries, inclusive", () => {
    expect(certificateStatus(at(0), today).alert).toBe("expiring_7");
    expect(certificateStatus(at(7), today).alert).toBe("expiring_7");
    expect(certificateStatus(at(8), today).alert).toBe("expiring_30");
    expect(certificateStatus(at(30), today).alert).toBe("expiring_30");
    expect(certificateStatus(at(31), today).alert).toBe("expiring_60");
    expect(certificateStatus(at(60), today).alert).toBe("expiring_60");
    expect(certificateStatus(at(61), today).alert).toBe("expiring_90");
    expect(certificateStatus(at(90), today).alert).toBe("expiring_90");
  });
  it("valid beyond 90 days, with no alert", () => {
    expect(certificateStatus(at(91), today)).toEqual({ status: "valid", days: 91, alert: null });
  });
});
