"use client";

import { useActionState, useState, useTransition } from "react";
import { addMember, setMemberRole, removeMember, type MemberState } from "./member-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

type Member = { user_id: string; email: string; role: string; display_name: string | null; created_at: string; last_sign_in_at: string | null };

export function MembersPanel({ members, isAdmin, currentUserId }: { members: Member[]; isAdmin: boolean; currentUserId: string }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(addMember, {});
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Team</CardTitle>
        <span className="text-xs text-muted-foreground">Admins manage settings · recruiters work candidates · viewers read only</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{m.display_name ?? m.email}{m.user_id === currentUserId && <span className="text-xs font-normal text-muted-foreground"> · you</span>}</div>
              <div className="text-xs text-muted-foreground truncate">{m.email} · last sign-in {m.last_sign_in_at ? formatDate(m.last_sign_in_at) : "never"}</div>
            </div>
            {isAdmin && m.user_id !== currentUserId ? (
              <>
                <select defaultValue={m.role} disabled={busy} aria-label={`Role for ${m.email}`} className="border rounded-md px-2 py-1 bg-white text-xs"
                  onChange={(e) => start(async () => { const r = await setMemberRole(m.user_id, e.target.value as "admin" | "recruiter" | "viewer"); setErr(r.error ?? null); })}>
                  <option value="admin">Admin</option><option value="recruiter">Recruiter</option><option value="viewer">Viewer</option>
                </select>
                {confirm === m.user_id ? (
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => start(async () => { const r = await removeMember(m.user_id); setErr(r.error ?? null); setConfirm(null); })}>Confirm remove</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirm(m.user_id)}>Remove</Button>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
            )}
          </div>
        ))}
        {err && <p className="text-xs text-red-700">{err}</p>}

        {isAdmin && (
          <form action={action} className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-end pt-2">
            <Input name="email" type="email" placeholder="name@company.com" required aria-label="Email" />
            <Input name="display_name" placeholder="Display name (optional)" aria-label="Display name" />
            <select name="role" defaultValue="recruiter" aria-label="Role" className="border rounded-md px-2 h-9 bg-white text-sm">
              <option value="recruiter">Recruiter</option><option value="viewer">Viewer</option><option value="admin">Admin</option>
            </select>
            <Button type="submit" variant="outline" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
            {state.error && <p className="col-span-4 text-xs text-red-700">{state.error}</p>}
            {state.ok && !state.tempPassword && <p className="col-span-4 text-xs text-green-800">{state.email} added. They already had an account and can sign in now.</p>}
            {state.ok && state.tempPassword && (
              <div className="col-span-4 rounded-md bg-[#FCE8D2] text-[#7C3A00] p-3 text-xs space-y-1">
                <div><strong>{state.email}</strong> added. Share this one-time password privately — it is shown only once:</div>
                <code className="block text-sm font-mono select-all text-foreground">{state.tempPassword}</code>
                <div>They should change it under Settings → Your account after signing in.</div>
              </div>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
