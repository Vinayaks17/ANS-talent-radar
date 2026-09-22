"use client";

import { useActionState } from "react";
import { signIn, signUp } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type State = { error?: string; message?: string };

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [inState, inAction, inPending] = useActionState<State, FormData>(signIn, { error: initialError });
  const [upState, upAction, upPending] = useActionState<State, FormData>(signUp, {});

  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm">
      <Tabs defaultValue="signin">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <form action={inAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {inState?.error && <p className="text-sm text-red-700">{inState.error}</p>}
            <Button type="submit" className="w-full" disabled={inPending}>
              {inPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup">
          <form action={upAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="su-email">Work email</Label>
              <Input id="su-email" name="email" type="email" autoComplete="email" required />
              <p className="text-xs text-muted-foreground">You join your company automatically if your email domain is on its allow-list.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-password">Password</Label>
              <Input id="su-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            {upState?.error && <p className="text-sm text-red-700">{upState.error}</p>}
            {upState?.message && <p className="text-sm text-green-800">{upState.message}</p>}
            <Button type="submit" className="w-full" disabled={upPending}>
              {upPending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
