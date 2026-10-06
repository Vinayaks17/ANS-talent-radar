import { describe, it, expect } from "vitest";

describe("health email + delivery status", async () => {
  process.env.CRON_SECRET ??= "x".repeat(20);
  const { healthEmailText } = await import("@/lib/health-digest");
  const { deliveryRank } = await import("@/lib/workers/inbound");
  it("lists only failing checks", () => {
    const text = healthEmailText("ANS RPO", { status: "error", checkedAt: "", checks: [
      { key: "a", label: "Sending engine", status: "error", detail: "3 actions late" },
      { key: "b", label: "AI", status: "ok", detail: "Working" },
      { key: "c", label: "Failed sends", status: "warn", detail: "1 failed" },
    ] }, "https://app.test");
    expect(text).toContain("PROBLEM · Sending engine: 3 actions late");
    expect(text).toContain("Warning · Failed sends: 1 failed");
    expect(text).not.toContain("Working");
    expect(text).toContain("https://app.test/");
  });
  it("delivery status never moves backwards", () => {
    expect(deliveryRank("DELIVERED")).toBeGreaterThan(deliveryRank("SENT"));
    expect(deliveryRank("BOUNCED")).toBeGreaterThan(deliveryRank("DELIVERED"));
    expect(deliveryRank("SENT")).toBeGreaterThan(deliveryRank("QUEUED"));
  });
});
