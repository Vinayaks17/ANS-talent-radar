"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { uploadResume, resumeLink, type ResumeState } from "./resume-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ResumeCard({ candidateId, canEdit, latest }: { candidateId: string; canEdit: boolean; latest: { filename: string; path: string; when: string } | null }) {
  const [state, action, pending] = useActionState<ResumeState, FormData>(uploadResume, {});
  const [opening, start] = useTransition();
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Resume <span className="font-normal text-muted-foreground">· the AI fills skills, experience and work history</span></CardTitle></CardHeader>
      <CardContent className="space-y-3 text-[13px]">
        {latest ? (
          <div className="flex items-center gap-2">
            <span className="truncate">{latest.filename}</span>
            <span className="text-xs text-muted-foreground">· {latest.when}</span>
            <div className="flex-1" />
            <Button size="sm" variant="outline" disabled={opening} onClick={() => start(async () => { const r = await resumeLink(latest.path); if (r.url) window.open(r.url, "_blank", "noopener"); else toast.error(r.error ?? "Couldn't open"); })}>Open</Button>
          </div>
        ) : <p className="text-xs text-muted-foreground">No resume yet.</p>}
        {canEdit && (
          <form action={action} className="flex items-center gap-2">
            <input type="hidden" name="candidateId" value={candidateId} />
            <input type="file" name="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required className="text-xs flex-1 min-w-0" aria-label="Resume file" />
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Reading…" : latest ? "Replace" : "Upload"}</Button>
          </form>
        )}
        {state.error && <p className="text-xs text-red-700">{state.error}</p>}
        {state.ok && <p className="text-xs text-green-800">{state.message}</p>}
        <p className="text-[11px] text-muted-foreground">PDF or Word, up to 4 MB. Stored privately; nothing personal like age or nationality is extracted.</p>
      </CardContent>
    </Card>
  );
}
