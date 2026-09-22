import { describe, it, expect } from "vitest";
import { timezoneFromLocation } from "@/lib/timezone";

describe("timezoneFromLocation", () => {
  it("maps US cities and states", () => {
    expect(timezoneFromLocation("Dallas, TX")).toBe("America/Chicago");
    expect(timezoneFromLocation("Seattle, Washington")).toBe("America/Los_Angeles");
    expect(timezoneFromLocation("Washington DC")).toBe("America/New_York");
    expect(timezoneFromLocation("Phoenix, AZ")).toBe("America/Phoenix");
  });
  it("does not treat lowercase words as state codes", () => {
    expect(timezoneFromLocation("Remote in Europe")).toBeNull();
    expect(timezoneFromLocation("Portland, OR")).toBe("America/Los_Angeles");
  });
  it("handles countries and unknowns", () => {
    expect(timezoneFromLocation("London, United Kingdom")).toBe("Europe/London");
    expect(timezoneFromLocation("Somewhere")).toBeNull();
    expect(timezoneFromLocation(null)).toBeNull();
  });
});
