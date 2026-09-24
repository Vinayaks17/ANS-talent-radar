"use client";

import { useActionState } from "react";
import { changePassword, type MemberState } from "./member-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AccountPanel() {
  const [state, action, pending] = useActionState<MemberState, FormData>(changePassword, {});
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Your account</CardTitle></CardHeader>
      <CardContent>
        <form action={action} className="space-y-2">
          <Input name="password" type="password" placeholder="New password" autoComplete="new-password" required aria-label="New password" />
          <Input name="confirm" type="password" placeholder="Repeat new password" autoComplete="new-password" required aria-label="Repeat new password" />
          <Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
          {state.error && <p className="text-xs text-red-700">{state.error}</p>}
          {state.ok && <p className="text-xs text-green-800">Password changed.</p>}
        </form>
      </CardContent>
    </Card>
  );
}
