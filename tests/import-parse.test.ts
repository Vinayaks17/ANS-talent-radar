import { describe, it, expect } from "vitest";
import { parseCsv, normalizeLinkedin, normalizePhone } from "@/lib/import/parse";

const csv = `First Name,Last Name,Email Address,Mobile,Job Title,Company Name,City,LinkedIn,Skills
Bryan,Boling,Bryan.Boling@Example.com,(214) 555-0100,Senior Freight Broker,ABC Logistics,"Dallas, TX",https://linkedin.com/in/BryanBoling/,"Truckload; LTL"
Maria,Castellanos,maria@example.com,,Logistics Sales Manager,Trinity 3PL,"Houston, TX",,
Dup,Row,BRYAN.BOLING@example.com,,,,,,
Bad,Email,not-an-email,,,,,,
`;

describe("parseCsv", () => {
  const r = parseCsv(csv);
  it("maps flexible headers", () => {
    expect(r.mapping["Email Address"]).toBe("email");
    expect(r.mapping["Job Title"]).toBe("title");
    expect(r.mapping["Company Name"]).toBe("company");
    expect(r.mapping["City"]).toBe("location");
  });
  it("normalises, dedupes within the file and rejects invalid rows", () => {
    expect(r.rows).toHaveLength(2);
    expect(r.duplicateInFile).toBe(1);
    expect(r.invalid).toHaveLength(1);
    expect(r.rows[0].email_normalized).toBe("bryan.boling@example.com");
    expect(r.rows[0].phone_normalized).toBe("2145550100");
    expect(r.rows[0].linkedin_url).toBe("https://www.linkedin.com/in/bryanboling");
    expect(r.rows[0].skills).toEqual(["Truckload", "LTL"]);
  });
});

describe("normalizers", () => {
  it("linkedin", () => {
    expect(normalizeLinkedin("www.linkedin.com/in/jane-doe?trk=x")).toBe("https://www.linkedin.com/in/jane-doe");
    expect(normalizeLinkedin("twitter.com/jane")).toBeNull();
  });
  it("phone", () => {
    expect(normalizePhone("+1 (214) 555-0100")).toBe("+12145550100");
    expect(normalizePhone("12")).toBeNull();
  });
});
