import { describe, it, expect } from "vitest";
import { createLogger, memorySink, span, setLogger } from "../src";

describe("logger", () => {
  it("writes one JSON line per event and respects the level", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "warn", service: "t", write: (l) => lines.push(l) });
    log.info("hidden"); log.warn("shown", { a: 1 }); log.error("also", { b: 2 });
    expect(lines).toHaveLength(2);
    const w = JSON.parse(lines[0]!);
    expect(w).toMatchObject({ level: "warn", service: "t", msg: "shown", a: 1 });
    expect(typeof w.ts).toBe("string");
  });
});

describe("span", () => {
  setLogger(createLogger({ write: () => undefined })); // quiet
  it("marks running → idle and emits start/end with a duration", async () => {
    const m = memorySink();
    const out = await span(m.sink, "compliance-watch", "org-1", "cid-1", async () => 42);
    expect(out).toBe(42);
    expect(m.events.map((e) => e.event)).toEqual(["start", "end"]);
    expect(m.events[1]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(m.health.map((h) => h.patch.state)).toEqual(["running", "idle"]);
    expect(m.health[1]!.patch).toMatchObject({ success: true, lastError: null });
  });
  it("marks failed with the error and rethrows", async () => {
    const m = memorySink();
    await expect(span(m.sink, "x", null, "cid", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(m.events.map((e) => e.event)).toEqual(["start", "error"]);
    expect(m.events[1]!.fields).toEqual({ error: "boom" });
    expect(m.health[1]!.patch).toMatchObject({ state: "failed", success: false, lastError: "boom" });
  });
});
