import { describe, it, expect } from "vitest";
import { readinessScore, combinedMatchScore, requirementTerms } from "@/lib/policy/readiness";

const now = new Date("2026-10-01T12:00:00Z");
const days = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const base = { market_status: "UNKNOWN", communication_status: "WAITING_FOR_REPLY", availability_date: null, last_verified_at: null, last_replied_at: null };

describe("readinessScore", () => {
  it("ranks the market statuses in the expected order", () => {
    const s = (m: string, extra = {}) => readinessScore({ ...base, market_status: m, last_verified_at: days(5), ...extra }, now).score;
    expect(s("AVAILABLE_NOW")).toBeGreaterThan(s("OPEN_TO_RIGHT_OPPORTUNITY"));
    expect(s("OPEN_TO_RIGHT_OPPORTUNITY")).toBeGreaterThan(s("PASSIVE"));
    expect(s("PASSIVE")).toBeGreaterThan(s("NOT_LOOKING"));
    expect(s("NOT_INTERESTED")).toBe(0);
  });
  it("open-later candidates warm up as their date approaches", () => {
    const at = (d: string) => readinessScore({ ...base, market_status: "OPEN_LATER", availability_date: d, last_verified_at: days(5) }, now).score;
    expect(at("2026-10-15")).toBeGreaterThan(at("2026-12-15"));
    expect(at("2026-12-15")).toBeGreaterThan(at("2027-03-01"));
    expect(at("2027-03-01")).toBeGreaterThan(at("2027-09-01"));
  });
  it("stale information counts for less", () => {
    const fresh = readinessScore({ ...base, market_status: "AVAILABLE_NOW", last_verified_at: days(10) }, now);
    const old = readinessScore({ ...base, market_status: "AVAILABLE_NOW", last_verified_at: days(200) }, now);
    expect(fresh.score).toBe(90);
    expect(old.score).toBe(54);
    expect(old.reasons).toContain("confirmed over 6 months ago");
  });
  it("recent replies and live conversations add a little", () => {
    const r = readinessScore({ ...base, market_status: "OPEN_TO_RIGHT_OPPORTUNITY", last_verified_at: days(2), last_replied_at: days(2), communication_status: "CONVERSATION_ACTIVE" }, now);
    expect(r.score).toBe(75);
    expect(r.band).toBe("HOT");
  });
  it("suppressed candidates are never ready", () => {
    expect(readinessScore({ ...base, market_status: "AVAILABLE_NOW", communication_status: "SUPPRESSED", last_verified_at: days(1) }, now)).toMatchObject({ score: 0, band: "COLD" });
  });
  it("is clamped to 0–100", () => {
    const r = readinessScore({ ...base, market_status: "AVAILABLE_NOW", last_verified_at: days(1), last_replied_at: days(1), communication_status: "HUMAN_REVIEW" }, now);
    expect(r.score).toBe(100);
  });
});

describe("combinedMatchScore", () => {
  it("readiness scales fit between half and full", () => {
    expect(combinedMatchScore(90, 100)).toBe(90);
    expect(combinedMatchScore(90, 0)).toBe(45);
    expect(combinedMatchScore(80, 50)).toBe(60);
    expect(combinedMatchScore(150, -5)).toBe(50);
  });
  it("a ready good fit outranks a perfect fit who isn't moving", () => {
    expect(combinedMatchScore(80, 90)).toBeGreaterThan(combinedMatchScore(95, 15));
  });
});

describe("requirementTerms", () => {
  it("extracts meaningful search terms", () => {
    const t = requirementTerms({ title: "Senior Logistics Operations Manager", must_have: ["TMS experience", "5+ years in 3PL"], nice_to_have: ["Lean / Six Sigma"] });
    expect(t).toEqual(expect.arrayContaining(["logistics", "operations", "tms", "3pl", "lean", "six", "sigma"]));
    expect(t).not.toContain("senior");
    expect(t).not.toContain("manager");
    expect(t).not.toContain("5");
  });
});
