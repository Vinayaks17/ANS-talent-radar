import Papa from "papaparse";
import { z } from "zod";

/** Canonical candidate import fields and the header spellings we accept. */
export const FIELD_ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "first name", "firstname", "given name", "first"],
  last_name: ["last_name", "last name", "lastname", "surname", "family name", "last"],
  full_name: ["name", "full name", "full_name", "candidate", "candidate name"],
  email: ["email", "email address", "e-mail", "work email", "personal email", "mail"],
  phone: ["phone", "mobile", "mobile phone", "cell", "phone number", "telephone", "work phone"],
  title: ["title", "job title", "current title", "position", "role", "designation"],
  company: ["company", "current company", "employer", "organisation", "organization", "company name"],
  location: ["location", "city", "city, state", "address", "region", "state", "country"],
  linkedin_url: ["linkedin", "linkedin url", "linkedin_url", "linkedin profile", "profile url"],
  skills: ["skills", "skill", "keywords", "tags"],
  industry: ["industry", "sector", "vertical"],
  owner: ["owner", "recruiter", "owner email", "assigned to"],
  source: ["source", "lead source", "origin"],
  last_contact_date: ["last_contact_date", "last contact", "last contacted", "last contact date"],
  notes: ["notes", "note", "comments", "summary", "person summary"],
};

export const IMPORT_FIELDS = Object.keys(FIELD_ALIASES);

function norm(h: string) {
  return h.toLowerCase().replace(/[\s_\-./]+/g, " ").trim();
}

/** Map raw CSV headers to canonical fields. Unknown headers are ignored. */
export function autoMapHeaders(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const taken = new Set<string>();
  for (const h of headers) {
    const n = norm(h);
    let hit: string | null = null;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (taken.has(field)) continue;
      if (aliases.some((a) => norm(a) === n)) { hit = field; break; }
    }
    mapping[h] = hit;
    if (hit) taken.add(hit);
  }
  return mapping;
}

export function normalizeEmail(raw: string | undefined | null) {
  const e = (raw ?? "").trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export function normalizePhone(raw: string | undefined | null) {
  const digits = (raw ?? "").replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 7) return null;
  return digits.startsWith("+") ? "+" + digits.slice(1).replace(/\D/g, "") : digits.replace(/\D/g, "");
}

export function normalizeLinkedin(raw: string | undefined | null) {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = v.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i);
  if (!m) return null;
  return `https://www.linkedin.com/in/${m[1].toLowerCase().replace(/\/+$/, "")}`;
}

function splitList(raw: string | undefined | null) {
  return (raw ?? "").split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export const RowSchema = z.object({
  first_name: z.string().max(100).nullable(),
  last_name: z.string().max(100).nullable(),
  email: z.string().email(),
  email_normalized: z.string(),
  phone: z.string().max(40).nullable(),
  phone_normalized: z.string().nullable(),
  linkedin_url: z.string().url().nullable(),
  current_title: z.string().max(200).nullable(),
  current_company: z.string().max(200).nullable(),
  location: z.string().max(200).nullable(),
  skills: z.array(z.string().max(80)).max(100),
  industry: z.string().max(120).nullable(),
  source: z.string().max(120).nullable(),
  owner_email: z.string().nullable(),
  last_contacted_at: z.string().datetime().nullable(),
  notes: z.string().max(5000).nullable(),
});
export type ImportRow = z.infer<typeof RowSchema>;

export type ParsedCsv = {
  headers: string[];
  mapping: Record<string, string | null>;
  rows: ImportRow[];
  invalid: { line: number; reason: string; raw: Record<string, string> }[];
  duplicateInFile: number;
};

function nz(v: string | undefined) {
  const t = (v ?? "").trim();
  return t ? t : null;
}

export function parseCsv(text: string, mappingOverride?: Record<string, string | null>): ParsedCsv {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  const headers = parsed.meta.fields ?? [];
  const mapping = mappingOverride ?? autoMapHeaders(headers);
  const get = (row: Record<string, string>, field: string) => {
    const h = Object.entries(mapping).find(([, f]) => f === field)?.[0];
    return h ? row[h] : undefined;
  };

  const rows: ImportRow[] = [];
  const invalid: ParsedCsv["invalid"] = [];
  const seen = new Set<string>();
  let duplicateInFile = 0;

  parsed.data.forEach((raw, i) => {
    const line = i + 2;
    const email = normalizeEmail(get(raw, "email"));
    if (!email) { invalid.push({ line, reason: "Missing or invalid email", raw }); return; }
    if (seen.has(email)) { duplicateInFile++; return; }
    seen.add(email);

    let first = nz(get(raw, "first_name"));
    let last = nz(get(raw, "last_name"));
    const full = nz(get(raw, "full_name"));
    if (!first && !last && full) { const s = splitName(full); first = s.first; last = s.last || null; }

    const lc = nz(get(raw, "last_contact_date"));
    const lcDate = lc ? new Date(lc) : null;

    const candidate = {
      first_name: first,
      last_name: last,
      email: (get(raw, "email") ?? "").trim(),
      email_normalized: email,
      phone: nz(get(raw, "phone")),
      phone_normalized: normalizePhone(get(raw, "phone")),
      linkedin_url: normalizeLinkedin(get(raw, "linkedin_url")),
      current_title: nz(get(raw, "title")),
      current_company: nz(get(raw, "company")),
      location: nz(get(raw, "location")),
      skills: splitList(get(raw, "skills")),
      industry: nz(get(raw, "industry")),
      source: nz(get(raw, "source")),
      owner_email: normalizeEmail(get(raw, "owner")),
      last_contacted_at: lcDate && !Number.isNaN(lcDate.getTime()) ? lcDate.toISOString() : null,
      notes: nz(get(raw, "notes")),
    };
    const ok = RowSchema.safeParse(candidate);
    if (!ok.success) { invalid.push({ line, reason: ok.error.issues[0]?.message ?? "Invalid row", raw }); return; }
    rows.push(ok.data);
  });

  return { headers, mapping, rows, invalid, duplicateInFile };
}
