"use client";

import { useActionState } from "react";
import Link from "next/link";
import { analyzeCsv, commitCsv, type AnalyzeState, type CommitState } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ImportWizard() {
  const [a, analyze, analyzing] = useActionState<AnalyzeState, FormData>(analyzeCsv, {});
  const [c, commit, committing] = useActionState<CommitState, FormData>(commitCsv, {});

  if (c.result) {
    const r = c.result;
    return (
      <Card>
        <CardHeader><CardTitle>Import complete</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-5 gap-3">
            <Stat n={r.created} label="created" />
            <Stat n={r.updated} label="updated (blanks filled)" />
            <Stat n={r.suppressed} label="on suppression list" />
            <Stat n={r.duplicateInFile} label="duplicates in file" />
            <Stat n={r.invalid} label="invalid rows" />
          </div>
          {r.errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">{r.errors.length} issue(s)</summary>
              <ul className="mt-2 space-y-1 max-h-48 overflow-auto">
                {r.errors.slice(0, 200).map((e, i) => <li key={i}>{e.line ? `Line ${e.line}: ` : ""}{e.reason}</li>)}
              </ul>
            </details>
          )}
          <p className="text-sm text-muted-foreground">Nobody has been emailed. Enrol these candidates in a campaign to start outreach.</p>
          <div className="flex gap-2">
            <Link href="/candidates" className={buttonVariants()}>View candidates</Link>
            <Link href="/campaigns" className={buttonVariants({ variant: "outline" })}>Go to campaigns</Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (a.analysis && a.key) {
    const an = a.analysis;
    const mapped = Object.entries(a.mapping ?? {}).filter(([, f]) => f);
    const ignored = Object.entries(a.mapping ?? {}).filter(([, f]) => !f).map(([h]) => h);
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Preview — {a.filename}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              <Stat n={an.total} label="valid rows" />
              <Stat n={an.willCreate} label="new candidates" />
              <Stat n={an.willUpdate} label="already exist (blanks filled)" />
              <Stat n={an.suppressed} label="suppressed (kept, never emailed)" cls={an.suppressed ? "text-[#7F1D1D]" : ""} />
              <Stat n={an.duplicateInFile + an.invalid} label="skipped (dupes + invalid)" />
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Columns used:</span> {mapped.map(([h, f]) => `${h} → ${f}`).join(" · ")}
              {ignored.length > 0 && <><br /><span className="font-semibold text-foreground">Ignored:</span> {ignored.join(", ")}</>}
            </div>
            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F7F5EF] text-muted-foreground uppercase tracking-wider">
                  <tr><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Email</th><th className="text-left px-3 py-2">Title · Company</th><th className="text-left px-3 py-2">Location</th><th className="text-left px-3 py-2">LinkedIn</th></tr>
                </thead>
                <tbody>
                  {an.sample.map((r) => (
                    <tr key={r.email_normalized} className="border-t">
                      <td className="px-3 py-2">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                      <td className="px-3 py-2">{r.email_normalized}</td>
                      <td className="px-3 py-2">{[r.current_title, r.current_company].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-3 py-2">{r.location ?? "—"}</td>
                      <td className="px-3 py-2">{r.linkedin_url ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={commit} className="flex items-center gap-3">
              <input type="hidden" name="key" value={a.key} />
              <input type="hidden" name="filename" value={a.filename} />
              <Button type="submit" disabled={committing}>{committing ? "Importing…" : `Import ${an.total.toLocaleString()} candidates`}</Button>
              <Link href="/candidates/import" className={buttonVariants({ variant: "outline" })}>Start over</Link>
              {c.error && <span className="text-sm text-red-700">{c.error}</span>}
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Upload a CSV</CardTitle></CardHeader>
      <CardContent>
        <form action={analyze} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="file" className="text-sm font-medium">File</label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required className="block text-sm" />
            <p className="text-xs text-muted-foreground">
              Recognised columns: first_name, last_name (or name), email (required), phone, title, company, location, linkedin_url, skills, industry, owner, source, last_contact_date, notes. Header spelling is flexible.
            </p>
          </div>
          {a.error && <p className="text-sm text-red-700">{a.error}</p>}
          <Button type="submit" disabled={analyzing}>{analyzing ? "Analysing…" : "Analyse file"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Stat({ n, label, cls }: { n: number; label: string; cls?: string }) {
  return (
    <div className="border rounded-lg px-3 py-2.5">
      <div className={`font-heading text-2xl ${cls ?? ""}`}>{n.toLocaleString()}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
