export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", opts);
}

export function formatDateTime(iso: string | null | undefined) {
  return formatDate(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** "March 2027 (approx.)" — keeps the precision the candidate actually gave. */
export function formatAvailability(date: string | null | undefined, precision: string | null | undefined) {
  if (!date) return "—";
  const d = new Date(date + (date.length === 10 ? "T00:00:00Z" : ""));
  if (Number.isNaN(d.getTime())) return "—";
  const month = d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  switch (precision) {
    case "DAY": return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    case "WEEK": return `Week of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
    case "MONTH": return month;
    case "MONTH_APPROXIMATE": return `${month} (approx.)`;
    case "QUARTER": return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
    case "YEAR": return String(d.getUTCFullYear());
    default: return month;
  }
}

export function fullName(c: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unknown";
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function money(v: { currency?: string; amount?: number; minimum?: number } | null | undefined) {
  if (!v) return "—";
  const n = v.amount ?? v.minimum;
  if (n == null) return "—";
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: v.currency ?? "USD", maximumFractionDigits: 0 }).format(n);
  return v.minimum != null && v.amount == null ? `${s}+` : s;
}

/** Whole days elapsed since an ISO timestamp, minimum 0. */
export function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
