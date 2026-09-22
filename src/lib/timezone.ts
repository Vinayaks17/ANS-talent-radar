/**
 * Best-effort IANA time zone from a free-text location. Deterministic and
 * conservative: returns null when unsure so the org default applies.
 */
const US_STATE: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles",
  CO: "America/Denver", CT: "America/New_York", DE: "America/New_York", FL: "America/New_York", GA: "America/New_York",
  HI: "Pacific/Honolulu", ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago",
  KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago",
  MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York",
  NM: "America/Denver", NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver", VT: "America/New_York",
  VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver",
  DC: "America/New_York",
};

const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const CITIES: Record<string, string> = {
  "new york": "America/New_York", nyc: "America/New_York", boston: "America/New_York", atlanta: "America/New_York",
  miami: "America/New_York", philadelphia: "America/New_York", charlotte: "America/New_York", "washington dc": "America/New_York",
  chicago: "America/Chicago", dallas: "America/Chicago", houston: "America/Chicago", austin: "America/Chicago",
  "san antonio": "America/Chicago", nashville: "America/Chicago", minneapolis: "America/Chicago", "kansas city": "America/Chicago",
  denver: "America/Denver", "salt lake city": "America/Denver", phoenix: "America/Phoenix",
  "los angeles": "America/Los_Angeles", "san francisco": "America/Los_Angeles", seattle: "America/Los_Angeles",
  "san diego": "America/Los_Angeles", portland: "America/Los_Angeles", "las vegas": "America/Los_Angeles",
  london: "Europe/London", manchester: "Europe/London", birmingham: "Europe/London", edinburgh: "Europe/London",
  sydney: "Australia/Sydney", melbourne: "Australia/Melbourne", brisbane: "Australia/Brisbane", perth: "Australia/Perth",
  toronto: "America/Toronto", vancouver: "America/Vancouver", dublin: "Europe/Dublin",
};

const COUNTRIES: Record<string, string> = {
  "united kingdom": "Europe/London", uk: "Europe/London", england: "Europe/London", scotland: "Europe/London",
  ireland: "Europe/Dublin", australia: "Australia/Sydney", india: "Asia/Kolkata", singapore: "Asia/Singapore",
  germany: "Europe/Berlin", france: "Europe/Paris", netherlands: "Europe/Amsterdam", canada: "America/Toronto",
};

export function timezoneFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const raw = location.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

  for (const [city, tz] of Object.entries(CITIES)) if (raw.includes(city)) return tz;
  for (const [name, abbr] of Object.entries(US_STATE_NAMES)) if (raw.includes(name)) return US_STATE[abbr];
  // Two-letter state codes only when written in capitals in the source ("Dallas, TX"), never "in", "or", "me".
  for (const t of location.replace(/[.,]/g, " ").split(/\s+/)) {
    if (t.length === 2 && t === t.toUpperCase() && US_STATE[t]) return US_STATE[t];
  }
  for (const [c, tz] of Object.entries(COUNTRIES)) if (raw.includes(c)) return tz;
  if (/\b(usa|us|united states)\b/.test(raw)) return "America/New_York";
  return null;
}
